import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { UserRepository } from '../../electron/database/repositories/user-repository';
import { PatientRepository } from '../../electron/database/repositories/patient-repository';
import { CatalogRepository } from '../../electron/database/repositories/catalog-repository';
import { VisitRepository } from '../../electron/database/repositories/visit-repository';
import { ResultRepository } from '../../electron/database/repositories/result-repository';

describe('Integration: Immutable Report Snapshots & Tamper-Evidence', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;
  let userRepo: UserRepository;
  let patientRepo: PatientRepository;
  let catalogRepo: CatalogRepository;
  let visitRepo: VisitRepository;
  let resultRepo: ResultRepository;
  let operatorId: number;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-snapshot-test-'));
    dbPath = path.join(tempDir, 'snapshot_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'SnapshotSecretKey2026!' });
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    userRepo = new UserRepository(manager);
    patientRepo = new PatientRepository(manager);
    catalogRepo = new CatalogRepository(manager);
    visitRepo = new VisitRepository(manager);
    resultRepo = new ResultRepository(manager);

    const user = userRepo.createInitialOperator({
      username: 'pathologist',
      passwordHash: 'dummy_hash',
      passwordSalt: 'dummy_salt',
      fullName: 'Dr. Pathologist',
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

  it('proves that subsequent catalog modifications do not alter finalized historical report snapshots', () => {
    const patient = patientRepo.createPatient({
      fullName: 'Kamran Akmal',
      gender: 'male',
      dateOfBirth: '1985-05-10',
    });

    const test = catalogRepo.createTest(
      {
        testCode: 'CHOL',
        testName: 'Serum Total Cholesterol',
        category: 'Biochemistry',
        pricePaisa: 60000,
      },
      [
        {
          parameter_name: 'Cholesterol Total',
          unit: 'mg/dL',
          display_order: 1,
          parameter_type: 'numeric',
          ranges: [
            {
              gender: 'all',
              min_age_days: 0,
              max_age_days: 47450,
              normal_low: 125,
              normal_high: 200,
              panic_low: null,
              panic_high: 350,
              display_text: '< 200 mg/dL',
            },
          ],
        },
      ]
    );

    const visit = visitRepo.createVisitWithOrder(
      {
        patientId: patient.id,
        testIds: [test.id],
      },
      operatorId
    );

    const orderItemId = visit.orderItems[0].id;
    const paramId = test.parameters![0].id;

    // Save draft and finalize
    resultRepo.saveDraftResults(
      {
        orderItemId,
        results: [{ parameterId: paramId, resultValue: '175' }],
      },
      operatorId
    );

    const snapshot = resultRepo.finalizeReport({ visitId: visit.visit.id }, operatorId);

    // Verify snapshot hash matches JSON content
    const calculatedHash = crypto.createHash('sha256').update(snapshot.snapshot_json).digest('hex');
    expect(snapshot.integrity_hash).toBe(calculatedHash);

    // Later: Laboratory updates parameter name and changes unit to mmol/L
    const db = manager.getDatabase();
    db.prepare(`UPDATE test_parameters SET parameter_name = 'Cholesterol (New Enzymatic Method)', unit = 'mmol/L' WHERE id = ?`).run(paramId);

    // Retrieve snapshot from database
    const reloadedSnapshot = db.prepare(`SELECT * FROM report_snapshots WHERE id = ?`).get(snapshot.id) as any;
    const parsedReport = JSON.parse(reloadedSnapshot.snapshot_json);

    // Historical snapshot MUST preserve original parameter name and unit!
    expect(parsedReport.tests[0].results[0].parameter.name).toBe('Cholesterol Total');
    expect(parsedReport.tests[0].results[0].parameter.unit).toBe('mg/dL');
    expect(parsedReport.tests[0].results[0].result.result_value).toBe('175');
    expect(reloadedSnapshot.integrity_hash).toBe(calculatedHash);
  });
});
