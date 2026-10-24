import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { PatientRepository } from '../../electron/database/repositories/patient-repository';
import { DoctorRepository } from '../../electron/database/repositories/doctor-repository';
import { CatalogRepository } from '../../electron/database/repositories/catalog-repository';
import { VisitRepository } from '../../electron/database/repositories/visit-repository';
import { ResultRepository } from '../../electron/database/repositories/result-repository';
import { DoctorStatsRepository } from '../../electron/database/repositories/doctor-stats-repository';
import { PatientHistoryRepository } from '../../electron/database/repositories/patient-history-repository';
import { UserRepository } from '../../electron/database/repositories/user-repository';
import { hashPasswordSync } from '../../electron/security/hash';

describe('Prompt 5: Synthetic Dataset Performance & Search Benchmark', () => {
  const testDir = path.join(__dirname, `temp_perf_test_${Date.now()}`);
  const dbPath = path.join(testDir, 'perf_lms.db');
  const migrationsDir = path.resolve(__dirname, '../../database/migrations');
  const key = 'perf-benchmark-test-key-789';

  it('populates synthetic clinical records and benchmarks query response times below 50ms', () => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });

    const manager = new DatabaseManager({ dbPath, encryptionKey: key });
    manager.open();
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    const patientRepo = new PatientRepository(manager);
    const doctorRepo = new DoctorRepository(manager);
    const catalogRepo = new CatalogRepository(manager);
    const visitRepo = new VisitRepository(manager);
    const resultRepo = new ResultRepository(manager);
    const doctorStatsRepo = new DoctorStatsRepository(manager);
    const historyRepo = new PatientHistoryRepository(manager);
    const userRepo = new UserRepository(manager);

    const { hash, salt } = hashPasswordSync('Password123!');
    const operator = userRepo.createInitialOperator({
      username: 'perf_op',
      passwordHash: hash,
      passwordSalt: salt,
      fullName: 'Benchmarking Operator',
    });

    // 1. Seed 10 Doctors
    const doctorIds: number[] = [];
    for (let i = 1; i <= 10; i++) {
      const doc = doctorRepo.createDoctor({
        fullName: `Dr. Specialist ${i}`,
        specialization: i % 2 === 0 ? 'Cardiology' : 'General Pathology',
        clinicHospitalName: `Hospital ${i}`,
      });
      doctorIds.push(doc.id);
    }

    // 2. Seed 10 Catalog Tests
    const testIds: number[] = [];
    const paramIds: number[] = [];
    for (let i = 1; i <= 10; i++) {
      const test = catalogRepo.createTest(
        {
          testCode: `TEST_${i.toString().padStart(3, '0')}`,
          testName: `Automated Clinical Test ${i}`,
          category: 'Hematology',
          pricePaisa: 50000 + i * 5000,
        },
        [
          {
            parameter_name: `Parameter ${i}.1`,
            parameter_type: 'numeric',
            unit: 'mg/dL',
            display_order: 1,
            ranges: [
              {
                gender: 'all',
                min_age_days: 0,
                max_age_days: 36500,
                normal_low: 10,
                normal_high: 50,
                panic_low: null,
                panic_high: null,
                display_text: '10 - 50 mg/dL',
              },
            ],
          },
        ]
      );
      testIds.push(test.id);
      paramIds.push(test.parameters![0].id);
    }

    // 3. Seed 50 Patients and Visits within a single transaction
    const patientIds: number[] = [];
    manager.runTransaction(() => {
      for (let i = 1; i <= 50; i++) {
        const patient = patientRepo.createPatient({
          fullName: `Benchmark Patient ${i}`,
          gender: i % 2 === 0 ? 'female' : 'male',
          dateOfBirth: '1990-05-15',
          phoneNumber: `0300${i.toString().padStart(7, '0')}`,
        });
        patientIds.push(patient.id);

        const docId = doctorIds[i % doctorIds.length];
        const selectedTestId = testIds[i % testIds.length];

        const visit = visitRepo.createVisitWithOrder(
          {
            patientId: patient.id,
            referringDoctorId: docId,
            testIds: [selectedTestId],
            paidAmountPaisa: 50000,
          },
          operator.id
        );

        // Enter result
        const pId = paramIds[i % paramIds.length];
        resultRepo.saveDraftResults(
          {
            orderItemId: visit.orderItems[0].id,
            results: [{ parameterId: pId, resultValue: '25.5' }],
          },
          operator.id
        );

        if (i % 2 === 0) {
          resultRepo.finalizeReport({ visitId: visit.visit.id }, operator.id);
        }
      }
    });

    // ==========================================
    // Benchmark 1: Patient Search by MRN / Name
    // ==========================================
    const startPatientSearch = performance.now();
    const searchRes = patientRepo.searchPatients({ query: 'Benchmark Patient 25', limit: 10 });
    const durationPatientSearch = performance.now() - startPatientSearch;

    expect(searchRes.total).toBe(1);
    expect(searchRes.patients[0].full_name).toBe('Benchmark Patient 25');
    expect(durationPatientSearch).toBeLessThan(50); // Under 50ms requirement

    // ==========================================
    // Benchmark 2: Doctor Statistics Aggregation
    // ==========================================
    const startDoctorStats = performance.now();
    const stats = doctorStatsRepo.getDoctorReferralStats({});
    const durationDoctorStats = performance.now() - startDoctorStats;

    expect(stats.length).toBe(10);
    expect(durationDoctorStats).toBeLessThan(50); // Under 50ms requirement

    // ==========================================
    // Benchmark 3: Longitudinal Patient History
    // ==========================================
    const targetPatientId = patientIds[10];
    const startHistory = performance.now();
    const history = historyRepo.getFullHistory(targetPatientId);
    const durationHistory = performance.now() - startHistory;

    expect(history.length).toBe(1);
    expect(durationHistory).toBeLessThan(50); // Under 50ms requirement

    manager.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });
});
