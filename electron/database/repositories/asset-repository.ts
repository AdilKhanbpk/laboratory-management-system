import { DatabaseManager, DatabaseError } from '../connection';

export interface LabAsset {
  id: number;
  title: string;
  category: string;
  amount_paisa: number;
  purchase_date: string; // YYYY-MM-DD
  purchased_by: 'technician' | 'doctor';
  purchaser_name?: string | null;
  invoice_receipt_no: string | null;
  vendor_name: string | null;
  notes: string | null;
  recorded_by_user_id: number | null;
  recorded_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAssetInput {
  title: string;
  category?: string;
  amountPaisa: number;
  purchaseDate: string; // YYYY-MM-DD
  purchasedBy?: 'technician' | 'doctor';
  purchaserName?: string | null;
  invoiceReceiptNo?: string | null;
  vendorName?: string | null;
  notes?: string | null;
}

export interface UpdateAssetInput {
  id: number;
  title?: string;
  category?: string;
  amountPaisa?: number;
  purchaseDate?: string;
  purchasedBy?: 'technician' | 'doctor';
  purchaserName?: string | null;
  invoiceReceiptNo?: string | null;
  vendorName?: string | null;
  notes?: string | null;
}

export interface AssetFilterQuery {
  startDate?: string;
  endDate?: string;
  category?: string;
  search?: string;
}

export class AssetRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  public createAsset(input: CreateAssetInput, userId?: number): LabAsset {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO lab_assets (
        title, category, amount_paisa, purchase_date, purchased_by, purchaser_name, invoice_receipt_no, vendor_name, notes, recorded_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.title.trim(),
      input.category?.trim() || 'general',
      Math.max(0, Math.round(input.amountPaisa)),
      input.purchaseDate.trim(),
      input.purchasedBy || 'technician',
      input.purchaserName?.trim() || null,
      input.invoiceReceiptNo?.trim() || null,
      input.vendorName?.trim() || null,
      input.notes?.trim() || null,
      userId || null,
      now,
      now
    );

    return this.getAssetById(Number(result.lastInsertRowid))!;
  }

  public updateAsset(input: UpdateAssetInput): LabAsset {
    const existing = this.getAssetById(input.id);
    if (!existing) {
      throw new DatabaseError(`Asset record with ID ${input.id} was not found.`);
    }

    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE lab_assets SET
        title = COALESCE(?, title),
        category = COALESCE(?, category),
        amount_paisa = COALESCE(?, amount_paisa),
        purchase_date = COALESCE(?, purchase_date),
        purchased_by = COALESCE(?, purchased_by),
        purchaser_name = COALESCE(?, purchaser_name),
        invoice_receipt_no = COALESCE(?, invoice_receipt_no),
        vendor_name = COALESCE(?, vendor_name),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `).run(
      input.title !== undefined ? input.title.trim() : null,
      input.category !== undefined ? input.category.trim() : null,
      input.amountPaisa !== undefined ? Math.max(0, Math.round(input.amountPaisa)) : null,
      input.purchaseDate !== undefined ? input.purchaseDate.trim() : null,
      input.purchasedBy !== undefined ? input.purchasedBy : null,
      input.purchaserName !== undefined ? (input.purchaserName ? input.purchaserName.trim() : null) : null,
      input.invoiceReceiptNo !== undefined ? (input.invoiceReceiptNo ? input.invoiceReceiptNo.trim() : null) : null,
      input.vendorName !== undefined ? (input.vendorName ? input.vendorName.trim() : null) : null,
      input.notes !== undefined ? (input.notes ? input.notes.trim() : null) : null,
      now,
      input.id
    );

    return this.getAssetById(input.id)!;
  }

  public deleteAsset(id: number): boolean {
    const db = this.dbManager.getDatabase();
    const result = db.prepare('DELETE FROM lab_assets WHERE id = ?').run(id);
    return result.changes > 0;
  }

  public getAssetById(id: number): LabAsset | null {
    const db = this.dbManager.getDatabase();
    const row = db.prepare(`
      SELECT a.*, u.full_name as recorded_by_name
      FROM lab_assets a
      LEFT JOIN app_users u ON a.recorded_by_user_id = u.id
      WHERE a.id = ?
    `).get(id);

    return (row as LabAsset) || null;
  }

  public listAssets(query: AssetFilterQuery = {}): LabAsset[] {
    const db = this.dbManager.getDatabase();
    const where: string[] = ['1=1'];
    const params: any[] = [];

    if (query.startDate) {
      where.push('substr(a.purchase_date, 1, 10) >= ?');
      params.push(query.startDate.slice(0, 10));
    }
    if (query.endDate) {
      where.push('substr(a.purchase_date, 1, 10) <= ?');
      params.push(query.endDate.slice(0, 10));
    }
    if (query.category && query.category !== 'all') {
      where.push('a.category = ?');
      params.push(query.category);
    }
    if (query.search && query.search.trim()) {
      const q = `%${query.search.trim()}%`;
      where.push('(a.title LIKE ? OR a.vendor_name LIKE ? OR a.invoice_receipt_no LIKE ? OR a.notes LIKE ?)');
      params.push(q, q, q, q);
    }

    const rows = db.prepare(`
      SELECT a.*, u.full_name as recorded_by_name
      FROM lab_assets a
      LEFT JOIN app_users u ON a.recorded_by_user_id = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY a.purchase_date DESC, a.id DESC
    `).all(...params);

    return rows as LabAsset[];
  }

  public getSummary(query: { startDate?: string; endDate?: string } = {}): {
    totalCount: number;
    totalAmountPaisa: number;
    technicianAmountPaisa: number;
    doctorAmountPaisa: number;
  } {
    const db = this.dbManager.getDatabase();
    const where: string[] = ['1=1'];
    const params: any[] = [];

    if (query.startDate) {
      where.push('substr(purchase_date, 1, 10) >= ?');
      params.push(query.startDate.slice(0, 10));
    }
    if (query.endDate) {
      where.push('substr(purchase_date, 1, 10) <= ?');
      params.push(query.endDate.slice(0, 10));
    }

    const row = db.prepare(`
      SELECT
        COUNT(*) as totalCount,
        COALESCE(SUM(amount_paisa), 0) as totalAmountPaisa,
        COALESCE(SUM(CASE WHEN purchased_by = 'technician' THEN amount_paisa ELSE 0 END), 0) as technicianAmountPaisa,
        COALESCE(SUM(CASE WHEN purchased_by = 'doctor' THEN amount_paisa ELSE 0 END), 0) as doctorAmountPaisa
      FROM lab_assets
      WHERE ${where.join(' AND ')}
    `).get(...params) as {
      totalCount: number;
      totalAmountPaisa: number;
      technicianAmountPaisa: number;
      doctorAmountPaisa: number;
    };

    return {
      totalCount: Number(row.totalCount || 0),
      totalAmountPaisa: Number(row.totalAmountPaisa || 0),
      technicianAmountPaisa: Number(row.technicianAmountPaisa || 0),
      doctorAmountPaisa: Number(row.doctorAmountPaisa || 0),
    };
  }
}
