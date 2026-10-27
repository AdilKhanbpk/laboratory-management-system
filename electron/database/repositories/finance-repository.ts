import { DatabaseManager, DatabaseError } from '../connection';
import type {
  PartnershipDashboardData,
  RecordLabCollectionInput,
  RecordPartnershipExpenseInput,
  RecordPartnerPaymentInput,
  ReversePartnershipTransactionInput,
  ClosePartnershipMonthInput,
  RecordDoctorCommissionPaymentInput,
  RecordInvestorCapitalInput,
} from '../../types/ipc';

export interface OwnerPayout {
  id: number;
  amount_paisa: number;
  payout_date: string; // YYYY-MM-DD
  notes: string | null;
  recorded_by_user_id: number | null;
  recorded_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordPayoutInput {
  amountPaisa: number;
  payoutDate: string; // YYYY-MM-DD
  notes?: string | null;
}

export interface DoctorCommissionBreakdown {
  doctorId: number;
  doctorName: string;
  commissionPercentage: number;
  referredVisits: number;
  netSalesPaisa: number;
  commissionPaisa: number;
  paidPaisa?: number;
  unpaidPaisa?: number;
}

export interface FinancialMetrics {
  totalSalesPaisa: number;
  totalPaidPaisa: number;
  totalDoctorsCommissionPaisa: number;
  totalAssetsPaisa: number;
  netProfitPaisa: number;
  ownerPercentage: number;
  mySharePaisa: number;
  totalReceivedPaisa: number;
  remainingBalancePaisa: number;
}

export interface MyPercentageSummary {
  lifetime: FinancialMetrics;
  period: FinancialMetrics & {
    startDate?: string | null;
    endDate?: string | null;
  };
  doctorCommissions: DoctorCommissionBreakdown[];
  payouts: OwnerPayout[];
}

export class FinanceRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  public getOwnerPercentage(): number {
    const db = this.dbManager.getDatabase();
    try {
      const row = db.prepare('SELECT owner_percentage FROM hospital_settings WHERE id = 1').get() as { owner_percentage?: number };
      if (row && row.owner_percentage !== undefined && row.owner_percentage !== null) {
        return Number(row.owner_percentage);
      }
    } catch {
      // column might not be queried if default
    }
    return 50;
  }

  /**
   * Looks up the effective percentage split applicable for a given date.
   * If no historical split existed on or before that date, falls back to the current hospital setting.
   */
  public getEffectiveSplit(targetDate?: string): { technicianPct: number; investorPct: number } {
    const db = this.dbManager.getDatabase();
    const date = targetDate ? targetDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
    try {
      const row = db.prepare(`
        SELECT technician_percentage, investor_percentage
        FROM partnership_percentage_history
        WHERE substr(effective_from, 1, 10) <= ?
        ORDER BY effective_from DESC, id DESC
        LIMIT 1
      `).get(date) as { technician_percentage: number; investor_percentage: number } | undefined;

      if (row && Number.isFinite(row.technician_percentage)) {
        const tech = Math.max(0, Math.min(100, Number(row.technician_percentage)));
        const inv = Number.isFinite(row.investor_percentage)
          ? Math.max(0, Math.min(100, Number(row.investor_percentage)))
          : 100 - tech;
        return { technicianPct: tech, investorPct: inv };
      }
    } catch {
      // fallback
    }
    const tech = this.getOwnerPercentage();
    return { technicianPct: tech, investorPct: 100 - tech };
  }

  public updateOwnerPercentage(percentage: number): number {
    return this.updatePartnershipSplit(percentage);
  }

