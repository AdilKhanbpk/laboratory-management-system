import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DatabaseConstructor = require('better-sqlite3-multiple-ciphers');

export interface DatabaseConfig {
  dbPath: string;
  encryptionKey: string;
  readOnly?: boolean;
  verbose?: boolean;
}

export class DatabaseError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class DatabaseDecryptionError extends DatabaseError {
  constructor(message = 'Failed to decrypt database. The encryption key is invalid or the database file is corrupted.') {
    super(message);
    this.name = 'DatabaseDecryptionError';
  }
}

export class DatabaseManager {
  private db: any = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  public open(): any {
    if (this.db) {
      return this.db;
    }

    const dir = path.dirname(this.config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      this.db = new DatabaseConstructor(this.config.dbPath, {
        readonly: this.config.readOnly || false,
        timeout: 5000,
        verbose: this.config.verbose ? console.log : undefined,
      });

      // Apply SQLCipher / SQLite3 Multiple Ciphers key
      // We pass the key safely escaped as a string literal or hex
      const escapedKey = this.config.encryptionKey.replace(/'/g, "''");
      this.db.pragma(`key = '${escapedKey}'`);

      // Verify encryption works by executing a lightweight query
      // If the key is incorrect or the database is corrupted, this will throw "file is not a database"
      this.db.pragma('cipher_compatibility = 4');
      this.db.prepare('SELECT count(*) AS count FROM sqlite_master').get();

      // Enforce crucial database integrity settings
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('busy_timeout = 5000');

      return this.db;
    } catch (err: any) {
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // ignore close error
        }
        this.db = null;
      }

      const msg = err?.message || String(err);
      if (msg.includes('file is not a database') || msg.includes('not a database') || msg.includes('unsupported file format')) {
        throw new DatabaseDecryptionError();
      }

      throw new DatabaseError(`Database connection failed: ${msg}`, err);
    }
  }

  public getDatabase(): any {
    if (!this.db) {
      return this.open();
    }
    return this.db;
  }

  public runTransaction<T>(fn: (db: any) => T): T {
    const db = this.getDatabase();
    const executeTx = db.transaction(() => fn(db));
    return executeTx();
  }

  public checkIntegrity(): { ok: boolean; details: string[] } {
    const db = this.getDatabase();
    const rows = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const results = rows.map((r) => r.integrity_check);
    const ok = results.length === 1 && results[0] === 'ok';
    return { ok, details: results };
  }

  public getDbPath(): string {
    return this.config.dbPath;
  }

  public getEncryptionKey(): string {
    return this.config.encryptionKey;
  }

  public backupOnline(targetPath: string): void {
    const db = this.getDatabase();
    db.prepare('VACUUM INTO ?').run(targetPath);
  }

  public close(): void {
    if (this.db) {
      try {
        // Optimize checkpoint before closing
        this.db.pragma('wal_checkpoint(TRUNCATE)');
        this.db.close();
      } catch (err) {
        console.error('Error during database close:', err);
      } finally {
        this.db = null;
      }
    }
  }

  public reopen(): any {
    this.close();
    return this.open();
  }

  public reconfigure(newConfig: DatabaseConfig): void {
    this.close();
    this.config = newConfig;
  }

  public isOpen(): boolean {
    return this.db !== null && this.db.open;
  }
}

