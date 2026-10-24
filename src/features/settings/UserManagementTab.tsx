import React, { useState, useEffect, useCallback } from 'react';
import { SafeUser } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Alert } from '../../components/common/Alert';
import { formatDateTime } from '../../lib/utils';
import {
  Users,
  UserPlus,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  PowerOff,
  Edit2,
  Lock,
  User,
  Shield,
  Check,
  X,
} from 'lucide-react';

interface UserManagementTabProps {
  currentUser: SafeUser;
}

const AVAILABLE_MODULES: Array<{ id: string; label: string; description: string }> = [
  { id: 'new-visit', label: 'New Visit & Bill', description: 'Register walk-in patients, order tests, and collect payment' },
  { id: 'billing', label: 'Orders & Invoices', description: 'View previous invoices, print receipts, and record pending balances' },
  { id: 'results', label: 'Specimen & Results', description: 'Accession specimen, enter lab results, review, and finalize reports' },
  { id: 'doctors', label: 'Referring Doctors', description: 'Add, update, and manage referring physicians directory' },
  { id: 'tests', label: 'Test Catalog & Ranges', description: 'Configure tests, profile packages, prices, and reference ranges' },
  { id: 'reports', label: 'Doctor Statistics', description: 'View doctor referral volumes, commissions, and financial metrics' },
  { id: 'backup', label: 'Backup & Recovery', description: 'Create database snapshots and execute restorations' },
  { id: 'audit', label: 'Security Audit Log', description: 'Inspect audit trail of staff actions, logins, and billing modifications' },
  { id: 'settings', label: 'Hospital Settings', description: 'Update laboratory branding, logo, contact headers, and timeouts' },
];