  public recordPayout(input: RecordPayoutInput, userId?: number): OwnerPayout {
    if (!input.amountPaisa || input.amountPaisa <= 0) {
      throw new DatabaseError('Received amount must be greater than zero.');
    }

    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();
    const cleanDate = input.payoutDate.trim().slice(0, 10);

    const stmt = db.prepare(`
      INSERT INTO owner_payouts (
        amount_paisa, payout_date, notes, recorded_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      Math.round(input.amountPaisa),
      cleanDate,
      input.notes?.trim() || null,
      userId || null,
      now,
      now
    );

    // Keep partner_transactions in sync
    try {
      db.prepare(`
        INSERT INTO partner_transactions (
          payment_date, amount_paisa, partner, payment_type, payment_method, notes, status, recorded_by_user_id, created_at
        ) VALUES (?, ?, 'technician', 'profit_distribution', 'cash', ?, 'active', ?, ?)
      `).run(
        cleanDate,
        Math.round(input.amountPaisa),
        input.notes?.trim() || null,
        userId || null,
        now
      );
    } catch {
      // Table might not exist yet during migration tests
    }

    return this.getPayoutById(Number(result.lastInsertRowid))!;
  }

  public deletePayout(id: number): boolean {
    const db = this.dbManager.getDatabase();
    const payout = this.getPayoutById(id);
    const result = db.prepare('DELETE FROM owner_payouts WHERE id = ?').run(id);
    if (payout) {
      try {
        db.prepare(`
          DELETE FROM partner_transactions
          WHERE partner = 'technician'
            AND substr(payment_date, 1, 10) = substr(?, 1, 10)
            AND amount_paisa = ?
        `).run(payout.payout_date, payout.amount_paisa);
      } catch {
        // ignore
      }
    }
    return result.changes > 0;
  }

  public getPayoutById(id: number): OwnerPayout | null {
    const db = this.dbManager.getDatabase();
    const row = db.prepare(`
      SELECT p.*, u.full_name as recorded_by_name
      FROM owner_payouts p
      LEFT JOIN app_users u ON p.recorded_by_user_id = u.id
      WHERE p.id = ?
    `).get(id);

    return (row as OwnerPayout) || null;
  }

  public listPayouts(query: { startDate?: string; endDate?: string } = {}): OwnerPayout[] {
    const db = this.dbManager.getDatabase();
    const where: string[] = ['1=1'];
    const params: any[] = [];

    if (query.startDate) {
      where.push('substr(p.payout_date, 1, 10) >= ?');
      params.push(query.startDate.slice(0, 10));
    }
    if (query.endDate) {
      where.push('substr(p.payout_date, 1, 10) <= ?');
      params.push(query.endDate.slice(0, 10));
    }

    const rows = db.prepare(`
      SELECT p.*, u.full_name as recorded_by_name
      FROM owner_payouts p
      LEFT JOIN app_users u ON p.recorded_by_user_id = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY p.payout_date DESC, p.id DESC
    `).all(...params);

    return rows as OwnerPayout[];
  }

  /**
   * Calculates comprehensive dynamic financial breakdown and lifetime stats.
   */
  public getMyPercentageSummary(query: { startDate?: string; endDate?: string } = {}): MyPercentageSummary {
    const db = this.dbManager.getDatabase();
    const ownerPercentage = this.getOwnerPercentage();

    // 1. LIFETIME METRICS
    const lifetimeSalesRow = db.prepare(`
      SELECT
        COALESCE(SUM(i.final_total), 0) as totalSales,
        COALESCE(SUM(i.paid_amount), 0) as totalPaid
      FROM invoices i
      JOIN visits v ON i.visit_id = v.id
      WHERE v.status != 'cancelled'
    `).get() as { totalSales: number; totalPaid: number };

    const lifetimeDoctorCommissionRow = db.prepare(`
      SELECT COALESCE(SUM(ROUND(i.final_total * COALESCE(d.commission_percentage, 0) / 100.0)), 0) as totalDocCommission
      FROM doctors d
      JOIN visits v ON d.id = v.referring_doctor_id
      JOIN invoices i ON v.id = i.visit_id
      WHERE v.status != 'cancelled' AND d.commission_percentage > 0
    `).get() as { totalDocCommission: number };

    const lifetimeAssetsRow = db.prepare(`
      SELECT
        COALESCE(SUM(amount_paisa), 0) as totalAssets,
        COALESCE(SUM(CASE WHEN purchased_by = 'technician' THEN amount_paisa ELSE 0 END), 0) as techPurchased
      FROM lab_assets
    `).get() as { totalAssets: number; techPurchased: number };

    const lifetimePayoutsRow = db.prepare(`
      SELECT COALESCE(SUM(amount_paisa), 0) as totalReceived
      FROM owner_payouts
    `).get() as { totalReceived: number };

    const lfSales = Number(lifetimeSalesRow?.totalSales || 0);
    const lfPaid = Number(lifetimeSalesRow?.totalPaid || 0);
    const lfDocCommission = Number(lifetimeDoctorCommissionRow?.totalDocCommission || 0);
    const lfAssets = Number(lifetimeAssetsRow?.totalAssets || 0);
    const lfTechOop = Number(lifetimeAssetsRow?.techPurchased || 0);
    const lfReceived = Number(lifetimePayoutsRow?.totalReceived || 0);

    const lfNetProfit = lfSales - lfDocCommission - lfAssets;
    const lfMyShare = Math.round((lfNetProfit * ownerPercentage) / 100);
    const lfRemaining = lfMyShare + lfTechOop - lfReceived;

    const lifetime: FinancialMetrics = {
      totalSalesPaisa: lfSales,
      totalPaidPaisa: lfPaid,
      totalDoctorsCommissionPaisa: lfDocCommission,
      totalAssetsPaisa: lfAssets,
      netProfitPaisa: lfNetProfit,
      ownerPercentage,
      mySharePaisa: lfMyShare,
      totalReceivedPaisa: lfReceived,
      remainingBalancePaisa: lfRemaining,
    };

    // 2. PERIOD METRICS (Filtered by optional startDate / endDate)
    const hasFilter = !!(query.startDate || query.endDate);

    let period: FinancialMetrics & { startDate?: string | null; endDate?: string | null };

    let doctorCommissions: DoctorCommissionBreakdown[] = [];

    if (!hasFilter) {
      // If no filter, period metrics match lifetime metrics
      period = {
        ...lifetime,
        startDate: null,
        endDate: null,
      };

      // Query all doctors commissions breakdown
      const docRows = db.prepare(`
        SELECT
          d.id as doctorId,
          d.full_name as doctorName,
          COALESCE(d.commission_percentage, 0) as commissionPercentage,
          COUNT(DISTINCT v.id) as referredVisits,
          COALESCE(SUM(i.final_total), 0) as netSalesPaisa,
          COALESCE(SUM(ROUND(i.final_total * COALESCE(d.commission_percentage, 0) / 100.0)), 0) as commissionPaisa
        FROM doctors d
        JOIN visits v ON d.id = v.referring_doctor_id
        JOIN invoices i ON v.id = i.visit_id
        WHERE v.status != 'cancelled' AND d.commission_percentage > 0
        GROUP BY d.id, d.full_name, d.commission_percentage
        ORDER BY commissionPaisa DESC
      `).all() as any[];

      doctorCommissions = docRows.map((r) => ({
        doctorId: Number(r.doctorId),
        doctorName: String(r.doctorName),
        commissionPercentage: Number(r.commissionPercentage),
        referredVisits: Number(r.referredVisits),
        netSalesPaisa: Number(r.netSalesPaisa),
        commissionPaisa: Number(r.commissionPaisa),
      }));
    } else {
      const visitDateConds: string[] = ["v.status != 'cancelled'"];
      const visitParams: any[] = [];
      if (query.startDate) {
        visitDateConds.push('substr(v.order_date, 1, 10) >= ?');
        visitParams.push(query.startDate.slice(0, 10));
      }
      if (query.endDate) {
        visitDateConds.push('substr(v.order_date, 1, 10) <= ?');
        visitParams.push(query.endDate.slice(0, 10));
      }

      const periodSalesRow = db.prepare(`
        SELECT
          COALESCE(SUM(i.final_total), 0) as totalSales,
          COALESCE(SUM(i.paid_amount), 0) as totalPaid
        FROM invoices i
        JOIN visits v ON i.visit_id = v.id
        WHERE ${visitDateConds.join(' AND ')}
      `).get(...visitParams) as { totalSales: number; totalPaid: number };

      const periodDocRows = db.prepare(`
        SELECT
          d.id as doctorId,
          d.full_name as doctorName,
          COALESCE(d.commission_percentage, 0) as commissionPercentage,
          COUNT(DISTINCT v.id) as referredVisits,
          COALESCE(SUM(i.final_total), 0) as netSalesPaisa,
          COALESCE(SUM(ROUND(i.final_total * COALESCE(d.commission_percentage, 0) / 100.0)), 0) as commissionPaisa
        FROM doctors d
        JOIN visits v ON d.id = v.referring_doctor_id
        JOIN invoices i ON v.id = i.visit_id
        WHERE ${visitDateConds.join(' AND ')} AND d.commission_percentage > 0
        GROUP BY d.id, d.full_name, d.commission_percentage
        ORDER BY commissionPaisa DESC
      `).all(...visitParams) as any[];

      doctorCommissions = periodDocRows.map((r) => ({
        doctorId: Number(r.doctorId),
        doctorName: String(r.doctorName),
        commissionPercentage: Number(r.commissionPercentage),
        referredVisits: Number(r.referredVisits),
        netSalesPaisa: Number(r.netSalesPaisa),
        commissionPaisa: Number(r.commissionPaisa),
      }));

      const periodDocCommission = doctorCommissions.reduce((sum, d) => sum + d.commissionPaisa, 0);

      // Period Assets
      const assetDateConds: string[] = ['1=1'];
      const assetParams: any[] = [];
      if (query.startDate) {
        assetDateConds.push('substr(purchase_date, 1, 10) >= ?');
        assetParams.push(query.startDate.slice(0, 10));
      }
      if (query.endDate) {
        assetDateConds.push('substr(purchase_date, 1, 10) <= ?');
        assetParams.push(query.endDate.slice(0, 10));
      }
      const periodAssetsRow = db.prepare(`
        SELECT
          COALESCE(SUM(amount_paisa), 0) as totalAssets,
          COALESCE(SUM(CASE WHEN purchased_by = 'technician' THEN amount_paisa ELSE 0 END), 0) as techPurchased
        FROM lab_assets
        WHERE ${assetDateConds.join(' AND ')}
      `).get(...assetParams) as { totalAssets: number; techPurchased: number };

      // Period Payouts
      const payoutDateConds: string[] = ['1=1'];
      const payoutParams: any[] = [];
      if (query.startDate) {
        payoutDateConds.push('substr(payout_date, 1, 10) >= ?');
        payoutParams.push(query.startDate.slice(0, 10));
      }
      if (query.endDate) {
        payoutDateConds.push('substr(payout_date, 1, 10) <= ?');
        payoutParams.push(query.endDate.slice(0, 10));
      }
      const periodPayoutsRow = db.prepare(`
        SELECT COALESCE(SUM(amount_paisa), 0) as totalReceived
        FROM owner_payouts
        WHERE ${payoutDateConds.join(' AND ')}
      `).get(...payoutParams) as { totalReceived: number };

      const pSales = Number(periodSalesRow?.totalSales || 0);
      const pPaid = Number(periodSalesRow?.totalPaid || 0);
      const pAssets = Number(periodAssetsRow?.totalAssets || 0);
      const pTechOop = Number(periodAssetsRow?.techPurchased || 0);
      const pReceived = Number(periodPayoutsRow?.totalReceived || 0);

      const pNetProfit = pSales - periodDocCommission - pAssets;
      const pMyShare = Math.round((pNetProfit * ownerPercentage) / 100);
      const pRemaining = pMyShare + pTechOop - pReceived;

      period = {
        startDate: query.startDate || null,
        endDate: query.endDate || null,
        totalSalesPaisa: pSales,
        totalPaidPaisa: pPaid,
        totalDoctorsCommissionPaisa: periodDocCommission,
        totalAssetsPaisa: pAssets,
        netProfitPaisa: pNetProfit,
        ownerPercentage,
        mySharePaisa: pMyShare,
        totalReceivedPaisa: pReceived,
        remainingBalancePaisa: pRemaining,
      };
    }

    // Recent payouts list
    const payouts = this.listPayouts(hasFilter ? { startDate: query.startDate, endDate: query.endDate } : {});

    return {
      lifetime,
      period,
      doctorCommissions,
      payouts,
    };
  }

  // =========================================================================
  // EXTENDED PARTNERSHIP LEDGER & SETTLEMENT METHODS
  // =========================================================================

  public updatePartnershipSplit(
    technicianPct: number,
    investorPct?: number,
    userId?: number,
    effectiveFrom?: string,
    reason?: string
  ): number {
    const cleanTech = Math.max(0, Math.min(100, Number(technicianPct) || 0));
    const cleanInv = investorPct !== undefined ? Math.max(0, Math.min(100, Number(investorPct) || 0)) : 100 - cleanTech;
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();
    const effDate = effectiveFrom ? effectiveFrom.slice(0, 10) : now.slice(0, 10);

    db.transaction(() => {
      db.prepare(`
        UPDATE hospital_settings
        SET owner_percentage = ?, updated_at = ?
        WHERE id = 1
      `).run(cleanTech, now);

      db.prepare(`
        INSERT INTO partnership_percentage_history (
          technician_percentage, investor_percentage, effective_from, reason, changed_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(cleanTech, cleanInv, effDate, reason?.trim() || null, userId || null, now);
    })();

    return cleanTech;
  }

