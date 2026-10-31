-- Migration 012: Doctor Payouts & Commission Settlement Enhancements
ALTER TABLE doctor_commission_payments ADD COLUMN reference TEXT;
ALTER TABLE doctor_commission_payments ADD COLUMN updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_doc_comm_pay_doc ON doctor_commission_payments(doctor_id);

