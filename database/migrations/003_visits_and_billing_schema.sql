-- Migration 003: Visits, Orders, Invoices, and Payments Schema
-- Windows Offline Laboratory Management System

-- 1. VISITS TABLE
-- Represents patient laboratory admissions / encounters
CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_number TEXT UNIQUE NOT NULL,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    referring_doctor_id INTEGER REFERENCES doctors(id) ON DELETE RESTRICT,
    order_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('registered', 'in_progress', 'completed', 'cancelled')) DEFAULT 'registered',
    operator_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visits_number ON visits(visit_number);
CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_doctor ON visits(referring_doctor_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(order_date);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);

-- 2. ORDER ITEMS TABLE
-- Stores tests ordered within a visit with historical price & test metadata snapshots
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    test_id INTEGER NOT NULL REFERENCES lab_tests(id) ON DELETE RESTRICT,
    test_code_snapshot TEXT NOT NULL,
    test_name_snapshot TEXT NOT NULL,
    price_snapshot INTEGER NOT NULL CHECK (price_snapshot >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0) DEFAULT 1,
    subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount >= 0),
    status TEXT NOT NULL CHECK (status IN ('ordered', 'sample_collected', 'in_progress', 'completed', 'cancelled')) DEFAULT 'ordered',
    created_at TEXT NOT NULL,
    UNIQUE (visit_id, test_id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_visit ON order_items(visit_id);
CREATE INDEX IF NOT EXISTS idx_order_items_test ON order_items(test_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);

-- 3. INVOICES TABLE
-- 1:1 financial ledger entry for each visit
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE NOT NULL,
    visit_id INTEGER UNIQUE NOT NULL REFERENCES visits(id) ON DELETE RESTRICT,
    subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount >= 0),
    discount_type TEXT NOT NULL CHECK (discount_type IN ('none', 'fixed', 'percentage')) DEFAULT 'none',
    discount_value INTEGER NOT NULL CHECK (discount_value >= 0) DEFAULT 0,
    discount_amount INTEGER NOT NULL CHECK (discount_amount >= 0) DEFAULT 0,
    final_total INTEGER NOT NULL CHECK (final_total >= 0),
    paid_amount INTEGER NOT NULL CHECK (paid_amount >= 0) DEFAULT 0,
    balance_amount INTEGER NOT NULL CHECK (balance_amount >= 0),
    payment_status TEXT NOT NULL CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'refunded', 'void')) DEFAULT 'unpaid',
    created_at TEXT NOT NULL,
    finalized_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_visit ON invoices(visit_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);

-- 4. PAYMENTS TABLE
-- Immutable transaction ledger for receipts against invoices
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT UNIQUE NOT NULL,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    amount INTEGER NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'credit_card', 'debit_card', 'bank_transfer', 'cheque', 'other')) DEFAULT 'cash',
    transaction_reference TEXT,
    operator_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('cleared', 'reversed')) DEFAULT 'cleared',
    reversal_reason TEXT,
    reversed_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_receipt ON payments(receipt_number);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
