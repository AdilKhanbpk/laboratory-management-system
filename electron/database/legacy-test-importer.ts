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
 * Supports both development workspace and packaged installer / portable execution.
 */
export function findCandidateLegacyBackup(customPath?: string): string | null {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const appRoot = app && app.isPackaged ? path.dirname(process.execPath) : process.cwd();
  const searchDirs: string[] = [];

  // 1. Packaged resources directories (NSIS installed app & portable release)
  if (process.resourcesPath) {
    searchDirs.push(path.join(process.resourcesPath, 'database', 'seeds'));
    searchDirs.push(path.join(process.resourcesPath, 'database'));
    searchDirs.push(process.resourcesPath);
  }
  searchDirs.push(path.join(appRoot, 'resources', 'database', 'seeds'));
  searchDirs.push(path.join(appRoot, 'resources', 'database'));
  searchDirs.push(path.join(appRoot, 'resources'));

  // 2. Application root and local workspace directories
  searchDirs.push(path.join(appRoot, 'database', 'seeds'));
  searchDirs.push(path.join(appRoot, 'database'));
  searchDirs.push(appRoot);
  searchDirs.push(path.join(process.cwd(), 'database', 'seeds'));
  searchDirs.push(path.join(process.cwd(), 'database'));
  searchDirs.push(process.cwd());

  // 3. Module bundle relative paths
  searchDirs.push(path.join(__dirname, '../../database/seeds'));
  searchDirs.push(path.join(__dirname, '../database/seeds'));
  searchDirs.push(path.join(__dirname, 'database/seeds'));

  // 4. AppData / UserData paths
  if (app && app.getPath) {
    try {
      searchDirs.push(path.join(app.getPath('userData'), 'seeds'));
      searchDirs.push(path.join(app.getPath('userData'), 'backups'));
      searchDirs.push(app.getPath('userData'));
    } catch {
      // app not ready
    }
  }

  // 5. Fallback paths for known setup drives
  searchDirs.push('d:\\LMS\\database\\seeds');
  searchDirs.push('d:\\LMS');
  searchDirs.push('c:\\LMS\\database\\seeds');
  searchDirs.push('c:\\LMS');

  const knownNames = [
    '20261013130521.bak',
    '20261013130521.BAK',
    'legacy_tests_backup.bak',
    'legacy_tests.bak',
  ];

  // Pass 1: Look for exact known file names in all candidate directories
  for (const dir of searchDirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const name of knownNames) {
      const full = path.join(dir, name);
      if (fs.existsSync(full)) {
        return full;
      }
    }
  }

  // Pass 2: Look for any *.bak or *.BAK in candidate directories
  for (const dir of searchDirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      const bakFiles = files.filter(f => f.toLowerCase().endsWith('.bak'));
      if (bakFiles.length > 0) {
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

export interface LegacyReferenceRangeItem {
  gender: 'all' | 'male' | 'female';
  minAgeDays: number;
  maxAgeDays: number;
  low: number | null;
  high: number | null;
  panicLow?: number | null;
  panicHigh?: number | null;
  displayText: string;
}

/**
 * Parses numeric bounds from normal range strings.
 * Handles '14 --- 16', '4000 - 11000', '< 6.0', '> 10', 'UPTO 20', etc.
 */
export function parseDashNumbers(text: string): { low: number | null; high: number | null } {
  if (!text || typeof text !== 'string') return { low: null, high: null };
  const clean = text.trim();
  if (!clean) return { low: null, high: null };

  const dashMatch = clean.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:[-–—]+|to)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (dashMatch) {
    return { low: parseFloat(dashMatch[1]), high: parseFloat(dashMatch[2]) };
  }

  const upToMatch = clean.match(/(?:<=?|<|upto|up\s*to)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (upToMatch) {
    return { low: null, high: parseFloat(upToMatch[1]) };
  }

  const greaterMatch = clean.match(/(?:>=?|>)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (greaterMatch) {
    return { low: parseFloat(greaterMatch[1]), high: null };
  }

  return { low: null, high: null };
}

/**
 * Parses legacy reference ranges into structured demographic rules:
 * - Male (M) vs Female (F)
 * - Adult (Ad.) vs Child (Ch.) vs Infant
 * - Comprehensive dual display text for report presentation (e.g. "M: 13.0 - 17.0   F: 11.5 - 15.5")
 */
export function parseLegacyReferenceRanges(
  paramName: string,
  rawRange: string | null,
  testName = '',
  _unit: string | null = ''
): LegacyReferenceRangeItem[] {
  const pName = (paramName || '').trim().toUpperCase();
  const tName = (testName || '').trim().toUpperCase();
  const raw = (rawRange || '').trim();

  // 1. Complete Blood Count (CBC) and Hemoglobin standardization (Pakistani & international clinical standard)
  const isCbcOrHb =
    tName.includes('COMPLETE BLOOD') ||
    tName.includes('CBC') ||
    tName.includes('HEMOGLUBIN') ||
    tName === 'HB';

  if (isCbcOrHb || pName === 'HB' || pName === 'HEMOGLUBIN' || pName.startsWith('HEMOGLUBIN (')) {
    if (pName === 'HB' || pName.includes('HEMOGLUBIN')) {
      const display = 'M: 13.0 - 17.0   F: 11.5 - 15.5';
      return [
        { gender: 'male', minAgeDays: 0, maxAgeDays: 47450, low: 13.0, high: 17.0, panicLow: 7.0, panicHigh: 20.0, displayText: display },
        { gender: 'female', minAgeDays: 0, maxAgeDays: 47450, low: 11.5, high: 15.5, panicLow: 7.0, panicHigh: 20.0, displayText: display },
      ];
    }
  }

  if (isCbcOrHb) {
    if (pName === 'RBC' || pName.includes('RED CELLS') || pName.includes('RED BLOOD')) {
      const display = 'M: 4.5 - 5.5   F: 3.8 - 5.2';
      return [
        { gender: 'male', minAgeDays: 0, maxAgeDays: 47450, low: 4.5, high: 5.5, displayText: display },
        { gender: 'female', minAgeDays: 0, maxAgeDays: 47450, low: 3.8, high: 5.2, displayText: display },
      ];
    }
    if (pName === 'HCT' || pName === 'PCV' || pName.includes('HEMATOCRIT')) {
      const display = 'M: 40 - 50   F: 35 - 47';
      return [
        { gender: 'male', minAgeDays: 0, maxAgeDays: 47450, low: 40.0, high: 50.0, displayText: display },
        { gender: 'female', minAgeDays: 0, maxAgeDays: 47450, low: 35.0, high: 47.0, displayText: display },
      ];
    }
    if (pName === 'MCV') {
      const display = 'Ad: 76 - 96   Ch: 80 - 105';
      return [
        { gender: 'all', minAgeDays: 6575, maxAgeDays: 47450, low: 76.0, high: 96.0, displayText: display },
        { gender: 'all', minAgeDays: 0, maxAgeDays: 6574, low: 80.0, high: 105.0, displayText: display },
      ];
    }
    if (pName === 'MCH') {
      const display = 'Ad: 27 - 32   Ch: 24 - 31';
      return [
        { gender: 'all', minAgeDays: 6575, maxAgeDays: 47450, low: 27.0, high: 32.0, displayText: display },
        { gender: 'all', minAgeDays: 0, maxAgeDays: 6574, low: 24.0, high: 31.0, displayText: display },
      ];
    }
    if (pName === 'MCHC') {
      const display = 'Ad: 31 - 34   Ch: 28 - 34';
      return [
        { gender: 'all', minAgeDays: 6575, maxAgeDays: 47450, low: 31.0, high: 34.0, displayText: display },
        { gender: 'all', minAgeDays: 0, maxAgeDays: 6574, low: 28.0, high: 34.0, displayText: display },
      ];
    }
    if (pName === 'WBC' || pName === 'TLC' || pName.includes('WHITE BLOOD')) {
      const parsed = parseDashNumbers(raw || '4.0 - 11.0');
      const display = raw || '4.0 - 11.0';
      return [
        { gender: 'all', minAgeDays: 0, maxAgeDays: 47450, low: parsed.low ?? 4.0, high: parsed.high ?? 11.0, panicLow: 2.0, panicHigh: 30.0, displayText: display },
      ];
    }
    if (pName === 'PLT' || pName.includes('PLATELET')) {
      const parsed = parseDashNumbers(raw || '150 - 450');
      const display = raw || '150 - 450';
      return [
        { gender: 'all', minAgeDays: 0, maxAgeDays: 47450, low: parsed.low ?? 150.0, high: parsed.high ?? 450.0, panicLow: 50.0, panicHigh: 1000.0, displayText: display },
      ];
    }
  }

  // 2. Multi-line or delimiter check in rawRange (Male/Female, Adult/Child)
  if (
    raw &&
    (raw.includes('\n') ||
      raw.includes('\r') ||
      /\b(m:|f:|ad:|ch:|male|female|adult|child|men|women)\b/i.test(raw))
  ) {
    const lines = raw.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    const parsedLines: Array<{
      gender: 'all' | 'male' | 'female';
      minAgeDays: number;
      maxAgeDays: number;
      low: number | null;
      high: number | null;
      lineText: string;
    }> = [];

    for (const line of lines) {
      let gender: 'all' | 'male' | 'female' = 'all';
      let minAgeDays = 0;
      let maxAgeDays = 47450;

      if (/\b(male|men)\b/i.test(line) || /^m\s*[:\-]/i.test(line)) {
        gender = 'male';
      } else if (/\b(female|women)\b/i.test(line) || /^f\s*[:\-]/i.test(line)) {
        gender = 'female';
      }

      if (/\b(adult|adults|ad\.?)\b/i.test(line)) {
        minAgeDays = 6575;
        maxAgeDays = 47450;
      } else if (/\b(child|children|ch\.?)\b/i.test(line)) {
        minAgeDays = 0;
        maxAgeDays = 6574;
      } else if (/\b(newborn|new\s*born|infant)\b/i.test(line)) {
        minAgeDays = 0;
        maxAgeDays = 365;
      }

      const parsed = parseDashNumbers(line);
      parsedLines.push({
        gender,
        minAgeDays,
        maxAgeDays,
        low: parsed.low,
        high: parsed.high,
        lineText: line.replace(/[\r\n]+/g, ' ').trim(),
      });
    }

    if (parsedLines.length > 0) {
      // Create unified display text if male + female or adult + child
      const hasMale = parsedLines.some((p) => p.gender === 'male');
      const hasFemale = parsedLines.some((p) => p.gender === 'female');
      const hasAdult = parsedLines.some((p) => p.minAgeDays >= 6000);
      const hasChild = parsedLines.some((p) => p.maxAgeDays < 6600 && p.minAgeDays === 0);

      let sharedDisplay: string | null = null;
      if (hasMale && hasFemale && parsedLines.length === 2) {
        sharedDisplay = parsedLines.map((p) => p.lineText).join('   ');
      } else if (hasAdult && hasChild && parsedLines.length === 2) {
        sharedDisplay = parsedLines.map((p) => p.lineText).join('   ');
      }

      return parsedLines.map((p) => ({
        gender: p.gender,
        minAgeDays: p.minAgeDays,
        maxAgeDays: p.maxAgeDays,
        low: p.low,
        high: p.high,
        displayText: sharedDisplay || p.lineText || raw,
      }));
    }
  }

  // 3. Single standard range
  const parsed = parseDashNumbers(raw);
  return [
    {
      gender: 'all',
      minAgeDays: 0,
      maxAgeDays: 47450,
      low: parsed.low,
      high: parsed.high,
      displayText: raw,
    },
  ];
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          const ranges = parseLegacyReferenceRanges(paramName, sp.NormalRange, testName, unit);
          const hasNumericRange = ranges.some((r) => r.low !== null || r.high !== null);
          const paramType = hasNumericRange ? 'numeric' : (sp.TestResult ? 'text' : 'numeric');

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

          for (const r of ranges) {
            insertRangeStmt.run(
              paramId,
              r.gender,
              r.minAgeDays,
              r.maxAgeDays,
              r.low,
              r.high,
              r.panicLow ?? null,
              r.panicHigh ?? null,
              r.displayText
            );
          }
        });
      } else {
        // Single parameter test (e.g. Pleural Fluid, Stone Analysis, High Vaginal Swab C/S)
        const pRes = insertParamStmt.run(testId, testName, 1, null, 'text', null);
        const paramId = Number(pRes.lastInsertRowid);
        parametersInserted++;

        insertRangeStmt.run(paramId, 'all', 0, 47450, null, null, null, null, '');
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
 * Wipes all transactional data (patients, doctors, visits, orders, results, invoices, payments, audit logs)
 * AND all tests, parameters, and reference ranges from the active database.
 * Leaves app_users and hospital_settings intact.
 */
export function wipeAllDatabaseData(dbManager: DatabaseManager): { deletedTests: number; deletedParams: number; deletedVisits: number } {
  return dbManager.runTransaction((tx) => {
    const testCount = tx.prepare('SELECT count(*) as c FROM lab_tests').get().c;
    const paramCount = tx.prepare('SELECT count(*) as c FROM test_parameters').get().c;
    const visitCount = tx.prepare('SELECT count(*) as c FROM visits').get().c;

    tx.prepare('DELETE FROM audit_logs').run();
    tx.prepare('DELETE FROM test_results').run();
    tx.prepare('DELETE FROM result_amendments').run();
    tx.prepare('DELETE FROM report_snapshots').run();
    tx.prepare('DELETE FROM order_items').run();
    tx.prepare('DELETE FROM invoices').run();
    tx.prepare('DELETE FROM payments').run();
    tx.prepare('DELETE FROM visits').run();
    tx.prepare('DELETE FROM patients').run();
    tx.prepare('DELETE FROM doctors').run();
    tx.prepare('DELETE FROM parameter_reference_ranges').run();
    tx.prepare('DELETE FROM test_parameters').run();
    tx.prepare('DELETE FROM lab_tests').run();

    try {
      tx.prepare("DELETE FROM sqlite_sequence WHERE name NOT IN ('app_users', 'hospital_settings')").run();
    } catch {
      // Ignore if table not in sqlite_sequence
    }

    return { deletedTests: testCount, deletedParams: paramCount, deletedVisits: visitCount };
  });
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

