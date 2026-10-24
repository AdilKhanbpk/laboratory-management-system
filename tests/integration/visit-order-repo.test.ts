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
import { BillingError } from '../../electron/services/billing-service';

describe('Integration: Visit, Order & Billing Repository', () => {
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-visit-test-'));
    dbPath = path.join(tempDir, 'visit_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'SecureVisitKey2026!' });
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
      fullName: 'Lead Pathologist',
    });
    operatorId = user.id;
  });

  afterEach(() => {
    try {
      manager.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors in tests
    }
  });

  it('creates a complete visit with existing patient, multiple tests, and exact payment', () => {
    // 1. Setup Patient
    const patient = patientRepo.createPatient({
      fullName: 'Muhammad Ali',
      gender: 'male',
      dateOfBirth: '1985-06-15',
      phoneNumber: '+92-300-1122334',
    });

    // 2. Setup Doctor
    const doctor = doctorRepo.createDoctor({
      fullName: 'Dr. Tariq Mahmood',
      specialization: 'Internal Medicine',
    });

    // 3. Setup Tests
    const test1 = catalogRepo.createTest({
      testCode: 'CBC',
      testName: 'Complete Blood Count',
      category: 'Hematology',
      pricePaisa: 150000, // 1500 PKR
    });

    const test2 = catalogRepo.createTest({
      testCode: 'LFT',
      testName: 'Liver Function Tests',
      category: 'Biochemistry',
      pricePaisa: 250000, // 2500 PKR
    });

    // Subtotal: 1500 + 2500 = 4000 PKR (400000 paisa)
    // 10% Discount: 400 PKR (40000 paisa)
    // Net Total: 3600 PKR (360000 paisa)
    // Exact Payment: 360000 paisa

    const result = visitRepo.createVisitWithOrder(
      {
        patientId: patient.id,
        referringDoctorId: doctor.id,
        testIds: [test1.id, test2.id],
        discountType: 'percentage',
        discountValue: 10,
        paidAmountPaisa: 360000,
        paymentMethod: 'cash',
        notes: 'Routine health checkup',
      },
      operatorId
    );

    expect(result.visit.visit_number).toMatch(/^VIS-\d{4}-\d{5}$/);
    expect(result.visit.patient_id).toBe(patient.id);
    expect(result.visit.referring_doctor_id).toBe(doctor.id);
    expect(result.orderItems.length).toBe(2);
    expect(result.invoice.subtotal_amount).toBe(400000);
    expect(result.invoice.discount_amount).toBe(40000);
    expect(result.invoice.final_total).toBe(360000);
    expect(result.invoice.paid_amount).toBe(360000);
    expect(result.invoice.balance_amount).toBe(0);
    expect(result.invoice.payment_status).toBe('paid');
    expect(result.payments.length).toBe(1);
    expect(result.payments[0].amount).toBe(360000);
    expect(result.payments[0].receipt_number).toMatch(/^RCT-\d{4}-\d{5}$/);
  });

  it('supports inline patient registration during visit creation', () => {
    const test = catalogRepo.createTest({
      testCode: 'BSF',
      testName: 'Blood Sugar Fasting',
      category: 'Biochemistry',
      pricePaisa: 30000,
    });

    const result = visitRepo.createVisitWithOrder(
      {
        newPatient: {
          fullName: 'Fatima Zahra',
          gender: 'female',
          dateOfBirth: '1992-04-10',
          phoneNumber: '+92-321-9988776',
        },
        testIds: [test.id],
        paidAmountPaisa: 30000,
      },
      operatorId
    );

    expect(result.patient.full_name).toBe('Fatima Zahra');
    expect(result.patient.patient_mrn).toMatch(/^PAT-\d{4}-\d{5}$/);
    expect(result.visit.patient_id).toBe(result.patient.id);
    expect(result.invoice.final_total).toBe(30000);
  });

  it('records partial payments and tracks outstanding balance correctly', () => {
    const patient = patientRepo.createPatient({ fullName: 'Ahmad Khan', gender: 'male' });
    const test = catalogRepo.createTest({
      testCode: 'LIPID',
      testName: 'Lipid Profile',
      category: 'Biochemistry',
      pricePaisa: 200000, // 2000 PKR
    });

    // Pay 1000 PKR (100000 paisa) out of 2000 PKR
    const result = visitRepo.createVisitWithOrder(
      {
        patientId: patient.id,
        testIds: [test.id],
        paidAmountPaisa: 100000,
      },
      operatorId
    );

    expect(result.invoice.paid_amount).toBe(100000);
    expect(result.invoice.balance_amount).toBe(100000);
    expect(result.invoice.payment_status).toBe('partially_paid');

    // Pay the remaining 1000 PKR later
    const followUpPayment = visitRepo.recordPayment(
      {
        invoiceId: result.invoice.id,
        amountPaisa: 100000,
        paymentMethod: 'cash',
      },
      operatorId
    );

    expect(followUpPayment.amount).toBe(100000);

    // Verify invoice is now paid
    const updatedVisit = visitRepo.getVisitById(result.visit.id);
    expect(updatedVisit?.invoice.paid_amount).toBe(200000);
    expect(updatedVisit?.invoice.balance_amount).toBe(0);
    expect(updatedVisit?.invoice.payment_status).toBe('paid');
    expect(updatedVisit?.payments.length).toBe(2);
  });

  it('rejects overpayments on initial visit creation and on follow-up payment', () => {
    const patient = patientRepo.createPatient({ fullName: 'Sara Bibi', gender: 'female' });
    const test = catalogRepo.createTest({
      testCode: 'HB',
      testName: 'Hemoglobin',
      category: 'Hematology',
      pricePaisa: 50000,
    });

    // Attempt to pay 60000 on a 50000 invoice
    expect(() => {
      visitRepo.createVisitWithOrder(
        {
          patientId: patient.id,
          testIds: [test.id],
          paidAmountPaisa: 60000,
        },
        operatorId
      );
    }).toThrow(BillingError);

    // Create partial order
    const valid = visitRepo.createVisitWithOrder(
      {
        patientId: patient.id,
        testIds: [test.id],
        paidAmountPaisa: 20000,
      },
      operatorId
    );

    // Remaining balance is 30000; attempt to pay 40000
    expect(() => {
      visitRepo.recordPayment(
        {
          invoiceId: valid.invoice.id,
          amountPaisa: 40000,
        },
        operatorId
      );
    }).toThrow(BillingError);
  });

  it('rejects order with inactive doctor', () => {
    const patient = patientRepo.createPatient({ fullName: 'Imran Shah', gender: 'male' });
    const doctor = doctorRepo.createDoctor({ fullName: 'Dr. Deactivated Doctor' });
    doctorRepo.setDoctorActiveStatus(doctor.id, false);

    const test = catalogRepo.createTest({
      testCode: 'URINE',
      testName: 'Urine Routine Examination',
      category: 'Urinalysis',
      pricePaisa: 40000,
    });

    expect(() => {
      visitRepo.createVisitWithOrder(
        {
          patientId: patient.id,
          referringDoctorId: doctor.id,
          testIds: [test.id],
        },
        operatorId
      );
    }).toThrow(/currently deactivated and cannot be selected/);
  });

  it('rejects order with inactive test', () => {
    const patient = patientRepo.createPatient({ fullName: 'Zainab Begum', gender: 'female' });
    const test = catalogRepo.createTest({
      testCode: 'INACTIVE',
      testName: 'Discontinued Test',
      category: 'General',
      pricePaisa: 50000,
    });
    catalogRepo.setTestActiveStatus(test.id, false);

    expect(() => {
      visitRepo.createVisitWithOrder(
        {
          patientId: patient.id,
          testIds: [test.id],
        },
        operatorId
      );
    }).toThrow(/currently inactive and cannot be ordered/);
  });

  it('rolls back completely if invoice or payment fails', () => {
    const patient = patientRepo.createPatient({ fullName: 'Rollback Patient', gender: 'male' });
    const test = catalogRepo.createTest({
      testCode: 'ROLL',
      testName: 'Rollback Test',
      category: 'General',
      pricePaisa: 100000,
    });

    // Provide invalid discount exceeding subtotal to trigger rollback
    expect(() => {
      visitRepo.createVisitWithOrder(
        {
          patientId: patient.id,
          testIds: [test.id],
          discountType: 'fixed',
          discountValue: 150000, // 1500 PKR > 1000 PKR
        },
        operatorId
      );
    }).toThrow(BillingError);

    // Verify nothing was persisted in visits or order_items
    const db = manager.getDatabase();
    const visitCount = db.prepare(`SELECT COUNT(*) as count FROM visits`).get() as { count: number };
    const invoiceCount = db.prepare(`SELECT COUNT(*) as count FROM invoices`).get() as { count: number };
    const orderItemsCount = db.prepare(`SELECT COUNT(*) as count FROM order_items`).get() as { count: number };

    expect(visitCount.count).toBe(0);
    expect(invoiceCount.count).toBe(0);
    expect(orderItemsCount.count).toBe(0);
  });
});
