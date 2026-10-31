import { DatabaseManager, DatabaseError } from '../connection';

export interface DoctorCommissionSummary {
  doctorId: number;
  doctorName: string;
  specialization: string | null;
  commissionPercentage: number;
  phoneNumber?: string | null;
  clinicHospitalName?: string | null;
  totalReferredVisits: number;
  totalTestsOrdered: number;
  grossRevenuePaisa: number;
  discountPaisa: number;
  netRevenuePaisa: number;
  patientPaidPaisa: number;
  patientBalancePaisa: number;
  totalEarnedCommissionPaisa: number;
  totalPaidPaisa: number;
  remainingBalancePaisa: number;
}

export interface DoctorReferredVisitItem {
  visitId: number;
  visitNumber: string;
  orderDate: string;
  patientId: number;
  patientName: string;
  patientMrn: string;
  patientGender: string;
  patientDob: string | null;
  testNames: string;
  testCount: number;
  subtotalPaisa: number;
  discountPaisa: number;
  netTotalPaisa: number;
  doctorPercentage: number;
  commissionPaisa: number;
  patientPaidPaisa: number;
  patientBalancePaisa: number;
}

export interface DoctorPayoutItem {
  id: number;
  doctorId: number;
  doctorName: string;
  paymentDate: string;
  amountPaisa: number;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  recordedByUserId: number | null;
  recordedByName: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface DoctorCommissionOverview {
  period: { startDate?: string; endDate?: string };
  overall: {
    totalDoctors: number;
    totalReferredVisits: number;
    totalTestsOrdered: number;
    grossRevenuePaisa: number;
    discountPaisa: number;
    netRevenuePaisa: number;
    totalEarnedCommissionPaisa: number;
    totalPaidPaisa: number;
    remainingBalancePaisa: number;
  };
  doctors: Array<{
    doctorId: number;
    doctorName: string;
    specialization: string | null;
    commissionPercentage: number;
    referredVisits: number;
    netSalesPaisa: number;
    commissionPaisa: number;
    paidPaisa: number;
    balancePaisa: number;
  }>;
}

export interface RecordDoctorPayoutInput {
  doctorId: number;
  amountPaisa: number;
  paymentDate: string; // YYYY-MM-DD
  paymentMethod?: string;
  reference?: string | null;
  notes?: string | null;
}

export interface UpdateDoctorPayoutInput {
  id: number;
  doctorId?: number;
  amountPaisa: number;
  paymentDate: string; // YYYY-MM-DD
  paymentMethod?: string;
  reference?: string | null;
  notes?: string | null;
  editReason: string;
}

export class DoctorCommissionRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Cleans and deduplicates [EDIT HISTORY] blocks inside payout notes.
   */
  public deduplicatePayoutNotes(notes: string | null): string | null {
    if (!notes) return notes;
    const histIdx = notes.search(/\[EDIT HISTORY/i);
    if (histIdx === -1) return notes;

    const baseNote = notes.slice(0, histIdx).trim();
    const histRaw = notes.slice(histIdx);
    const parts = histRaw.split(/(?=\[EDIT HISTORY)/i).map((p: string) => p.trim()).filter(Boolean);
    const uniqueHistory: string[] = [];

    for (const p of parts) {
      if (!uniqueHistory.includes(p)) {
        uniqueHistory.push(p);
      }
    }

    return baseNote
      ? `${baseNote}\n\n${uniqueHistory.join('\n\n')}`
      : uniqueHistory.join('\n\n');
  }

  /**
   * Retrieves full overview of all doctors and their commission/settlement standings.
   */
  public getCommissionOverview(query: { startDate?: string; endDate?: string } = {}): DoctorCommissionOverview {
    const db = this.dbManager.getDatabase();

    const visitConditions: string[] = ["v.status != 'cancelled'"];
    const visitParams: any[] = [];
    if (query.startDate) {
      visitConditions.push('substr(v.order_date, 1, 10) >= ?');
      visitParams.push(query.startDate.slice(0, 10));
    }
    if (query.endDate) {
      visitConditions.push('substr(v.order_date, 1, 10) <= ?');
      visitParams.push(query.endDate.slice(0, 10));
    }

    // Payout date condition
    const payConditions: string[] = ['1=1'];
    const payParams: any[] = [];
    if (query.startDate) {
      payConditions.push('substr(payment_date, 1, 10) >= ?');
      payParams.push(query.startDate.slice(0, 10));
    }
    if (query.endDate) {
      payConditions.push('substr(payment_date, 1, 10) <= ?');
      payParams.push(query.endDate.slice(0, 10));
    }

    // 1. Fetch active doctors with referrals
    const doctors = db.prepare(`
      SELECT id, full_name, specialization, commission_percentage
      FROM doctors
      WHERE is_active = 1
      ORDER BY full_name ASC
    `).all() as Array<{ id: number; full_name: string; specialization: string | null; commission_percentage: number }>;

    // 2. Fetch referred visits aggregated per doctor
    const visitAggregates = db.prepare(`
      SELECT
        v.referring_doctor_id as doctorId,
        COUNT(DISTINCT v.id) as referredVisits,
        COALESCE(SUM(i.subtotal_amount), 0) as grossRevenuePaisa,
        COALESCE(SUM(i.discount_amount), 0) as discountPaisa,
        COALESCE(SUM(i.final_total), 0) as netSalesPaisa,
        COALESCE(SUM(ROUND(i.final_total * COALESCE(d.commission_percentage, 0) / 100.0)), 0) as commissionPaisa,
        COALESCE(SUM(item_counts.test_count), 0) as totalTests
      FROM visits v
      JOIN doctors d ON v.referring_doctor_id = d.id
      LEFT JOIN invoices i ON v.id = i.visit_id
      LEFT JOIN (
        SELECT visit_id, COUNT(*) as test_count
        FROM order_items
        GROUP BY visit_id
      ) item_counts ON v.id = item_counts.visit_id
      WHERE ${visitConditions.join(' AND ')}
      GROUP BY v.referring_doctor_id
    `).all(...visitParams) as Array<{
      doctorId: number;
      referredVisits: number;
      grossRevenuePaisa: number;
      discountPaisa: number;
      netSalesPaisa: number;
      commissionPaisa: number;
      totalTests: number;
    }>;

    const visitMap = new Map<number, (typeof visitAggregates)[0]>();
    for (const v of visitAggregates) {
      visitMap.set(v.doctorId, v);
    }

    // 3. Fetch payouts aggregated per doctor
    const payoutsAggregates = db.prepare(`
      SELECT doctor_id as doctorId, COALESCE(SUM(amount_paisa), 0) as paidPaisa
      FROM doctor_commission_payments
      WHERE ${payConditions.join(' AND ')}
      GROUP BY doctor_id
    `).all(...payParams) as Array<{ doctorId: number; paidPaisa: number }>;

    const payMap = new Map<number, number>();
    for (const p of payoutsAggregates) {
      payMap.set(p.doctorId, Number(p.paidPaisa || 0));
    }

    let overallVisits = 0;
    let overallTests = 0;
    let overallGross = 0;
    let overallDiscount = 0;
    let overallNet = 0;
    let overallCommission = 0;
    let overallPaid = 0;

    const doctorRows = doctors.map((doc) => {
      const v = visitMap.get(doc.id);
      const paid = payMap.get(doc.id) || 0;
      const visits = Number(v?.referredVisits || 0);
      const tests = Number(v?.totalTests || 0);
      const gross = Number(v?.grossRevenuePaisa || 0);
      const discount = Number(v?.discountPaisa || 0);
      const net = Number(v?.netSalesPaisa || 0);
      const comm = Number(v?.commissionPaisa || 0);

      overallVisits += visits;
      overallTests += tests;
      overallGross += gross;
      overallDiscount += discount;
      overallNet += net;
      overallCommission += comm;
      overallPaid += paid;

      return {
        doctorId: doc.id,
        doctorName: doc.full_name,
        specialization: doc.specialization,
        commissionPercentage: Number(doc.commission_percentage || 0),
        referredVisits: visits,
        netSalesPaisa: net,
        commissionPaisa: comm,
        paidPaisa: paid,
        balancePaisa: comm - paid,
      };
    });

    return {
      period: { startDate: query.startDate, endDate: query.endDate },
      overall: {
        totalDoctors: doctors.length,
        totalReferredVisits: overallVisits,
        totalTestsOrdered: overallTests,
        grossRevenuePaisa: overallGross,
        discountPaisa: overallDiscount,
        netRevenuePaisa: overallNet,
        totalEarnedCommissionPaisa: overallCommission,
        totalPaidPaisa: overallPaid,
        remainingBalancePaisa: overallCommission - overallPaid,
      },
      doctors: doctorRows,
    };
  }

  /**
   * Retrieves summary for a specific doctor.
   */
  public getDoctorSummary(
    doctorId: number,
    query: { startDate?: string; endDate?: string } = {}
  ): DoctorCommissionSummary | null {
    const db = this.dbManager.getDatabase();

    const doctor = db.prepare(`
      SELECT id, full_name, specialization, phone_number, clinic_hospital_name, commission_percentage
      FROM doctors
      WHERE id = ?
    `).get(doctorId) as any;

    if (!doctor) return null;

    const visitConditions: string[] = ["v.referring_doctor_id = ?", "v.status != 'cancelled'"];
    const visitParams: any[] = [doctorId];
    if (query.startDate) {
      visitConditions.push('substr(v.order_date, 1, 10) >= ?');
      visitParams.push(query.startDate.slice(0, 10));
    }
    if (query.endDate) {
      visitConditions.push('substr(v.order_date, 1, 10) <= ?');
      visitParams.push(query.endDate.slice(0, 10));
    }

    const visitRow = db.prepare(`
      SELECT
        COUNT(DISTINCT v.id) as totalVisits,
        COALESCE(SUM(i.subtotal_amount), 0) as grossRevenuePaisa,
        COALESCE(SUM(i.discount_amount), 0) as discountPaisa,
        COALESCE(SUM(i.final_total), 0) as netRevenuePaisa,
        COALESCE(SUM(i.paid_amount), 0) as patientPaidPaisa,
        COALESCE(SUM(i.balance_amount), 0) as patientBalancePaisa,
        COALESCE(SUM(ROUND(i.final_total * COALESCE(d.commission_percentage, 0) / 100.0)), 0) as earnedCommissionPaisa,
        COALESCE(SUM(item_counts.test_count), 0) as totalTests
      FROM visits v
      JOIN doctors d ON v.referring_doctor_id = d.id
      LEFT JOIN invoices i ON v.id = i.visit_id
      LEFT JOIN (
        SELECT visit_id, COUNT(*) as test_count
        FROM order_items
        GROUP BY visit_id
      ) item_counts ON v.id = item_counts.visit_id
      WHERE ${visitConditions.join(' AND ')}
    `).get(...visitParams) as any;

    const payConditions: string[] = ['doctor_id = ?'];
    const payParams: any[] = [doctorId];
    if (query.startDate) {
      payConditions.push('substr(payment_date, 1, 10) >= ?');
      payParams.push(query.startDate.slice(0, 10));
    }
    if (query.endDate) {
      payConditions.push('substr(payment_date, 1, 10) <= ?');
      payParams.push(query.endDate.slice(0, 10));
    }

    const paidRow = db.prepare(`
      SELECT COALESCE(SUM(amount_paisa), 0) as totalPaidPaisa
      FROM doctor_commission_payments
      WHERE ${payConditions.join(' AND ')}
    `).get(...payParams) as any;

    const earned = Number(visitRow?.earnedCommissionPaisa || 0);
    const paid = Number(paidRow?.totalPaidPaisa || 0);

    return {
      doctorId: doctor.id,
      doctorName: doctor.full_name,
      specialization: doctor.specialization,
      phoneNumber: doctor.phone_number,
      clinicHospitalName: doctor.clinic_hospital_name,
      commissionPercentage: Number(doctor.commission_percentage || 0),
      totalReferredVisits: Number(visitRow?.totalVisits || 0),
      totalTestsOrdered: Number(visitRow?.totalTests || 0),
      grossRevenuePaisa: Number(visitRow?.grossRevenuePaisa || 0),
      discountPaisa: Number(visitRow?.discountPaisa || 0),
      netRevenuePaisa: Number(visitRow?.netRevenuePaisa || 0),
      patientPaidPaisa: Number(visitRow?.patientPaidPaisa || 0),
      patientBalancePaisa: Number(visitRow?.patientBalancePaisa || 0),
      totalEarnedCommissionPaisa: earned,
      totalPaidPaisa: paid,
      remainingBalancePaisa: earned - paid,
    };
  }

  /**
   * Retrieves list of individual visits referred by the doctor.
   */
  public getDoctorReferredVisits(
    doctorId: number,
    query: { startDate?: string; endDate?: string; search?: string } = {}
  ): DoctorReferredVisitItem[] {
    const db = this.dbManager.getDatabase();

    const conditions: string[] = ["v.referring_doctor_id = ?", "v.status != 'cancelled'"];
    const params: any[] = [doctorId];

    if (query.startDate) {
      conditions.push('substr(v.order_date, 1, 10) >= ?');
      params.push(query.startDate.slice(0, 10));
    }
    if (query.endDate) {
      conditions.push('substr(v.order_date, 1, 10) <= ?');
      params.push(query.endDate.slice(0, 10));
    }
    if (query.search && query.search.trim()) {
      const q = `%${query.search.trim()}%`;
      conditions.push('(p.full_name LIKE ? OR p.patient_mrn LIKE ? OR v.visit_number LIKE ?)');
      params.push(q, q, q);
    }

    const rows = db.prepare(`
      SELECT
        v.id as visitId,
        v.visit_number as visitNumber,
        v.order_date as orderDate,
        p.id as patientId,
        p.full_name as patientName,
        p.patient_mrn as patientMrn,
        p.gender as patientGender,
        p.date_of_birth as patientDob,
        COALESCE(d.commission_percentage, 0) as doctorPercentage,
        COALESCE(i.subtotal_amount, 0) as subtotalPaisa,
        COALESCE(i.discount_amount, 0) as discountPaisa,
        COALESCE(i.final_total, 0) as netTotalPaisa,
        COALESCE(i.paid_amount, 0) as patientPaidPaisa,
        COALESCE(i.balance_amount, 0) as patientBalancePaisa,
        COALESCE(ROUND(i.final_total * COALESCE(d.commission_percentage, 0) / 100.0), 0) as commissionPaisa,
        COALESCE(test_data.test_names, '') as testNames,
        COALESCE(test_data.test_count, 0) as testCount
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      JOIN doctors d ON v.referring_doctor_id = d.id
      LEFT JOIN invoices i ON v.id = i.visit_id
      LEFT JOIN (
        SELECT
          visit_id,
          COUNT(*) as test_count,
          GROUP_CONCAT(test_name_snapshot, ', ') as test_names
        FROM order_items
        GROUP BY visit_id
      ) test_data ON v.id = test_data.visit_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY v.order_date DESC, v.id DESC
    `).all(...params) as Array<{
      visitId: number;
      visitNumber: string;
      orderDate: string;
      patientId: number;
      patientName: string;
      patientMrn: string;
      patientGender: string;
      patientDob: string | null;
      doctorPercentage: number;
      subtotalPaisa: number;
      discountPaisa: number;
      netTotalPaisa: number;
      patientPaidPaisa: number;
      patientBalancePaisa: number;
      commissionPaisa: number;
      testNames: string;
      testCount: number;
    }>;

    return rows.map((r) => ({
      visitId: Number(r.visitId),
      visitNumber: String(r.visitNumber),
      orderDate: String(r.orderDate),
      patientId: Number(r.patientId),
      patientName: String(r.patientName),
      patientMrn: String(r.patientMrn),
      patientGender: String(r.patientGender),
      patientDob: r.patientDob,
      testNames: String(r.testNames || ''),
      testCount: Number(r.testCount || 0),
      subtotalPaisa: Number(r.subtotalPaisa || 0),
      discountPaisa: Number(r.discountPaisa || 0),
      netTotalPaisa: Number(r.netTotalPaisa || 0),
      doctorPercentage: Number(r.doctorPercentage || 0),
      commissionPaisa: Number(r.commissionPaisa || 0),
      patientPaidPaisa: Number(r.patientPaidPaisa || 0),
      patientBalancePaisa: Number(r.patientBalancePaisa || 0),
    }));
  }

  /**
   * Lists doctor payout disbursements.
   */
  public listDoctorPayouts(query: { doctorId?: number; startDate?: string; endDate?: string } = {}): DoctorPayoutItem[] {
    const db = this.dbManager.getDatabase();

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (query.doctorId && query.doctorId > 0) {
      conditions.push('p.doctor_id = ?');
      params.push(query.doctorId);
    }
    if (query.startDate) {
      conditions.push('substr(p.payment_date, 1, 10) >= ?');
      params.push(query.startDate.slice(0, 10));
    }
    if (query.endDate) {
      conditions.push('substr(p.payment_date, 1, 10) <= ?');
      params.push(query.endDate.slice(0, 10));
    }

    const rows = db.prepare(`
      SELECT
        p.id,
        p.doctor_id as doctorId,
        d.full_name as doctorName,
        p.payment_date as paymentDate,
        p.amount_paisa as amountPaisa,
        p.payment_method as paymentMethod,
        p.reference,
        p.notes,
        p.recorded_by_user_id as recordedByUserId,
        u.full_name as recordedByName,
        p.created_at as createdAt,
        p.updated_at as updatedAt
      FROM doctor_commission_payments p
      JOIN doctors d ON p.doctor_id = d.id
      LEFT JOIN app_users u ON p.recorded_by_user_id = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.payment_date DESC, p.id DESC
    `).all(...params) as any[];

    return rows.map((r) => {
      let sanitizedNotes = r.notes;
      if (sanitizedNotes) {
        const cleaned = this.deduplicatePayoutNotes(sanitizedNotes);
        if (cleaned !== sanitizedNotes) {
          sanitizedNotes = cleaned;
          try {
            db.prepare('UPDATE doctor_commission_payments SET notes = ? WHERE id = ?').run(cleaned, r.id);
          } catch {
            // ignore
          }
        }
      }
      return {
        id: Number(r.id),
        doctorId: Number(r.doctorId),
        doctorName: String(r.doctorName),
        paymentDate: String(r.paymentDate),
        amountPaisa: Number(r.amountPaisa),
        paymentMethod: String(r.paymentMethod || 'cash'),
        reference: r.reference || null,
        notes: sanitizedNotes || null,
        recordedByUserId: r.recordedByUserId ? Number(r.recordedByUserId) : null,
        recordedByName: r.recordedByName ? String(r.recordedByName) : null,
        createdAt: String(r.createdAt),
        updatedAt: r.updatedAt ? String(r.updatedAt) : null,
      };
    });
  }

  /**
   * Records a new payment to a doctor.
   */
  public recordDoctorPayout(input: RecordDoctorPayoutInput, userId?: number): DoctorPayoutItem {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO doctor_commission_payments (
        doctor_id, amount_paisa, payment_date, payment_method, reference, notes, recorded_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.doctorId,
      Math.round(input.amountPaisa),
      input.paymentDate.slice(0, 10),
      input.paymentMethod?.trim() || 'cash',
      input.reference?.trim() || null,
      input.notes?.trim() || null,
      userId || null,
      now,
      now
    );

    const createdId = Number(result.lastInsertRowid);
    const list = this.listDoctorPayouts({ doctorId: input.doctorId });
    const found = list.find((p) => p.id === createdId);
    if (!found) {
      throw new DatabaseError(`Could not find recorded payout with ID ${createdId}`);
    }
    return found;
  }

  /**
   * Updates an existing doctor payout and writes a structured audit log.
   */
  public updateDoctorPayout(input: UpdateDoctorPayoutInput, userId?: number): DoctorPayoutItem {
    const db = this.dbManager.getDatabase();
    const old = db.prepare(`
      SELECT p.*, d.full_name as doctor_name
      FROM doctor_commission_payments p
      JOIN doctors d ON p.doctor_id = d.id
      WHERE p.id = ?
    `).get(input.id) as any;

    if (!old) {
      throw new DatabaseError(`Doctor payment record with ID ${input.id} was not found.`);
    }

    const newAmount = Math.round(input.amountPaisa);
    const newDate = input.paymentDate.slice(0, 10);
    const newMethod = input.paymentMethod?.trim() || 'cash';
    const newRef = input.reference !== undefined ? (input.reference ? input.reference.trim() : null) : (old.reference || null);

    const changes: string[] = [];
    if (newAmount !== old.amount_paisa) {
      changes.push(`Amount changed from Rs. ${(old.amount_paisa / 100).toLocaleString('en-PK')} to Rs. ${(newAmount / 100).toLocaleString('en-PK')}`);
    }
    if (newDate !== old.payment_date) {
      changes.push(`Payment date changed from ${old.payment_date} to ${newDate}`);
    }
    if (newMethod !== (old.payment_method || 'cash')) {
      changes.push(`Method changed from ${old.payment_method || 'cash'} to ${newMethod}`);
    }
    if (newRef !== (old.reference || null)) {
      changes.push(`Reference changed from '${old.reference || 'none'}' to '${newRef || 'none'}'`);
    }

    let editorName = 'Staff';
    if (userId) {
      const u = db.prepare('SELECT full_name FROM app_users WHERE id = ?').get(userId) as any;
      if (u?.full_name) editorName = u.full_name;
    }

    const editTimestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const reasonDetail = input.editReason?.trim() || 'No detail provided';
    const beforeSummary = `Amount: Rs. ${(old.amount_paisa / 100).toLocaleString('en-PK')}, Date: ${old.payment_date}, Method: ${old.payment_method || 'cash'}${old.reference ? `, Ref: ${old.reference}` : ''}`;
    const whatChangedText = changes.length > 0 ? changes.join('; ') : 'Notes updated';

    const auditMessage = `[EDIT HISTORY ${editTimestamp} by ${editorName}]\n• Reason for change: "${reasonDetail}"\n• What changed: ${whatChangedText}\n• Before values: [${beforeSummary}]`;

    let cleanBaseNote = '';
    if (input.notes !== undefined) {
      const inputRaw = input.notes?.trim() || '';
      const inputHistIdx = inputRaw.search(/\[EDIT HISTORY/i);
      cleanBaseNote = inputHistIdx >= 0 ? inputRaw.slice(0, inputHistIdx).trim() : inputRaw;
    } else if (old.notes) {
      const existRaw = old.notes.trim();
      const existHistIdx = existRaw.search(/\[EDIT HISTORY/i);
      cleanBaseNote = existHistIdx >= 0 ? existRaw.slice(0, existHistIdx).trim() : existRaw;
    }

    const historyBlocks: string[] = [];
    if (old.notes) {
      const existHistIdx = old.notes.search(/\[EDIT HISTORY/i);
      if (existHistIdx >= 0) {
        const histRaw = old.notes.slice(existHistIdx);
        const parts = histRaw.split(/(?=\[EDIT HISTORY)/i).map((p: string) => p.trim()).filter(Boolean);
        for (const p of parts) {
          if (!historyBlocks.includes(p)) {
            historyBlocks.push(p);
          }
        }
      }
    }

    historyBlocks.push(auditMessage);

    const finalNotes = cleanBaseNote
      ? `${cleanBaseNote}\n\n${historyBlocks.join('\n\n')}`
      : historyBlocks.join('\n\n');

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE doctor_commission_payments
      SET amount_paisa = ?, payment_date = ?, payment_method = ?, reference = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      newAmount,
      newDate,
      newMethod,
      newRef,
      finalNotes,
      now,
      input.id
    );

    const list = this.listDoctorPayouts({ doctorId: old.doctor_id });
    const found = list.find((p) => p.id === input.id);
    if (!found) {
      throw new DatabaseError(`Could not retrieve updated doctor payout ID ${input.id}`);
    }
    return found;
  }
}

