import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { DoctorCommissionRepository } from '../../electron/database/repositories/doctor-commission-repository';
import { DoctorRepository } from '../../electron/database/repositories/doctor-repository';
import { PatientRepository } from '../../electron/database/repositories/patient-repository';
import { CatalogRepository } from '../../electron/database/repositories/catalog-repository';
import { VisitRepository } from '../../electron/database/repositories/visit-repository';
import { UserRepository } from '../../electron/database/repositories/user-repository';

describe('Integration: Doctor Commission & Settlement Repository', () => {
  let tempDir: string;
  let dbPath: string;
  let dbManager: DatabaseManager;
  let commissionRepo: DoctorCommissionRepository;
  let doctorRepo: DoctorRepository;
  let patientRepo: PatientRepository;
  let catalogRepo: CatalogRepository;
  let visitRepo: VisitRepository;
  let userRepo: UserRepository;
  let operatorId: number;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-doc-comm-test-'));
    dbPath = path.join(tempDir, 'doc_comm_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    dbManager = new DatabaseManager({ dbPath, encryptionKey: 'SecureDocCommKey2026!' });
    const runner = new MigrationRunner(dbManager, migrationsDir);
    runner.runPendingMigrations();

    commissionRepo = new DoctorCommissionRepository(dbManager);
    doctorRepo = new DoctorRepository(dbManager);
    patientRepo = new PatientRepository(dbManager);
    catalogRepo = new CatalogRepository(dbManager);
    visitRepo = new VisitRepository(dbManager);
    userRepo = new UserRepository(dbManager);

    const user = userRepo.createInitialOperator({
      username: 'admin',
      passwordHash: 'dummy_hash',
      passwordSalt: 'dummy_salt',
      fullName: 'Lead Pathologist',
    });
    operatorId = user.id;
  });

  afterEach(() => {
    try {
      dbManager.close();
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('calculates earned commission according to doctor percentage (e.g. 30%) and tracks balance', () => {
    // Create doctor with 30% commission
    const doc = doctorRepo.createDoctor({
      fullName: 'Dr. Tariq Khan',
      specialization: 'Physician',
      commissionPercentage: 30,
    });

    // Create a patient
    const patient = patientRepo.createPatient({
      fullName: 'Shahid Afridi',
      gender: 'male',
      dateOfBirth: '1985-06-15',
    });

    // Create a test in catalog (price Rs. 2,000 = 200,000 paisa)
    const test = catalogRepo.createTest({
      testCode: 'LFT',
      testName: 'Liver Function Tests',
      category: 'Biochemistry',
      pricePaisa: 200000,
    });

    // Create a visit referring to Dr. Tariq Khan
    visitRepo.createVisitWithOrder(
      {
        patientId: patient.id,
        referringDoctorId: doc.id,
        testIds: [test.id],
        paidAmountPaisa: 200000,
        paymentMethod: 'cash',
      },
      operatorId
    );

    // Total net bill = Rs. 2,000 (200000 paisa)
    // Doctor commission @ 30% = Rs. 600 (60,000 paisa)
    const summary = commissionRepo.getDoctorSummary(doc.id);
    expect(summary).toBeDefined();
    expect(summary?.commissionPercentage).toBe(30);
    expect(summary?.totalReferredVisits).toBe(1);
    expect(summary?.netRevenuePaisa).toBe(200000);
    expect(summary?.totalEarnedCommissionPaisa).toBe(60000); // 30% of 2000 = 600
    expect(summary?.totalPaidPaisa).toBe(0);
    expect(summary?.remainingBalancePaisa).toBe(60000);

    // Record payout of Rs. 400 (40,000 paisa)
    const payout = commissionRepo.recordDoctorPayout(
      {
        doctorId: doc.id,
        amountPaisa: 40000,
        paymentDate: '2026-10-27',
        paymentMethod: 'cash',
        notes: 'Partial settlement for week 1',
      },
      operatorId
    );

    expect(payout.id).toBeGreaterThan(0);
    expect(payout.amountPaisa).toBe(40000);

    // Verify updated summary
    const updatedSummary = commissionRepo.getDoctorSummary(doc.id);
    expect(updatedSummary?.totalPaidPaisa).toBe(40000);
    expect(updatedSummary?.remainingBalancePaisa).toBe(20000); // 600 - 400 = 200 (20,000 paisa)
  });

  it('records payout modification audit trail and deduplicates properly', () => {
    const doc = doctorRepo.createDoctor({
      fullName: 'Dr. Sarah Fatima',
      commissionPercentage: 20,
    });

    // Record initial payout of Rs. 1,000
    const initialPayout = commissionRepo.recordDoctorPayout(
      {
        doctorId: doc.id,
        amountPaisa: 100000,
        paymentDate: '2026-10-27',
        paymentMethod: 'cash',
        notes: 'Initial cash payout',
      },
      operatorId
    );

    // Edit payout from 1,000 to 1,500 with reason
    const editedPayout = commissionRepo.updateDoctorPayout(
      {
        id: initialPayout.id,
        doctorId: doc.id,
        amountPaisa: 150000,
        paymentDate: '2026-10-27',
        paymentMethod: 'bank_transfer',
        notes: 'Initial cash payout',
        editReason: 'Corrected amount to include weekend allowance',
      },
      operatorId
    );

    expect(editedPayout.amountPaisa).toBe(150000);
    expect(editedPayout.paymentMethod).toBe('bank_transfer');
    expect(editedPayout.notes).toContain('[EDIT HISTORY');
    expect(editedPayout.notes).toContain('Corrected amount to include weekend allowance');
    expect(editedPayout.notes).toContain('Amount changed from Rs. 1,000 to Rs. 1,500');

    // Edit again to 2,000
    const secondEdit = commissionRepo.updateDoctorPayout(
      {
        id: initialPayout.id,
        doctorId: doc.id,
        amountPaisa: 200000,
        paymentDate: '2026-10-27',
        paymentMethod: 'bank_transfer',
        notes: 'Initial cash payout',
        editReason: 'Second modification',
      },
      operatorId
    );

    expect(secondEdit.amountPaisa).toBe(200000);
    expect(secondEdit.notes).toContain('Second modification');
    // Ensure both edit histories are preserved cleanly
    const count = (secondEdit.notes?.match(/\[EDIT HISTORY/g) || []).length;
    expect(count).toBe(2);
  });
});

