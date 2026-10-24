import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { UserRepository } from '../../electron/database/repositories/user-repository';
import { PatientRepository } from '../../electron/database/repositories/patient-repository';
import { DoctorRepository } from '../../electron/database/repositories/doctor-repository';
import { CatalogRepository } from '../../electron/database/repositories/catalog-repository';
import { VisitRepository } from '../../electron/database/repositories/visit-repository';

describe('Integration: Historical Price Snapshots & Integrity', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;
  let userRepo: UserRepository;
  let patientRepo: PatientRepository;
  let doctorRepo: DoctorRepository;
  let catalogRepo: CatalogRepository;
  let visitRepo: VisitRepository;
  let operatorId: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-historical-test-'));
    dbPath = path.join(tempDir, 'historical_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'HistoricalSecretKey2026!' });
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    userRepo = new UserRepository(manager);
    patientRepo = new PatientRepository(manager);
    doctorRepo = new DoctorRepository(manager);
    catalogRepo = new CatalogRepository(manager);
    visitRepo = new VisitRepository(manager);

    const user = userRepo.createInitialOperator({
      username: 'admin',
      passwordHash: 'dummy_hash',
      passwordSalt: 'dummy_salt',
      fullName: 'Supervisor',
    });
    operatorId = user.id;
  });

  afterEach(() => {
    try {
      manager.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('guarantees that subsequent test price updates do NOT alter historical invoices or order items', () => {
    const patient = patientRepo.createPatient({ fullName: 'Hamza Tariq', gender: 'male' });
    const test = catalogRepo.createTest({
      testCode: 'CBC',
      testName: 'Complete Blood Count',
      category: 'Hematology',
      pricePaisa: 100000, // 1000 PKR
    });

    // Create visit at 1000 PKR
    const initialVisit = visitRepo.createVisitWithOrder(
      {
        patientId: patient.id,
        testIds: [test.id],
        paidAmountPaisa: 100000,
      },
      operatorId
    );

    expect(initialVisit.invoice.subtotal_amount).toBe(100000);
    expect(initialVisit.orderItems[0].price_snapshot).toBe(100000);

    // Later: Laboratory increases price to 1800 PKR (180000 paisa)
    catalogRepo.updateTest(test.id, {
      testCode: 'CBC',
      testName: 'Complete Blood Count (Updated Automated Differential)',
      category: 'Hematology',
      pricePaisa: 180000,
    });

    // Re-query historical visit
    const reloaded = visitRepo.getVisitById(initialVisit.visit.id);

    // Historical invoice MUST remain at 1000 PKR!
    expect(reloaded?.invoice.subtotal_amount).toBe(100000);
    expect(reloaded?.invoice.final_total).toBe(100000);
    expect(reloaded?.orderItems[0].price_snapshot).toBe(100000);
    expect(reloaded?.orderItems[0].test_name_snapshot).toBe('Complete Blood Count');
  });

  it('preserves historical orders and receipts when a test or doctor is deactivated', () => {
    const patient = patientRepo.createPatient({ fullName: 'Amina Bibi', gender: 'female' });
    const doctor = doctorRepo.createDoctor({ fullName: 'Dr. Retiring Physician' });
    const test = catalogRepo.createTest({
      testCode: 'OBSOLETE',
      testName: 'Old Manual Method Test',
      category: 'General',
      pricePaisa: 75000,
    });

    const visit = visitRepo.createVisitWithOrder(
      {
        patientId: patient.id,
        referringDoctorId: doctor.id,
        testIds: [test.id],
        paidAmountPaisa: 75000,
      },
      operatorId
    );

    // Deactivate both doctor and test
    doctorRepo.setDoctorActiveStatus(doctor.id, false);
    catalogRepo.setTestActiveStatus(test.id, false);

    // Fetch historical visit
    const reloaded = visitRepo.getVisitById(visit.visit.id);

    expect(reloaded).not.toBeNull();
    expect(reloaded?.doctor?.full_name).toBe('Dr. Retiring Physician');
    expect(reloaded?.orderItems[0].test_name_snapshot).toBe('Old Manual Method Test');
    expect(reloaded?.invoice.final_total).toBe(75000);
    expect(reloaded?.invoice.payment_status).toBe('paid');
  });
});

