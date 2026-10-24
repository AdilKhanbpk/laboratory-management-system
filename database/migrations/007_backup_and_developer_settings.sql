-- Migration 007: Default Backup Path Persistence
ALTER TABLE hospital_settings ADD COLUMN default_backup_path TEXT;

