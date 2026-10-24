-- Migration 006: User Permissions and RBAC Support
ALTER TABLE app_users ADD COLUMN permissions TEXT DEFAULT 'all';

