-- Migration 004: Laboratory Results, Final Reports, and Amendments Schema
-- Windows Offline Laboratory Management System

-- 1. TEST RESULTS TABLE
-- Stores observed parameter values for ordered tests with strict precision and range metadata
CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    parameter_id INTEGER NOT NULL REFERENCES test_parameters(id) ON DELETE RESTRICT,
    numeric_value REAL,
    result_value TEXT NOT NULL,
    unit_snapshot TEXT,
    reference_range_display TEXT,
    flag TEXT NOT NULL CHECK (flag IN ('normal', 'low', 'high', 'critical', 'unconfigured')) DEFAULT 'normal',
    status TEXT NOT NULL CHECK (status IN ('pending', 'draft', 'reviewed', 'finalized', 'corrected')) DEFAULT 'draft',
    result_notes TEXT,
    entered_by INTEGER NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    entered_at TEXT NOT NULL,
    reviewed_by INTEGER REFERENCES app_users(id) ON DELETE RESTRICT,
    reviewed_at TEXT,
    finalized_by INTEGER REFERENCES app_users(id) ON DELETE RESTRICT,
    finalized_at TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (order_item_id, parameter_id)
);

CREATE INDEX IF NOT EXISTS idx_results_order_item ON test_results(order_item_id);
CREATE INDEX IF NOT EXISTS idx_results_parameter ON test_results(parameter_id);
CREATE INDEX IF NOT EXISTS idx_results_status ON test_results(status);

-- 2. REPORT SNAPSHOTS TABLE
-- Immutable archive of finalized diagnostic reports for exact historical reproduction
CREATE TABLE IF NOT EXISTS report_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL DEFAULT 1,
    report_number TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('finalized', 'amended')) DEFAULT 'finalized',
    snapshot_json TEXT NOT NULL,
    integrity_hash TEXT NOT NULL,
    finalized_by INTEGER NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    finalized_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (visit_id, version)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_visit ON report_snapshots(visit_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_number ON report_snapshots(report_number);

-- 3. RESULT AMENDMENTS TABLE
-- Audit log of post-finalization modifications, capturing previous values and mandatory clinical reasoning
CREATE TABLE IF NOT EXISTS result_amendments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER NOT NULL REFERENCES test_results(id) ON DELETE RESTRICT,
    previous_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    previous_flag TEXT NOT NULL,
    new_flag TEXT NOT NULL,
    amendment_reason TEXT NOT NULL,
    amended_by INTEGER NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_amendments_result ON result_amendments(result_id);
CREATE INDEX IF NOT EXISTS idx_amendments_created ON result_amendments(created_at);
