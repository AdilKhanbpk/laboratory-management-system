import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import {
  detectLegacyTestCatalog,
  importLegacyTestsToActiveDatabase,
} from '../../electron/database/legacy-test-importer';

describe('Legacy Test Importer Integration', () => {
  let tempDir: string;
  let testDbPath: string;
  let dbManager: DatabaseManager;
  const legacyBakPath = path.resolve(__dirname, '../../20261013130521.bak');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-test-legacy-import-'));
    testDbPath = path.join(tempDir, 'test_lms.db');

    dbManager = new DatabaseManager({
      dbPath: testDbPath,
      encryptionKey: 'test-secret-key-123456789012345678901234567890',
    });

    dbManager.open();

    const migrationsDir = path.resolve(__dirname, '../../database/migrations');
    const runner = new MigrationRunner(dbManager, migrationsDir);
    runner.runPendingMigrations();
  });

  afterEach(() => {
    try {
      dbManager.close();
    } catch {
      // Ignore
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('detects 249 tests and 446 parameters in the candidate backup file', () => {
    const detection = detectLegacyTestCatalog(legacyBakPath);
    expect(detection.detected).toBe(true);
    expect(detection.testsCount).toBe(249);
    expect(detection.parametersCount).toBe(446);
    expect(detection.departmentsCount).toBe(13);
  });

  it('imports all 249 tests and parameters into the active database with one call', () => {
    const stats = importLegacyTestsToActiveDatabase(dbManager, legacyBakPath);

    expect(stats.totalTests).toBe(249);
    expect(stats.testsInserted).toBe(249);
    expect(stats.parametersInserted).toBeGreaterThanOrEqual(446);

    const db = dbManager.getDatabase();
    const testCount = db.prepare('SELECT count(*) as c FROM lab_tests').get().c;
    const paramCount = db.prepare('SELECT count(*) as c FROM test_parameters').get().c;
    const rangeCount = db.prepare('SELECT count(*) as c FROM parameter_reference_ranges').get().c;

    expect(testCount).toBe(249);
    expect(paramCount).toBeGreaterThanOrEqual(446);
    expect(rangeCount).toBe(paramCount);

    // Verify sample test: Complete Blood Count (CBC)
    const cbc = db.prepare('SELECT * FROM lab_tests WHERE test_code = ?').get('CBC');
    expect(cbc).toBeDefined();
    expect(cbc.test_name).toBe('COMPLETE BLOOD COUNT');
    expect(cbc.category).toBe('HEMATOLOGY');
    expect(cbc.price_paisa).toBe(50000); // Rs 500 = 50000 paisa

    // Verify idempotency: re-running updates without duplicate code error
    const secondRun = importLegacyTestsToActiveDatabase(dbManager, legacyBakPath);
    expect(secondRun.totalTests).toBe(249);
    expect(secondRun.testsUpdated).toBe(249);
    expect(secondRun.testsInserted).toBe(0);
  });
});

