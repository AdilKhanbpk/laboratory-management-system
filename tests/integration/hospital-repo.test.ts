import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { HospitalRepository } from '../../electron/database/repositories/hospital-repository';

describe('Integration: Hospital Settings Repository', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;
  let hospitalRepo: HospitalRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-hosp-test-'));
    dbPath = path.join(tempDir, 'hosp_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'HospTestKey2026!' });
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    hospitalRepo = new HospitalRepository(manager);
  });

  afterEach(() => {
    if (manager) manager.close();
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup
      }
    }
  });

  it('initializes single hospital record and enforces singleton constraint (CHECK id = 1)', () => {
    expect(hospitalRepo.getSettings()).toBeNull();

    const created = hospitalRepo.initializeSettings({
      hospital_name: 'Shaukat Khanum Diagnostic Lab',
      tagline: 'Excellence in Pathology',
      address: '7A Block R-3, Johar Town, Lahore',
      phone_primary: '+92-42-35905000',
      currency_code: 'PKR',
      timezone: 'Asia/Karachi',
    });

    expect(created.id).toBe(1);
    expect(created.hospital_name).toBe('Shaukat Khanum Diagnostic Lab');
    expect(created.currency_code).toBe('PKR');

    // Verify database constraint prevents creating an id other than 1
    const db = manager.getDatabase();
    expect(() => {
      db.prepare(`
        INSERT INTO hospital_settings (
          id, hospital_name, address, phone_primary, currency_code, timezone, created_at, updated_at
        ) VALUES (2, 'Invalid Second Lab', 'Address', '12345', 'PKR', 'Asia/Karachi', datetime('now'), datetime('now'))
      `).run();
    }).toThrow(/CHECK constraint failed/);
  });

  it('updates hospital settings and updates timestamp', () => {
    hospitalRepo.initializeSettings({
      hospital_name: 'Original Lab Name',
      address: 'Old Address',
      phone_primary: '111',
    });

    const updated = hospitalRepo.updateSettings({
      hospital_name: 'Renamed Modern Laboratory',
      phone_primary: '+92-51-1112223',
      inactivity_timeout_minutes: 30,
    });

    expect(updated.hospital_name).toBe('Renamed Modern Laboratory');
    expect(updated.phone_primary).toBe('+92-51-1112223');
    expect(updated.inactivity_timeout_minutes).toBe(30);
    expect(updated.address).toBe('Old Address'); // preserved
  });
});