export const UserManagementTab: React.FC<UserManagementTabProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);
  const [passwordTargetUser, setPasswordTargetUser] = useState<SafeUser | null>(null);

  // Form states for Add / Edit
  const [formUsername, setFormUsername] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'operator'>('operator');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const isAdmin = currentUser.role === 'admin';

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await window.electronAPI.users.list();
      if (res.success && res.data) {
        setUsers(res.data);
      } else {
        setErrorMsg(res.error || 'Failed to retrieve users list.');
      }
    } catch {
      setErrorMsg('Error communicating with authentication service.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleOpenAdd = () => {
    setFormUsername('');
    setFormFullName('');
    setFormPassword('');
    setFormRole('operator');
    setFormPermissions(['new-visit', 'billing', 'results']);
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsAddOpen(true);
  };

  const handleOpenEdit = (user: SafeUser) => {
    setEditingUser(user);
    setFormFullName(user.full_name);
    setFormRole(user.role as 'admin' | 'operator');
    if (!user.permissions || user.permissions === 'all') {
      setFormPermissions(AVAILABLE_MODULES.map((m) => m.id));
    } else {
      setFormPermissions(user.permissions.split(',').map((p) => p.trim()));
    }
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleToggleModule = (moduleId: string) => {
    setFormPermissions((prev) =>
      prev.includes(moduleId) ? prev.filter((m) => m !== moduleId) : [...prev, moduleId]
    );
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUsername.trim() || !formFullName.trim() || !formPassword) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }
    if (formPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const permsString = formRole === 'admin' ? 'all' : formPermissions.join(',');
      const res = await window.electronAPI.users.create({
        username: formUsername.trim().toLowerCase(),
        fullName: formFullName.trim(),
        password: formPassword,
        role: formRole,
        permissions: permsString,
      });

      if (res.success) {
        setSuccessMsg(`User account '${formUsername}' created successfully.`);
        setIsAddOpen(false);
        fetchUsers();
      } else {
        setErrorMsg(res.error || 'Failed to create user account.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error occurred while saving new user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!formFullName.trim()) {
      setErrorMsg('Full name cannot be blank.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const permsString = formRole === 'admin' ? 'all' : formPermissions.join(',');
      const res = await window.electronAPI.users.update({
        id: editingUser.id,
        fullName: formFullName.trim(),
        role: formRole,
        permissions: permsString,
      });

      if (res.success) {
        setSuccessMsg(`User '${editingUser.username}' updated successfully.`);
        setEditingUser(null);
        fetchUsers();
      } else {
        setErrorMsg(res.error || 'Failed to update user profile.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error occurred while updating user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (user: SafeUser) => {
    const nextStatus = user.is_active !== 1;
    const confirmText = nextStatus
      ? `Reactivate account '${user.username}'?`
      : `Deactivate account '${user.username}'? The user will be blocked from logging into the workstation.`;

    if (!window.confirm(confirmText)) return;

    try {
      const res = await window.electronAPI.users.toggleActive(user.id, nextStatus);
      if (res.success) {
        setSuccessMsg(`Account '${user.username}' status updated.`);
        fetchUsers();
      } else {
        setErrorMsg(res.error || 'Failed to change user status.');
      }
    } catch {
      setErrorMsg('Error updating user status.');
    }
  };

  const handleOpenPasswordModal = (user: SafeUser) => {
    setPasswordTargetUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSubmitPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTargetUser) return;
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please retype carefully.');
      return;
    }

    setPasswordSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await window.electronAPI.users.updatePassword({
        id: passwordTargetUser.id,
        newPassword,
      });

      if (res.success) {
        setSuccessMsg(`Password for user '${passwordTargetUser.username}' updated successfully.`);
        setPasswordTargetUser(null);
      } else {
        setErrorMsg(res.error || 'Failed to update password.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error updating password.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Messages */}
      {successMsg && (
        <Alert type="success" title="Success">
          {successMsg}
        </Alert>
      )}
      {errorMsg && (
        <Alert type="error" title="Notice">
          {errorMsg}
        </Alert>
      )}

      {/* Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-600" />
            User Accounts & Role-Based Access Control
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Create operator accounts, configure module access permissions, reset passwords, and audit login activity.
          </p>
        </div>

        {isAdmin && (
          <Button size="sm" onClick={handleOpenAdd}>
            <UserPlus className="w-4 h-4 mr-1.5" />
            Add New User
          </Button>
        )}
      </div>

      {/* Users List Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider bg-slate-50/50">
                <th className="py-3 px-4">Operator Name</th>
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Module Permissions</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last Login</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                const permissionsList =
                  u.role === 'admin' || !u.permissions || u.permissions === 'all'
                    ? ['All Modules']
                    : u.permissions.split(',').map((p) => p.trim());

                return (
                  <tr
                    key={u.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      u.is_active === 0 ? 'opacity-50 bg-slate-50/50' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">
                          {u.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span>{u.full_name}</span>
                          {isSelf && (
                            <span className="ml-1.5 px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded text-[10px] font-bold">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-700 whitespace-nowrap">
                      @{u.username}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {u.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <ShieldCheck className="w-3 h-3 text-amber-600" />
                          Administrator
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          <User className="w-3 h-3 text-slate-500" />
                          Operator / Staff
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {permissionsList.map((p) => (
                          <span
                            key={p}
                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200"
                          >
                            {p === 'All Modules'
                              ? 'Full System Access'
                              : AVAILABLE_MODULES.find((m) => m.id === p)?.label || p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {u.is_active === 1 ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="default" className="text-slate-400 bg-slate-100">
                          Disabled
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap text-[11px]">
                      {u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Change Password (available to admin or self) */}
                        {(isAdmin || isSelf) && (
                          <button
                            onClick={() => handleOpenPasswordModal(u)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Update Password"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                        )}

                        {/* Edit Permissions (admin only) */}
                        {isAdmin && (
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            title="Edit Permissions & Role"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Toggle Active (admin only, cannot deactivate self) */}
                        {isAdmin && !isSelf && (
                          <button
                            onClick={() => handleToggleActive(u)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              u.is_active === 1
                                ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={u.is_active === 1 ? 'Disable Account' : 'Enable Account'}
                          >
                            {u.is_active === 1 ? (
                              <PowerOff className="w-4 h-4" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ============================================================== */}
      {/* MODAL: ADD NEW USER                                            */}
      {/* ============================================================== */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-brand-600" />
                Register New System Operator
              </h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAdd} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Muhammad Ali"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ali_reception"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Min 6 characters"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Account Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                >
                  <option value="operator">Operator / Staff (Custom Allowed Modules)</option>
                  <option value="admin">Administrator (Full Unrestricted Access)</option>
                </select>
              </div>

              {formRole === 'operator' && (
                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    Allowed System Modules:
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {AVAILABLE_MODULES.map((m) => {
                      const isChecked = formPermissions.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-brand-50/50 border-brand-300 text-slate-900'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleModule(m.id)}
                            className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <div>
                            <span className="text-xs font-semibold block">{m.label}</span>
                            <span className="text-[10px] text-slate-500 block leading-tight">
                              {m.description}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={isSubmitting}>
                  Create Operator Account
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EDIT USER & PERMISSIONS                                 */}
      {/* ============================================================== */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-brand-600" />
                Edit Access Permissions: @{editingUser.username}
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                >
                  <option value="operator">Operator / Staff (Custom Allowed Modules)</option>
                  <option value="admin">Administrator (Full Unrestricted Access)</option>
                </select>
              </div>

              {formRole === 'operator' && (
                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    Allowed System Modules:
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {AVAILABLE_MODULES.map((m) => {
                      const isChecked = formPermissions.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-brand-50/50 border-brand-300 text-slate-900'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleModule(m.id)}
                            className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <div>
                            <span className="text-xs font-semibold block">{m.label}</span>
                            <span className="text-[10px] text-slate-500 block leading-tight">
                              {m.description}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingUser(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={isSubmitting}>
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CHANGE PASSWORD                                         */}
      {/* ============================================================== */}
      {passwordTargetUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" />
                Change Password: @{passwordTargetUser.username}
              </h3>
              <button
                onClick={() => setPasswordTargetUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitPasswordChange} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPasswordTargetUser(null)}
                  disabled={passwordSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" isLoading={passwordSubmitting}>
                  Update Password
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

