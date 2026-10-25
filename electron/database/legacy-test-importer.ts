import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { DatabaseManager } from './connection';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DatabaseConstructor = require('better-sqlite3-multiple-ciphers');

export interface LegacyTestDetectionResult {
  detected: boolean;
  filePath: string | null;
  fileName: string | null;
  fileSize: number;
  testsCount: number;
  parametersCount: number;
  departmentsCount: number;
  error?: string;
}

export interface LegacyTestImportStats {
  filePath: string;
  testsInserted: number;
  testsUpdated: number;
  totalTests: number;
  parametersInserted: number;
  departmentsFound: number;
}

/**
 * Searches common locations to find the legacy .bak SQLite database.
 */
export function findCandidateLegacyBackup(customPath?: string): string | null {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const appRoot = app.isPackaged ? path.dirname(process.execPath) : process.cwd();
  const searchDirs = [
    appRoot,
    process.cwd(),
    'd:\\LMS',
    path.join(app.getPath('userData'), 'backups'),
  ];

  // 1. Look for known 20261013130521.bak
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const directFile = path.join(dir, '20261013130521.bak');
    if (fs.existsSync(directFile)) {
      return directFile;
    }
  }

  // 2. Look for any *.bak in searchDirs
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      const bakFiles = files.filter(f => f.toLowerCase().endsWith('.bak'));
      if (bakFiles.length > 0) {
        // Return largest or latest .bak
        bakFiles.sort((a, b) => {
          const sA = fs.statSync(path.join(dir, a)).size;
          const sB = fs.statSync(path.join(dir, b)).size;
          return sB - sA;
        });
        return path.join(dir, bakFiles[0]);
      }
    } catch {
      // Ignore directory read errors
    }
  }

  return null;
}

/**
 * Inspects a candidate legacy backup file to count available tests & parameters.
 */
export function detectLegacyTestCatalog(customPath?: string): LegacyTestDetectionResult {
  const filePath = findCandidateLegacyBackup(customPath);
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      detected: false,
      filePath: null,
      fileName: null,
      fileSize: 0,
      testsCount: 0,
      parametersCount: 0,
      departmentsCount: 0,
    };
  }

  try {
    const stat = fs.statSync(filePath);
    const legacyDb = new DatabaseConstructor(filePath, { readonly: true, fileMustExist: true });

    let testsCount = 0;
    let parametersCount = 0;
    let departmentsCount = 0;

    try {
      testsCount = legacyDb.prepare('SELECT count(*) as c FROM MsTests').get().c;
      parametersCount = legacyDb.prepare('SELECT count(*) as c FROM DtlTests').get().c;
      departmentsCount = legacyDb.prepare('SELECT count(*) as c FROM Departments').get().c;
    } catch (e: any) {
      legacyDb.close();
      return {
        detected: false,
        filePath,
        fileName: path.basename(filePath),
        fileSize: stat.size,
        testsCount: 0,
        parametersCount: 0,
        departmentsCount: 0,
        error: `File is not a valid legacy laboratory database: ${e.message}`,
      };
    }

    legacyDb.close();

    return {
      detected: testsCount > 0,
      filePath,
      fileName: path.basename(filePath),
      fileSize: stat.size,
      testsCount,
      parametersCount,
      departmentsCount,
    };
  } catch (err: any) {
    return {
      detected: false,
      filePath,
      fileName: path.basename(filePath),
      fileSize: 0,
      testsCount: 0,
      parametersCount: 0,
      departmentsCount: 0,
      error: err?.message || 'Failed to inspect file.',
    };
  }
}

/**
 * Helper to clean and sanitize test codes for strict uniqueness and regex validation.
 */
