import { DatabaseManager } from '../connection';
import { PatientHistoryItem, Visit, Invoice, OrderItem, ResultStatus } from '../../types/ipc';

export class PatientHistoryRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Retrieves comprehensive longitudinal visit and clinical history for a patient.
   */
  public getFullHistory(patientId: number): PatientHistoryItem[] {
    const db = this.dbManager.getDatabase();

    // 1. Fetch all visits
    const visits = db
      .prepare(`
        SELECT v.*, d.full_name as doctor_name
        FROM visits v
        LEFT JOIN doctors d ON v.referring_doctor_id = d.id
        WHERE v.patient_id = ?
        ORDER BY v.id DESC
      `)
      .all(patientId) as Visit[];

    if (visits.length === 0) return [];

    const visitIds = visits.map((v) => v.id);
    const placeholders = visitIds.map(() => '?').join(',');

    // 2. Fetch all invoices for these visits
    const invoices = db
      .prepare(`SELECT * FROM invoices WHERE visit_id IN (${placeholders})`)
      .all(...visitIds) as Invoice[];

    const invoiceMap = new Map(invoices.map((i) => [i.visit_id, i]));

    // 3. Fetch all order items for these visits
    const orderItems = db
      .prepare(`SELECT * FROM order_items WHERE visit_id IN (${placeholders}) ORDER BY id ASC`)
      .all(...visitIds) as OrderItem[];

    const orderItemsMap = new Map<number, OrderItem[]>();
    for (const item of orderItems) {
      if (!orderItemsMap.has(item.visit_id)) {
        orderItemsMap.set(item.visit_id, []);
      }
      orderItemsMap.get(item.visit_id)!.push(item);
    }

    // 4. Fetch snapshots and latest result statuses
    const snapshots = db
      .prepare(`SELECT visit_id, finalized_at, status FROM report_snapshots WHERE visit_id IN (${placeholders})`)
      .all(...visitIds) as Array<{ visit_id: number; finalized_at: string; status: string }>;

    const snapshotMap = new Map(snapshots.map((s) => [s.visit_id, s]));

    return visits.map((visit) => {
      const inv = invoiceMap.get(visit.id) || null;
      const items = orderItemsMap.get(visit.id) || [];
      const snap = snapshotMap.get(visit.id);

      let reportStatus: ResultStatus = 'pending';
      if (snap) {
        reportStatus = snap.status === 'amended' ? 'corrected' : 'finalized';
      } else if (items.some((it) => it.status === 'in_progress')) {
        reportStatus = 'draft';
      }

      return {
        visit,
        invoice: inv,
        orderItems: items,
        reportStatus,
        hasSnapshot: !!snap,
        finalizedAt: snap?.finalized_at || null,
      };
    });
  }
}

