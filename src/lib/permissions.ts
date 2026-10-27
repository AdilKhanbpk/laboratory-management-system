import { NavTab } from '../components/layout/Sidebar';
import { SafeUser } from '../types';

/**
 * Checks whether an authenticated user has permission to view a specific navigation tab/module.
 *
 * Rules:
 * - Admin users have access to all modules.
 * - 'dashboard' (overview) is accessible by all authenticated users.
 * - 'developer' portal has its own developer password gate.
 * - If user.permissions is null, undefined, or 'all', access is granted.
 * - Otherwise, user.permissions is a comma-separated list of allowed tab IDs.
 */
export const canUserAccessTab = (tab: NavTab, user: SafeUser | null): boolean => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (tab === 'dashboard') return true;
  if (tab === 'developer') return true;

  if (!user.permissions || user.permissions === 'all') return true;

  const allowed = user.permissions.split(',').map((p) => p.trim());
  if (allowed.includes(tab)) return true;

  // 'report-designer' can also be accessed if the user has 'settings' permission
  if (tab === 'report-designer' && allowed.includes('settings')) return true;

  return false;
};

