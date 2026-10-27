-- Migration 011: Add purchaser details to lab_assets
ALTER TABLE lab_assets ADD COLUMN purchased_by TEXT NOT NULL DEFAULT 'technician';
ALTER TABLE lab_assets ADD COLUMN purchaser_name TEXT;