function sanitizeTestCode(rawCode: string | null, testName: string, id: number, assignedCodes: Set<string>): string {
  let base = (rawCode || '').trim()
    .replace(/[^a-zA-Z0-9_\-\.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase();

  if (!base) {
    base = (testName || '').trim()
      .replace(/[^a-zA-Z0-9_\-\.]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toUpperCase();
  }

  if (!base) base = `TEST-${id}`;
  base = base.substring(0, 24);

  let candidate = base;
  let counter = 2;
  while (assignedCodes.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter++;
  }

  assignedCodes.add(candidate);
  return candidate;
}

/**
 * Parses numeric bounds from normal range strings.
 */
function parseNormalRange(text: string | null): { low: number | null; high: number | null; text: string } {
  if (!text || typeof text !== 'string') return { low: null, high: null, text: '' };
  const clean = text.trim();
  if (!clean) return { low: null, high: null, text: '' };

  // Match e.g. '14 --- 16' or '4000 - 11000' or '0.5 to 1.5'
  const dashMatch = clean.match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:[-–—]+|to)\s*([0-9]+(?:\.[0-9]+)?)$/i);
  if (dashMatch) {
    return { low: parseFloat(dashMatch[1]), high: parseFloat(dashMatch[2]), text: clean };
  }

  // Match '< 6.0' or '<= 6' or 'UPTO 20' or 'UP TO 20'
  const upToMatch = clean.match(/^(?:<=?|<|upto|up\s*to)\s*([0-9]+(?:\.[0-9]+)?)$/i);
  if (upToMatch) {
    return { low: null, high: parseFloat(upToMatch[1]), text: clean };
  }

  // Match '> 10' or '>= 10'
  const greaterMatch = clean.match(/^(?:>=?|>)\s*([0-9]+(?:\.[0-9]+)?)$/i);
  if (greaterMatch) {
    return { low: parseFloat(greaterMatch[1]), high: null, text: clean };
  }

  return { low: null, high: null, text: clean };
}

/**
 * Executes a one-click import of all tests and clinical parameters from the legacy backup database.
 */
export function importLegacyTestsToActiveDatabase(
  dbManager: DatabaseManager,
  customFilePath?: string
): LegacyTestImportStats {
  const filePath = findCandidateLegacyBackup(customFilePath);
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('No candidate legacy backup file (.bak) found to import tests from.');
  }

  // Open legacy database in readonly mode
  const legacyDb = new DatabaseConstructor(filePath, { readonly: true, fileMustExist: true });

  let msTests: any[] = [];
  let dtlTests: any[] = [];
  let depts: any[] = [];

  try {
    depts = legacyDb.prepare('SELECT DepartmentID, DepartmentName FROM Departments').all();
    msTests = legacyDb.prepare('SELECT * FROM MsTests ORDER BY MsTestID ASC').all();
    dtlTests = legacyDb.prepare('SELECT * FROM DtlTests ORDER BY MsTestID ASC, [Order] ASC, DtlTestID ASC').all();
  } finally {
    legacyDb.close();
  }

  if (msTests.length === 0) {
    throw new Error('The selected backup file contains 0 test definitions.');
  }

  // Build department lookup
  const deptMap: Record<number, string> = {};
  depts.forEach(d => {
    deptMap[d.DepartmentID] = d.DepartmentName;
  });

  // Group sub-parameters by MsTestID
  const dtlByMs: Record<number, any[]> = {};
  dtlTests.forEach(d => {
    if (!dtlByMs[d.MsTestID]) dtlByMs[d.MsTestID] = [];
    dtlByMs[d.MsTestID].push(d);
  });

  const assignedCodes = new Set<string>();
  const now = new Date().toISOString();

  let testsInserted = 0;
  let testsUpdated = 0;
  let parametersInserted = 0;

  // Execute import inside an atomic transaction on the active LMS database
  dbManager.runTransaction((tx) => {
    // Collect existing test codes to avoid colliding with already registered custom tests
    const existingRows = tx.prepare('SELECT test_code FROM lab_tests').all() as { test_code: string }[];
    const existingCodeSet = new Set(existingRows.map(r => r.test_code.toUpperCase()));

    const checkTestStmt = tx.prepare('SELECT id FROM lab_tests WHERE test_code = ? COLLATE NOCASE');
    const updateTestStmt = tx.prepare(`
      UPDATE lab_tests
      SET test_name = ?, category = ?, description = ?, price_paisa = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `);
    const insertTestStmt = tx.prepare(`
      INSERT INTO lab_tests (
        test_code, test_name, category, description, price_paisa, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Parameter cleanup and insertion statements
    const deleteParamsStmt = tx.prepare('DELETE FROM test_parameters WHERE test_id = ?');
    const insertParamStmt = tx.prepare(`
      INSERT INTO test_parameters (
        test_id, parameter_name, display_order, unit, parameter_type, notes, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    const insertRangeStmt = tx.prepare(`
      INSERT INTO parameter_reference_ranges (
        parameter_id, gender, min_age_days, max_age_days, normal_low, normal_high, panic_low, panic_high, display_text
      ) VALUES (?, 'all', 0, 47450, ?, ?, null, null, ?)
    `);

    for (const t of msTests) {
      // Clean code and resolve duplicates
      const code = sanitizeTestCode(t.Code, t.TestName, t.MsTestID, assignedCodes);
      const category = (deptMap[t.DepartmentID] || 'General').trim();
      const pricePaisa = Math.max(0, Math.round((t.Fees || 0) * 100));
      const isActive = t.Status === 'Deleted' ? 0 : 1;
      const testName = (t.TestName || '').trim();
      const description = t.Comments?.trim() || null;

      const existingTest = checkTestStmt.get(code) as { id: number } | undefined;
      let testId: number;

      if (existingTest) {
        testId = existingTest.id;
        updateTestStmt.run(testName, category, description, pricePaisa, isActive, now, testId);
        // Clear old parameters to re-insert fresh
        deleteParamsStmt.run(testId);
        testsUpdated++;
      } else {
        const res = insertTestStmt.run(code, testName, category, description, pricePaisa, isActive, now, now);
        testId = Number(res.lastInsertRowid);
        testsInserted++;
      }

      // Insert parameters
      const subParams = dtlByMs[t.MsTestID] || [];
      if (subParams.length > 0) {
        subParams.forEach((sp, idx) => {
          const paramName = (sp.Parameter || testName).trim();
          const unit = (sp.Unit || '').trim() || null;
          const rangeInfo = parseNormalRange(sp.NormalRange);
          const isNumeric = rangeInfo.low !== null || rangeInfo.high !== null;
          const paramType = isNumeric ? 'numeric' : (sp.TestResult ? 'text' : 'numeric');

          const pRes = insertParamStmt.run(
            testId,
            paramName,
            sp.Order != null && !isNaN(Number(sp.Order)) ? Number(sp.Order) : idx + 1,
            unit,
            paramType,
            null
          );
          const paramId = Number(pRes.lastInsertRowid);
          parametersInserted++;

          insertRangeStmt.run(paramId, rangeInfo.low, rangeInfo.high, rangeInfo.text);
        });
      } else {
        // Single parameter test (e.g. Pleural Fluid, Stone Analysis, High Vaginal Swab C/S)
        const pRes = insertParamStmt.run(testId, testName, 1, null, 'text', null);
        const paramId = Number(pRes.lastInsertRowid);
        parametersInserted++;

        insertRangeStmt.run(paramId, null, null, '');
      }
    }
  });

  return {
    filePath,
    testsInserted,
    testsUpdated,
    totalTests: testsInserted + testsUpdated,
    parametersInserted,
    departmentsFound: depts.length,
  };
}

/**
 * Wipes all tests, parameters, and reference ranges from the active catalog.
 */
export function clearAllCatalogTests(dbManager: DatabaseManager): { deletedTests: number; deletedParams: number } {
  return dbManager.runTransaction((tx) => {
    const testCount = tx.prepare('SELECT count(*) as c FROM lab_tests').get().c;
    const paramCount = tx.prepare('SELECT count(*) as c FROM test_parameters').get().c;

    tx.prepare('DELETE FROM parameter_reference_ranges').run();
    tx.prepare('DELETE FROM test_parameters').run();
    tx.prepare('DELETE FROM lab_tests').run();
    try {
      tx.prepare("DELETE FROM sqlite_sequence WHERE name IN ('lab_tests', 'test_parameters', 'parameter_reference_ranges')").run();
    } catch {
      // Ignore if table not in sqlite_sequence
    }

    return { deletedTests: testCount, deletedParams: paramCount };
  });
}

