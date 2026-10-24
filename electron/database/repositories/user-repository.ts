import { DatabaseManager, DatabaseError } from '../connection';

export interface AppUser {
  id: number;
  username: string;
  password_hash: string;
  password_salt: string;
  full_name: string;
  role: string;
  permissions?: string | null;
  is_active: number;
  failed_login_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export type SafeUser = Omit<AppUser, 'password_hash' | 'password_salt'>;

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export class UserRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  public toSafeUser(user: AppUser): SafeUser {
    const { password_hash, password_salt, ...safe } = user;
    return safe;
  }

  public countUsers(): number {
    const db = this.dbManager.getDatabase();
    const row = db.prepare('SELECT count(*) as count FROM app_users').get() as { count: number };
    return row.count;
  }

  public findByUsername(username: string): AppUser | null {
    const db = this.dbManager.getDatabase();
    const row = db.prepare('SELECT * FROM app_users WHERE username = ? COLLATE NOCASE').get(username);
    return (row as AppUser) || null;
  }

  public findById(id: number): AppUser | null {
    const db = this.dbManager.getDatabase();
    const row = db.prepare('SELECT * FROM app_users WHERE id = ?').get(id);
    return (row as AppUser) || null;
  }

  public createInitialOperator(params: {
    username: string;
    passwordHash: string;
    passwordSalt: string;
    fullName: string;
  }): SafeUser {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    const existingCount = this.countUsers();
    if (existingCount > 0) {
      throw new DatabaseError('Initial operator can only be created when the user directory is empty.');
    }

    const stmt = db.prepare(`
      INSERT INTO app_users (
        username,
        password_hash,
        password_salt,
        full_name,
        role,
        permissions,
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'admin', 'all', 1, ?, ?)
    `);

    const result = stmt.run(
      params.username.trim().toLowerCase(),
      params.passwordHash,
      params.passwordSalt,
      params.fullName.trim(),
      now,
      now
    );

    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) {
      throw new DatabaseError('Failed to create initial operator.');
    }

    return this.toSafeUser(created);
  }

  public recordSuccessfulLogin(id: number): void {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE app_users
      SET last_login_at = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, now, id);
  }

  public recordFailedLogin(username: string): { locked: boolean; lockedUntil?: string } {
    const user = this.findByUsername(username);
    if (!user) {
      return { locked: false };
    }

    const db = this.dbManager.getDatabase();
    const now = new Date();
    const attempts = user.failed_login_attempts + 1;
    let lockedUntil: string | null = null;

    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const lockDate = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
      lockedUntil = lockDate.toISOString();
    }

    db.prepare(`
      UPDATE app_users
      SET failed_login_attempts = ?, locked_until = ?, updated_at = ?
      WHERE id = ?
    `).run(attempts, lockedUntil, now.toISOString(), user.id);

    return {
      locked: lockedUntil !== null,
      lockedUntil: lockedUntil || undefined,
    };
  }

  public isUserLocked(user: AppUser): boolean {
    if (!user.locked_until) return false;
    const lockTime = new Date(user.locked_until).getTime();
    return Date.now() < lockTime;
  }

  public listUsers(): SafeUser[] {
    const db = this.dbManager.getDatabase();
    const rows = db.prepare(`
      SELECT id, username, full_name, role, permissions, is_active, failed_login_attempts, locked_until, created_at, updated_at, last_login_at
      FROM app_users
      ORDER BY id ASC
    `).all() as AppUser[];
    return rows.map((r) => this.toSafeUser(r));
  }

  public createUser(params: {
    username: string;
    passwordHash: string;
    passwordSalt: string;
    fullName: string;
    role: string;
    permissions?: string;
  }): SafeUser {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    const existing = this.findByUsername(params.username);
    if (existing) {
      throw new DatabaseError(`Username '${params.username}' is already taken.`);
    }

    const stmt = db.prepare(`
      INSERT INTO app_users (
        username,
        password_hash,
        password_salt,
        full_name,
        role,
        permissions,
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const result = stmt.run(
      params.username.trim().toLowerCase(),
      params.passwordHash,
      params.passwordSalt,
      params.fullName.trim(),
      params.role || 'operator',
      params.permissions || 'all',
      now,
      now
    );

    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) {
      throw new DatabaseError('Failed to create new user account.');
    }

    return this.toSafeUser(created);
  }

  public updateUser(
    id: number,
    params: {
      fullName?: string;
      role?: string;
      permissions?: string;
      isActive?: number;
    }
  ): SafeUser {
    const current = this.findById(id);
    if (!current) {
      throw new DatabaseError(`User with ID ${id} not found.`);
    }

    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    const updated = {
      fullName: params.fullName !== undefined ? params.fullName.trim() : current.full_name,
      role: params.role !== undefined ? params.role : current.role,
      permissions: params.permissions !== undefined ? params.permissions : current.permissions,
      isActive: params.isActive !== undefined ? params.isActive : current.is_active,
    };

    db.prepare(`
      UPDATE app_users
      SET full_name = ?, role = ?, permissions = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(updated.fullName, updated.role, updated.permissions, updated.isActive, now, id);

    const refreshed = this.findById(id);
    return this.toSafeUser(refreshed!);
  }

  public updatePassword(id: number, passwordHash: string, passwordSalt: string): void {
    const current = this.findById(id);
    if (!current) {
      throw new DatabaseError(`User with ID ${id} not found.`);
    }

    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE app_users
      SET password_hash = ?, password_salt = ?, failed_login_attempts = 0, locked_until = NULL, updated_at = ?
      WHERE id = ?
    `).run(passwordHash, passwordSalt, now, id);
  }

  public toggleUserStatus(id: number, isActive: boolean): SafeUser {
    return this.updateUser(id, { isActive: isActive ? 1 : 0 });
  }
}

