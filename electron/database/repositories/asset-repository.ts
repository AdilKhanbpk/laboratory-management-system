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
  editReason?: string;
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

  public updateAsset(input: UpdateAssetInput, userId?: number): LabAsset {
    const existing = this.getAssetById(input.id);
    if (!existing) {
      throw new DatabaseError(`Asset record with ID ${input.id} was not found.`);
    }

    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    const newTitle = input.title !== undefined ? input.title.trim() : existing.title;
    const newCategory = input.category !== undefined ? input.category.trim() : (existing.category || 'General');
    const newAmount = input.amountPaisa !== undefined ? Math.max(0, Math.round(input.amountPaisa)) : existing.amount_paisa;
    const newDate = input.purchaseDate !== undefined ? input.purchaseDate.trim() : existing.purchase_date;
    const newPurchasedBy = input.purchasedBy !== undefined ? input.purchasedBy : (existing.purchased_by || 'technician');
    const newPurchaserName = input.purchaserName !== undefined ? (input.purchaserName ? input.purchaserName.trim() : null) : (existing.purchaser_name || null);
    const newInvoiceReceiptNo = input.invoiceReceiptNo !== undefined ? (input.invoiceReceiptNo ? input.invoiceReceiptNo.trim() : null) : (existing.invoice_receipt_no || null);
    const newVendorName = input.vendorName !== undefined ? (input.vendorName ? input.vendorName.trim() : null) : (existing.vendor_name || null);

    const changes: string[] = [];
    if (newTitle !== existing.title) {
      changes.push(`Title changed from '${existing.title}' to '${newTitle}'`);
    }
    if (newAmount !== existing.amount_paisa) {
      changes.push(`Amount changed from Rs. ${(existing.amount_paisa / 100).toLocaleString('en-PK')} to Rs. ${(newAmount / 100).toLocaleString('en-PK')}`);
    }
    if (newDate !== existing.purchase_date) {
      changes.push(`Purchase date changed from ${existing.purchase_date} to ${newDate}`);
    }
    if (newPurchasedBy !== (existing.purchased_by || 'technician')) {
      changes.push(`Purchaser role changed from ${existing.purchased_by || 'technician'} to ${newPurchasedBy}`);
    }
    if (newPurchaserName !== (existing.purchaser_name || null)) {
      changes.push(`Purchaser name changed from '${existing.purchaser_name || 'none'}' to '${newPurchaserName || 'none'}'`);
    }
    if (newCategory !== (existing.category || 'General')) {
      changes.push(`Category changed from '${existing.category || 'General'}' to '${newCategory}'`);
    }
    if (newVendorName !== (existing.vendor_name || null)) {
      changes.push(`Vendor changed from '${existing.vendor_name || 'none'}' to '${newVendorName || 'none'}'`);
    }
    if (newInvoiceReceiptNo !== (existing.invoice_receipt_no || null)) {
      changes.push(`Invoice/Receipt# changed from '${existing.invoice_receipt_no || 'none'}' to '${newInvoiceReceiptNo || 'none'}'`);
    }

    // Determine editor name if available
    let editorName = 'User';
    if (userId) {
      const u = db.prepare('SELECT full_name FROM app_users WHERE id = ?').get(userId) as any;
      if (u?.full_name) editorName = u.full_name;
    }

    const editTimestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const reasonDetail = input.editReason?.trim() || 'No detail provided';
    const beforeSummary = `Title: ${existing.title}, Amount: Rs. ${(existing.amount_paisa / 100).toLocaleString('en-PK')}, Date: ${existing.purchase_date}, Purchased by: ${existing.purchased_by || 'technician'}${existing.purchaser_name ? ` (${existing.purchaser_name})` : ''}, Category: ${existing.category || 'General'}${existing.vendor_name ? `, Vendor: ${existing.vendor_name}` : ''}${existing.invoice_receipt_no ? `, Inv: ${existing.invoice_receipt_no}` : ''}`;
    const whatChangedText = changes.length > 0 ? changes.join('; ') : 'Notes updated';

    const auditMessage = `[EDIT HISTORY ${editTimestamp} by ${editorName}]\n• Reason for change: "${reasonDetail}"\n• What changed: ${whatChangedText}\n• Before values: [${beforeSummary}]`;

    // Construct final notes: preserve clean base notes, extract prior audit history (deduplicated), and append new auditMessage
    let cleanBaseNote = '';
    if (input.notes !== undefined) {
      const inputRaw = input.notes?.trim() || '';
      const inputHistIdx = inputRaw.search(/\[EDIT HISTORY/i);
      cleanBaseNote = inputHistIdx >= 0 ? inputRaw.slice(0, inputHistIdx).trim() : inputRaw;
    } else if (existing.notes) {
      const existRaw = existing.notes.trim();
      const existHistIdx = existRaw.search(/\[EDIT HISTORY/i);
      cleanBaseNote = existHistIdx >= 0 ? existRaw.slice(0, existHistIdx).trim() : existRaw;
    }

    // Extract prior audit history blocks from existing.notes and deduplicate
    const historyBlocks: string[] = [];
    if (existing.notes) {
      const existHistIdx = existing.notes.search(/\[EDIT HISTORY/i);
      if (existHistIdx >= 0) {
        const histRaw = existing.notes.slice(existHistIdx);
        const parts = histRaw.split(/(?=\[EDIT HISTORY)/i).map((p: string) => p.trim()).filter(Boolean);
        for (const p of parts) {
          if (!historyBlocks.includes(p)) {
            historyBlocks.push(p);
          }
        }
      }
    }

    // Append new auditMessage to historyBlocks
    historyBlocks.push(auditMessage);

    const finalNotes = cleanBaseNote
      ? `${cleanBaseNote}\n\n${historyBlocks.join('\n\n')}`
      : historyBlocks.join('\n\n');

    db.prepare(`
      UPDATE lab_assets SET
        title = ?,
        category = ?,
        amount_paisa = ?,
        purchase_date = ?,
        purchased_by = ?,
        purchaser_name = ?,
        invoice_receipt_no = ?,
        vendor_name = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      newTitle,
      newCategory,
      newAmount,
      newDate,
      newPurchasedBy,
      newPurchaserName,
      newInvoiceReceiptNo,
      newVendorName,
      finalNotes,
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

  private deduplicateAssetNotes(notes: string | null): string | null {
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

  public getAssetById(id: number): LabAsset | null {
    const db = this.dbManager.getDatabase();
    const row = db.prepare(`
      SELECT a.*, u.full_name as recorded_by_name
      FROM lab_assets a
      LEFT JOIN app_users u ON a.recorded_by_user_id = u.id
      WHERE a.id = ?
    `).get(id) as LabAsset | undefined;

    if (row && row.notes) {
      const sanitized = this.deduplicateAssetNotes(row.notes);
      if (sanitized !== row.notes) {
        row.notes = sanitized;
        try {
          db.prepare('UPDATE lab_assets SET notes = ? WHERE id = ?').run(sanitized, row.id);
        } catch {
          // ignore background cleanup error
        }
      }
    }

    return row || null;
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
    `).all(...params) as LabAsset[];

    for (const row of rows) {
      if (row.notes) {
        const sanitized = this.deduplicateAssetNotes(row.notes);
        if (sanitized !== row.notes) {
          row.notes = sanitized;
          try {
            db.prepare('UPDATE lab_assets SET notes = ? WHERE id = ?').run(sanitized, row.id);
          } catch {
            // ignore background cleanup error
          }
        }
      }
    }

    return rows;
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
