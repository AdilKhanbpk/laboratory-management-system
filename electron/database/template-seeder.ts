import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { DatabaseManager } from './connection';
import type {
  SavedTemplateDetectionResult,
  SavedTemplateSeedResult,
} from '../types/ipc';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DatabaseConstructor = require('better-sqlite3-multiple-ciphers');

/**
 * Searches common directories to locate the saved report template file (.json or .db).
 */
export function findCandidateSavedTemplate(customPath?: string): string | null {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const appRoot = app && app.isPackaged ? path.dirname(process.execPath) : process.cwd();
  const searchDirs = [
    path.join(process.cwd(), 'database', 'seeds'),
    path.join(process.cwd(), 'database'),
    path.join(appRoot, 'database', 'seeds'),
    path.join(appRoot, 'resources', 'database', 'seeds'),
    'd:\\LMS\\database\\seeds',
    'd:\\LMS\\database',
  ];

  if (app && app.getPath) {
    try {
      searchDirs.push(path.join(app.getPath('userData'), 'seeds'));
      searchDirs.push(path.join(process.resourcesPath, 'database', 'seeds'));
    } catch {
      // not yet ready
    }
  }

  // 1. Prioritize saved_report_template.json
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const jsonPath = path.join(dir, 'saved_report_template.json');
    if (fs.existsSync(jsonPath)) {
      return jsonPath;
    }
  }

  // 2. Look for report_template_seed.db
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const dbPath = path.join(dir, 'report_template_seed.db');
    if (fs.existsSync(dbPath)) {
      return dbPath;
    }
  }

  return null;
}

/**
 * Parses a saved template file (.json or .db) and returns high-level inspection metadata.
 */
export function detectSavedTemplate(customPath?: string): SavedTemplateDetectionResult {
  const filePath = findCandidateSavedTemplate(customPath);

  if (!filePath || !fs.existsSync(filePath)) {
    return {
      detected: false,
      filePath: null,
      fileName: null,
      fileSize: 0,
      templateName: '',
      hospitalName: '',
      supervisor: '',
      address: '',
      badgeText: '',
      hasLogo: false,
      logoLength: 0,
      footerText: '',
      footerRightText: '',
      columnsCount: 0,
      error: 'Saved report design seed file (saved_report_template.json or report_template_seed.db) not found.',
    };
  }

  try {
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);

    let templateObj: any = null;

    if (filePath.toLowerCase().endsWith('.json')) {
      const raw = fs.readFileSync(filePath, 'utf8');
      templateObj = JSON.parse(raw);
    } else {
      // Unencrypted SQLite DB file
      const db = new DatabaseConstructor(filePath, { readonly: true, fileMustExist: true });
      const row = db.prepare('SELECT * FROM report_templates WHERE is_active = 1 LIMIT 1').get() ||
                  db.prepare('SELECT * FROM report_templates LIMIT 1').get();
      db.close();

      if (!row) {
        return {
          detected: false,
          filePath,
          fileName,
          fileSize: stats.size,
          templateName: '',
          hospitalName: '',
          supervisor: '',
          address: '',
          badgeText: '',
          hasLogo: false,
          logoLength: 0,
          footerText: '',
          footerRightText: '',
          columnsCount: 0,
          error: 'No template records found in seed database file.',
        };
      }

      templateObj = {
        id: row.id,
        name: row.name,
        active: Boolean(row.is_active),
        ...JSON.parse(row.config_json),
      };
    }

    const header = templateObj.header || {};
    const footer = templateObj.footer || {};
    const logoDataUrl = header.logoDataUrl || '';
    const hasLogo = Boolean(logoDataUrl && logoDataUrl.startsWith('data:image'));

    return {
      detected: true,
      filePath,
      fileName,
      fileSize: stats.size,
      templateName: templateObj.name || 'Al-Shifa Default',
      hospitalName: header.hospitalName || 'AL-SHIFA MEDICAL CENTER',
      supervisor: header.supervisor || 'Dr. Saad Khan',
      address: header.address || '',
      badgeText: header.badgeText || '',
      hasLogo,
      logoLength: logoDataUrl.length,
      footerText: footer.text || '',
      footerRightText: footer.rightText || '',
      columnsCount: Array.isArray(templateObj.columns) ? templateObj.columns.length : 0,
    };
  } catch (err: any) {
    return {
      detected: false,
      filePath,
      fileName: path.basename(filePath),
      fileSize: 0,
      templateName: '',
      hospitalName: '',
      supervisor: '',
      address: '',
      badgeText: '',
      hasLogo: false,
      logoLength: 0,
      footerText: '',
      footerRightText: '',
      columnsCount: 0,
      error: `Failed to inspect template seed file: ${err?.message || 'Unknown error'}`,
    };
  }
}

