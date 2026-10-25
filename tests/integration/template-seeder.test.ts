import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import {
  detectSavedTemplate,
  applySavedTemplateSeed,
  findCandidateSavedTemplate,
} from '../../electron/database/template-seeder';
import { TemplateRepository } from '../../electron/database/repositories/template-repository';

describe('Integration: ReportTemplateSeeder', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;
  let templateRepo: TemplateRepository;
  const encryptionKey = 'SeedMasterSecretKey999!';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-template-seeder-test-'));
    dbPath = path.join(tempDir, 'seeder_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey });
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    templateRepo = new TemplateRepository(manager);
  });

  afterEach(() => {
    if (manager) {
      manager.close();
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup
      }
    }
  });

  it('detects the bundled report template seed file with embedded logo', () => {
    const seedPath = findCandidateSavedTemplate();
    expect(seedPath).toBeTruthy();
    expect(fs.existsSync(seedPath!)).toBe(true);

    const detection = detectSavedTemplate(seedPath!);
    expect(detection.detected).toBe(true);
    expect(detection.hospitalName).toBe('AL-SHIFA MEDICAL CENTER');
    expect(detection.supervisor).toBe('Dr. Saad Khan');
    expect(detection.hasLogo).toBe(true);
    expect(detection.logoLength).toBeGreaterThan(100000);
  });

  it('applies saved report template seed to the database and synchronizes hospital branding', () => {
    const seedPath = findCandidateSavedTemplate();
    expect(seedPath).toBeTruthy();

    const result = applySavedTemplateSeed(manager, seedPath!);
    expect(result.templateName).toBe('Al-Shifa Default');
    expect(result.hospitalName).toBe('AL-SHIFA MEDICAL CENTER');
    expect(result.hasLogo).toBe(true);
    expect(result.activated).toBe(true);

    // Verify active template in database
    const active = templateRepo.getActiveTemplate();
    expect(active.header.hospitalName).toBe('AL-SHIFA MEDICAL CENTER');
    expect(active.header.supervisor).toBe('Dr. Saad Khan');
    expect(active.header.logoDataUrl.startsWith('data:image')).toBe(true);
    expect(active.footer.rightText).toBe('Lab Technition | Muhammad Ahsan');

    // Verify hospital settings updated
    const db = manager.getDatabase();
    const hospital = db.prepare('SELECT * FROM hospital_settings LIMIT 1').get() as any;
    expect(hospital).toBeTruthy();
    expect(hospital.hospital_name).toBe('AL-SHIFA MEDICAL CENTER');
  });
});
