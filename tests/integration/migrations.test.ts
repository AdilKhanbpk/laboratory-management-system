import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';

describe('Integration: Database Migrations Runner', () => {
  let tempDir: string;
  let dbPath: string;
  let migrationsDir: string;
  const encryptionKey = 'MigrationTestCryptKey999!';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-mig-test-'));
    dbPath = path.join(tempDir, 'mig_test.db');
    migrationsDir = path.resolve(__dirname, '../../database/migrations');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup
      }
    }
  });

  it('runs initial migration on a fresh database and populates schema_migrations', () => {
    const manager = new DatabaseManager({ dbPath, encryptionKey });
    const runner = new MigrationRunner(manager, migrationsDir);

    const result = runner.runPendingMigrations();
    expect(result.appliedCount).toBe(11);
    expect(result.latestVersion).toBe(11);

    const applied = runner.getAppliedMigrations();
    expect(applied.length).toBe(11);
    expect(applied[0].version).toBe(1);
    expect(applied[0].name).toBe('initial_schema');
    expect(applied[1].version).toBe(2);
    expect(applied[1].name).toBe('master_data_schema');
    expect(applied[2].version).toBe(3);
    expect(applied[2].name).toBe('visits_and_billing_schema');
    expect(applied[3].version).toBe(4);
    expect(applied[3].name).toBe('results_and_reporting_schema');
    expect(applied[4].version).toBe(5);
    expect(applied[4].name).toBe('who_catalog_standards');
    expect(applied[5].version).toBe(6);
    expect(applied[5].name).toBe('user_permissions');
    expect(applied[6].version).toBe(7);
    expect(applied[6].name).toBe('backup_and_developer_settings');
    expect(applied[7].version).toBe(8);
    expect(applied[7].name).toBe('report_templates');
    expect(applied[8].version).toBe(9);
    expect(applied[8].name).toBe('assets_and_doctor_commission');
    expect(applied[0].checksum).toBeDefined();

    // Verify tables exist
    const db = manager.getDatabase();
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN ('app_users', 'hospital_settings', 'audit_logs', 'visits', 'invoices', 'order_items', 'payments', 'test_results', 'report_snapshots', 'result_amendments', 'report_templates', 'lab_assets', 'owner_payouts');
    `).all() as Array<{ name: string }>;

    expect(tables.map((t) => t.name)).toContain('app_users');
    expect(tables.map((t) => t.name)).toContain('hospital_settings');
    expect(tables.map((t) => t.name)).toContain('audit_logs');
    expect(tables.map((t) => t.name)).toContain('visits');
    expect(tables.map((t) => t.name)).toContain('invoices');
    expect(tables.map((t) => t.name)).toContain('order_items');
    expect(tables.map((t) => t.name)).toContain('payments');
    expect(tables.map((t) => t.name)).toContain('test_results');
    expect(tables.map((t) => t.name)).toContain('report_snapshots');
    expect(tables.map((t) => t.name)).toContain('result_amendments');
    expect(tables.map((t) => t.name)).toContain('report_templates');
    expect(tables.map((t) => t.name)).toContain('lab_assets');
    expect(tables.map((t) => t.name)).toContain('owner_payouts');

    manager.close();
  });

  it('is idempotent when executed multiple times', () => {
    const manager = new DatabaseManager({ dbPath, encryptionKey });
    const runner = new MigrationRunner(manager, migrationsDir);

    const run1 = runner.runPendingMigrations();
    expect(run1.appliedCount).toBe(11);

    const run2 = runner.runPendingMigrations();
    expect(run2.appliedCount).toBe(0);
    expect(run2.latestVersion).toBe(11);

    manager.close();
  });

  it('detects tampering if an applied migration file is modified', () => {
    // Create a local isolated copy of migrations to test tampering
    const isolatedMigDir = path.join(tempDir, 'test_migrations');
    fs.mkdirSync(isolatedMigDir);

    const originalSql = 'CREATE TABLE test_table (id INTEGER PRIMARY KEY);';
    const migFile = path.join(isolatedMigDir, '001_tamper_test.sql');
    fs.writeFileSync(migFile, originalSql);

    const manager = new DatabaseManager({ dbPath, encryptionKey });
    const runner = new MigrationRunner(manager, isolatedMigDir);

    runner.runPendingMigrations();

    // Tamper with the migration file on disk
    fs.writeFileSync(migFile, 'CREATE TABLE test_table (id INTEGER PRIMARY KEY, tampered TEXT);');

    // Running again must detect the checksum mismatch and abort safely
    expect(() => {
      runner.runPendingMigrations();
    }).toThrow(/Migration checksum mismatch/);

    manager.close();
  });

  it('safely stops when database version is newer than supported migrations', () => {
    const manager = new DatabaseManager({ dbPath, encryptionKey });
    const runner = new MigrationRunner(manager, migrationsDir);

    runner.runPendingMigrations();

    // Artificially simulate a future database version (e.g., version 99)
    const db = manager.getDatabase();
    db.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at, checksum)
      VALUES (99, 'future_version_99', datetime('now'), 'fakehash')
    `).run();

    expect(() => {
      runner.runPendingMigrations();
    }).toThrow(/Database schema version \(99\) is newer than what this application supports/);

    manager.close();
  });
});

