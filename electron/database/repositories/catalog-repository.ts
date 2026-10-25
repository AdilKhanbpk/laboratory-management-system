import { DatabaseManager, DatabaseError } from '../connection';

export interface LabTest {
  id: number;
  test_code: string;
  test_name: string;
  category: string;
  description: string | null;
  price_paisa: number;
  sample_type?: string | null;
  collection_container?: string | null;
  patient_preparation?: string | null;
  turnaround_time?: string | null;
  test_method?: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  parameters?: TestParameterWithRanges[];
}

export interface TestParameter {
  id: number;
  test_id: number;
  parameter_name: string;
  display_order: number;
  unit: string | null;
  parameter_type: 'numeric' | 'text' | 'options';
  notes: string | null;
  is_active: number;
}

export interface ParameterReferenceRange {
  id?: number;
  parameter_id?: number;
  gender: 'all' | 'male' | 'female';
  min_age_days: number;
  max_age_days: number;
  normal_low: number | null;
  normal_high: number | null;
  panic_low: number | null;
  panic_high: number | null;
  display_text: string;
}

export interface TestParameterWithRanges extends TestParameter {
  ranges: ParameterReferenceRange[];
}

export interface CreateParameterInput {
  parameter_name: string;
  display_order?: number;
  unit?: string | null;
  parameter_type?: 'numeric' | 'text' | 'options';
  notes?: string | null;
  ranges?: ParameterReferenceRange[];
}

export class CatalogRepository {
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  public getTestByCode(code: string): LabTest | null {
    const db = this.dbManager.getDatabase();
    const row = db.prepare('SELECT * FROM lab_tests WHERE test_code = ? COLLATE NOCASE').get(code.trim());
    return (row as LabTest) || null;
  }

  public getTestById(id: number, includeParameters = true): LabTest | null {
    const db = this.dbManager.getDatabase();
    const testRow = db.prepare('SELECT * FROM lab_tests WHERE id = ?').get(id) as LabTest | undefined;
    if (!testRow) return null;

    if (!includeParameters) {
      return testRow;
    }

    const paramRows = db.prepare(`
      SELECT * FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC
    `).all(id) as TestParameter[];

    const parameters: TestParameterWithRanges[] = paramRows.map((param) => {
      const rangeRows = db.prepare(`
        SELECT * FROM parameter_reference_ranges WHERE parameter_id = ? ORDER BY id ASC
      `).all(param.id) as ParameterReferenceRange[];

      return {
        ...param,
        ranges: rangeRows,
      };
    });

    return {
      ...testRow,
      parameters,
    };
  }

