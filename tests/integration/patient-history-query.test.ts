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
import { PatientHistoryRepository } from '../../electron/database/repositories/patient-history-repository';

describe('Integration: Patient Longitudinal History Repository', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;
  let userRepo: UserRepository;
  let patientRepo: PatientRepository;
  let catalogRepo: CatalogRepository;
  let visitRepo: VisitRepository;
  let resultRepo: ResultRepository;
  let historyRepo: PatientHistoryRepository;
  let operatorId: number;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-history-test-'));
    dbPath = path.join(tempDir, 'history_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'HistorySecretKey2026!' });
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    userRepo = new UserRepository(manager);
    patientRepo = new PatientRepository(manager);
    catalogRepo = new CatalogRepository(manager);
    visitRepo = new VisitRepository(manager);
    resultRepo = new ResultRepository(manager);
    historyRepo = new PatientHistoryRepository(manager);

    const user = userRepo.createInitialOperator({
      username: 'operator',
      passwordHash: 'dummy_hash',
      passwordSalt: 'dummy_salt',
      fullName: 'Lab Staff',
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

  it('aggregates visits, invoices, and tracks report statuses from pending to finalized', () => {
    const patient = patientRepo.createPatient({ fullName: 'Naveed Iqbal', gender: 'male' });
    const test1 = catalogRepo.createTest(
      { testCode: 'CBC', testName: 'Complete Blood Count', category: 'Hematology', pricePaisa: 100000 },
      [{ parameter_name: 'Hb', unit: 'g/dL', display_order: 1, parameter_type: 'numeric' }]
    );

    // Visit 1: Ordered, results entered and finalized
    const visit1 = visitRepo.createVisitWithOrder({ patientId: patient.id, testIds: [test1.id], paidAmountPaisa: 100000 }, operatorId);
    resultRepo.saveDraftResults({ orderItemId: visit1.orderItems[0].id, results: [{ parameterId: test1.parameters![0].id, resultValue: '15.0' }] }, operatorId);
    resultRepo.finalizeReport({ visitId: visit1.visit.id }, operatorId);

    // Visit 2: Ordered, results in draft
    const visit2 = visitRepo.createVisitWithOrder({ patientId: patient.id, testIds: [test1.id], paidAmountPaisa: 50000 }, operatorId);
    resultRepo.saveDraftResults({ orderItemId: visit2.orderItems[0].id, results: [{ parameterId: test1.parameters![0].id, resultValue: '14.2' }] }, operatorId);

    // Visit 3: Brand new visit, pending results
    visitRepo.createVisitWithOrder({ patientId: patient.id, testIds: [test1.id] }, operatorId);

    const history = historyRepo.getFullHistory(patient.id);

    expect(history.length).toBe(3);

    // Latest visit (Visit 3) is pending
    expect(history[0].reportStatus).toBe('pending');
    expect(history[0].hasSnapshot).toBe(false);

    // Middle visit (Visit 2) is draft
    expect(history[1].reportStatus).toBe('draft');
    expect(history[1].invoice?.payment_status).toBe('partially_paid');

    // First visit (Visit 1) is finalized
    expect(history[2].reportStatus).toBe('finalized');
    expect(history[2].hasSnapshot).toBe(true);
    expect(history[2].finalizedAt).not.toBeNull();
  });
});
