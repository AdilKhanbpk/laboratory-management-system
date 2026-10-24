import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { CatalogRepository } from '../../electron/database/repositories/catalog-repository';

describe('Integration: Test Catalog & Parameter Repository', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;
  let catalogRepo: CatalogRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-catalog-test-'));
    dbPath = path.join(tempDir, 'catalog_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'CatalogSecretKey2026!' });
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    catalogRepo = new CatalogRepository(manager);
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

  it('creates multi-parameter test (CBC) with parameters and reference ranges transactionally', () => {
    const cbcTest = catalogRepo.createTest(
      {
        testCode: 'CBC',
        testName: 'Complete Blood Count',
        category: 'Hematology',
        description: 'Complete hemogram with automated differentials',
        pricePaisa: 85000, // Rs. 850.00
      },
      [
        {
          parameter_name: 'Hemoglobin (Hb)',
          display_order: 1,
          unit: 'g/dL',
          parameter_type: 'numeric',
          ranges: [
            {
              gender: 'male',
              min_age_days: 5840,
              max_age_days: 47450,
              normal_low: 13.5,
              normal_high: 17.5,
              panic_low: 7.0,
              panic_high: 20.0,
              display_text: '13.5 - 17.5 g/dL',
            },
          ],
        },
        {
          parameter_name: 'Total Leukocyte Count (TLC)',
          display_order: 2,
          unit: 'cells/mcL',
          parameter_type: 'numeric',
          ranges: [
            {
              gender: 'all',
              min_age_days: 0,
              max_age_days: 47450,
              normal_low: 4000,
              normal_high: 11000,
              panic_low: 2000,
              panic_high: 30000,
              display_text: '4,000 - 11,000 cells/mcL',
            },
          ],
        },
      ]
    );

    expect(cbcTest.id).toBe(1);
    expect(cbcTest.test_code).toBe('CBC');
    expect(cbcTest.price_paisa).toBe(85000);
    expect(cbcTest.parameters?.length).toBe(2);
    expect(cbcTest.parameters?.[0].parameter_name).toBe('Hemoglobin (Hb)');
    expect(cbcTest.parameters?.[0].display_order).toBe(1);
    expect(cbcTest.parameters?.[0].ranges.length).toBe(1);
    expect(cbcTest.parameters?.[0].ranges[0].display_text).toBe('13.5 - 17.5 g/dL');
  });

  it('enforces case-insensitive uniqueness on test codes (e.g. CBC vs cbc)', () => {
    catalogRepo.createTest({
      testCode: 'BSF',
      testName: 'Blood Sugar Fasting',
      category: 'Biochemistry',
      pricePaisa: 35000,
    });

    // Attempting to create duplicate test code with different case must throw
    expect(() => {
      catalogRepo.createTest({
        testCode: 'bsf',
        testName: 'Another Sugar Test',
        category: 'Biochemistry',
        pricePaisa: 30000,
      });
    }).toThrow(/already exists/);
  });

  it('rejects negative test prices but permits zero-priced complimentary tests', () => {
    // Negative price must throw
    expect(() => {
      catalogRepo.createTest({
        testCode: 'NEG1',
        testName: 'Negative Price Test',
        category: 'General',
        pricePaisa: -500,
      });
    }).toThrow(/cannot be negative/);

    // Zero price must succeed
    const zeroTest = catalogRepo.createTest({
      testCode: 'FREE1',
      testName: 'Complimentary Screening',
      category: 'General',
      pricePaisa: 0,
    });

    expect(zeroTest.price_paisa).toBe(0);
  });

  it('preserves parameter display ordering and updates parameters correctly', () => {
    const test = catalogRepo.createTest(
      {
        testCode: 'LFT',
        testName: 'Liver Function Tests',
        category: 'Biochemistry',
        pricePaisa: 150000,
      },
      [
        { parameter_name: 'Bilirubin Total', display_order: 1, unit: 'mg/dL' },
        { parameter_name: 'ALT (SGPT)', display_order: 2, unit: 'U/L' },
      ]
    );

    const updated = catalogRepo.updateTest(
      test.id,
      {
        testCode: 'LFT',
        testName: 'Liver Function Tests (Complete Profile)',
        category: 'Biochemistry',
        pricePaisa: 160000,
      },
      [
        { parameter_name: 'Bilirubin Total', display_order: 1, unit: 'mg/dL' },
        { parameter_name: 'Bilirubin Direct', display_order: 2, unit: 'mg/dL' },
        { parameter_name: 'ALT (SGPT)', display_order: 3, unit: 'U/L' },
      ]
    );

    expect(updated.parameters?.length).toBe(3);
    expect(updated.parameters?.[1].parameter_name).toBe('Bilirubin Direct');
    expect(updated.price_paisa).toBe(160000);
  });
});

