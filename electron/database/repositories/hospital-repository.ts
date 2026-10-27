import { DatabaseManager } from '../connection';

export interface HospitalSettings {
  id: number;
  hospital_name: string;
  tagline: string | null;
  address: string;
  phone_primary: string;
  phone_secondary: string | null;
  email: string | null;
  logo_relative_path: string | null;
  logo_url?: string | null;
  currency_code: string;
  timezone: string;
  inactivity_timeout_minutes: number;
  default_backup_path?: string | null;
  owner_percentage?: number;
  created_at: string;
  updated_at: string;
}

export class HospitalRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  public getSettings(): HospitalSettings | null {
    const db = this.dbManager.getDatabase();
    const row = db.prepare('SELECT * FROM hospital_settings WHERE id = 1').get();
    return (row as HospitalSettings) || null;
  }

  public initializeSettings(params: {
    hospital_name: string;
    tagline?: string;
    address: string;
    phone_primary: string;
    phone_secondary?: string;
    email?: string;
    currency_code?: string;
    timezone?: string;
    inactivity_timeout_minutes?: number;
  }): HospitalSettings {
    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO hospital_settings (
        id,
        hospital_name,
        tagline,
        address,
        phone_primary,
        phone_secondary,
        email,
        currency_code,
        timezone,
        inactivity_timeout_minutes,
        created_at,
        updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        hospital_name = excluded.hospital_name,
        tagline = excluded.tagline,
        address = excluded.address,
        phone_primary = excluded.phone_primary,
        phone_secondary = excluded.phone_secondary,
        email = excluded.email,
        currency_code = excluded.currency_code,
        timezone = excluded.timezone,
        inactivity_timeout_minutes = excluded.inactivity_timeout_minutes,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      params.hospital_name.trim(),
      params.tagline?.trim() || null,
      params.address.trim(),
      params.phone_primary.trim(),
      params.phone_secondary?.trim() || null,
      params.email?.trim() || null,
      params.currency_code || 'PKR',
      params.timezone || 'Asia/Karachi',
      params.inactivity_timeout_minutes || 15,
      now,
      now
    );

    return this.getSettings()!;
  }

  public updateSettings(params: Partial<HospitalSettings>): HospitalSettings {
    const current = this.getSettings();
    if (!current) {
      throw new Error('Hospital settings have not been initialized yet.');
    }

    const updated = {
      ...current,
      ...params,
      id: 1,
      updated_at: new Date().toISOString(),
    };

    const db = this.dbManager.getDatabase();
    db.prepare(`
      UPDATE hospital_settings SET
        hospital_name = ?,
        tagline = ?,
        address = ?,
        phone_primary = ?,
        phone_secondary = ?,
        email = ?,
        logo_relative_path = ?,
        currency_code = ?,
        timezone = ?,
        inactivity_timeout_minutes = ?,
        default_backup_path = ?,
        owner_percentage = COALESCE(?, owner_percentage),
        updated_at = ?
      WHERE id = 1
    `).run(
      updated.hospital_name,
      updated.tagline,
      updated.address,
      updated.phone_primary,
      updated.phone_secondary,
      updated.email,
      updated.logo_relative_path,
      updated.currency_code,
      updated.timezone,
      updated.inactivity_timeout_minutes,
      updated.default_backup_path !== undefined ? updated.default_backup_path : current.default_backup_path || null,
      updated.owner_percentage !== undefined ? updated.owner_percentage : null,
      updated.updated_at
    );

    return this.getSettings()!;
  }
}

