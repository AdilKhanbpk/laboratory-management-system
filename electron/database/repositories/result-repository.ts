import crypto from 'crypto';
import { DatabaseManager, DatabaseError } from '../connection';
import {
  TestResult,
  ReportSnapshot,
  ResultAmendment,
  WorklistOrderItem,
  FullDiagnosticReport,
  SaveDraftResultsInput,
  FinalizeReportInput,
  AmendResultInput,
  Visit,
  Patient,
  Doctor,
  OrderItem,
} from '../../types/ipc';
import { RangeMatcher, ParameterRangeRule } from '../../services/range-matcher';
import { AuditRepository } from './audit-repository';
import { HospitalRepository } from './hospital-repository';

export class ResultRepository {
  private dbManager: DatabaseManager;
  private auditRepo: AuditRepository;
  private hospitalRepo: HospitalRepository;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
    this.auditRepo = new AuditRepository(dbManager);
    this.hospitalRepo = new HospitalRepository(dbManager);
  }

  /**
   * Generates a unique, collision-proof Report Number.
   * Format: REP-YYYY-XXXXX (e.g. REP-2026-00001)
   */
  public generateNextReportNumber(): string {
    const db = this.dbManager.getDatabase();
    const currentYear = new Date().getFullYear();
    const prefix = `REP-${currentYear}-`;

    const row = db
      .prepare(`SELECT report_number FROM report_snapshots WHERE report_number LIKE ? ORDER BY id DESC LIMIT 1`)
      .get(`${prefix}%`) as { report_number: string } | undefined;

    let nextSeq = 1;
    if (row && row.report_number) {
      const parts = row.report_number.split('-');
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
   * Accession Worklist: Search and list pending/in-progress laboratory orders.
   */
  public getWorklist(params: {
    query?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): WorklistOrderItem[] {
    const db = this.dbManager.getDatabase();
    const conditions: string[] = [];
    const sqlParams: any[] = [];

    if (params.query && params.query.trim()) {
      const q = `%${params.query.trim()}%`;
      conditions.push(`v.id IN (
        SELECT DISTINCT v_sub.id
        FROM visits v_sub
        JOIN patients p_sub ON v_sub.patient_id = p_sub.id
        JOIN order_items oi_sub ON oi_sub.visit_id = v_sub.id
        WHERE v_sub.visit_number LIKE ? OR p_sub.full_name LIKE ? OR p_sub.patient_mrn LIKE ? OR oi_sub.test_code_snapshot LIKE ?
      )`);
      sqlParams.push(q, q, q, q);
    }

    if (params.status && params.status !== 'all') {
      if (params.status === 'pending') {
        conditions.push(`v.id IN (
          SELECT DISTINCT v_sub.id
          FROM visits v_sub
          JOIN order_items oi_sub ON oi_sub.visit_id = v_sub.id
          LEFT JOIN (
            SELECT order_item_id, COUNT(*) as entered_count
            FROM test_results GROUP BY order_item_id
          ) res_summary_sub ON oi_sub.id = res_summary_sub.order_item_id
          WHERE (oi_sub.status IN ('pending', 'ordered') AND (res_summary_sub.entered_count IS NULL OR res_summary_sub.entered_count = 0))
        )`);
      } else if (params.status === 'draft') {
        conditions.push(`v.id IN (
          SELECT DISTINCT v_sub.id
          FROM visits v_sub
          JOIN order_items oi_sub ON oi_sub.visit_id = v_sub.id
          LEFT JOIN (
            SELECT order_item_id, MIN(status) as min_status
            FROM test_results GROUP BY order_item_id
          ) res_summary_sub ON oi_sub.id = res_summary_sub.order_item_id
          WHERE (res_summary_sub.min_status = 'draft' AND oi_sub.status != 'completed')
        )`);
      } else if (params.status === 'reviewed') {
        conditions.push(`v.id IN (
          SELECT DISTINCT v_sub.id
          FROM visits v_sub
          JOIN order_items oi_sub ON oi_sub.visit_id = v_sub.id
          LEFT JOIN (
            SELECT order_item_id, MIN(status) as min_status
            FROM test_results GROUP BY order_item_id
          ) res_summary_sub ON oi_sub.id = res_summary_sub.order_item_id
          WHERE (res_summary_sub.min_status = 'reviewed' AND oi_sub.status != 'completed')
        )`);
      } else if (params.status === 'completed' || params.status === 'finalized') {
        conditions.push(`v.id IN (
          SELECT DISTINCT v_sub.id
          FROM visits v_sub
          JOIN order_items oi_sub ON oi_sub.visit_id = v_sub.id
          LEFT JOIN (
            SELECT order_item_id, MIN(status) as min_status
            FROM test_results GROUP BY order_item_id
          ) res_summary_sub ON oi_sub.id = res_summary_sub.order_item_id
          WHERE (oi_sub.status = 'completed' OR res_summary_sub.min_status = 'finalized')
        )`);
      } else {
        conditions.push(`oi.status = ?`);
        sqlParams.push(params.status);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        oi.id as orderItemId,
        v.id as visitId,
        v.visit_number as visitNumber,
        p.id as patientId,
        p.full_name as patientName,
        p.patient_mrn as patientMrn,
        p.gender as patientGender,
        p.date_of_birth as patientDob,
        d.full_name as doctorName,
        oi.test_id as testId,
        oi.test_code_snapshot as testCode,
        oi.test_name_snapshot as testName,
        v.order_date as orderDate,
        oi.status as orderItemStatus,
        COALESCE(res_summary.min_status, 'pending') as resultStatus,
        COALESCE(param_counts.total_params, 0) as parametersTotal,
        COALESCE(res_summary.entered_count, 0) as parametersEntered
      FROM order_items oi
      JOIN visits v ON oi.visit_id = v.id
      JOIN patients p ON v.patient_id = p.id
      LEFT JOIN doctors d ON v.referring_doctor_id = d.id
      LEFT JOIN (
        SELECT test_id, COUNT(*) as total_params
        FROM test_parameters
        WHERE is_active = 1
        GROUP BY test_id
      ) param_counts ON oi.test_id = param_counts.test_id
      LEFT JOIN (
        SELECT
          order_item_id,
          COUNT(*) as entered_count,
          MIN(status) as min_status
        FROM test_results
        GROUP BY order_item_id
      ) res_summary ON oi.id = res_summary.order_item_id
      ${whereClause}
      ORDER BY v.id DESC, oi.id ASC
      LIMIT 500
    `;

    const rows = db.prepare(sql).all(...sqlParams) as any[];

    return rows.map((r) => ({
      orderItemId: r.orderItemId,
      visitId: r.visitId,
      visitNumber: r.visitNumber,
      patientId: r.patientId,
      patientName: r.patientName,
      patientMrn: r.patientMrn,
      patientGender: r.patientGender,
      patientDob: r.patientDob,
      doctorName: r.doctorName,
      testId: r.testId,
      testCode: r.testCode,
      testName: r.testName,
      orderDate: r.orderDate,
      orderItemStatus: r.orderItemStatus,
      resultStatus: r.resultStatus,
      parametersTotal: Number(r.parametersTotal),
      parametersEntered: Number(r.parametersEntered),
    }));
  }

  /**
   * Retrieves an order item along with its test parameters, current results, and reference ranges.
   */
  public getOrderResults(orderItemId: number): {
    orderItem: OrderItem;
    patient: Patient;
    parameters: Array<{
      parameter: { id: number; name: string; unit: string | null; type: 'numeric' | 'text' | 'options'; displayOrder: number };
      currentResult: TestResult | null;
      ranges: ParameterRangeRule[];
    }>;
  } {
    const db = this.dbManager.getDatabase();

    const orderItem = db
      .prepare(`SELECT * FROM order_items WHERE id = ?`)
      .get(orderItemId) as OrderItem | undefined;

    if (!orderItem) {
      throw new DatabaseError(`Order item with ID ${orderItemId} does not exist.`);
    }

    const visit = db
      .prepare(`SELECT * FROM visits WHERE id = ?`)
      .get(orderItem.visit_id) as Visit;

    const patient = db
      .prepare(`SELECT * FROM patients WHERE id = ?`)
      .get(visit.patient_id) as Patient;

    // Fetch parameters for this test
    const params = db
      .prepare(`
        SELECT id, parameter_name, unit, parameter_type, display_order
        FROM test_parameters
        WHERE test_id = ? AND is_active = 1
        ORDER BY display_order ASC, id ASC
      `)
      .all(orderItem.test_id) as Array<{
      id: number;
      parameter_name: string;
      unit: string | null;
      parameter_type: 'numeric' | 'text' | 'options';
      display_order: number;
    }>;

    // Fetch existing results for this order item
    const results = db
      .prepare(`
        SELECT tr.*, u.full_name as entered_by_name
        FROM test_results tr
        JOIN app_users u ON tr.entered_by = u.id
        WHERE tr.order_item_id = ?
      `)
      .all(orderItemId) as TestResult[];

    const resultMap = new Map(results.map((r) => [r.parameter_id, r]));

    // Fetch reference ranges for all parameters of this test
    const parameterIds = params.map((p) => p.id);
    let ranges: ParameterRangeRule[] = [];
    if (parameterIds.length > 0) {
      const placeholders = parameterIds.map(() => '?').join(',');
      ranges = db
        .prepare(`SELECT * FROM parameter_reference_ranges WHERE parameter_id IN (${placeholders})`)
        .all(...parameterIds) as ParameterRangeRule[];
    }

    const rangeMap = new Map<number, ParameterRangeRule[]>();
    for (const r of ranges) {
      if (!rangeMap.has(r.parameter_id)) {
        rangeMap.set(r.parameter_id, []);
      }
      rangeMap.get(r.parameter_id)!.push(r);
    }

    const parameterDetails = params.map((p) => ({
      parameter: {
        id: p.id,
        name: p.parameter_name,
        unit: p.unit,
        type: p.parameter_type,
        displayOrder: p.display_order,
      },
      currentResult: resultMap.get(p.id) || null,
      ranges: rangeMap.get(p.id) || [],
    }));

    return {
      orderItem,
      patient,
      parameters: parameterDetails,
    };
  }

  /**
   * Saves draft results for an order item.
   */
  public saveDraftResults(input: SaveDraftResultsInput, operatorId: number): TestResult[] {
    const db = this.dbManager.getDatabase();

    const transaction = db.transaction(() => {
      const orderItem = db
        .prepare(`SELECT * FROM order_items WHERE id = ?`)
        .get(input.orderItemId) as OrderItem | undefined;

      if (!orderItem) {
        throw new DatabaseError(`Order item with ID ${input.orderItemId} does not exist.`);
      }

      if (orderItem.status === 'completed') {
        throw new DatabaseError('This order has already been finalized. Modifications require a formal clinical amendment.');
      }

      const visit = db
        .prepare(`SELECT * FROM visits WHERE id = ?`)
        .get(orderItem.visit_id) as Visit;

      const patient = db
        .prepare(`SELECT * FROM patients WHERE id = ?`)
        .get(visit.patient_id) as Patient;

      const now = new Date().toISOString();

      const upsertResultStmt = db.prepare(`
        INSERT INTO test_results (
          order_item_id, parameter_id, numeric_value, result_value,
          unit_snapshot, reference_range_display, flag, status,
          result_notes, entered_by, entered_at, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, 1, ?, ?)
        ON CONFLICT(order_item_id, parameter_id) DO UPDATE SET
          numeric_value = excluded.numeric_value,
          result_value = excluded.result_value,
          unit_snapshot = excluded.unit_snapshot,
          reference_range_display = excluded.reference_range_display,
          flag = excluded.flag,
          status = CASE WHEN test_results.status = 'finalized' THEN 'finalized' ELSE 'draft' END,
          result_notes = excluded.result_notes,
          updated_at = excluded.updated_at
      `);

      for (const res of input.results) {
        // Fetch parameter metadata
        const param = db
          .prepare(`SELECT parameter_name, unit, parameter_type FROM test_parameters WHERE id = ?`)
          .get(res.parameterId) as { parameter_name: string; unit: string | null; parameter_type: 'numeric' | 'text' | 'options' } | undefined;

        if (!param) {
          throw new DatabaseError(`Test parameter with ID ${res.parameterId} was not found.`);
        }

        // Fetch reference ranges
        const ranges = db
          .prepare(`SELECT * FROM parameter_reference_ranges WHERE parameter_id = ?`)
          .all(res.parameterId) as ParameterRangeRule[];

        // Clinical range evaluation
        const evalRes = RangeMatcher.evaluateResult(
          res.resultValue,
          param.parameter_type,
          param.unit,
          ranges,
          {
            gender: patient.gender,
            dateOfBirth: patient.date_of_birth,
            orderDate: visit.order_date,
          }
        );

        if (!evalRes.isValid) {
          throw new DatabaseError(`Invalid result for "${param.parameter_name}": ${evalRes.validationError}`);
        }

        upsertResultStmt.run(
          input.orderItemId,
          res.parameterId,
          evalRes.numericValue,
          evalRes.formattedDisplayValue,
          evalRes.unit,
          evalRes.referenceRangeDisplay,
          evalRes.flag,
          res.resultNotes ? res.resultNotes.trim() : null,
          operatorId,
          now,
          now,
          now
        );
      }

      // Transition order item and visit to 'in_progress'
      db.prepare(`UPDATE order_items SET status = 'in_progress' WHERE id = ? AND status = 'ordered'`).run(input.orderItemId);
      db.prepare(`UPDATE visits SET status = 'in_progress' WHERE id = ? AND status = 'registered'`).run(orderItem.visit_id);

      this.auditRepo.logAction({
        userId: operatorId,
        action: 'DRAFT_RESULTS_SAVED',
        entityType: 'order_items',
        entityId: String(input.orderItemId),
        details: {
          orderItemId: input.orderItemId,
          parameterCount: input.results.length,
        },
      });
    });

    transaction();

    return db
      .prepare(`SELECT * FROM test_results WHERE order_item_id = ?`)
      .all(input.orderItemId) as TestResult[];
  }

  /**
   * Finalizes the diagnostic report for a visit: freezes results, validates completeness,
   * generates an immutable report snapshot with SHA-256 integrity hash.
   */
  public finalizeReport(input: FinalizeReportInput, operatorId: number): ReportSnapshot {
    const db = this.dbManager.getDatabase();

    const transaction = db.transaction(() => {
      const visit = db
        .prepare(`SELECT * FROM visits WHERE id = ?`)
        .get(input.visitId) as Visit | undefined;

      if (!visit) {
        throw new DatabaseError(`Visit with ID ${input.visitId} does not exist.`);
      }

      // Check if already finalized snapshot exists
      const existingSnapshot = db
        .prepare(`SELECT * FROM report_snapshots WHERE visit_id = ? ORDER BY version DESC LIMIT 1`)
        .get(input.visitId) as ReportSnapshot | undefined;

      if (existingSnapshot && existingSnapshot.status === 'finalized') {
        throw new DatabaseError('This laboratory report has already been finalized.');
      }

      // Check that all order items have complete results
      const orderItems = db
        .prepare(`SELECT * FROM order_items WHERE visit_id = ?`)
        .all(input.visitId) as OrderItem[];

      if (orderItems.length === 0) {
        throw new DatabaseError('This visit has no laboratory test orders.');
      }

      for (const item of orderItems) {
        const requiredParams = db
          .prepare(`SELECT id, parameter_name FROM test_parameters WHERE test_id = ? AND is_active = 1`)
          .all(item.test_id) as Array<{ id: number; parameter_name: string }>;

        const enteredResults = db
          .prepare(`SELECT parameter_id FROM test_results WHERE order_item_id = ?`)
          .all(item.id) as Array<{ parameter_id: number }>;

        const enteredSet = new Set(enteredResults.map((r) => r.parameter_id));

        for (const rp of requiredParams) {
          if (!enteredSet.has(rp.id)) {
            throw new DatabaseError(`Cannot finalize report: Result for required parameter "${rp.parameter_name}" in test "${item.test_name_snapshot}" has not been entered.`);
          }
        }
      }

      const now = new Date().toISOString();

      // Build complete report document structure for snapshot
      const reportData = this.getFullDiagnosticReport(input.visitId);

      // Serialize and hash
      const snapshotJson = JSON.stringify(reportData);
      const integrityHash = crypto.createHash('sha256').update(snapshotJson).digest('hex');
      const reportNumber = this.generateNextReportNumber();

      const insertSnapshotStmt = db.prepare(`
        INSERT INTO report_snapshots (
          visit_id, version, report_number, status,
          snapshot_json, integrity_hash, finalized_by, finalized_at, created_at
        ) VALUES (?, 1, ?, 'finalized', ?, ?, ?, ?, ?)
      `);

      const result = insertSnapshotStmt.run(
        input.visitId,
        reportNumber,
        snapshotJson,
        integrityHash,
        operatorId,
        now,
        now
      );

      const snapshotId = Number(result.lastInsertRowid);

      // Lock all test results to 'finalized'
      for (const item of orderItems) {
        db.prepare(`
          UPDATE test_results
          SET status = 'finalized', finalized_by = ?, finalized_at = ?, updated_at = ?
          WHERE order_item_id = ?
        `).run(operatorId, now, now, item.id);

        db.prepare(`UPDATE order_items SET status = 'completed' WHERE id = ?`).run(item.id);
      }

      // Mark visit as completed
      db.prepare(`UPDATE visits SET status = 'completed', updated_at = ? WHERE id = ?`).run(now, input.visitId);

      // Audit Log
      this.auditRepo.logAction({
        userId: operatorId,
        action: 'REPORT_FINALIZED',
        entityType: 'report_snapshots',
        entityId: String(snapshotId),
        details: {
          visitId: input.visitId,
          reportNumber,
          integrityHash,
          orderItemCount: orderItems.length,
        },
      });

      return snapshotId;
    });

    const snapshotId = transaction();
    return db
      .prepare(`
        SELECT rs.*, u.full_name as finalized_by_name
        FROM report_snapshots rs
        JOIN app_users u ON rs.finalized_by = u.id
        WHERE rs.id = ?
      `)
      .get(snapshotId) as ReportSnapshot;
  }

  /**
   * Formal Clinical Amendment: Updates a finalized result value with mandatory justification.
   */
  public amendResult(input: AmendResultInput, operatorId: number): TestResult {
    const db = this.dbManager.getDatabase();

    const transaction = db.transaction(() => {
      const existing = db
        .prepare(`SELECT * FROM test_results WHERE id = ?`)
        .get(input.resultId) as TestResult | undefined;

      if (!existing) {
        throw new DatabaseError(`Result with ID ${input.resultId} does not exist.`);
      }

      if (existing.status !== 'finalized' && existing.status !== 'corrected') {
        throw new DatabaseError('Only finalized results require formal clinical amendments. Draft results can be edited directly.');
      }

      if (!input.amendmentReason || input.amendmentReason.trim().length < 10) {
        throw new DatabaseError('A documented clinical amendment explanation of at least 10 characters is required.');
      }

      // Fetch order item, visit, patient, parameter
      const orderItem = db
        .prepare(`SELECT * FROM order_items WHERE id = ?`)
        .get(existing.order_item_id) as OrderItem;

      const visit = db
        .prepare(`SELECT * FROM visits WHERE id = ?`)
        .get(orderItem.visit_id) as Visit;

      const patient = db
        .prepare(`SELECT * FROM patients WHERE id = ?`)
        .get(visit.patient_id) as Patient;

      const param = db
        .prepare(`SELECT parameter_name, unit, parameter_type FROM test_parameters WHERE id = ?`)
        .get(existing.parameter_id) as { parameter_name: string; unit: string | null; parameter_type: 'numeric' | 'text' | 'options' };

      const ranges = db
        .prepare(`SELECT * FROM parameter_reference_ranges WHERE parameter_id = ?`)
        .all(existing.parameter_id) as ParameterRangeRule[];

      // Evaluate new value
      const evalRes = RangeMatcher.evaluateResult(
        input.newValue,
        param.parameter_type,
        param.unit,
        ranges,
        {
          gender: patient.gender,
          dateOfBirth: patient.date_of_birth,
          orderDate: visit.order_date,
        }
      );

      if (!evalRes.isValid) {
        throw new DatabaseError(`Invalid amendment value: ${evalRes.validationError}`);
      }

      const now = new Date().toISOString();

      // Record in result_amendments table
      db.prepare(`
        INSERT INTO result_amendments (
          result_id, previous_value, new_value, previous_flag,
          new_flag, amendment_reason, amended_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        existing.id,
        existing.result_value,
        evalRes.formattedDisplayValue,
        existing.flag,
        evalRes.flag,
        input.amendmentReason.trim(),
        operatorId,
        now
      );

      // Update test_results
      const newVersion = existing.version + 1;
      db.prepare(`
        UPDATE test_results
        SET numeric_value = ?, result_value = ?, flag = ?, status = 'corrected',
            version = ?, updated_at = ?
        WHERE id = ?
      `).run(
        evalRes.numericValue,
        evalRes.formattedDisplayValue,
        evalRes.flag,
        newVersion,
        now,
        existing.id
      );

      // Generate a new amended Report Snapshot for historical accuracy
      const currentSnapshot = db
        .prepare(`SELECT * FROM report_snapshots WHERE visit_id = ? ORDER BY version DESC LIMIT 1`)
        .get(visit.id) as ReportSnapshot | undefined;

      const nextSnapshotVersion = currentSnapshot ? currentSnapshot.version + 1 : 2;
      const updatedReportData = this.getFullDiagnosticReport(visit.id);
      const snapshotJson = JSON.stringify(updatedReportData);
      const integrityHash = crypto.createHash('sha256').update(snapshotJson).digest('hex');

      const amendedReportNumber = currentSnapshot
        ? currentSnapshot.report_number.includes('-REV')
          ? currentSnapshot.report_number.replace(/-REV\d+$/, `-REV${nextSnapshotVersion}`)
          : `${currentSnapshot.report_number}-REV${nextSnapshotVersion}`
        : this.generateNextReportNumber();

      db.prepare(`
        INSERT INTO report_snapshots (
          visit_id, version, report_number, status,
          snapshot_json, integrity_hash, finalized_by, finalized_at, created_at
        ) VALUES (?, ?, ?, 'amended', ?, ?, ?, ?, ?)
      `).run(
        visit.id,
        nextSnapshotVersion,
        amendedReportNumber,
        snapshotJson,
        integrityHash,
        operatorId,
        now,
        now
      );

      // Audit Log
      this.auditRepo.logAction({
        userId: operatorId,
        action: 'RESULT_AMENDED',
        entityType: 'test_results',
        entityId: String(existing.id),
        details: {
          resultId: existing.id,
          parameterName: param.parameter_name,
          previousValue: existing.result_value,
          newValue: evalRes.formattedDisplayValue,
          amendmentReason: input.amendmentReason.trim(),
          newVersion,
        },
      });
    });

    transaction();

    return db.prepare(`SELECT * FROM test_results WHERE id = ?`).get(input.resultId) as TestResult;
  }

  /**
   * Constructs the full diagnostic laboratory report data structure for viewing, printing, and PDF export.
   */
  public getFullDiagnosticReport(visitId: number): FullDiagnosticReport {
    const db = this.dbManager.getDatabase();

    const visit = db
      .prepare(`
        SELECT v.*, u.full_name as operator_name
        FROM visits v
        JOIN app_users u ON v.operator_id = u.id
        WHERE v.id = ?
      `)
      .get(visitId) as Visit | undefined;

    if (!visit) {
      throw new DatabaseError(`Visit with ID ${visitId} does not exist.`);
    }

    const patient = db.prepare(`SELECT * FROM patients WHERE id = ?`).get(visit.patient_id) as Patient;

    let doctor: Doctor | null = null;
    if (visit.referring_doctor_id) {
      doctor = (db.prepare(`SELECT * FROM doctors WHERE id = ?`).get(visit.referring_doctor_id) as Doctor) || null;
    }

    const hospital = this.hospitalRepo.getSettings() || {
      id: 1,
      hospital_name: 'Medical Diagnostic Laboratory',
      tagline: 'Reliable Pathology Services',
      address: 'Medical Complex, Main Boulevard',
      phone_primary: '+92-300-1122334',
      phone_secondary: null,
      email: 'lab@diagnostics.pk',
      logo_relative_path: null,
      currency_code: 'PKR',
      timezone: 'Asia/Karachi',
      inactivity_timeout_minutes: 15,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const orderItems = db
      .prepare(`SELECT * FROM order_items WHERE visit_id = ? ORDER BY id ASC`)
      .all(visitId) as OrderItem[];

    const tests = orderItems.map((item) => {
      const params = db
        .prepare(`
          SELECT id, parameter_name, unit, parameter_type, display_order
          FROM test_parameters
          WHERE test_id = ?
          ORDER BY display_order ASC, id ASC
        `)
        .all(item.test_id) as Array<{
        id: number;
        parameter_name: string;
        unit: string | null;
        parameter_type: 'numeric' | 'text' | 'options';
        display_order: number;
      }>;

      const results = db
        .prepare(`SELECT * FROM test_results WHERE order_item_id = ?`)
        .all(item.id) as TestResult[];

      const resultMap = new Map(results.map((r) => [r.parameter_id, r]));

      const parameterResults = params.map((p) => {
        const res = resultMap.get(p.id) || null;
        let refDisplay = res?.reference_range_display;
        if (!refDisplay) {
          const ranges = db
            .prepare(`SELECT * FROM parameter_reference_ranges WHERE parameter_id = ?`)
            .all(p.id) as ParameterRangeRule[];
          const matched = RangeMatcher.findMatchingRange(ranges, {
            gender: patient.gender,
            dateOfBirth: patient.date_of_birth,
            orderDate: visit.order_date,
          });
          refDisplay = matched?.display_text || (ranges.length > 0 ? ranges[0].display_text : 'Reference range not configured');
        }
        return {
          parameter: {
            id: p.id,
            name: p.parameter_name,
            unit: p.unit,
            type: p.parameter_type,
            displayOrder: p.display_order,
          },
          result: res,
          flag: res?.flag || 'unconfigured',
          referenceRangeDisplay: refDisplay,
        };
      });

      return {
        orderItem: item,
        results: parameterResults,
      };
    });

    const snapshot = (db
      .prepare(`SELECT * FROM report_snapshots WHERE visit_id = ? ORDER BY version DESC LIMIT 1`)
      .get(visitId) as ReportSnapshot) || null;

    // Get any amendments for this visit
    const amendments = db
      .prepare(`
        SELECT ra.*, u.full_name as amended_by_name, tp.parameter_name
        FROM result_amendments ra
        JOIN test_results tr ON ra.result_id = tr.id
        JOIN order_items oi ON tr.order_item_id = oi.id
        JOIN test_parameters tp ON tr.parameter_id = tp.id
        JOIN app_users u ON ra.amended_by = u.id
        WHERE oi.visit_id = ?
        ORDER BY ra.id ASC
      `)
      .all(visitId) as ResultAmendment[];

    return {
      visit,
      patient,
      doctor,
      hospital,
      tests,
      snapshot,
      amendments,
    };
  }
}
