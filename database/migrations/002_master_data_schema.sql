-- Migration: 002_master_data_schema.sql
-- Description: Master data entities: patients, doctors, lab tests, parameters, and reference ranges

CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_mrn TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    date_of_birth TEXT, -- ISO-8601 YYYY-MM-DD
    gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
    phone_number TEXT,
    address TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    specialization TEXT,
    phone_number TEXT,
    clinic_hospital_name TEXT,
    address TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lab_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_code TEXT UNIQUE NOT NULL COLLATE NOCASE,
    test_name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    price_paisa INTEGER NOT NULL CHECK (price_paisa >= 0),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS test_parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id INTEGER NOT NULL REFERENCES lab_tests(id) ON DELETE RESTRICT,
    parameter_name TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 1,
    unit TEXT,
    parameter_type TEXT NOT NULL DEFAULT 'numeric' CHECK (parameter_type IN ('numeric', 'text', 'options')),
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS parameter_reference_ranges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parameter_id INTEGER NOT NULL REFERENCES test_parameters(id) ON DELETE CASCADE,
    gender TEXT NOT NULL CHECK (gender IN ('all', 'male', 'female')),
    min_age_days INTEGER NOT NULL DEFAULT 0,
    max_age_days INTEGER NOT NULL DEFAULT 47450, -- Up to 130 years
    normal_low REAL,
    normal_high REAL,
    panic_low REAL,
    panic_high REAL,
    display_text TEXT NOT NULL
);

-- Indexes for high performance searching
CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(patient_mrn);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone_number);

CREATE INDEX IF NOT EXISTS idx_doctors_name ON doctors(full_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_doctors_active ON doctors(is_active);

CREATE INDEX IF NOT EXISTS idx_tests_code ON lab_tests(test_code);
CREATE INDEX IF NOT EXISTS idx_tests_category ON lab_tests(category);
CREATE INDEX IF NOT EXISTS idx_tests_active ON lab_tests(is_active);

CREATE INDEX IF NOT EXISTS idx_params_test_id ON test_parameters(test_id);
CREATE INDEX IF NOT EXISTS idx_ranges_param_id ON parameter_reference_ranges(parameter_id);

