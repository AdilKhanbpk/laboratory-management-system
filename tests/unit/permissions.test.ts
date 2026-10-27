import { describe, it, expect } from 'vitest';
import { canUserAccessTab } from '../../src/lib/permissions';
import type { SafeUser } from '../../src/types';

describe('Role-Based Access Control: canUserAccessTab', () => {
  const adminUser: SafeUser = {
    id: 1,
    username: 'admin',
    full_name: 'System Admin',
    role: 'admin',
    permissions: null,
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    last_login_at: null,
  };

  const operatorWithLimitedAccess: SafeUser = {
    id: 2,
    username: 'operator.ali',
    full_name: 'Ali Khan',
    role: 'operator',
    permissions: 'new-visit,billing,results',
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    last_login_at: null,
  };

  const operatorWithAllAccess: SafeUser = {
    id: 3,
    username: 'operator.manager',
    full_name: 'Lab Manager',
    role: 'operator',
    permissions: 'all',
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    last_login_at: null,
  };

  it('allows admin users full access to all tabs including settings, audit, backup', () => {
    expect(canUserAccessTab('dashboard', adminUser)).toBe(true);
    expect(canUserAccessTab('settings', adminUser)).toBe(true);
    expect(canUserAccessTab('backup', adminUser)).toBe(true);
    expect(canUserAccessTab('audit', adminUser)).toBe(true);
    expect(canUserAccessTab('doctors', adminUser)).toBe(true);
    expect(canUserAccessTab('report-designer', adminUser)).toBe(true);
    expect(canUserAccessTab('assets', adminUser)).toBe(true);
    expect(canUserAccessTab('my-percentage', adminUser)).toBe(true);
  });

  it('allows all users to view dashboard', () => {
    expect(canUserAccessTab('dashboard', operatorWithLimitedAccess)).toBe(true);
  });

  it('denies limited operator access to unauthorized modules like settings, backup, audit', () => {
    expect(canUserAccessTab('settings', operatorWithLimitedAccess)).toBe(false);
    expect(canUserAccessTab('backup', operatorWithLimitedAccess)).toBe(false);
    expect(canUserAccessTab('audit', operatorWithLimitedAccess)).toBe(false);
    expect(canUserAccessTab('doctors', operatorWithLimitedAccess)).toBe(false);
    expect(canUserAccessTab('assets', operatorWithLimitedAccess)).toBe(false);
    expect(canUserAccessTab('my-percentage', operatorWithLimitedAccess)).toBe(false);
  });

  it('permits limited operator access to authorized modules', () => {
    expect(canUserAccessTab('new-visit', operatorWithLimitedAccess)).toBe(true);
    expect(canUserAccessTab('billing', operatorWithLimitedAccess)).toBe(true);
    expect(canUserAccessTab('results', operatorWithLimitedAccess)).toBe(true);
  });

  it('grants full access when permissions is "all"', () => {
    expect(canUserAccessTab('settings', operatorWithAllAccess)).toBe(true);
    expect(canUserAccessTab('backup', operatorWithAllAccess)).toBe(true);
    expect(canUserAccessTab('results', operatorWithAllAccess)).toBe(true);
  });

  it('returns false when user is null', () => {
    expect(canUserAccessTab('settings', null)).toBe(false);
    expect(canUserAccessTab('dashboard', null)).toBe(false);
  });
});

