import { DatabaseManager, DatabaseError } from '../connection';

export interface Doctor {
  id: number;
  full_name: string;
  specialization: string | null;
  phone_number: string | null;
  clinic_hospital_name: string | null;
  address: string | null;
  notes: string | null;
  commission_percentage: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface DuplicateDoctorWarning {
  hasDuplicate: boolean;
  duplicateByName?: { id: number; full_name: string; specialization: string | null; phone_number: string | null };
}

export class DoctorRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  public checkDuplicates(fullName: string, excludeId?: number): DuplicateDoctorWarning {
    const db = this.dbManager.getDatabase();
    const cleanName = fullName.trim().toLowerCase();

    let query = 'SELECT id, full_name, specialization, phone_number FROM doctors WHERE LOWER(full_name) = ?';
    const params: any[] = [cleanName];
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }

    const row = db.prepare(query).get(...params);
    return {
      hasDuplicate: !!row,
      duplicateByName: row as any,
    };
  }

  public createDoctor(params: {
    fullName: string;
    specialization?: string | null;
    phoneNumber?: string | null;
    clinicHospitalName?: string | null;
    address?: string | null;
    notes?: string | null;
    commissionPercentage?: number;
  }): Doctor {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO doctors (
        full_name, specialization, phone_number, clinic_hospital_name, address, notes, commission_percentage, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const result = stmt.run(
      params.fullName.trim(),
      params.specialization?.trim() || null,
      params.phoneNumber?.trim() || null,
      params.clinicHospitalName?.trim() || null,
      params.address?.trim() || null,
      params.notes?.trim() || null,
      params.commissionPercentage !== undefined ? Number(params.commissionPercentage) : 0,
      now,
      now
    );

    return this.getDoctorById(Number(result.lastInsertRowid))!;
  }

  public updateDoctor(
    id: number,
    params: {
      fullName: string;
      specialization?: string | null;
      phoneNumber?: string | null;
      clinicHospitalName?: string | null;
      address?: string | null;
      notes?: string | null;
      commissionPercentage?: number;
      isActive?: number;
    }
  ): Doctor {
    const existing = this.getDoctorById(id);
    if (!existing) {
      throw new DatabaseError(`Doctor record with ID ${id} was not found.`);
    }

    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE doctors SET
        full_name = ?,
        specialization = ?,
        phone_number = ?,
        clinic_hospital_name = ?,
        address = ?,
        notes = ?,
        commission_percentage = COALESCE(?, commission_percentage),
        is_active = COALESCE(?, is_active),
        updated_at = ?
      WHERE id = ?
    `).run(
      params.fullName.trim(),
      params.specialization?.trim() || null,
      params.phoneNumber?.trim() || null,
      params.clinicHospitalName?.trim() || null,
      params.address?.trim() || null,
      params.notes?.trim() || null,
      params.commissionPercentage !== undefined ? Number(params.commissionPercentage) : null,
      params.isActive !== undefined ? params.isActive : null,
      now,
      id
    );

    return this.getDoctorById(id)!;
  }

  public setDoctorActiveStatus(id: number, isActive: boolean): Doctor {
    const existing = this.getDoctorById(id);
    if (!existing) {
      throw new DatabaseError(`Doctor record with ID ${id} was not found.`);
    }

    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE doctors SET is_active = ?, updated_at = ? WHERE id = ?
    `).run(isActive ? 1 : 0, now, id);

    return this.getDoctorById(id)!;
  }

  public getDoctorById(id: number): Doctor | null {
    const db = this.dbManager.getDatabase();
    const row = db.prepare('SELECT * FROM doctors WHERE id = ?').get(id);
    return (row as Doctor) || null;
  }

  public listDoctors(params: {
    search?: string;
    includeInactive?: boolean;
    specialization?: string;
  } = {}): Doctor[] {
    const db = this.dbManager.getDatabase();
    const whereClauses: string[] = [];
    const queryParams: any[] = [];

    if (!params.includeInactive) {
      whereClauses.push('is_active = 1');
    }

    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      whereClauses.push('(full_name LIKE ? OR clinic_hospital_name LIKE ? OR specialization LIKE ?)');
      queryParams.push(q, q, q);
    }

    if (params.specialization && params.specialization !== 'all') {
      whereClauses.push('specialization = ?');
      queryParams.push(params.specialization);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    return db.prepare(`
      SELECT * FROM doctors
      ${whereSql}
      ORDER BY is_active DESC, full_name ASC
    `).all(...queryParams) as Doctor[];
  }
}