  public createTest(
    testData: {
      testCode: string;
      testName: string;
      category: string;
      description?: string | null;
      pricePaisa: number;
      sampleType?: string | null;
      collectionContainer?: string | null;
      patientPreparation?: string | null;
      turnaroundTime?: string | null;
      testMethod?: string | null;
    },
    parameters: CreateParameterInput[] = []
  ): LabTest {
    if (testData.pricePaisa < 0) {
      throw new DatabaseError('Test price cannot be negative.');
    }

    const existing = this.getTestByCode(testData.testCode);
    if (existing) {
      throw new DatabaseError(`Test code '${testData.testCode}' already exists. Please choose a unique code.`);
    }

    const now = new Date().toISOString();

    return this.dbManager.runTransaction((tx) => {
      const insertTestStmt = tx.prepare(`
        INSERT INTO lab_tests (
          test_code, test_name, category, description, price_paisa,
          sample_type, collection_container, patient_preparation, turnaround_time, test_method,
          is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);

      const result = insertTestStmt.run(
        testData.testCode.trim().toUpperCase(),
        testData.testName.trim(),
        testData.category.trim(),
        testData.description?.trim() || null,
        Math.round(testData.pricePaisa),
        testData.sampleType?.trim() || null,
        testData.collectionContainer?.trim() || null,
        testData.patientPreparation?.trim() || null,
        testData.turnaroundTime?.trim() || null,
        testData.testMethod?.trim() || null,
        now,
        now
      );

      const testId = Number(result.lastInsertRowid);

      // Insert parameters and their reference ranges
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

      parameters.forEach((param, idx) => {
        const paramResult = insertParamStmt.run(
          testId,
          param.parameter_name.trim(),
          param.display_order ?? idx + 1,
          param.unit?.trim() || null,
          param.parameter_type || 'numeric',
          param.notes?.trim() || null
        );

        const paramId = Number(paramResult.lastInsertRowid);

        if (param.ranges && param.ranges.length > 0) {
          for (const range of param.ranges) {
            insertRangeStmt.run(
              paramId,
              range.gender || 'all',
              range.min_age_days ?? 0,
              range.max_age_days ?? 47450,
              range.normal_low ?? null,
              range.normal_high ?? null,
              range.panic_low ?? null,
              range.panic_high ?? null,
              range.display_text.trim()
            );
          }
        }
      });

      return this.getTestById(testId, true)!;
    });
  }

  public updateTest(
    id: number,
    testData: {
      testCode: string;
      testName: string;
      category: string;
      description?: string | null;
      pricePaisa: number;
      sampleType?: string | null;
      collectionContainer?: string | null;
      patientPreparation?: string | null;
      turnaroundTime?: string | null;
      testMethod?: string | null;
      isActive?: number;
    },
    parameters?: CreateParameterInput[]
  ): LabTest {
    if (testData.pricePaisa < 0) {
      throw new DatabaseError('Test price cannot be negative.');
    }

    const current = this.getTestById(id, false);
    if (!current) {
      throw new DatabaseError(`Test record with ID ${id} was not found.`);
    }

    // Check code collision if code was changed
    if (testData.testCode.trim().toUpperCase() !== current.test_code) {
      const codeCheck = this.getTestByCode(testData.testCode);
      if (codeCheck && codeCheck.id !== id) {
        throw new DatabaseError(`Test code '${testData.testCode}' is already in use by another test.`);
      }
    }

    const now = new Date().toISOString();

    return this.dbManager.runTransaction((tx) => {
      tx.prepare(`
        UPDATE lab_tests SET
          test_code = ?,
          test_name = ?,
          category = ?,
          description = ?,
          price_paisa = ?,
          sample_type = ?,
          collection_container = ?,
          patient_preparation = ?,
          turnaround_time = ?,
          test_method = ?,
          is_active = COALESCE(?, is_active),
          updated_at = ?
        WHERE id = ?
      `).run(
        testData.testCode.trim().toUpperCase(),
        testData.testName.trim(),
        testData.category.trim(),
        testData.description?.trim() || null,
        Math.round(testData.pricePaisa),
        testData.sampleType?.trim() || null,
        testData.collectionContainer?.trim() || null,
        testData.patientPreparation?.trim() || null,
        testData.turnaroundTime?.trim() || null,
        testData.testMethod?.trim() || null,
        testData.isActive !== undefined ? testData.isActive : null,
        now,
        id
      );

      // If new parameter list is supplied, update parameter definitions safely without breaking FK constraints
      if (parameters) {
        const existingParams = tx.prepare('SELECT id, parameter_name FROM test_parameters WHERE test_id = ?').all(id) as Array<{ id: number; parameter_name: string }>;
        const existingMap = new Map(existingParams.map((p) => [p.parameter_name.toLowerCase().trim(), p.id]));
        const keptParamIds = new Set<number>();

        const updateParamStmt = tx.prepare(`
          UPDATE test_parameters SET
            parameter_name = ?,
            display_order = ?,
            unit = ?,
            parameter_type = ?,
            notes = ?,
            is_active = 1
          WHERE id = ?
        `);

        const insertParamStmt = tx.prepare(`
          INSERT INTO test_parameters (
            test_id, parameter_name, display_order, unit, parameter_type, notes, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, 1)
        `);

        const deleteRangesStmt = tx.prepare('DELETE FROM parameter_reference_ranges WHERE parameter_id = ?');

        const insertRangeStmt = tx.prepare(`
          INSERT INTO parameter_reference_ranges (
            parameter_id, gender, min_age_days, max_age_days, normal_low, normal_high, panic_low, panic_high, display_text
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        parameters.forEach((param, idx) => {
          const trimmedName = param.parameter_name.trim();
          const existingId = existingMap.get(trimmedName.toLowerCase());
          let paramId: number;

          if (existingId) {
            updateParamStmt.run(
              trimmedName,
              param.display_order ?? idx + 1,
              param.unit?.trim() || null,
              param.parameter_type || 'numeric',
              param.notes?.trim() || null,
              existingId
            );
            paramId = existingId;
            keptParamIds.add(existingId);
            deleteRangesStmt.run(paramId);
          } else {
            const paramResult = insertParamStmt.run(
              id,
              trimmedName,
              param.display_order ?? idx + 1,
              param.unit?.trim() || null,
              param.parameter_type || 'numeric',
              param.notes?.trim() || null
            );
            paramId = Number(paramResult.lastInsertRowid);
            keptParamIds.add(paramId);
          }

          if (param.ranges && param.ranges.length > 0) {
            for (const range of param.ranges) {
              insertRangeStmt.run(
                paramId,
                range.gender || 'all',
                range.min_age_days ?? 0,
                range.max_age_days ?? 47450,
                range.normal_low ?? null,
                range.normal_high ?? null,
                range.panic_low ?? null,
                range.panic_high ?? null,
                range.display_text.trim()
              );
            }
          }
        });

        // For any previous parameters removed in the edit form:
        for (const ep of existingParams) {
          if (!keptParamIds.has(ep.id)) {
            // Check if this parameter is referenced in test_results
            const inUse = tx.prepare('SELECT 1 FROM test_results WHERE parameter_id = ? LIMIT 1').get(ep.id);
            if (inUse) {
              // Soft delete to protect clinical audit history and avoid FK violation
              tx.prepare('UPDATE test_parameters SET is_active = 0 WHERE id = ?').run(ep.id);
            } else {
              deleteRangesStmt.run(ep.id);
              tx.prepare('DELETE FROM test_parameters WHERE id = ?').run(ep.id);
            }
          }
        }
      }

      return this.getTestById(id, true)!;
    });
  }

  public setTestActiveStatus(id: number, isActive: boolean): LabTest {
    const existing = this.getTestById(id, false);
    if (!existing) {
      throw new DatabaseError(`Test with ID ${id} was not found.`);
    }

    const db = this.dbManager.getDatabase();
    const now = new Date().toISOString();

    db.prepare('UPDATE lab_tests SET is_active = ?, updated_at = ? WHERE id = ?').run(
      isActive ? 1 : 0,
      now,
      id
    );

    return this.getTestById(id, true)!;
  }

  public listTests(params: {
    category?: string;
    search?: string;
    includeInactive?: boolean;
  } = {}): LabTest[] {
    const db = this.dbManager.getDatabase();
    const whereClauses: string[] = [];
    const queryParams: any[] = [];

    if (!params.includeInactive) {
      whereClauses.push('is_active = 1');
    }

    if (params.category && params.category !== 'all') {
      whereClauses.push('category = ?');
      queryParams.push(params.category);
    }

    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      whereClauses.push('(test_code LIKE ? OR test_name LIKE ?)');
      queryParams.push(q, q);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    return db.prepare(`
      SELECT * FROM lab_tests
      ${whereSql}
      ORDER BY is_active DESC, category ASC, test_code ASC
    `).all(...queryParams) as LabTest[];
  }

  public getCategories(): string[] {
    const db = this.dbManager.getDatabase();
    const rows = db.prepare('SELECT DISTINCT category FROM lab_tests ORDER BY category ASC').all() as Array<{ category: string }>;
    return rows.map((r) => r.category);
  }
}

