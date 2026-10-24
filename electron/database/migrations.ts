import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseManager, DatabaseError } from './connection';

export interface MigrationFile {
  version: number;
  name: string;
  filePath: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  applied_at: string;
  checksum: string;
}

export class MigrationRunner {
  private dbManager: DatabaseManager;
  private migrationsDirectory: string;

  constructor(dbManager: DatabaseManager, migrationsDirectory: string) {
    this.dbManager = dbManager;
    this.migrationsDirectory = migrationsDirectory;
  }

  /**
   * Reads all SQL migration files in the migrations directory.
   * Expects files matching format: 001_name.sql, 002_name.sql, etc.
   */
  public loadMigrationFiles(): MigrationFile[] {
    if (!fs.existsSync(this.migrationsDirectory)) {
      throw new DatabaseError(`Migrations directory does not exist: ${this.migrationsDirectory}`);
    }

    const files = fs.readdirSync(this.migrationsDirectory)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const migrations: MigrationFile[] = [];

    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        continue;
      }

      const version = parseInt(match[1], 10);
      const name = match[2];
      const filePath = path.join(this.migrationsDirectory, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sql.trim()).digest('hex');

      migrations.push({
        version,
        name,
        filePath,
        sql,
        checksum,
      });
    }

    return migrations.sort((a, b) => a.version - b.version);
  }

  /**
   * Initializes the schema_migrations tracking table if it doesn't exist.
   */
  private ensureMigrationsTable(): void {
    const db = this.dbManager.getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT NOT NULL
      );
    `);
  }

  /**
   * Retrieves list of already applied migrations from the database.
   */
  public getAppliedMigrations(): AppliedMigration[] {
    this.ensureMigrationsTable();
    const db = this.dbManager.getDatabase();
    const rows = db.prepare('SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY version ASC').all();
    return rows as AppliedMigration[];
  }

  /**
   * Gets current schema version (highest applied version, or 0 if none).
   */
  public getCurrentVersion(): number {
    const applied = this.getAppliedMigrations();
    if (applied.length === 0) return 0;
    return applied[applied.length - 1].version;
  }

  /**
   * Gets the highest version supported by the local migration files.
   */
  public getMaxSupportedVersion(): number {
    try {
      const files = this.loadMigrationFiles();
      if (files.length === 0) return 4;
      return files[files.length - 1].version;
    } catch {
      return 4;
    }
  }

  /**
   * Runs all pending migrations in order, inside individual transactions.
   */
  public runPendingMigrations(): { appliedCount: number; latestVersion: number } {
    this.ensureMigrationsTable();

    const diskMigrations = this.loadMigrationFiles();
    const appliedMigrations = this.getAppliedMigrations();
    const appliedMap = new Map(appliedMigrations.map((m) => [m.version, m]));

    const maxDiskVersion = diskMigrations.length > 0 ? diskMigrations[diskMigrations.length - 1].version : 0;
    const currentVersion = this.getCurrentVersion();

    // Guard against unsupported future database versions
    if (currentVersion > maxDiskVersion) {
      throw new DatabaseError(
        `Database schema version (${currentVersion}) is newer than what this application supports (max: ${maxDiskVersion}). Please update the application.`
      );
    }

    // Verify integrity of previously applied migrations (tamper detection)
    for (const diskMig of diskMigrations) {
      const applied = appliedMap.get(diskMig.version);
      if (applied) {
        if (applied.checksum !== diskMig.checksum) {
          throw new DatabaseError(
            `Migration checksum mismatch for version ${diskMig.version} (${diskMig.name}). ` +
            `Existing migrations must never be modified once applied.`
          );
        }
      }
    }

    // Determine pending migrations
    const pending = diskMigrations.filter((m) => !appliedMap.has(m.version));
    let appliedCount = 0;

    for (const migration of pending) {
      this.dbManager.runTransaction((tx) => {
        // Execute migration SQL
        tx.exec(migration.sql);

        // Record in schema_migrations
        const now = new Date().toISOString();
        const insertStmt = tx.prepare(`
          INSERT INTO schema_migrations (version, name, applied_at, checksum)
          VALUES (?, ?, ?, ?)
        `);
        insertStmt.run(migration.version, migration.name, now, migration.checksum);
      });
      appliedCount++;
    }

    return {
      appliedCount,
      latestVersion: this.getCurrentVersion(),
    };
  }
}

