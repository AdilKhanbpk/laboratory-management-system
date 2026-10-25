import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { TemplateRepository, DEFAULT_REPORT_TEMPLATE } from '../../electron/database/repositories/template-repository';

describe('Integration: TemplateRepository', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;
  let templateRepo: TemplateRepository;
  const encryptionKey = 'TemplateTestCryptKey777!';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-template-test-'));
    dbPath = path.join(tempDir, 'template_test.db');
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

  it('automatically seeds default Al-Shifa template when empty', () => {
    const templates = templateRepo.getTemplates();
    expect(templates.length).toBe(1);
    expect(templates[0].name).toBe('Al-Shifa Default');
    expect(templates[0].active).toBe(true);

    const active = templateRepo.getActiveTemplate();
    expect(active.id).toBe(DEFAULT_REPORT_TEMPLATE.id);
    expect(active.header.hospitalName).toBe('AL-SHIFA MEDICAL CENTER');
  });

  it('saves a new template and activates it uniquely', () => {
    const created = templateRepo.saveTemplate({
      ...DEFAULT_REPORT_TEMPLATE,
      id: 'template-custom-2',
      name: 'Custom Blue Minimalist',
      active: true,
      header: {
        ...DEFAULT_REPORT_TEMPLATE.header,
        hospitalName: 'KOIL CLINICAL LAB',
      },
    });

    expect(created.id).toBe('template-custom-2');
    expect(created.name).toBe('Custom Blue Minimalist');
    expect(created.active).toBe(true);

    const active = templateRepo.getActiveTemplate();
    expect(active.id).toBe('template-custom-2');
    expect(active.header.hospitalName).toBe('KOIL CLINICAL LAB');

    // Default template should now be inactive
    const all = templateRepo.getTemplates();
    expect(all.length).toBe(2);
    const oldDefault = all.find((t) => t.id === DEFAULT_REPORT_TEMPLATE.id);
    expect(oldDefault?.active).toBe(false);
  });

  it('prevents deleting an active template', () => {
    expect(() => {
      templateRepo.deleteTemplate(DEFAULT_REPORT_TEMPLATE.id);
    }).toThrow(/Cannot delete the active report template/);
  });
});

