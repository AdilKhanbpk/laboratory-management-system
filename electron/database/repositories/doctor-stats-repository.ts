import { DatabaseManager } from '../connection';
import { DoctorReferralStats, DoctorStatsQuery } from '../../types/ipc';

export class DoctorStatsRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Calculates comprehensive referral statistics for doctors over an optional date window.
   */
  public getDoctorReferralStats(query: DoctorStatsQuery = {}): DoctorReferralStats[] {
    const db = this.dbManager.getDatabase();

    const conditions: string[] = ['d.is_active >= 0']; // include all doctors with activity
    const params: any[] = [];

    if (query.doctorId && query.doctorId > 0) {
      conditions.push('d.id = ?');
      params.push(query.doctorId);
    }

    let visitDateCondition = '';
    const visitParams: any[] = [];
    if (query.startDate) {
      visitDateCondition += ' AND v.order_date >= ?';
      visitParams.push(query.startDate);
    }
    if (query.endDate) {
      visitDateCondition += ' AND v.order_date <= ?';
      visitParams.push(query.endDate);
    }

    const sql = `
      SELECT
        d.id as doctorId,
        d.full_name as doctorName,
        d.specialization,
        COUNT(DISTINCT v.id) as totalVisits,
        COUNT(DISTINCT v.patient_id) as uniquePatients,
        COALESCE(SUM(item_counts.test_count), 0) as totalTestsOrdered,
        COALESCE(SUM(i.subtotal_amount), 0) as grossRevenuePaisa,
        COALESCE(SUM(i.final_total), 0) as netRevenuePaisa,
        COALESCE(SUM(i.discount_amount), 0) as totalDiscountPaisa,
        COALESCE(SUM(i.paid_amount), 0) as totalPaidPaisa,
        COALESCE(SUM(i.balance_amount), 0) as totalBalancePaisa
      FROM doctors d
      LEFT JOIN visits v ON d.id = v.referring_doctor_id ${visitDateCondition}
      LEFT JOIN invoices i ON v.id = i.visit_id
      LEFT JOIN (
        SELECT visit_id, COUNT(*) as test_count
        FROM order_items
        GROUP BY visit_id
      ) item_counts ON v.id = item_counts.visit_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY d.id, d.full_name, d.specialization
      ORDER BY totalVisits DESC, grossRevenuePaisa DESC
    `;

    const result: DoctorReferralStats[] = [];

    // 1. Fetch assigned doctor stats if not strictly querying unassigned doctor (doctorId === 0)
    if (query.doctorId !== 0) {
      const rows = db.prepare(sql).all(...visitParams, ...params) as Array<{
        doctorId: number;
        doctorName: string;
        specialization: string | null;
        totalVisits: number;
        uniquePatients: number;
        totalTestsOrdered: number;
        grossRevenuePaisa: number;
        netRevenuePaisa: number;
        totalDiscountPaisa: number;
        totalPaidPaisa: number;
        totalBalancePaisa: number;
      }>;

      for (const r of rows) {
        result.push({
          doctorId: r.doctorId,
          doctorName: r.doctorName,
          specialization: r.specialization,
          totalVisits: Number(r.totalVisits),
          uniquePatients: Number(r.uniquePatients),
          totalTestsOrdered: Number(r.totalTestsOrdered),
          grossRevenuePaisa: Number(r.grossRevenuePaisa),
          netRevenuePaisa: Number(r.netRevenuePaisa),
          totalDiscountPaisa: Number(r.totalDiscountPaisa),
          totalPaidPaisa: Number(r.totalPaidPaisa),
          totalBalancePaisa: Number(r.totalBalancePaisa),
        });
      }
    }

    // 2. Fetch unassigned / direct walk-in visits if query allows (no specific doctor or doctorId === 0)
    if (query.doctorId === undefined || query.doctorId === null || query.doctorId === 0) {
      let unassignedDateCondition = '';
      const unassignedParams: any[] = [];
      if (query.startDate) {
        unassignedDateCondition += ' AND v.order_date >= ?';
        unassignedParams.push(query.startDate);
      }
      if (query.endDate) {
        unassignedDateCondition += ' AND v.order_date <= ?';
        unassignedParams.push(query.endDate);
      }

      const unassignedSql = `
        SELECT
          0 as doctorId,
          'Self / Direct (No Doctor Selected)' as doctorName,
          'Direct Patient / Walk-in' as specialization,
          COUNT(DISTINCT v.id) as totalVisits,
          COUNT(DISTINCT v.patient_id) as uniquePatients,
          COALESCE(SUM(item_counts.test_count), 0) as totalTestsOrdered,
          COALESCE(SUM(i.subtotal_amount), 0) as grossRevenuePaisa,
          COALESCE(SUM(i.final_total), 0) as netRevenuePaisa,
          COALESCE(SUM(i.discount_amount), 0) as totalDiscountPaisa,
          COALESCE(SUM(i.paid_amount), 0) as totalPaidPaisa,
          COALESCE(SUM(i.balance_amount), 0) as totalBalancePaisa
        FROM visits v
        LEFT JOIN invoices i ON v.id = i.visit_id
        LEFT JOIN (
          SELECT visit_id, COUNT(*) as test_count
          FROM order_items
          GROUP BY visit_id
        ) item_counts ON v.id = item_counts.visit_id
        WHERE v.referring_doctor_id IS NULL ${unassignedDateCondition}
      `;

      const unassignedRow = db.prepare(unassignedSql).get(...unassignedParams) as any;
      if (unassignedRow && (Number(unassignedRow.totalVisits) > 0 || query.doctorId === 0)) {
        result.push({
          doctorId: 0,
          doctorName: 'Self / Direct (No Doctor Selected)',
          specialization: 'Direct Patient / Walk-in',
          totalVisits: Number(unassignedRow.totalVisits),
          uniquePatients: Number(unassignedRow.uniquePatients),
          totalTestsOrdered: Number(unassignedRow.totalTestsOrdered),
          grossRevenuePaisa: Number(unassignedRow.grossRevenuePaisa),
          netRevenuePaisa: Number(unassignedRow.netRevenuePaisa),
          totalDiscountPaisa: Number(unassignedRow.totalDiscountPaisa),
          totalPaidPaisa: Number(unassignedRow.totalPaidPaisa),
          totalBalancePaisa: Number(unassignedRow.totalBalancePaisa),
        });
      }
    }

    return result.sort((a, b) => b.totalVisits - a.totalVisits || b.grossRevenuePaisa - a.grossRevenuePaisa);
  }
}