  public recordLabCollection(
    input: RecordLabCollectionInput,
    userId?: number
  ): any {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO lab_collections (
        collection_date, amount_paisa, entry_type, collected_by, notes, recorded_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      input.date.slice(0, 10),
      Math.round(input.amountPaisa),
      input.type,
      input.collectedBy,
      input.notes?.trim() || null,
      userId || null,
      now
    );
    return { id: Number(res.lastInsertRowid), ...input };
  }

  public recordPartnershipExpense(
    input: RecordPartnershipExpenseInput,
    userId?: number
  ): any {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO partnership_expenses (
        expense_date, category, description, amount_paisa, paid_by, receipt_no, recorded_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      input.expenseDate.slice(0, 10),
      input.category.trim(),
      input.description.trim(),
      Math.round(input.amountPaisa),
      input.paidBy,
      input.receiptNo?.trim() || null,
      userId || null,
      now
    );
    return { id: Number(res.lastInsertRowid), ...input };
  }

  public recordPartnerPayment(
    input: RecordPartnerPaymentInput,
    userId?: number
  ): any {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO partner_transactions (
        payment_date, amount_paisa, partner, payment_type, payment_method, reference, notes, status, recorded_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);
    const res = stmt.run(
      input.paymentDate.slice(0, 10),
      Math.round(input.amountPaisa),
      input.partner,
      input.type,
      input.method || 'cash',
      input.reference?.trim() || null,
      input.notes?.trim() || null,
      userId || null,
      now
    );

    // If technician payment, also mirror to owner_payouts for backward compatibility
    if (input.partner === 'technician') {
      try {
        db.prepare(`
          INSERT INTO owner_payouts (
            amount_paisa, payout_date, notes, recorded_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          Math.round(input.amountPaisa),
          input.paymentDate.slice(0, 10),
          input.notes?.trim() || `${input.type} via ${input.method || 'cash'}`,
          userId || null,
          now,
          now
        );
      } catch {
        // ignore
      }
    }

    return { id: Number(res.lastInsertRowid), ...input, status: 'active', createdAt: now };
  }

  public deduplicateTransactionNotes(notes: string | null): string | null {
    if (!notes) return notes;
    const histIdx = notes.search(/\[EDIT HISTORY/i);
    if (histIdx === -1) return notes;

    const baseNote = notes.slice(0, histIdx).trim();
    const histRaw = notes.slice(histIdx);
    const parts = histRaw.split(/(?=\[EDIT HISTORY)/i).map((p: string) => p.trim()).filter(Boolean);
    const uniqueHistory: string[] = [];
    let hadDuplicates = false;

    for (const p of parts) {
      if (!uniqueHistory.includes(p)) {
        uniqueHistory.push(p);
      } else {
        hadDuplicates = true;
      }
    }

    if (!hadDuplicates) return notes;

    return baseNote
      ? `${baseNote}\n\n${uniqueHistory.join('\n\n')}`
      : uniqueHistory.join('\n\n');
  }

  public updatePartnerTransaction(
    input: {
      id: number;
      paymentDate: string;
      amountPaisa: number;
      partner?: 'technician' | 'investor';
      type?: string;
      method?: string;
      reference?: string;
      notes?: string;
      editReason?: string;
    },
    userId?: number
  ): boolean {
    const db = this.dbManager.getDatabase();
    const old = db.prepare('SELECT * FROM partner_transactions WHERE id = ?').get(input.id) as any;
    if (!old) return false;

    // Track what changed and format the before values
    const newAmount = Math.round(input.amountPaisa);
    const newDate = input.paymentDate.slice(0, 10);
    const newPartner = input.partner || old.partner;
    const newType = input.type || old.payment_type;
    const newMethod = input.method || old.payment_method;
    const newRef = input.reference !== undefined ? (input.reference?.trim() || null) : (old.reference || null);

    const changes: string[] = [];
    if (newAmount !== old.amount_paisa) {
      changes.push(`Amount changed from Rs. ${(old.amount_paisa / 100).toLocaleString('en-PK')} to Rs. ${(newAmount / 100).toLocaleString('en-PK')}`);
    }
    if (newDate !== old.payment_date) {
      changes.push(`Date changed from ${old.payment_date} to ${newDate}`);
    }
    if (newPartner !== old.partner) {
      changes.push(`Partner changed from ${old.partner} to ${newPartner}`);
    }
    if (newType !== old.payment_type) {
      changes.push(`Type changed from ${old.payment_type} to ${newType}`);
    }
    if (newMethod !== old.payment_method) {
      changes.push(`Method changed from ${old.payment_method} to ${newMethod}`);
    }
    if (newRef !== (old.reference || null)) {
      changes.push(`Reference changed from '${old.reference || 'none'}' to '${newRef || 'none'}'`);
    }

    // Determine editor name if available
    let editorName = 'User';
    if (userId) {
      const u = db.prepare('SELECT full_name FROM app_users WHERE id = ?').get(userId) as any;
      if (u?.full_name) editorName = u.full_name;
    }

    const editTimestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const reasonDetail = input.editReason?.trim() || 'No detail provided';
    const beforeSummary = `Amount: Rs. ${(old.amount_paisa / 100).toLocaleString('en-PK')}, Date: ${old.payment_date}, Partner: ${old.partner}, Type: ${old.payment_type}, Method: ${old.payment_method}${old.reference ? `, Ref: ${old.reference}` : ''}`;
    const whatChangedText = changes.length > 0 ? changes.join('; ') : 'Notes updated';

    const auditMessage = `[EDIT HISTORY ${editTimestamp} by ${editorName}]\n• Reason for change: "${reasonDetail}"\n• What changed: ${whatChangedText}\n• Before values: [${beforeSummary}]`;

    // Construct final notes message: preserve base notes and append edit message
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

    db.prepare(`
      UPDATE partner_transactions
      SET payment_date = ?, amount_paisa = ?, partner = COALESCE(?, partner),
          payment_type = COALESCE(?, payment_type), payment_method = COALESCE(?, payment_method),
          reference = ?, notes = ?
      WHERE id = ?
    `).run(
      newDate,
      newAmount,
      newPartner,
      newType,
      newMethod,
      newRef,
      finalNotes,
      input.id
    );

    if (old.partner === 'technician' || newPartner === 'technician') {
      try {
        db.prepare(`
          UPDATE owner_payouts
          SET amount_paisa = ?, payout_date = ?, notes = ?, updated_at = ?
          WHERE payout_date = ? AND amount_paisa = ?
        `).run(
          newAmount,
          newDate,
          finalNotes,
          new Date().toISOString(),
          old.payment_date,
          old.amount_paisa
        );
      } catch {}
    }

    return true;
  }

  public deletePartnerTransaction(id: number): boolean {
    const db = this.dbManager.getDatabase();
    const row = db.prepare('SELECT * FROM partner_transactions WHERE id = ?').get(id) as any;
    if (row && row.partner === 'technician') {
      try {
        db.prepare('DELETE FROM owner_payouts WHERE payout_date = ? AND amount_paisa = ?').run(row.payment_date, row.amount_paisa);
      } catch {}
    }
    const res = db.prepare('DELETE FROM partner_transactions WHERE id = ?').run(id);
    return res.changes > 0;
  }

  public clearTechnicianPayouts(): { deletedCount: number } {
    const db = this.dbManager.getDatabase();
    const res1 = db.prepare("DELETE FROM partner_transactions WHERE partner = 'technician'").run();
    const res2 = db.prepare("DELETE FROM owner_payouts").run();
    return { deletedCount: Number(res1.changes) + Number(res2.changes) };
  }

  public reversePartnershipTransaction(
    input: ReversePartnershipTransactionInput,
    userId?: number
  ): boolean {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();
    const res = db.prepare(`
      UPDATE partner_transactions
      SET status = 'reversed', reversal_reason = ?, reversed_at = ?, reversed_by_user_id = ?
      WHERE id = ? AND status = 'active'
    `).run(input.reason.trim(), now, userId || null, input.transactionId);
    return res.changes > 0;
  }

  public closePartnershipMonth(
    input: ClosePartnershipMonthInput & { reopen?: boolean },
    userId?: number
  ): any {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();
    const month = input.month.trim(); // YYYY-MM

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new DatabaseError('Invalid month format. Expected YYYY-MM.');
    }

    const currentMonth = now.slice(0, 7);
    if (month > currentMonth) {
      throw new DatabaseError('Cannot finalize or close a future month.');
    }

    const existing = db.prepare('SELECT month_key FROM monthly_settlements WHERE month_key = ?').get(month);
    if (existing && !input.reopen) {
      throw new DatabaseError(`Month ${month} is already finalized.`);
    }

    const startDate = `${month}-01`;
    const parts = month.split('-');
    const year = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const lastDay = new Date(year, m, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    const summary = this.getPartnershipDashboard({ startDate, endDate });

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO monthly_settlements (
        month_key, sales_paisa, collections_paisa, doctor_commissions_paisa, expenses_paisa,
        net_profit_paisa, technician_percentage, technician_share_paisa, investor_share_paisa,
        technician_paid_paisa, investor_paid_paisa, technician_remaining_paisa, investor_remaining_paisa,
        closed_by_user_id, closed_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      month,
      summary.period.totalSalesPaisa,
      summary.period.totalCollectedPaisa,
      summary.period.totalDoctorsCommissionPaisa,
      summary.period.totalAssetsPaisa,
      summary.period.netProfitPaisa,
      summary.period.technicianPct,
      summary.period.mySharePaisa,
      summary.period.investorSharePaisa,
      summary.period.totalReceivedPaisa,
      summary.period.investorPaidPaisa,
      summary.period.remainingBalancePaisa,
      summary.period.investorRemainingBalancePaisa,
      userId || null,
      now,
      input.notes?.trim() || null
    );

    return { month, closedAt: now };
  }

  public reversePartnershipExpense(
    input: { expenseId: number; reason: string },
    _userId?: number
  ): boolean {
    const db = this.dbManager.getDatabase();
    const res = db.prepare(`
      UPDATE partnership_expenses
      SET status = 'reversed', reversal_reason = ?
      WHERE id = ? AND status = 'active'
    `).run(input.reason.trim(), input.expenseId);
    return res.changes > 0;
  }

  public recordDoctorCommissionPayment(
    input: RecordDoctorCommissionPaymentInput,
    userId?: number
  ): any {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();
    const res = db.prepare(`
      INSERT INTO doctor_commission_payments (
        doctor_id, amount_paisa, payment_date, notes, recorded_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.doctorId,
      Math.round(input.amountPaisa),
      input.paymentDate.slice(0, 10),
      input.notes?.trim() || null,
      userId || null,
      now
    );
    return { id: Number(res.lastInsertRowid), ...input };
  }

  public recordInvestorCapital(
    input: RecordInvestorCapitalInput,
    userId?: number
  ): any {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();
    const res = db.prepare(`
      INSERT INTO investor_capital (
        amount_paisa, transaction_type, transaction_date, notes, recorded_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      Math.round(input.amountPaisa),
      input.type,
      input.transactionDate.slice(0, 10),
      input.notes?.trim() || null,
      userId || null,
      now
    );
    return { id: Number(res.lastInsertRowid), ...input };
  }

  /**
   * Generates comprehensive Partnership Accounting & Settlement Dashboard Data.
   */
  public getPartnershipDashboard(query: { startDate?: string; endDate?: string } = {}): PartnershipDashboardData {
    const db = this.dbManager.getDatabase();

    // Look up effective split for the requested period
    const periodSplit = this.getEffectiveSplit(query.endDate || query.startDate);
    const technicianPct = periodSplit.technicianPct;
    const investorPct = periodSplit.investorPct;

    const hasFilter = !!(query.startDate || query.endDate);

    // 1. Visit condition helpers
    const buildDateCond = (col: string, s?: string, e?: string) => {
      const conds: string[] = ['1=1'];
      const params: any[] = [];
      if (s) {
        conds.push(`substr(${col}, 1, 10) >= ?`);
        params.push(s.slice(0, 10));
      }
      if (e) {
        conds.push(`substr(${col}, 1, 10) <= ?`);
        params.push(e.slice(0, 10));
      }
      return { sql: conds.join(' AND '), params };
    };

    // --- Period Aggregates ---
    const vPeriod = buildDateCond('v.order_date', query.startDate, query.endDate);
    const invoicePeriodRow = db.prepare(`
      SELECT
        COALESCE(SUM(i.final_total), 0) as totalBilled,
        COALESCE(SUM(i.paid_amount), 0) as totalCollectedFromInvoices,
        COALESCE(SUM(i.balance_amount), 0) as unpaidBills
      FROM invoices i
      JOIN visits v ON i.visit_id = v.id
      WHERE v.status != 'cancelled' AND ${vPeriod.sql}
    `).get(...vPeriod.params) as { totalBilled: number; totalCollectedFromInvoices: number; unpaidBills: number };

    // Collections from lab_collections ledger in period
    const colPeriod = buildDateCond('collection_date', query.startDate, query.endDate);
    const labColPeriodRow = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'payment_received' THEN amount_paisa ELSE 0 END), 0) as ledgerCollections,
        COALESCE(SUM(CASE WHEN entry_type = 'payment_received' AND collected_by = 'investor' THEN amount_paisa ELSE 0 END), 0) as invCollections,
        COALESCE(SUM(CASE WHEN entry_type = 'payment_received' AND collected_by = 'technician' THEN amount_paisa ELSE 0 END), 0) as techCollections
      FROM lab_collections
      WHERE ${colPeriod.sql}
    `).get(...colPeriod.params) as { ledgerCollections: number; invCollections: number; techCollections: number };

    // Doctor Commissions in period
    const docPeriodRows = db.prepare(`
      SELECT
        d.id as doctorId,
        d.full_name as doctorName,
        COALESCE(d.commission_percentage, 0) as commissionPercentage,
        COUNT(DISTINCT v.id) as referredVisits,
        COALESCE(SUM(i.final_total), 0) as netSalesPaisa,
        COALESCE(SUM(ROUND(i.final_total * COALESCE(d.commission_percentage, 0) / 100.0)), 0) as commissionPaisa
      FROM doctors d
      JOIN visits v ON d.id = v.referring_doctor_id
      JOIN invoices i ON v.id = i.visit_id
      WHERE v.status != 'cancelled' AND d.commission_percentage > 0 AND ${vPeriod.sql}
      GROUP BY d.id, d.full_name, d.commission_percentage
      ORDER BY commissionPaisa DESC
    `).all(...vPeriod.params) as any[];

    // Calculate paid doctor commissions in period
    const docPaidPeriod = buildDateCond('payment_date', query.startDate, query.endDate);
    const doctorCommissions = docPeriodRows.map((r) => {
      const paidRow = db.prepare(`
        SELECT COALESCE(SUM(amount_paisa), 0) as paid
        FROM doctor_commission_payments
        WHERE doctor_id = ? AND ${docPaidPeriod.sql}
      `).get(r.doctorId, ...docPaidPeriod.params) as { paid: number };
      const paid = Number(paidRow?.paid || 0);
      const earned = Number(r.commissionPaisa || 0);
      return {
        doctorId: Number(r.doctorId),
        doctorName: String(r.doctorName),
        commissionPercentage: Number(r.commissionPercentage),
        referredVisits: Number(r.referredVisits),
        netSalesPaisa: Number(r.netSalesPaisa),
        commissionPaisa: earned,
        paidPaisa: paid,
        unpaidPaisa: Math.max(0, earned - paid),
      };
    });

    const totalDocCommissionPaisa = doctorCommissions.reduce((sum, d) => sum + d.commissionPaisa, 0);

    // Expenses in period: All active operating expenses reduce profit
    const assetPeriod = buildDateCond('purchase_date', query.startDate, query.endDate);
    const labAssetRow = db.prepare(`
      SELECT
        COALESCE(SUM(amount_paisa), 0) as totalAssets,
        COALESCE(SUM(CASE WHEN purchased_by = 'technician' THEN amount_paisa ELSE 0 END), 0) as techPurchased,
        COALESCE(SUM(CASE WHEN purchased_by = 'doctor' THEN amount_paisa ELSE 0 END), 0) as docPurchased
      FROM lab_assets
      WHERE ${assetPeriod.sql}
    `).get(...assetPeriod.params) as { totalAssets: number; techPurchased: number; docPurchased: number };

    const expPeriod = buildDateCond('expense_date', query.startDate, query.endDate);
    const partExpRow = db.prepare(`
      SELECT
        COALESCE(SUM(amount_paisa), 0) as totalExpenses,
        COALESCE(SUM(CASE WHEN paid_by = 'lab' THEN amount_paisa ELSE 0 END), 0) as labPaid,
        COALESCE(SUM(CASE WHEN paid_by = 'investor' THEN amount_paisa ELSE 0 END), 0) as invPaid,
        COALESCE(SUM(CASE WHEN paid_by = 'technician' THEN amount_paisa ELSE 0 END), 0) as techPaid
      FROM partnership_expenses
      WHERE status = 'active' AND ${expPeriod.sql}
    `).get(...expPeriod.params) as { totalExpenses: number; labPaid: number; invPaid: number; techPaid: number };

    const totalAssetsPaisa = Number(labAssetRow?.totalAssets || 0) + Number(partExpRow?.totalExpenses || 0);
    const techOutOfPocket = Number(partExpRow?.techPaid || 0) + Number(labAssetRow?.techPurchased || 0);
    const invOutOfPocket = Number(partExpRow?.invPaid || 0) + Number(labAssetRow?.docPurchased || 0);

    // Partner Payouts / Transactions in period (single source of truth)
    const txPeriod = buildDateCond('t.payment_date', query.startDate, query.endDate);
    const poPeriod = buildDateCond('p.payout_date', query.startDate, query.endDate);

    const txRow = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN t.partner = 'technician' AND t.status = 'active' THEN t.amount_paisa ELSE 0 END), 0) as techPaid,
        COALESCE(SUM(CASE WHEN t.partner = 'investor' AND t.status = 'active' THEN t.amount_paisa ELSE 0 END), 0) as invPaid
      FROM partner_transactions t
      WHERE ${txPeriod.sql}
    `).get(...txPeriod.params) as { techPaid: number; invPaid: number };

    // Also include any payouts recorded in owner_payouts that are not already in partner_transactions
    const poRow = db.prepare(`
      SELECT COALESCE(SUM(p.amount_paisa), 0) as legacyTechPaid
      FROM owner_payouts p
      WHERE ${poPeriod.sql}
        AND NOT EXISTS (
          SELECT 1 FROM partner_transactions t
          WHERE t.partner = 'technician' AND t.status = 'active'
            AND substr(t.payment_date, 1, 10) = substr(p.payout_date, 1, 10)
            AND t.amount_paisa = p.amount_paisa
        )
    `).get(...poPeriod.params) as { legacyTechPaid: number };

    const techPaidInPeriod = Number(txRow?.techPaid || 0) + Number(poRow?.legacyTechPaid || 0);
    const invPaidInPeriod = Number(txRow?.invPaid || 0);

    const totalSalesPaisa = Number(invoicePeriodRow?.totalBilled || 0);
    const totalCollectedPaisa = Number(invoicePeriodRow?.totalCollectedFromInvoices || 0) + Number(labColPeriodRow?.ledgerCollections || 0);
    const unpaidPatientBillsPaisa = Number(invoicePeriodRow?.unpaidBills || 0);

    const netProfitPaisa = totalSalesPaisa - totalDocCommissionPaisa - totalAssetsPaisa;

    // Guaranteed 100% split without 1-paisa rounding discrepancy
    const mySharePaisa = Math.round((netProfitPaisa * technicianPct) / 100);
    const investorSharePaisa = netProfitPaisa - mySharePaisa;

    // Remaining balances: Profit share + Out-of-pocket expenses - Total payments received
    const remainingBalancePaisa = mySharePaisa + techOutOfPocket - techPaidInPeriod;
    const investorRemainingBalancePaisa = investorSharePaisa + invOutOfPocket - invPaidInPeriod;

    // --- Lifetime Aggregates ---
    const currentSplit = this.getEffectiveSplit();
    const lfSalesRow = db.prepare(`
      SELECT
        COALESCE(SUM(i.final_total), 0) as totalBilled,
        COALESCE(SUM(i.paid_amount), 0) as totalCollected
      FROM invoices i
      JOIN visits v ON i.visit_id = v.id
      WHERE v.status != 'cancelled'
    `).get() as { totalBilled: number; totalCollected: number };

    const lfDocCommissionRow = db.prepare(`
      SELECT COALESCE(SUM(ROUND(i.final_total * COALESCE(d.commission_percentage, 0) / 100.0)), 0) as docCommission
      FROM doctors d
      JOIN visits v ON d.id = v.referring_doctor_id
      JOIN invoices i ON v.id = i.visit_id
      WHERE v.status != 'cancelled' AND d.commission_percentage > 0
    `).get() as { docCommission: number };

    const lfAssetsRow = db.prepare(`
      SELECT
        (SELECT COALESCE(SUM(amount_paisa), 0) FROM lab_assets) +
        (SELECT COALESCE(SUM(amount_paisa), 0) FROM partnership_expenses WHERE status = 'active') as totalAssets
    `).get() as { totalAssets: number };

    const lfOutOfPocketRow = db.prepare(`
      SELECT
        (SELECT COALESCE(SUM(CASE WHEN paid_by = 'technician' THEN amount_paisa ELSE 0 END), 0) FROM partnership_expenses WHERE status = 'active') +
        (SELECT COALESCE(SUM(CASE WHEN purchased_by = 'technician' THEN amount_paisa ELSE 0 END), 0) FROM lab_assets) as techOop,
        (SELECT COALESCE(SUM(CASE WHEN paid_by = 'investor' THEN amount_paisa ELSE 0 END), 0) FROM partnership_expenses WHERE status = 'active') +
        (SELECT COALESCE(SUM(CASE WHEN purchased_by = 'doctor' THEN amount_paisa ELSE 0 END), 0) FROM lab_assets) as invOop
    `).get() as { techOop: number; invOop: number };

    const lfTechPaidRow = db.prepare(`
      SELECT
        (SELECT COALESCE(SUM(amount_paisa), 0) FROM partner_transactions WHERE partner = 'technician' AND status = 'active') +
        (SELECT COALESCE(SUM(p.amount_paisa), 0) FROM owner_payouts p
         WHERE NOT EXISTS (
           SELECT 1 FROM partner_transactions t
           WHERE t.partner = 'technician' AND t.status = 'active'
             AND substr(t.payment_date, 1, 10) = substr(p.payout_date, 1, 10)
             AND t.amount_paisa = p.amount_paisa
         )
        ) as totalTechPaid
    `).get() as { totalTechPaid: number };

    const lfInvPaidRow = db.prepare(`
      SELECT COALESCE(SUM(amount_paisa), 0) as totalInvPaid
      FROM partner_transactions
      WHERE partner = 'investor' AND status = 'active'
    `).get() as { totalInvPaid: number };

    const lfSales = Number(lfSalesRow?.totalBilled || 0);
    const lfCollected = Number(lfSalesRow?.totalCollected || 0);
    const lfDocCommission = Number(lfDocCommissionRow?.docCommission || 0);
    const lfAssets = Number(lfAssetsRow?.totalAssets || 0);
    const lfTechOutOfPocket = Number(lfOutOfPocketRow?.techOop || 0);
    const lfInvOutOfPocket = Number(lfOutOfPocketRow?.invOop || 0);
    const lfTechPaid = Number(lfTechPaidRow?.totalTechPaid || 0);
    const lfInvPaid = Number(lfInvPaidRow?.totalInvPaid || 0);

    const lfNetProfit = lfSales - lfDocCommission - lfAssets;
    const lfMyShare = Math.round((lfNetProfit * currentSplit.technicianPct) / 100);
    const lfInvShare = lfNetProfit - lfMyShare;

    // Cumulative Lifetime Outstanding Balances
    const lfRemaining = (lfMyShare + lfTechOutOfPocket) - lfTechPaid;
    const lfInvRemaining = (lfInvShare + lfInvOutOfPocket) - lfInvPaid;

    // Collections tracking summary
    const collectionSummary = {
      billedPaisa: totalSalesPaisa,
      collectedPaisa: totalCollectedPaisa,
      outstandingPaisa: unpaidPatientBillsPaisa,
      collectionDifferencePaisa: totalCollectedPaisa - totalSalesPaisa,
      investorCollectedPaisa: Number(labColPeriodRow?.invCollections || 0),
      technicianCollectedPaisa: Number(labColPeriodRow?.techCollections || 0),
      transferToTechnicianPaisa: techPaidInPeriod,
    };

    // Transactions list in period (filtered strictly by selected date filter)
    const txRows = db.prepare(`
      SELECT
        t.id,
        t.payment_date as date,
        t.amount_paisa as amountPaisa,
        t.partner,
        t.payment_type as type,
        t.payment_method as method,
        t.reference,
        t.notes,
        t.status,
        t.reversal_reason as reversalReason,
        t.reversed_at as reversedAt,
        u.full_name as recordedByName,
        t.created_at as createdAt
      FROM partner_transactions t
      LEFT JOIN app_users u ON t.recorded_by_user_id = u.id
      WHERE ${txPeriod.sql}
      ORDER BY t.payment_date DESC, t.id DESC
      LIMIT 100
    `).all(...txPeriod.params) as any[];

    for (const row of txRows) {
      if (row.notes) {
        const sanitized = this.deduplicateTransactionNotes(row.notes);
        if (sanitized !== row.notes) {
          row.notes = sanitized;
          try {
            db.prepare('UPDATE partner_transactions SET notes = ? WHERE id = ?').run(sanitized, row.id);
          } catch {
            // ignore
          }
        }
      }
    }

    // Expenses list in period (filtered strictly by selected date filter)
    const expRows = db.prepare(`
      SELECT
        e.id,
        e.expense_date as expenseDate,
        e.category,
        e.description,
        e.amount_paisa as amountPaisa,
        e.paid_by as paidBy,
        e.receipt_no as receiptNo,
        e.status,
        e.reversal_reason as reversalReason,
        u.full_name as recordedByName
      FROM partnership_expenses e
      LEFT JOIN app_users u ON e.recorded_by_user_id = u.id
      WHERE ${expPeriod.sql}
      ORDER BY e.expense_date DESC, e.id DESC
      LIMIT 100
    `).all(...expPeriod.params) as any[];

    // Assets list in period (filtered strictly by selected date filter)
    const assetRows = db.prepare(`
      SELECT
        a.id,
        a.title,
        a.category,
        a.amount_paisa as amountPaisa,
        a.purchase_date as purchaseDate,
        a.purchased_by as purchasedBy,
        a.purchaser_name as purchaserName,
        a.invoice_receipt_no as invoiceReceiptNo,
        a.vendor_name as vendorName,
        a.notes,
        u.full_name as recordedByName,
        a.created_at as createdAt
      FROM lab_assets a
      LEFT JOIN app_users u ON a.recorded_by_user_id = u.id
      WHERE ${assetPeriod.sql}
      ORDER BY a.purchase_date DESC, a.id DESC
      LIMIT 100
    `).all(...assetPeriod.params) as any[];

    // Closed months list
    const monthRows = db.prepare(`
      SELECT
        m.id,
        m.month_key as month,
        m.closed_at as closedAt,
        m.net_profit_paisa as netProfitPaisa,
        m.technician_share_paisa as technicianSharePaisa,
        m.investor_share_paisa as investorSharePaisa,
        u.full_name as closedByName
      FROM monthly_settlements m
      LEFT JOIN app_users u ON m.closed_by_user_id = u.id
      ORDER BY m.month_key DESC
    `).all() as any[];

    // Investor Capital
    const capitalRow = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'capital_contribution' THEN amount_paisa ELSE 0 END), 0) as contribution,
        COALESCE(SUM(CASE WHEN transaction_type = 'capital_return' THEN amount_paisa ELSE 0 END), 0) as returned
      FROM investor_capital
    `).get() as { contribution: number; returned: number };

    const invCap = Number(capitalRow?.contribution || 0);
    const capReturned = Number(capitalRow?.returned || 0);
    const capRemaining = invCap - capReturned;

    // Legacy payouts list
    const payouts = this.listPayouts(hasFilter ? { startDate: query.startDate, endDate: query.endDate } : {});

    return {
      period: {
        startDate: query.startDate || null,
        endDate: query.endDate || null,
        totalSalesPaisa,
        totalCollectedPaisa,
        unpaidPatientBillsPaisa,
        totalDoctorsCommissionPaisa: totalDocCommissionPaisa,
        totalAssetsPaisa,
        netProfitPaisa,
        technicianPct,
        investorPct,
        mySharePaisa,
        investorSharePaisa,
        techOutOfPocketPaisa: techOutOfPocket,
        investorOutOfPocketPaisa: invOutOfPocket,
        totalReceivedPaisa: techPaidInPeriod,
        investorPaidPaisa: invPaidInPeriod,
        remainingBalancePaisa,
        investorRemainingBalancePaisa,
      },
      lifetime: {
        totalSalesPaisa: lfSales,
        totalCollectedPaisa: lfCollected,
        totalDoctorsCommissionPaisa: lfDocCommission,
        totalAssetsPaisa: lfAssets,
        netProfitPaisa: lfNetProfit,
        mySharePaisa: lfMyShare,
        investorSharePaisa: lfInvShare,
        techOutOfPocketPaisa: lfTechOutOfPocket,
        investorOutOfPocketPaisa: lfInvOutOfPocket,
        totalReceivedPaisa: lfTechPaid,
        remainingBalancePaisa: lfRemaining,
        investorRemainingBalancePaisa: lfInvRemaining,
      },
      collection: collectionSummary,
      doctorCommissions,
      transactions: txRows,
      expenses: expRows,
      assets: assetRows,
      closedMonths: monthRows,
      capital: {
        investorCapitalPaisa: invCap,
        capitalReturnedPaisa: capReturned,
        capitalRemainingPaisa: capRemaining,
      },
      payouts,
    };
  }
}
