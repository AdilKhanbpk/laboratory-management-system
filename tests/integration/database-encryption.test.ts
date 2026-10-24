import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager, DatabaseDecryptionError } from '../../electron/database/connection';

describe('Integration: Encrypted SQLite & Multiple Ciphers', () => {
  let tempDir: string;
  let dbPath: string;
  const validKey = 'CorrectCryptographicMasterKey2026!';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-db-enc-test-'));
    dbPath = path.join(tempDir, 'encrypted_test.db');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // file handle release
      }
    }
  });

  it('creates an encrypted database where raw file contains NO plaintext data and NO SQLite header', () => {
    const manager = new DatabaseManager({ dbPath, encryptionKey: validKey });
    const db = manager.open();

    db.exec(`
      CREATE TABLE patient_records (
        id INTEGER PRIMARY KEY,
        patient_mrn TEXT NOT NULL,
        diagnosis TEXT NOT NULL
      );
    `);

    db.prepare('INSERT INTO patient_records (patient_mrn, diagnosis) VALUES (?, ?)')
      .run('MRN-99941-SECURE', 'CONFIDENTIAL_CLINICAL_DIAGNOSIS_DATA');

    manager.close();

    // Inspect raw file bytes on disk
    const rawBytes = fs.readFileSync(dbPath);
    const plaintextHeader = Buffer.from('SQLite format 3');
    const sensitiveData1 = Buffer.from('MRN-99941-SECURE');
    const sensitiveData2 = Buffer.from('CONFIDENTIAL_CLINICAL_DIAGNOSIS_DATA');

    expect(rawBytes.includes(plaintextHeader)).toBe(false);
    expect(rawBytes.includes(sensitiveData1)).toBe(false);
    expect(rawBytes.includes(sensitiveData2)).toBe(false);
  });

  it('successfully opens, queries, and writes with the correct key', () => {
    // 1. Create and populate
    const manager1 = new DatabaseManager({ dbPath, encryptionKey: validKey });
    const db1 = manager1.open();
    db1.exec('CREATE TABLE test_data (val TEXT);');
    db1.prepare('INSERT INTO test_data VALUES (?)').run('VERIFIED_RECORD');
    manager1.close();

    // 2. Re-open with same key
    const manager2 = new DatabaseManager({ dbPath, encryptionKey: validKey });
    const db2 = manager2.open();
    const row = db2.prepare('SELECT val FROM test_data').get() as { val: string };
    expect(row.val).toBe('VERIFIED_RECORD');
    manager2.close();
  });

  it('fails safely with DatabaseDecryptionError when opened with a wrong key', () => {
    // 1. Create with valid key
    const manager1 = new DatabaseManager({ dbPath, encryptionKey: validKey });
    const db1 = manager1.open();
    db1.exec('CREATE TABLE sensitive (note TEXT);');
    db1.prepare('INSERT INTO sensitive VALUES (?)').run('SECRET');
    manager1.close();

    // 2. Try to open with wrong key
    const managerWrong = new DatabaseManager({ dbPath, encryptionKey: 'WrongKeyAttempt12345!' });
    expect(() => {
      managerWrong.open();
    }).toThrow(DatabaseDecryptionError);
  });

  it('enforces foreign key constraints (PRAGMA foreign_keys = ON)', () => {
    const manager = new DatabaseManager({ dbPath, encryptionKey: validKey });
    const db = manager.open();

    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
    `);

    // Inserting a child with non-existent parent must throw SQLite constraint error
    expect(() => {
      db.prepare('INSERT INTO child (id, parent_id) VALUES (1, 999)').run();
    }).toThrow(/FOREIGN KEY constraint failed/);

    manager.close();
  });

  it('enforces WAL journal mode and passes integrity check', () => {
    const manager = new DatabaseManager({ dbPath, encryptionKey: validKey });
    manager.open();

    const integrity = manager.checkIntegrity();
    expect(integrity.ok).toBe(true);
    expect(integrity.details).toEqual(['ok']);

    const db = manager.getDatabase();
    const mode = db.pragma('journal_mode', { simple: true });
    expect(mode).toBe('wal');

    manager.close();
  });
});

