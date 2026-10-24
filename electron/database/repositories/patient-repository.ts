import { DatabaseManager, DatabaseError } from '../connection';

export interface Patient {
  id: number;
  patient_mrn: string;
  full_name: string;
  date_of_birth: string | null;
  gender: 'male' | 'female' | 'other';
  phone_number: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientSearchParams {
  query?: string;
  gender?: string;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'patient_mrn' | 'full_name';
  sortOrder?: 'asc' | 'desc';
}

export interface PatientSearchResult {
  patients: Patient[];
  total: number;
  page: number;
  totalPages: number;
}

export interface DuplicatePatientWarning {
  hasDuplicate: boolean;
  duplicateByName?: { id: number; patient_mrn: string; full_name: string; phone_number: string | null };
  duplicateByPhone?: { id: number; patient_mrn: string; full_name: string; phone_number: string | null };
}

export class PatientRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Generates a unique, collision-proof Medical Record Number (MRN).
   * Format: PAT-YYYY-XXXXX (e.g., PAT-2026-00001)
   */
  public generateNextMRN(): string {
    const db = this.dbManager.getDatabase();
    const currentYear = new Date().getFullYear();
    const prefix = `PAT-${currentYear}-`;

    const row = db.prepare(`
      SELECT patient_mrn FROM patients
      WHERE patient_mrn LIKE ?
      ORDER BY id DESC LIMIT 1
    `).get(`${prefix}%`) as { patient_mrn: string } | undefined;

    let nextSeq = 1;
    if (row && row.patient_mrn) {
      const parts = row.patient_mrn.split('-');
      if (parts.length === 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) {
          nextSeq = parsed + 1;
        }
      }
    }

    // Zero-padded to 5 digits
    return `${prefix}${String(nextSeq).padStart(5, '0')}`;
  }

  /**
   * Checks for duplicate patient names or phone numbers to return non-blocking warnings.
   */
  public checkDuplicates(
    fullName: string,
    phoneNumber?: string | null,
    excludeId?: number
  ): DuplicatePatientWarning {
    const db = this.dbManager.getDatabase();
    const cleanName = fullName.trim().toLowerCase();
    const cleanPhone = phoneNumber?.trim() || null;

    let duplicateByName: any = undefined;
    let duplicateByPhone: any = undefined;

    // Check by name
    let queryName = 'SELECT id, patient_mrn, full_name, phone_number FROM patients WHERE LOWER(full_name) = ?';
    const paramsName: any[] = [cleanName];
    if (excludeId) {
      queryName += ' AND id != ?';
      paramsName.push(excludeId);
    }
    const nameRow = db.prepare(queryName).get(...paramsName);
    if (nameRow) {
      duplicateByName = nameRow;
    }

    // Check by phone if provided
    if (cleanPhone && cleanPhone.length >= 7) {
      let queryPhone = 'SELECT id, patient_mrn, full_name, phone_number FROM patients WHERE phone_number = ?';
      const paramsPhone: any[] = [cleanPhone];
      if (excludeId) {
        queryPhone += ' AND id != ?';
        paramsPhone.push(excludeId);
      }
      const phoneRow = db.prepare(queryPhone).get(...paramsPhone);
      if (phoneRow) {
        duplicateByPhone = phoneRow;
      }
    }

    return {
      hasDuplicate: !!(duplicateByName || duplicateByPhone),
      duplicateByName,
      duplicateByPhone,
    };
  }

  public createPatient(params: {
    fullName: string;
    dateOfBirth?: string | null;
    gender: 'male' | 'female' | 'other';
    phoneNumber?: string | null;
    address?: string | null;
    notes?: string | null;
  }): Patient {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    // Collision retry loop for MRN generation
    let attempts = 0;
    while (attempts < 5) {
      const mrn = this.generateNextMRN();
      try {
        const stmt = db.prepare(`
          INSERT INTO patients (
            patient_mrn, full_name, date_of_birth, gender, phone_number, address, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
          mrn,
          params.fullName.trim(),
          params.dateOfBirth?.trim() || null,
          params.gender,
          params.phoneNumber?.trim() || null,
          params.address?.trim() || null,
          params.notes?.trim() || null,
          now,
          now
        );

        return this.getPatientById(Number(result.lastInsertRowid))!;
      } catch (err: any) {
        if (err?.message?.includes('UNIQUE constraint failed: patients.patient_mrn')) {
          attempts++;
          continue;
        }
        throw new DatabaseError(`Failed to create patient record: ${err.message}`, err);
      }
    }

    throw new DatabaseError('Failed to allocate unique patient MRN after multiple attempts.');
  }

  public updatePatient(
    id: number,
    params: {
      fullName: string;
      dateOfBirth?: string | null;
      gender: 'male' | 'female' | 'other';
      phoneNumber?: string | null;
      address?: string | null;
      notes?: string | null;
    }
  ): Patient {
    const existing = this.getPatientById(id);
    if (!existing) {
      throw new DatabaseError(`Patient record with ID ${id} was not found.`);
    }

    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE patients SET
        full_name = ?,
        date_of_birth = ?,
        gender = ?,
        phone_number = ?,
        address = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      params.fullName.trim(),
      params.dateOfBirth?.trim() || null,
      params.gender,
      params.phoneNumber?.trim() || null,
      params.address?.trim() || null,
      params.notes?.trim() || null,
      now,
      id
    );

    return this.getPatientById(id)!;
  }

  public getPatientById(id: number): Patient | null {
    const db = this.dbManager.getDatabase();
    const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
    return (row as Patient) || null;
  }

  public getPatientByMRN(mrn: string): Patient | null {
    const db = this.dbManager.getDatabase();
    const row = db.prepare('SELECT * FROM patients WHERE patient_mrn = ?').get(mrn.trim());
    return (row as Patient) || null;
  }

  public searchPatients(params: PatientSearchParams = {}): PatientSearchResult {
    const db = this.dbManager.getDatabase();
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(Math.max(1, params.limit || 15), 100);
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const queryParams: any[] = [];

    if (params.query && params.query.trim()) {
      const q = `%${params.query.trim()}%`;
      whereClauses.push('(patient_mrn LIKE ? OR full_name LIKE ? OR phone_number LIKE ?)');
      queryParams.push(q, q, q);
    }

    if (params.gender && params.gender !== 'all') {
      whereClauses.push('gender = ?');
      queryParams.push(params.gender);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count
    const countRow = db.prepare(`SELECT count(*) as total FROM patients ${whereSql}`).get(...queryParams) as { total: number };
    const total = countRow.total;

    // Sorting
    const sortField = ['created_at', 'patient_mrn', 'full_name'].includes(params.sortBy || '')
      ? params.sortBy!
      : 'created_at';
    const sortDirection = params.sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Query records
    const rows = db.prepare(`
      SELECT * FROM patients
      ${whereSql}
      ORDER BY ${sortField} ${sortDirection}
      LIMIT ? OFFSET ?
    `).all(...queryParams, limit, offset) as Patient[];

    return {
      patients: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}

