-- Migration 008: Report Templates Table
CREATE TABLE IF NOT EXISTS report_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_report_template
ON report_templates(is_active) WHERE is_active = 1;

