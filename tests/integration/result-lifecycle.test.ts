import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { UserRepository } from '../../electron/database/repositories/user-repository';
import { PatientRepository } from '../../electron/database/repositories/patient-repository';
import { CatalogRepository } from '../../electron/database/repositories/catalog-repository';
import { VisitRepository } from '../../electron/database/repositories/visit-repository';
import { ResultRepository } from '../../electron/database/repositories/result-repository';

describe('Integration: Laboratory Result Entry & Verification Lifecycle', () => {
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-results-test-'));
    dbPath = path.join(tempDir, 'results_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'ResultSecretKey2026!' });
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

  it('enters draft results, evaluates reference ranges, and calculates visual flags', () => {
    const patient = patientRepo.createPatient({
      fullName: 'Bilal Ahmad',
      gender: 'male',
      dateOfBirth: '1988-02-14',
    });

    const cbcTest = catalogRepo.createTest(
      {
        testCode: 'CBC',
        testName: 'Complete Blood Count',
        category: 'Hematology',
        pricePaisa: 120000,
      },
      [
        {
          parameter_name: 'Hemoglobin',
          unit: 'g/dL',
          display_order: 1,
          parameter_type: 'numeric',
          ranges: [
            {
              gender: 'male',
              min_age_days: 0,
              max_age_days: 47450,
              normal_low: 13.0,
              normal_high: 17.5,
              panic_low: 7.0,
              panic_high: 20.0,
              display_text: '13.0 - 17.5 g/dL',
            },
          ],
        },
      ]
    );

    const visitDetail = visitRepo.createVisitWithOrder(
      {
        patientId: patient.id,
        testIds: [cbcTest.id],
        paidAmountPaisa: 120000,
      },
      operatorId
    );

    const orderItemId = visitDetail.orderItems[0].id;
    const hbParamId = cbcTest.parameters![0].id;

    // 1. Enter Normal result
    const resultsNormal = resultRepo.saveDraftResults(
      {
        orderItemId,
        results: [{ parameterId: hbParamId, resultValue: '14.8' }],
      },
      operatorId
    );

    expect(resultsNormal.length).toBe(1);
    expect(resultsNormal[0].status).toBe('draft');
    expect(resultsNormal[0].flag).toBe('normal');
    expect(resultsNormal[0].numeric_value).toBe(14.8);
    expect(resultsNormal[0].reference_range_display).toBe('13.0 - 17.5 g/dL');

    // 2. Edit draft to High result
    const resultsHigh = resultRepo.saveDraftResults(
      {
        orderItemId,
        results: [{ parameterId: hbParamId, resultValue: '18.9' }],
      },
      operatorId
    );

    expect(resultsHigh[0].flag).toBe('high');
    expect(resultsHigh[0].numeric_value).toBe(18.9);

    // 3. Edit draft to Critical result
    const resultsCritical = resultRepo.saveDraftResults(
      {
        orderItemId,
        results: [{ parameterId: hbParamId, resultValue: '6.2' }],
      },
      operatorId
    );

    expect(resultsCritical[0].flag).toBe('critical');
    expect(resultsCritical[0].numeric_value).toBe(6.2);
  });

  it('prevents report finalization if any required parameter result is missing', () => {
    const patient = patientRepo.createPatient({ fullName: 'Zahid Khan', gender: 'male' });
    const lftTest = catalogRepo.createTest(
      {
        testCode: 'LFT',
        testName: 'Liver Function Tests',
        category: 'Biochemistry',
        pricePaisa: 200000,
      },
      [
        { parameter_name: 'Bilirubin Total', unit: 'mg/dL', display_order: 1, parameter_type: 'numeric' },
        { parameter_name: 'ALT (SGPT)', unit: 'U/L', display_order: 2, parameter_type: 'numeric' },
      ]
    );

    const visit = visitRepo.createVisitWithOrder(
      {
        patientId: patient.id,
        testIds: [lftTest.id],
      },
      operatorId
    );

    const orderItemId = visit.orderItems[0].id;

    // Only enter 1 of 2 parameters
    resultRepo.saveDraftResults(
      {
        orderItemId,
        results: [{ parameterId: lftTest.parameters![0].id, resultValue: '0.9' }],
      },
      operatorId
    );

    // Attempting to finalize MUST fail
    expect(() => {
      resultRepo.finalizeReport({ visitId: visit.visit.id }, operatorId);
    }).toThrow(/Cannot finalize report: Result for required parameter/);
  });

  it('finalizes complete report, creates immutable snapshot with SHA-256 hash, and prevents silent edits', () => {
    const patient = patientRepo.createPatient({ fullName: 'Ayesha Malik', gender: 'female' });
    const glucoseTest = catalogRepo.createTest(
      {
        testCode: 'GLU',
        testName: 'Blood Glucose Fasting',
        category: 'Biochemistry',
        pricePaisa: 40000,
      },
      [
        {
          parameter_name: 'Glucose',
          unit: 'mg/dL',
          display_order: 1,
          parameter_type: 'numeric',
          ranges: [
            {
              gender: 'all',
              min_age_days: 0,
              max_age_days: 47450,
              normal_low: 70,
              normal_high: 100,
              panic_low: 45,
              panic_high: 400,
              display_text: '70 - 100 mg/dL',
            },
          ],
        },
      ]
    );

    const visit = visitRepo.createVisitWithOrder(
      {
        patientId: patient.id,
        testIds: [glucoseTest.id],
        paidAmountPaisa: 40000,
      },
      operatorId
    );

    const orderItemId = visit.orderItems[0].id;
    const glucoseParamId = glucoseTest.parameters![0].id;

    // Enter draft result
    resultRepo.saveDraftResults(
      {
        orderItemId,
        results: [{ parameterId: glucoseParamId, resultValue: '88.5' }],
      },
      operatorId
    );

    // Finalize report
    const snapshot = resultRepo.finalizeReport({ visitId: visit.visit.id }, operatorId);

    expect(snapshot.report_number).toMatch(/^REP-\d{4}-\d{5}$/);
    expect(snapshot.version).toBe(1);
    expect(snapshot.status).toBe('finalized');
    expect(snapshot.integrity_hash).toMatch(/^[a-f0-9]{64}$/); // Valid SHA-256

    // Verify order item and visit transitioned to completed
    const reloadedWorklist = resultRepo.getWorklist({ query: visit.visit.visit_number });
    expect(reloadedWorklist[0].orderItemStatus).toBe('completed');

    // Attempting to silently edit draft after finalization MUST fail
    expect(() => {
      resultRepo.saveDraftResults(
        {
          orderItemId,
          results: [{ parameterId: glucoseParamId, resultValue: '95.0' }],
        },
        operatorId
      );
    }).toThrow(/already been finalized/);
  });

  it('permits formal clinical amendments on finalized results with mandatory reason and version bump', () => {
    const patient = patientRepo.createPatient({ fullName: 'Tariq Aziz', gender: 'male' });
    const uricTest = catalogRepo.createTest(
      {
        testCode: 'URIC',
        testName: 'Serum Uric Acid',
        category: 'Biochemistry',
        pricePaisa: 50000,
      },
      [
        {
          parameter_name: 'Uric Acid',
          unit: 'mg/dL',
          display_order: 1,
          parameter_type: 'numeric',
          ranges: [
            {
              gender: 'male',
              min_age_days: 0,
              max_age_days: 47450,
              normal_low: 3.5,
              normal_high: 7.2,
              panic_low: null,
              panic_high: null,
              display_text: '3.5 - 7.2 mg/dL',
            },
          ],
        },
      ]
    );

    const visit = visitRepo.createVisitWithOrder(
      {
        patientId: patient.id,
        testIds: [uricTest.id],
      },
      operatorId
    );

    const orderItemId = visit.orderItems[0].id;
    const paramId = uricTest.parameters![0].id;

    resultRepo.saveDraftResults(
      {
        orderItemId,
        results: [{ parameterId: paramId, resultValue: '6.0' }],
      },
      operatorId
    );

    resultRepo.finalizeReport({ visitId: visit.visit.id }, operatorId);

    const reportBefore = resultRepo.getFullDiagnosticReport(visit.visit.id);
    const resultRow = reportBefore.tests[0].results[0].result!;
    expect(resultRow.status).toBe('finalized');
    expect(resultRow.result_value).toBe('6.0');

    // Attempting amendment without sufficient reason MUST fail
    expect(() => {
      resultRepo.amendResult(
        {
          resultId: resultRow.id,
          newValue: '6.8',
          amendmentReason: 'mistake', // < 10 characters
        },
        operatorId
      );
    }).toThrow(/at least 10 characters/);

    // Perform valid formal clinical amendment
    const amendedResult = resultRepo.amendResult(
      {
        resultId: resultRow.id,
        newValue: '6.8',
        amendmentReason: 'Sample re-run on automated analyzer after calibration check confirmed 6.8 mg/dL.',
      },
      operatorId
    );

    expect(amendedResult.status).toBe('corrected');
    expect(amendedResult.result_value).toBe('6.8');
    expect(amendedResult.version).toBe(2);

    // Verify report reflects amendment
    const reportAfter = resultRepo.getFullDiagnosticReport(visit.visit.id);
    expect(reportAfter.amendments?.length).toBe(1);
    expect(reportAfter.amendments![0].previous_value).toBe('6.0');
    expect(reportAfter.amendments![0].new_value).toBe('6.8');
    expect(reportAfter.snapshot?.status).toBe('amended');
    expect(reportAfter.snapshot?.version).toBe(2);
  });
});
