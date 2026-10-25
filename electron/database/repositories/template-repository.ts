import { DatabaseManager } from '../connection';
import type { ReportTemplate } from '../../types/ipc';

export const DEFAULT_REPORT_TEMPLATE: ReportTemplate = {
  id: 'al-shifa-default',
  name: 'Al-Shifa Default',
  active: true,
  header: {
    logoDataUrl: '',
    hospitalName: 'AL-SHIFA MEDICAL CENTER',
    reportTitle: 'LAB TEST REPORT',
    supervisor: 'Dr. Saad Khan',
    address: 'Peshawar Swabi Road, Mohalla Panch Paao, Kohat',
    phone: '0938-281507',
    mobile: '0315-1996504',
    whatsapp: '0333-9995967',
    badgeText: '24 Ghantay Service',
    showBadge: true,
    showLogo: true,
    color: '#124779',
    accentColor: '#079b98',
    align: 'left',
  },
  patientFields: [
    'Patient Name',
    'Age / Gender',
    'Date',
    'Report No.',
    'C/O No.',
    'S/O,D/O,W/O',
    'Referring Physician',
    'Sample Collected',
  ],
  columns: [
    { key: 'testName', label: 'Test Name', visible: true },
    { key: 'result', label: 'Result', visible: true },
    { key: 'unit', label: 'Unit', visible: true },
    { key: 'normalRange', label: 'Normal Range', visible: true },
    { key: 'status', label: 'Status / Flag', visible: true },
  ],
  observations: {
    visible: true,
    title: 'COMPUTER TEST RESULTS / OBSERVATIONS',
    defaultText: '',
  },
  footer: {
    visible: true,
    text: 'Thank you for trusting AL-SHIFA MEDICAL CENTER | Dr. Saad Khan',
    rightText: 'AL-SHIFA | Dr. Saad Khan',
    color: '#124779',
  },
  style: {
    fontFamily: 'Arial',
    fontSize: 10,
    showPatientBox: true,
  },
};

export class TemplateRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  private rowToTemplate(row: any): ReportTemplate {
    let parsedConfig: any = {};
    try {
      parsedConfig = JSON.parse(row.config_json);
    } catch {
      // fallback
    }

    return {
      id: row.id,
      name: row.name,
      active: Boolean(row.is_active),
      header: parsedConfig.header || DEFAULT_REPORT_TEMPLATE.header,
      patientFields: parsedConfig.patientFields || DEFAULT_REPORT_TEMPLATE.patientFields,
      columns: parsedConfig.columns || DEFAULT_REPORT_TEMPLATE.columns,
      observations: parsedConfig.observations || DEFAULT_REPORT_TEMPLATE.observations,
      footer: parsedConfig.footer || DEFAULT_REPORT_TEMPLATE.footer,
      style: parsedConfig.style || DEFAULT_REPORT_TEMPLATE.style,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private seedDefaultTemplateIfEmpty(): void {
    const db = this.dbManager.getDatabase();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM report_templates').get() as { count: number };
    if (countRow.count === 0) {
      const now = new Date().toISOString();
      const configJson = JSON.stringify({
        header: DEFAULT_REPORT_TEMPLATE.header,
        patientFields: DEFAULT_REPORT_TEMPLATE.patientFields,
        columns: DEFAULT_REPORT_TEMPLATE.columns,
        observations: DEFAULT_REPORT_TEMPLATE.observations,
        footer: DEFAULT_REPORT_TEMPLATE.footer,
        style: DEFAULT_REPORT_TEMPLATE.style,
      });

      db.prepare(`
        INSERT INTO report_templates (id, name, config_json, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run(DEFAULT_REPORT_TEMPLATE.id, DEFAULT_REPORT_TEMPLATE.name, configJson, now, now);
    }
  }

  public getTemplates(): ReportTemplate[] {
    const db = this.dbManager.getDatabase();
    this.seedDefaultTemplateIfEmpty();

    const rows = db.prepare(`
      SELECT * FROM report_templates
      ORDER BY is_active DESC, name ASC
    `).all() as any[];

    return rows.map((r) => this.rowToTemplate(r));
  }

  public getActiveTemplate(): ReportTemplate {
    const db = this.dbManager.getDatabase();
    this.seedDefaultTemplateIfEmpty();

    const row = db.prepare(`
      SELECT * FROM report_templates
      WHERE is_active = 1
      LIMIT 1
    `).get() as any;

    if (!row) {
      return DEFAULT_REPORT_TEMPLATE;
    }

    return this.rowToTemplate(row);
  }

  public saveTemplate(template: ReportTemplate): ReportTemplate {
    const db = this.dbManager.getDatabase();
    this.seedDefaultTemplateIfEmpty();
    const now = new Date().toISOString();
    const id = template.id || `template-${Date.now()}`;
    const name = template.name.trim() || 'Untitled Template';
    const isActive = Boolean(template.active);

    const configJson = JSON.stringify({
      header: template.header,
      patientFields: template.patientFields,
      columns: template.columns,
      observations: template.observations,
      footer: template.footer,
      style: template.style,
    });

    const tx = db.transaction(() => {
      if (isActive) {
        db.prepare('UPDATE report_templates SET is_active = 0').run();
      }

      const existing = db.prepare('SELECT id FROM report_templates WHERE id = ?').get(id);
      if (existing) {
        db.prepare(`
          UPDATE report_templates
          SET name = ?, config_json = ?, is_active = ?, updated_at = ?
          WHERE id = ?
        `).run(name, configJson, isActive ? 1 : 0, now, id);
      } else {
        db.prepare(`
          INSERT INTO report_templates (id, name, config_json, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, name, configJson, isActive ? 1 : 0, now, now);
      }
    });

    tx();

    return {
      ...template,
      id,
      name,
      active: isActive,
      updated_at: now,
    };
  }

  public activateTemplate(id: string): boolean {
    const db = this.dbManager.getDatabase();
    this.seedDefaultTemplateIfEmpty();
    const now = new Date().toISOString();

    const tx = db.transaction(() => {
      db.prepare('UPDATE report_templates SET is_active = 0').run();
      const res = db.prepare('UPDATE report_templates SET is_active = 1, updated_at = ? WHERE id = ?').run(now, id);
      if (res.changes === 0) {
        throw new Error(`Report template with ID ${id} not found.`);
      }
    });

    tx();
    return true;
  }

  public deleteTemplate(id: string): boolean {
    const db = this.dbManager.getDatabase();
    this.seedDefaultTemplateIfEmpty();

    const tx = db.transaction(() => {
      const existing = db.prepare('SELECT is_active FROM report_templates WHERE id = ?').get(id) as { is_active: number } | undefined;
      if (!existing) {
        throw new Error('Template not found.');
      }
      if (existing.is_active === 1) {
        throw new Error('Cannot delete the active report template. Please activate another design first.');
      }

      db.prepare('DELETE FROM report_templates WHERE id = ?').run(id);
    });

    tx();
    return true;
  }
}
