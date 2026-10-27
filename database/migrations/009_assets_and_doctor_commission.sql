-- Migration 009: Assets/Purchases, Doctor Commission, and Owner Profit Tracking

-- 1. Doctor Commission Percentage (defaults to 0%)
ALTER TABLE doctors ADD COLUMN commission_percentage REAL NOT NULL DEFAULT 0;

-- 2. Owner Profit Share Percentage in Hospital Settings (defaults to 50%)
ALTER TABLE hospital_settings ADD COLUMN owner_percentage REAL NOT NULL DEFAULT 50;

-- 3. Laboratory Assets and Purchases Ledger
CREATE TABLE IF NOT EXISTS lab_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    amount_paisa INTEGER NOT NULL CHECK (amount_paisa >= 0),
    purchase_date TEXT NOT NULL,
    invoice_receipt_no TEXT,
    vendor_name TEXT,
    notes TEXT,
    recorded_by_user_id INTEGER REFERENCES app_users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lab_assets_date ON lab_assets(purchase_date);

-- 4. Owner Payouts / Drawings Ledger
CREATE TABLE IF NOT EXISTS owner_payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
    payout_date TEXT NOT NULL,
    notes TEXT,
    recorded_by_user_id INTEGER REFERENCES app_users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_owner_payouts_date ON owner_payouts(payout_date);

