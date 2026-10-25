import { DatabaseManager, DatabaseError } from '../connection';
import {
  Visit,
  OrderItem,
  Invoice,
  Payment,
  VisitDetail,
  VisitSearchResult,
  CreateVisitOrderInput,
  UpdateVisitOrderAndInvoiceInput,
  RecordPaymentInput,
} from '../../types/ipc';
import { BillingService, BillingError } from '../../services/billing-service';
import { PatientRepository } from './patient-repository';
import { AuditRepository } from './audit-repository';

export class VisitRepository {
  private dbManager: DatabaseManager;
  private patientRepo: PatientRepository;
  private auditRepo: AuditRepository;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
    this.patientRepo = new PatientRepository(dbManager);
    this.auditRepo = new AuditRepository(dbManager);
  }

  /**
   * Generates a unique, collision-proof Visit Number.
   * Format: VIS-YYYY-XXXXX (e.g., VIS-2026-00001)
   */
  public generateNextVisitNumber(): string {
    const db = this.dbManager.getDatabase();
    const currentYear = new Date().getFullYear();
    const prefix = `VIS-${currentYear}-`;

    const row = db
      .prepare(`SELECT visit_number FROM visits WHERE visit_number LIKE ? ORDER BY id DESC LIMIT 1`)
      .get(`${prefix}%`) as { visit_number: string } | undefined;

    let nextSeq = 1;
    if (row && row.visit_number) {
      const parts = row.visit_number.split('-');
      if (parts.length === 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) {
          nextSeq = parsed + 1;
        }
      }
    }

    return `${prefix}${String(nextSeq).padStart(5, '0')}`;
  }

  /**
   * Generates a unique, collision-proof Invoice Number.
   * Format: INV-YYYY-XXXXX (e.g., INV-2026-00001)
   */
  public generateNextInvoiceNumber(): string {
    const db = this.dbManager.getDatabase();
    const currentYear = new Date().getFullYear();
    const prefix = `INV-${currentYear}-`;

    const row = db
      .prepare(`SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1`)
      .get(`${prefix}%`) as { invoice_number: string } | undefined;

    let nextSeq = 1;
    if (row && row.invoice_number) {
      const parts = row.invoice_number.split('-');
      if (parts.length === 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) {
          nextSeq = parsed + 1;
        }
      }
    }

    return `${prefix}${String(nextSeq).padStart(5, '0')}`;
  }

  /**
   * Generates a unique, collision-proof Receipt Number.
   * Format: RCT-YYYY-XXXXX (e.g., RCT-2026-00001)
   */
  public generateNextReceiptNumber(): string {
    const db = this.dbManager.getDatabase();
    const currentYear = new Date().getFullYear();
    const prefix = `RCT-${currentYear}-`;

    const row = db
      .prepare(`SELECT receipt_number FROM payments WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1`)
      .get(`${prefix}%`) as { receipt_number: string } | undefined;

    let nextSeq = 1;
    if (row && row.receipt_number) {
      const parts = row.receipt_number.split('-');
      if (parts.length === 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) {
          nextSeq = parsed + 1;
        }
      }
    }

    return `${prefix}${String(nextSeq).padStart(5, '0')}`;
  }

  /**
   * Creates a complete visit, order items with price snapshots, invoice, and optional initial payment
   * inside a single atomic SQLite transaction.
   */
  public createVisitWithOrder(input: CreateVisitOrderInput, operatorId: number): VisitDetail {
    const db = this.dbManager.getDatabase();

    const transaction = db.transaction(() => {
      const now = new Date().toISOString();

      // 1. Resolve Patient ID (existing or newly registered)
      let patientId: number;
      if (input.patientId) {
        const patientExists = db
          .prepare(`SELECT id FROM patients WHERE id = ?`)
          .get(input.patientId) as { id: number } | undefined;
        if (!patientExists) {
          throw new DatabaseError(`Patient with ID ${input.patientId} does not exist.`);
        }
        patientId = input.patientId;
      } else if (input.newPatient) {
        const createdPatient = this.patientRepo.createPatient(input.newPatient);
        patientId = createdPatient.id;
      } else {
        throw new DatabaseError('Either patientId or newPatient registration details must be provided.');
      }

      // 2. Validate Referring Doctor (if supplied)
      if (input.referringDoctorId) {
        const doctor = db
          .prepare(`SELECT id, full_name, is_active FROM doctors WHERE id = ?`)
          .get(input.referringDoctorId) as { id: number; full_name: string; is_active: number } | undefined;

        if (!doctor) {
          throw new DatabaseError(`Doctor with ID ${input.referringDoctorId} does not exist.`);
        }
        if (doctor.is_active === 0) {
          throw new DatabaseError(`Doctor "${doctor.full_name}" is currently deactivated and cannot be selected for new visits.`);
        }
      }

      // 3. Fetch and validate selected tests
      if (!input.testIds || input.testIds.length === 0) {
        throw new DatabaseError('At least one laboratory test must be selected.');
      }

      const placeholders = input.testIds.map(() => '?').join(',');
      const tests = db
        .prepare(`SELECT id, test_code, test_name, price_paisa, is_active FROM lab_tests WHERE id IN (${placeholders})`)
        .all(...input.testIds) as Array<{
        id: number;
        test_code: string;
        test_name: string;
        price_paisa: number;
        is_active: number;
      }>;

      if (tests.length !== input.testIds.length) {
        throw new DatabaseError('One or more selected laboratory tests could not be found.');
      }

      // Check for any deactivated tests
      for (const t of tests) {
        if (t.is_active === 0) {
          throw new DatabaseError(`Test "${t.test_name}" (${t.test_code}) is currently inactive and cannot be ordered.`);
        }
      }

      // 4. Calculate authoritative billing totals via BillingService
      const billingItems = tests.map((t) => ({
        testId: t.id,
        testCode: t.test_code,
        testName: t.test_name,
        pricePaisa: t.price_paisa,
        quantity: 1, // Phase 3: default quantity 1 per test
      }));

      const discountType = input.discountType || 'none';
      const discountValue = input.discountValue ?? 0;
      const paidAmount = input.paidAmountPaisa ?? 0;

      const billing = BillingService.calculateOrderBilling(
        billingItems,
        { type: discountType, value: discountValue },
        paidAmount
      );

      // 5. Generate Visit Number and Insert Visit
      const visitNumber = this.generateNextVisitNumber();
      const insertVisitStmt = db.prepare(`
        INSERT INTO visits (
          visit_number, patient_id, referring_doctor_id, order_date,
          status, operator_id, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const visitResult = insertVisitStmt.run(
        visitNumber,
        patientId,
        input.referringDoctorId || null,
        now,
        'registered',
        operatorId,
        input.notes ? input.notes.trim() : null,
        now,
        now
      );

      const visitId = Number(visitResult.lastInsertRowid);

      // 6. Insert Order Items with price snapshots
      const insertOrderItemStmt = db.prepare(`
        INSERT INTO order_items (
          visit_id, test_id, test_code_snapshot, test_name_snapshot,
          price_snapshot, quantity, subtotal_amount, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of billing.itemCalculations) {
        insertOrderItemStmt.run(
          visitId,
          item.testId,
          item.testCode,
          item.testName,
          item.priceSnapshotPaisa,
          item.quantity,
          item.itemSubtotalPaisa,
          'ordered',
          now
        );
      }

      // 7. Generate Invoice Number and Insert Invoice
      const invoiceNumber = this.generateNextInvoiceNumber();
      const insertInvoiceStmt = db.prepare(`
        INSERT INTO invoices (
          invoice_number, visit_id, subtotal_amount, discount_type,
          discount_value, discount_amount, final_total, paid_amount,
          balance_amount, payment_status, created_at, finalized_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const invoiceResult = insertInvoiceStmt.run(
        invoiceNumber,
        visitId,
        billing.subtotalPaisa,
        billing.discountType,
        billing.discountValue,
        billing.discountPaisa,
        billing.finalTotalPaisa,
        billing.paidPaisa,
        billing.balancePaisa,
        billing.paymentStatus,
        now,
        now
      );

      const invoiceId = Number(invoiceResult.lastInsertRowid);

      // 8. Record Initial Payment (if paid > 0)
      if (billing.paidPaisa > 0) {
        const receiptNumber = this.generateNextReceiptNumber();
        const insertPaymentStmt = db.prepare(`
          INSERT INTO payments (
            receipt_number, invoice_id, amount, payment_method,
            transaction_reference, operator_id, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertPaymentStmt.run(
          receiptNumber,
          invoiceId,
          billing.paidPaisa,
          input.paymentMethod || 'cash',
          input.transactionReference ? input.transactionReference.trim() : null,
          operatorId,
          'cleared',
          now
        );
      }

      // 9. Record Audit Trail
      this.auditRepo.logAction({
        userId: operatorId,
        action: 'VISIT_CREATED',
        entityType: 'visits',
        entityId: String(visitId),
        details: {
          visitNumber,
          invoiceNumber,
          patientId,
          testCount: billing.itemCalculations.length,
          finalTotalPaisa: billing.finalTotalPaisa,
          paidPaisa: billing.paidPaisa,
          balancePaisa: billing.balancePaisa,
        },
      });

      return visitId;
    });

    const createdVisitId = transaction();
    const detail = this.getVisitById(createdVisitId);
    if (!detail) {
      throw new DatabaseError(`Failed to retrieve newly created visit with ID ${createdVisitId}.`);
    }
    return detail;
  }

  /**
   * Updates an existing visit's referring doctor, clinical notes, ordered tests, and invoice.
   * Recalculates subtotal, discount, and balance based on existing payments.
   * Preserves already recorded payments and existing test results for retained tests.
   */
  public updateVisitOrderAndInvoice(
    input: UpdateVisitOrderAndInvoiceInput,
    operatorId: number
  ): VisitDetail {
    const db = this.dbManager.getDatabase();

    const transaction = db.transaction(() => {
      const now = new Date().toISOString();

      // 1. Fetch current visit & invoice
      const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(input.visitId) as Visit | undefined;
      if (!visit) {
        throw new DatabaseError(`Visit with ID ${input.visitId} does not exist.`);
      }

      const invoice = db.prepare('SELECT * FROM invoices WHERE visit_id = ?').get(input.visitId) as Invoice | undefined;
      if (!invoice) {
        throw new DatabaseError(`Invoice for visit ID ${input.visitId} does not exist.`);
      }

      // 2. Fetch current cleared payments
      const payments = db
        .prepare('SELECT * FROM payments WHERE invoice_id = ? AND status = ?')
        .all(invoice.id, 'cleared') as Payment[];
      const totalPaidPaisaBefore = payments.reduce((sum, p) => sum + p.amount, 0);

      // 3. Validate new test IDs
      if (!input.testIds || input.testIds.length === 0) {
        throw new DatabaseError('An order must contain at least one laboratory test.');
      }

      const placeholders = input.testIds.map(() => '?').join(',');
      const tests = db
        .prepare(`SELECT id, test_code, test_name, price_paisa, is_active FROM lab_tests WHERE id IN (${placeholders})`)
        .all(...input.testIds) as Array<{
          id: number;
          test_code: string;
          test_name: string;
          price_paisa: number;
          is_active: number;
        }>;

      if (tests.length !== input.testIds.length) {
        throw new DatabaseError('One or more selected laboratory tests do not exist in the active catalog.');
      }

      // 4. Calculate updated billing
      const billingItems = tests.map((t) => ({
        testId: t.id,
        testCode: t.test_code,
        testName: t.test_name,
        pricePaisa: t.price_paisa,
        quantity: 1,
      }));

      const discountType = input.discountType || 'none';
      const discountValue = input.discountValue ?? 0;

      const initialBilling = BillingService.calculateOrderBilling(
        billingItems,
        { type: discountType, value: discountValue },
        0
      );

      const finalTotalPaisa = initialBilling.finalTotalPaisa;

      // Handle additional payment if received now
      const additionalPaymentPaisa = Math.max(0, input.additionalPaymentPaisa || 0);
      let totalPaidPaisa = totalPaidPaisaBefore;

      if (additionalPaymentPaisa > 0) {
        const remainingBeforePayment = Math.max(0, finalTotalPaisa - totalPaidPaisaBefore);
        if (additionalPaymentPaisa > remainingBeforePayment) {
          throw new DatabaseError(
            `Payment amount (${additionalPaymentPaisa / 100}) exceeds remaining balance (${remainingBeforePayment / 100}).`
          );
        }

        const receiptNumber = this.generateNextReceiptNumber();
        const insertPaymentStmt = db.prepare(`
          INSERT INTO payments (
            receipt_number, invoice_id, amount, payment_method,
            transaction_reference, operator_id, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertPaymentStmt.run(
          receiptNumber,
          invoice.id,
          additionalPaymentPaisa,
          input.paymentMethod || 'cash',
          input.transactionReference ? input.transactionReference.trim() : null,
          operatorId,
          'cleared',
          now
        );

        totalPaidPaisa += additionalPaymentPaisa;
      }

      const balancePaisa = Math.max(0, finalTotalPaisa - totalPaidPaisa);
      let paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
      if (finalTotalPaisa === 0 || totalPaidPaisa >= finalTotalPaisa) {
        paymentStatus = 'paid';
      } else if (totalPaidPaisa > 0) {
        paymentStatus = 'partially_paid';
      } else {
        paymentStatus = 'unpaid';
      }

      // 5. Update Visit
      db.prepare(`
        UPDATE visits
        SET referring_doctor_id = ?, notes = ?, operator_id = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.referringDoctorId || null,
        input.notes ? input.notes.trim() : null,
        operatorId,
        now,
        input.visitId
      );

      // 6. Synchronize Order Items
      const existingOrderItems = db
        .prepare('SELECT * FROM order_items WHERE visit_id = ?')
        .all(input.visitId) as OrderItem[];

      const newTestIdSet = new Set(input.testIds);
      const existingTestIdSet = new Set(existingOrderItems.map((oi) => oi.test_id));

      // Remove deleted order items (and their results if any)
      for (const item of existingOrderItems) {
        if (!newTestIdSet.has(item.test_id)) {
          db.prepare('DELETE FROM test_results WHERE order_item_id = ?').run(item.id);
          db.prepare('DELETE FROM order_items WHERE id = ?').run(item.id);
        }
      }

      // Add new order items
      const insertOrderItemStmt = db.prepare(`
        INSERT INTO order_items (
          visit_id, test_id, test_code_snapshot, test_name_snapshot,
          price_snapshot, quantity, subtotal_amount, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ordered', ?)
      `);

      for (const item of initialBilling.itemCalculations) {
        if (!existingTestIdSet.has(item.testId)) {
          insertOrderItemStmt.run(
            input.visitId,
            item.testId,
            item.testCode,
            item.testName,
            item.priceSnapshotPaisa,
            item.quantity,
            item.itemSubtotalPaisa,
            now
          );
        }
      }

      // 7. Update Invoice
      db.prepare(`
        UPDATE invoices
        SET subtotal_amount = ?, discount_type = ?, discount_value = ?, discount_amount = ?,
            final_total = ?, paid_amount = ?, balance_amount = ?, payment_status = ?, finalized_at = ?
        WHERE id = ?
      `).run(
        initialBilling.subtotalPaisa,
        initialBilling.discountType,
        initialBilling.discountValue,
        initialBilling.discountPaisa,
        finalTotalPaisa,
        totalPaidPaisa,
        balancePaisa,
        paymentStatus,
        paymentStatus === 'paid' ? now : invoice.finalized_at,
        invoice.id
      );

      // 8. Log Audit
      this.auditRepo.logAction({
        userId: operatorId,
        action: 'VISIT_ORDER_INVOICE_EDITED',
        entityType: 'visits',
        entityId: String(input.visitId),
        details: {
          visitId: input.visitId,
          previousFinalTotal: invoice.final_total,
          newFinalTotal: finalTotalPaisa,
          additionalPaymentPaisa,
          totalPaidPaisa,
          newBalance: balancePaisa,
          testCount: input.testIds.length,
        },
      });

      return input.visitId;
    });

    const updatedVisitId = transaction();
    const detail = this.getVisitById(updatedVisitId);
    if (!detail) {
      throw new DatabaseError(`Failed to retrieve updated visit with ID ${updatedVisitId}.`);
    }
    return detail;
  }

  /**
   * Fetches full visit details including patient, doctor, order items, invoice, and payments.
   */
  public getVisitById(id: number): VisitDetail | null {
    const db = this.dbManager.getDatabase();

    const visitRow = db
      .prepare(`
        SELECT
          v.*,
          p.full_name as patient_name,
          p.patient_mrn,
          p.gender as patient_gender,
          p.date_of_birth as patient_dob,
          p.phone_number as patient_phone,
          d.full_name as doctor_name,
          d.specialization as doctor_specialization,
          u.full_name as operator_name,
          i.invoice_number,
          i.final_total,
          i.paid_amount,
          i.balance_amount,
          i.payment_status
        FROM visits v
        JOIN patients p ON v.patient_id = p.id
        LEFT JOIN doctors d ON v.referring_doctor_id = d.id
        JOIN app_users u ON v.operator_id = u.id
        LEFT JOIN invoices i ON v.id = i.visit_id
        WHERE v.id = ?
      `)
      .get(id) as Visit | undefined;

    if (!visitRow) return null;

    // Fetch Patient entity
    const patient = this.patientRepo.getPatientById(visitRow.patient_id);
    if (!patient) return null;

    // Fetch Doctor entity (if any)
    let doctor = null;
    if (visitRow.referring_doctor_id) {
      doctor = db.prepare(`SELECT * FROM doctors WHERE id = ?`).get(visitRow.referring_doctor_id) as any;
    }

    // Fetch Order Items
    const orderItems = db
      .prepare(`SELECT * FROM order_items WHERE visit_id = ? ORDER BY id ASC`)
      .all(visitRow.id) as OrderItem[];

    // Fetch Invoice
    const invoice = db
      .prepare(`SELECT * FROM invoices WHERE visit_id = ?`)
      .get(visitRow.id) as Invoice | undefined;

    if (!invoice) return null;

    // Fetch Payments
    const payments = db
      .prepare(`
        SELECT p.*, u.full_name as operator_name
        FROM payments p
        JOIN app_users u ON p.operator_id = u.id
        WHERE p.invoice_id = ?
        ORDER BY p.id ASC
      `)
      .all(invoice.id) as Payment[];

    return {
      visit: visitRow,
      patient,
      doctor: doctor || null,
      orderItems,
      invoice,
      payments,
    };
  }

  /**
   * Returns all visits for a specific patient (for Patient History tab).
   */
  public getVisitsByPatientId(patientId: number): Visit[] {
    const db = this.dbManager.getDatabase();

    return db
      .prepare(`
        SELECT
          v.*,
          d.full_name as doctor_name,
          i.invoice_number,
          i.final_total,
          i.paid_amount,
          i.balance_amount,
          i.payment_status
        FROM visits v
        LEFT JOIN doctors d ON v.referring_doctor_id = d.id
        LEFT JOIN invoices i ON v.id = i.visit_id
        WHERE v.patient_id = ?
        ORDER BY v.id DESC
      `)
      .all(patientId) as Visit[];
  }

  /**
   * Search / filter visits for the laboratory reception desk.
   */
  public searchVisits(params: {
    query?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {}): VisitSearchResult {
    const db = this.dbManager.getDatabase();
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const sqlParams: any[] = [];

    if (params.query && params.query.trim()) {
      const q = `%${params.query.trim()}%`;
      conditions.push(`(v.visit_number LIKE ? OR p.full_name LIKE ? OR p.patient_mrn LIKE ? OR i.invoice_number LIKE ?)`);
      sqlParams.push(q, q, q, q);
    }

    if (params.status && params.status !== 'all') {
      conditions.push(`v.status = ?`);
      sqlParams.push(params.status);
    }

    if (params.startDate) {
      conditions.push(`v.order_date >= ?`);
      sqlParams.push(params.startDate);
    }

    if (params.endDate) {
      conditions.push(`v.order_date <= ?`);
      sqlParams.push(params.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db
      .prepare(`
        SELECT COUNT(*) as count
        FROM visits v
        JOIN patients p ON v.patient_id = p.id
        LEFT JOIN invoices i ON v.id = i.visit_id
        ${whereClause}
      `)
      .get(...sqlParams) as { count: number };

    const total = countRow.count;
    const totalPages = Math.ceil(total / limit) || 1;

    const visits = db
      .prepare(`
        SELECT
          v.*,
          p.full_name as patient_name,
          p.patient_mrn,
          p.gender as patient_gender,
          p.date_of_birth as patient_dob,
          p.phone_number as patient_phone,
          d.full_name as doctor_name,
          i.invoice_number,
          i.final_total,
          i.paid_amount,
          i.balance_amount,
          i.payment_status
        FROM visits v
        JOIN patients p ON v.patient_id = p.id
        LEFT JOIN doctors d ON v.referring_doctor_id = d.id
        LEFT JOIN invoices i ON v.id = i.visit_id
        ${whereClause}
        ORDER BY v.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...sqlParams, limit, offset) as Visit[];

    return {
      visits,
      total,
      page,
      totalPages,
    };
  }

  /**
   * Records a subsequent payment against an outstanding invoice inside a transaction.
   */
  public recordPayment(input: RecordPaymentInput, operatorId: number): Payment {
    const db = this.dbManager.getDatabase();

    const transaction = db.transaction(() => {
      const invoice = db
        .prepare(`SELECT * FROM invoices WHERE id = ?`)
        .get(input.invoiceId) as Invoice | undefined;

      if (!invoice) {
        throw new DatabaseError(`Invoice with ID ${input.invoiceId} does not exist.`);
      }

      if (invoice.balance_amount <= 0 || invoice.payment_status === 'paid') {
        throw new BillingError('This invoice is already fully paid. No further payments can be recorded.');
      }

      if (input.amountPaisa > invoice.balance_amount) {
        throw new BillingError(
          `Payment amount (${input.amountPaisa / 100}) exceeds the remaining balance (${invoice.balance_amount / 100}). Overpayments are not permitted.`
        );
      }

      const now = new Date().toISOString();
      const receiptNumber = this.generateNextReceiptNumber();

      const insertPaymentStmt = db.prepare(`
        INSERT INTO payments (
          receipt_number, invoice_id, amount, payment_method,
          transaction_reference, operator_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const paymentResult = insertPaymentStmt.run(
        receiptNumber,
        invoice.id,
        input.amountPaisa,
        input.paymentMethod,
        input.transactionReference ? input.transactionReference.trim() : null,
        operatorId,
        'cleared',
        now
      );

      const paymentId = Number(paymentResult.lastInsertRowid);

      // Update Invoice
      const newPaidAmount = invoice.paid_amount + input.amountPaisa;
      const newBalanceAmount = invoice.final_total - newPaidAmount;
      const newPaymentStatus = newBalanceAmount === 0 ? 'paid' : 'partially_paid';

      db.prepare(`
        UPDATE invoices
        SET paid_amount = ?, balance_amount = ?, payment_status = ?, finalized_at = ?
        WHERE id = ?
      `).run(newPaidAmount, newBalanceAmount, newPaymentStatus, newBalanceAmount === 0 ? now : invoice.finalized_at, invoice.id);

      // Audit Log
      this.auditRepo.logAction({
        userId: operatorId,
        action: 'PAYMENT_RECORDED',
        entityType: 'payments',
        entityId: String(paymentId),
        details: {
          invoiceId: invoice.id,
          receiptNumber,
          amountPaisa: input.amountPaisa,
          newPaidAmount,
          newBalanceAmount,
        },
      });

      return paymentId;
    });

    const paymentId = transaction();
    const payment = db
      .prepare(`
        SELECT p.*, u.full_name as operator_name
        FROM payments p
        JOIN app_users u ON p.operator_id = u.id
        WHERE p.id = ?
      `)
      .get(paymentId) as Payment;

    return payment;
  }
}
