import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { UserRepository } from '../../electron/database/repositories/user-repository';
import { hashPasswordSync } from '../../electron/security/hash';

describe('Integration: User & Authentication Repository', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;
  let userRepo: UserRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-user-test-'));
    dbPath = path.join(tempDir, 'user_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'TestKeyUserRepo2026!' });
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    userRepo = new UserRepository(manager);
  });

  afterEach(() => {
    if (manager) manager.close();
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup
      }
    }
  });

  it('creates initial administrator and prevents duplicate initialization', () => {
    expect(userRepo.countUsers()).toBe(0);

    const { hash, salt } = hashPasswordSync('AdminPassword123!');
    const user = userRepo.createInitialOperator({
      username: 'admin',
      fullName: 'Chief Laboratory Technologist',
      passwordHash: hash,
      passwordSalt: salt,
    });

    expect(user.id).toBe(1);
    expect(user.username).toBe('admin');
    expect(user.role).toBe('admin');
    expect(userRepo.countUsers()).toBe(1);

    // Attempting to create another initial operator must fail
    expect(() => {
      userRepo.createInitialOperator({
        username: 'second_admin',
        fullName: 'Second Admin',
        passwordHash: hash,
        passwordSalt: salt,
      });
    }).toThrow(/Initial operator can only be created when the user directory is empty/);
  });

  it('rejects duplicate usernames with case-insensitive collision', () => {
    const { hash, salt } = hashPasswordSync('Password123!');
    userRepo.createInitialOperator({
      username: 'LabAdmin',
      fullName: 'Lab Admin',
      passwordHash: hash,
      passwordSalt: salt,
    });

    // Lookup case-insensitively
    const foundLower = userRepo.findByUsername('labadmin');
    const foundUpper = userRepo.findByUsername('LABADMIN');
    expect(foundLower?.id).toBe(1);
    expect(foundUpper?.id).toBe(1);

    // Direct insertion of duplicate username must trigger UNIQUE constraint
    const db = manager.getDatabase();
    expect(() => {
      db.prepare(`
        INSERT INTO app_users (username, password_hash, password_salt, full_name, created_at, updated_at)
        VALUES ('LABADMIN', 'hash', 'salt', 'Duplicate', datetime('now'), datetime('now'))
      `).run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('tracks failed login attempts and locks the user after 5 failures', () => {
    const { hash, salt } = hashPasswordSync('Password123!');
    userRepo.createInitialOperator({
      username: 'operator1',
      fullName: 'Operator One',
      passwordHash: hash,
      passwordSalt: salt,
    });

    // First 4 failed attempts should not lock
    for (let i = 1; i <= 4; i++) {
      const res = userRepo.recordFailedLogin('operator1');
      expect(res.locked).toBe(false);
    }

    let user = userRepo.findByUsername('operator1')!;
    expect(userRepo.isUserLocked(user)).toBe(false);

    // 5th failed attempt must lock the account
    const res5 = userRepo.recordFailedLogin('operator1');
    expect(res5.locked).toBe(true);
    expect(res5.lockedUntil).toBeDefined();

    user = userRepo.findByUsername('operator1')!;
    expect(userRepo.isUserLocked(user)).toBe(true);

    // A successful login resets failed attempts and removes lock
    userRepo.recordSuccessfulLogin(user.id);
    user = userRepo.findByUsername('operator1')!;
    expect(user.failed_login_attempts).toBe(0);
    expect(user.locked_until).toBeNull();
    expect(userRepo.isUserLocked(user)).toBe(false);
  });

  it('toSafeUser strips password hash and salt', () => {
    const { hash, salt } = hashPasswordSync('Password123!');
    userRepo.createInitialOperator({
      username: 'op',
      fullName: 'Op',
      passwordHash: hash,
      passwordSalt: salt,
    });

    const rawUser = userRepo.findByUsername('op')!;
    const safe = userRepo.toSafeUser(rawUser);

    expect((safe as any).password_hash).toBeUndefined();
    expect((safe as any).password_salt).toBeUndefined();
    expect(safe.username).toBe('op');
  });

  it('supports creating multiple operators with specific permissions, updating profiles, and resetting passwords', () => {
    const { hash: adminHash, salt: adminSalt } = hashPasswordSync('AdminPass123!');
    userRepo.createInitialOperator({
      username: 'admin',
      fullName: 'System Administrator',
      passwordHash: adminHash,
      passwordSalt: adminSalt,
    });

    const { hash: opHash, salt: opSalt } = hashPasswordSync('StaffPass123!');
    const staff = userRepo.createUser({
      username: 'reception1',
      fullName: 'Ahmad Reception',
      passwordHash: opHash,
      passwordSalt: opSalt,
      role: 'operator',
      permissions: 'new-visit,billing',
    });

    expect(staff.id).toBe(2);
    expect(staff.username).toBe('reception1');
    expect(staff.role).toBe('operator');
    expect(staff.permissions).toBe('new-visit,billing');
    expect(userRepo.countUsers()).toBe(2);

    // Update staff permissions
    const updated = userRepo.updateUser(staff.id, {
      fullName: 'Ahmad Khan',
      permissions: 'new-visit,billing,results',
    });
    expect(updated.full_name).toBe('Ahmad Khan');
    expect(updated.permissions).toBe('new-visit,billing,results');

    // Update password
    const { hash: newHash, salt: newSalt } = hashPasswordSync('NewStaffPass456!');
    userRepo.updatePassword(staff.id, newHash, newSalt);

    const reloaded = userRepo.findById(staff.id)!;
    expect(reloaded.password_hash).toBe(newHash);

    // Toggle active status
    const deactivated = userRepo.toggleUserStatus(staff.id, false);
    expect(deactivated.is_active).toBe(0);

    const userList = userRepo.listUsers();
    expect(userList.length).toBe(2);
  });
});

