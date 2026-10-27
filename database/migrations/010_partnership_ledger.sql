-- Migration 010: Comprehensive Partnership Accounting & Settlement Ledger

-- 1. Partnership percentage history (effective-dated profit split)
CREATE TABLE IF NOT EXISTS partnership_percentage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    technician_percentage REAL NOT NULL CHECK (technician_percentage >= 0 AND technician_percentage <= 100),
    investor_percentage REAL NOT NULL CHECK (investor_percentage >= 0 AND investor_percentage <= 100),
    effective_from TEXT NOT NULL, -- YYYY-MM-DD
    reason TEXT,
    changed_by_user_id INTEGER REFERENCES app_users(id),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_partner_pct_date ON partnership_percentage_history(effective_from);

-- 2. Patient collection ledger (Investor vs Technician collections)
CREATE TABLE IF NOT EXISTS lab_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_date TEXT NOT NULL, -- YYYY-MM-DD
    amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
    entry_type TEXT NOT NULL CHECK (entry_type IN ('payment_received', 'patient_bill', 'credit_adjustment')),
    collected_by TEXT NOT NULL CHECK (collected_by IN ('investor', 'technician')),
    notes TEXT,
    recorded_by_user_id INTEGER REFERENCES app_users(id),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lab_collections_date ON lab_collections(collection_date);

-- 3. Partnership expenses ledger with 'paid_by' attribution (Lab funds, Investor personally, Technician personally)
CREATE TABLE IF NOT EXISTS partnership_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_date TEXT NOT NULL, -- YYYY-MM-DD
    category TEXT NOT NULL, -- supplies, equipment, maintenance, rent_utilities, staff, other
    description TEXT NOT NULL,
    amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
    paid_by TEXT NOT NULL DEFAULT 'lab' CHECK (paid_by IN ('lab', 'investor', 'technician')),
    receipt_no TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
    reversal_reason TEXT,
    recorded_by_user_id INTEGER REFERENCES app_users(id),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_part_expenses_date ON partnership_expenses(expense_date);

-- 4. Partner transactions & settlements (with reversible audit log)
CREATE TABLE IF NOT EXISTS partner_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_date TEXT NOT NULL, -- YYYY-MM-DD
    amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
    partner TEXT NOT NULL CHECK (partner IN ('technician', 'investor')),
    payment_type TEXT NOT NULL CHECK (payment_type IN ('profit_distribution', 'advance', 'expense_reimbursement', 'adjustment')),
    payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'other')),
    reference TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
    reversal_reason TEXT,
    reversed_at TEXT,
    reversed_by_user_id INTEGER REFERENCES app_users(id),
    recorded_by_user_id INTEGER REFERENCES app_users(id),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_part_tx_date ON partner_transactions(payment_date);

-- 5. Doctor commission payment tracker (Calculated vs Actually Paid)
CREATE TABLE IF NOT EXISTS doctor_commission_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER NOT NULL REFERENCES doctors(id),
    amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
    payment_date TEXT NOT NULL, -- YYYY-MM-DD
    payment_method TEXT NOT NULL DEFAULT 'cash',
    notes TEXT,
    recorded_by_user_id INTEGER REFERENCES app_users(id),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_comm_pay_date ON doctor_commission_payments(payment_date);

-- 6. Monthly settlements (Closed and frozen month ledger)
CREATE TABLE IF NOT EXISTS monthly_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_key TEXT NOT NULL UNIQUE, -- YYYY-MM
    sales_paisa INTEGER NOT NULL,
    collections_paisa INTEGER NOT NULL,
    doctor_commissions_paisa INTEGER NOT NULL,
    expenses_paisa INTEGER NOT NULL,
    net_profit_paisa INTEGER NOT NULL,
    technician_percentage REAL NOT NULL,
    technician_share_paisa INTEGER NOT NULL,
    investor_share_paisa INTEGER NOT NULL,
    technician_paid_paisa INTEGER NOT NULL,
    investor_paid_paisa INTEGER NOT NULL,
    technician_remaining_paisa INTEGER NOT NULL,
    investor_remaining_paisa INTEGER NOT NULL,
    closed_by_user_id INTEGER REFERENCES app_users(id),
    closed_at TEXT NOT NULL,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_month_settle_key ON monthly_settlements(month_key);

-- 7. Investor capital contributions and returns (optional capital ledger)
CREATE TABLE IF NOT EXISTS investor_capital (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('capital_contribution', 'capital_return')),
    transaction_date TEXT NOT NULL, -- YYYY-MM-DD
    notes TEXT,
    recorded_by_user_id INTEGER REFERENCES app_users(id),
    created_at TEXT NOT NULL
);

-- Seed initial partnership percentage from current hospital settings if available
INSERT OR IGNORE INTO partnership_percentage_history (
    id, technician_percentage, investor_percentage, effective_from, reason, created_at
)
VALUES (1, 50, 50, '2026-01-01', 'Initial partnership agreement', datetime('now'));

