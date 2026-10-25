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
    expect(rangeCount).toBeGreaterThanOrEqual(paramCount);

    // Verify sample test: Complete Blood Count (CBC)
    const cbc = db.prepare('SELECT * FROM lab_tests WHERE test_code = ?').get('CBC');
    expect(cbc).toBeDefined();
    expect(cbc.test_name).toBe('COMPLETE BLOOD COUNT');
    expect(cbc.category).toBe('HEMATOLOGY');
    expect(cbc.price_paisa).toBe(50000); // Rs 500 = 50000 paisa

    // Verify Male (M) and Female (F) ranges for CBC Hemoglobin
    const hbRanges = db.prepare(`
      SELECT prr.* FROM parameter_reference_ranges prr
      JOIN test_parameters tp ON prr.parameter_id = tp.id
      JOIN lab_tests lt ON tp.test_id = lt.id
      WHERE lt.test_code = 'CBC' AND tp.parameter_name = 'HB'
    `).all();
    expect(hbRanges.length).toBe(2);
    expect(hbRanges.some((r: any) => r.gender === 'male' && r.normal_low === 13.0 && r.normal_high === 17.0)).toBe(true);
    expect(hbRanges.some((r: any) => r.gender === 'female' && r.normal_low === 11.5 && r.normal_high === 15.5)).toBe(true);

    // Verify Adult (Ad.) and Child (Ch.) ranges for CBC MCV
    const mcvRanges = db.prepare(`
      SELECT prr.* FROM parameter_reference_ranges prr
      JOIN test_parameters tp ON prr.parameter_id = tp.id
      JOIN lab_tests lt ON tp.test_id = lt.id
      WHERE lt.test_code = 'CBC' AND tp.parameter_name = 'MCV'
    `).all();
    expect(mcvRanges.length).toBe(2);
    expect(mcvRanges.some((r: any) => r.min_age_days >= 6000 && r.normal_low === 76.0 && r.normal_high === 96.0)).toBe(true);
    expect(mcvRanges.some((r: any) => r.max_age_days < 6600 && r.normal_low === 80.0 && r.normal_high === 105.0)).toBe(true);

    // Verify idempotency: re-running updates without duplicate code error
    const secondRun = importLegacyTestsToActiveDatabase(dbManager, legacyBakPath);
    expect(secondRun.totalTests).toBe(249);
    expect(secondRun.testsUpdated).toBe(249);
    expect(secondRun.testsInserted).toBe(0);
  });
});

