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
import { DoctorStatsRepository } from '../../electron/database/repositories/doctor-stats-repository';

describe('Integration: Doctor Referral Statistics Repository', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;
  let userRepo: UserRepository;
  let patientRepo: PatientRepository;
  let doctorRepo: DoctorRepository;
  let catalogRepo: CatalogRepository;
  let visitRepo: VisitRepository;
  let doctorStatsRepo: DoctorStatsRepository;
  let operatorId: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-doc-stats-test-'));
    dbPath = path.join(tempDir, 'doc_stats_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'DoctorStatsKey2026!' });
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    userRepo = new UserRepository(manager);
    patientRepo = new PatientRepository(manager);
    doctorRepo = new DoctorRepository(manager);
    catalogRepo = new CatalogRepository(manager);
    visitRepo = new VisitRepository(manager);
    doctorStatsRepo = new DoctorStatsRepository(manager);

    const user = userRepo.createInitialOperator({
      username: 'admin',
      passwordHash: 'dummy_hash',
      passwordSalt: 'dummy_salt',
      fullName: 'Chief Pathologist',
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

  it('aggregates total visits, unique patients, tests ordered, and revenue per doctor', () => {
    const doc1 = doctorRepo.createDoctor({ fullName: 'Dr. Tariq', specialization: 'Cardiology' });
    const doc2 = doctorRepo.createDoctor({ fullName: 'Dr. Ayesha', specialization: 'Pediatrics' });

    const p1 = patientRepo.createPatient({ fullName: 'Patient A', gender: 'male' });
    const p2 = patientRepo.createPatient({ fullName: 'Patient B', gender: 'female' });

    const test1 = catalogRepo.createTest({
      testCode: 'ECG',
      testName: 'Electrocardiogram',
      category: 'Cardiology',
      pricePaisa: 100000,
    });
    const test2 = catalogRepo.createTest({
      testCode: 'TROP',
      testName: 'Troponin-I',
      category: 'Cardiology',
      pricePaisa: 250000,
    });

    // Visit 1: Dr. Tariq refers Patient A for 2 tests (Subtotal: 350,000, 10% discount -> Net 315,000)
    visitRepo.createVisitWithOrder(
      {
        patientId: p1.id,
        referringDoctorId: doc1.id,
        testIds: [test1.id, test2.id],
        discountType: 'percentage',
        discountValue: 10,
        paidAmountPaisa: 315000,
      },
      operatorId
    );

    // Visit 2: Dr. Tariq refers Patient A AGAIN for 1 test (Subtotal: 100,000 -> Net 100,000)
    visitRepo.createVisitWithOrder(
      {
        patientId: p1.id,
        referringDoctorId: doc1.id,
        testIds: [test1.id],
        paidAmountPaisa: 100000,
      },
      operatorId
    );

    // Visit 3: Dr. Ayesha refers Patient B for 1 test (Subtotal: 100,000 -> Net 100,000)
    visitRepo.createVisitWithOrder(
      {
        patientId: p2.id,
        referringDoctorId: doc2.id,
        testIds: [test1.id],
        paidAmountPaisa: 100000,
      },
      operatorId
    );

    // Visit 4: Walk-in Patient (No Doctor Selected) for 1 test
    visitRepo.createVisitWithOrder(
      {
        patientId: p1.id,
        testIds: [test2.id],
        paidAmountPaisa: 250000,
      },
      operatorId
    );

    const stats = doctorStatsRepo.getDoctorReferralStats();

    expect(stats.length).toBe(3);

    // Self / Direct Walk-in Stats
    const selfStats = stats.find((s) => s.doctorId === 0);
    expect(selfStats).toBeDefined();
    expect(selfStats?.doctorName).toBe('Self / Direct (No Doctor Selected)');
    expect(selfStats?.totalVisits).toBe(1);
    expect(selfStats?.grossRevenuePaisa).toBe(250000);

    // Dr. Tariq should have 2 visits, 1 unique patient (Patient A), 3 tests ordered, gross 450,000 paisa, net 415,000 paisa
    const tariqStats = stats.find((s) => s.doctorId === doc1.id);
    expect(tariqStats).toBeDefined();
    expect(tariqStats?.totalVisits).toBe(2);
    expect(tariqStats?.uniquePatients).toBe(1);
    expect(tariqStats?.totalTestsOrdered).toBe(3);
    expect(tariqStats?.grossRevenuePaisa).toBe(450000);
    expect(tariqStats?.netRevenuePaisa).toBe(415000);

    // Dr. Ayesha should have 1 visit, 1 unique patient, 1 test ordered, gross 100,000, net 100,000
    const ayeshaStats = stats.find((s) => s.doctorId === doc2.id);
    expect(ayeshaStats).toBeDefined();
    expect(ayeshaStats?.totalVisits).toBe(1);
    expect(ayeshaStats?.uniquePatients).toBe(1);
    expect(ayeshaStats?.totalTestsOrdered).toBe(1);
    expect(ayeshaStats?.grossRevenuePaisa).toBe(100000);
    expect(ayeshaStats?.netRevenuePaisa).toBe(100000);
  });
});