/**
 * Loads the saved template file (.json or .db) and writes it into the active Electron database,
 * making it the active template and synchronizing hospital branding.
 */
export function applySavedTemplateSeed(
  dbManager: DatabaseManager,
  customPath?: string
): SavedTemplateSeedResult {
  const filePath = findCandidateSavedTemplate(customPath);
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Saved report template seed file not found. Ensure saved_report_template.json exists.');
  }

  let templateObj: any = null;

  if (filePath.toLowerCase().endsWith('.json')) {
    const raw = fs.readFileSync(filePath, 'utf8');
    templateObj = JSON.parse(raw);
  } else {
    const db = new DatabaseConstructor(filePath, { readonly: true, fileMustExist: true });
    const row = db.prepare('SELECT * FROM report_templates WHERE is_active = 1 LIMIT 1').get() ||
                db.prepare('SELECT * FROM report_templates LIMIT 1').get();
    db.close();

    if (!row) {
      throw new Error('No template records found in seed database file.');
    }

    templateObj = {
      id: row.id,
      name: row.name,
      active: true,
      ...JSON.parse(row.config_json),
    };
  }

  const now = new Date().toISOString();
  const templateId = templateObj.id || 'al-shifa-default';
  const templateName = templateObj.name || 'Al-Shifa Default';

  const configJson = JSON.stringify({
    header: templateObj.header,
    patientFields: templateObj.patientFields,
    columns: templateObj.columns,
    observations: templateObj.observations,
    footer: templateObj.footer,
    style: templateObj.style,
  });

  const activeDb = dbManager.getDatabase();

  const tx = activeDb.transaction(() => {
    // 1. Deactivate all other templates
    activeDb.prepare('UPDATE report_templates SET is_active = 0').run();

    // 2. Insert or replace this template
    const existing = activeDb.prepare('SELECT id FROM report_templates WHERE id = ?').get(templateId);
    if (existing) {
      activeDb.prepare(`
        UPDATE report_templates
        SET name = ?, config_json = ?, is_active = 1, updated_at = ?
        WHERE id = ?
      `).run(templateName, configJson, now, templateId);
    } else {
      activeDb.prepare(`
        INSERT INTO report_templates (id, name, config_json, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run(templateId, templateName, configJson, now, now);
    }

    // 3. Synchronize hospital branding with this template
    const header = templateObj.header || {};
    if (header.hospitalName) {
      const hRow = activeDb.prepare('SELECT id FROM hospital_settings LIMIT 1').get() as { id: number } | undefined;
      if (hRow) {
        activeDb.prepare(`
          UPDATE hospital_settings
          SET hospital_name = ?,
              address = COALESCE(?, address),
              phone_primary = COALESCE(?, phone_primary),
              phone_secondary = COALESCE(?, phone_secondary),
              updated_at = ?
          WHERE id = ?
        `).run(
          header.hospitalName,
          header.address || null,
          header.phone || null,
          header.mobile || header.whatsapp || null,
          now,
          hRow.id
        );
      } else {
        activeDb.prepare(`
          INSERT INTO hospital_settings (
            id,
            hospital_name,
            address,
            phone_primary,
            phone_secondary,
            currency_code,
            timezone,
            inactivity_timeout_minutes,
            created_at,
            updated_at
          ) VALUES (1, ?, ?, ?, ?, 'PKR', 'Asia/Karachi', 15, ?, ?)
        `).run(
          header.hospitalName,
          header.address || 'Address',
          header.phone || '0000',
          header.mobile || header.whatsapp || null,
          now,
          now
        );
      }
    }
  });

  tx();

  return {
    templateId,
    templateName,
    hospitalName: templateObj.header?.hospitalName || 'AL-SHIFA MEDICAL CENTER',
    hasLogo: Boolean(templateObj.header?.logoDataUrl && templateObj.header.logoDataUrl.startsWith('data:image')),
    activated: true,
    updatedAt: now,
  };
}
