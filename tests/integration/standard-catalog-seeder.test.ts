import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { wipeDatabaseAndSeedStandardCatalog, STANDARD_TEST_CATALOG } from '../../electron/database/standard-catalog-seeder';
import { CatalogRepository } from '../../electron/database/repositories/catalog-repository';
import { DoctorRepository } from '../../electron/database/repositories/doctor-repository';
import { PatientRepository } from '../../electron/database/repositories/patient-repository';
import { UserRepository } from '../../electron/database/repositories/user-repository';
import { HospitalRepository } from '../../electron/database/repositories/hospital-repository';

describe('Integration: Standard Catalog Seeder & Clean Slate', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-seeder-test-'));
    dbPath = path.join(tempDir, 'seeder_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'SeederSecretKey2026!' });
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();
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

  it('wipes previous test entries, doctors, and seeds all tests from the hospital slip', () => {
    const db = manager.getDatabase();
    const docRepo = new DoctorRepository(manager);
    const patRepo = new PatientRepository(manager);
    const catRepo = new CatalogRepository(manager);

    // Create old demo data
    docRepo.createDoctor({ fullName: 'Dr. Old Demo Doctor', specialization: 'General Physician' });
    patRepo.createPatient({ fullName: 'Demo Patient', gender: 'male' });
    catRepo.createTest({
      testCode: 'SUGER',
      testName: 'Suger',
      category: 'General',
      pricePaisa: 10000,
    });

    expect(catRepo.getTestByCode('SUGER')).not.toBeNull();
    expect(docRepo.listDoctors().length).toBeGreaterThan(0);

    // Run wipe and seed
    const res = wipeDatabaseAndSeedStandardCatalog(db);
    expect(res.testsInserted).toBe(STANDARD_TEST_CATALOG.length);

    // Verify doctors and patients are wiped clean
    expect(docRepo.listDoctors().length).toBe(0);
    expect(patRepo.searchPatients().total).toBe(0);

    // Verify users and hospital settings are wiped clean for fresh setup
    const userRepo = new UserRepository(manager);
    const hospRepo = new HospitalRepository(manager);
    expect(userRepo.countUsers()).toBe(0);
    expect(hospRepo.getSettings()).toBeNull();

    // Verify old SUGER is deleted
    expect(catRepo.getTestByCode('SUGER')).toBeNull();

    // Verify standard tests exist
    const glu = catRepo.getTestByCode('GLU');
    expect(glu).not.toBeNull();
    expect(glu?.test_name).toBe('Blood Glucose');
    const gluFull = catRepo.getTestById(glu!.id, true);
    expect(gluFull?.parameters?.length).toBe(2);

    const cbc = catRepo.getTestByCode('CBC');
    expect(cbc).not.toBeNull();
    expect(cbc?.test_name).toBe('Complete Blood Count (CBC)');
    const cbcFull = catRepo.getTestById(cbc!.id, true);
    expect(cbcFull?.parameters?.length).toBe(14);

    const urine = catRepo.getTestByCode('URINE');
    expect(urine).not.toBeNull();
    const urineFull = catRepo.getTestById(urine!.id, true);
    expect(urineFull?.parameters?.length).toBe(18);

    const stool = catRepo.getTestByCode('STOOL');
    expect(stool).not.toBeNull();
    const stoolFull = catRepo.getTestById(stool!.id, true);
    expect(stoolFull?.parameters?.length).toBe(9);
  });

  it('is safe to run multiple times without primary key or unique constraint errors', () => {
    const db = manager.getDatabase();
    const res1 = wipeDatabaseAndSeedStandardCatalog(db);
    expect(res1.testsInserted).toBe(STANDARD_TEST_CATALOG.length);

    const res2 = wipeDatabaseAndSeedStandardCatalog(db);
    expect(res2.testsInserted).toBe(STANDARD_TEST_CATALOG.length);
  });
});
