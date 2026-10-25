import React, { useState, useEffect, useCallback } from 'react';
import { SafeUser } from '../../types';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { formatDateTime } from '../../lib/utils';
import { UserPlus, X } from 'lucide-react';

/*
 * Same tokens as the rest of the app: primary #0F766E / #115E59, text #1F2937,
 * muted #64748B, border #E2E8F0, success #15803D, error #DC2626. Radius 8px, no shadows.
 */

interface UserManagementTabProps {
  currentUser: SafeUser;
}

const AVAILABLE_MODULES: Array<{ id: string; label: string; description: string }> = [
  { id: 'new-visit', label: 'New visit and bill', description: 'Register walk-in patients, order tests and collect payment' },
  { id: 'billing', label: 'Orders and invoices', description: 'View invoices, print receipts and record pending balances' },
  { id: 'results', label: 'Specimens and results', description: 'Accession specimens, enter results, review and finalize reports' },
  { id: 'doctors', label: 'Referring doctors', description: 'Add and update the referring doctor directory' },
  { id: 'tests', label: 'Test catalog and ranges', description: 'Set up tests, packages, prices and reference ranges' },
  { id: 'reports', label: 'Doctor statistics', description: 'View referral volumes and financial totals by doctor' },
  { id: 'backup', label: 'Backup and recovery', description: 'Create database backups and restore them' },
  { id: 'audit', label: 'Audit log', description: 'See staff sign-ins and billing changes' },
  { id: 'settings', label: 'Settings', description: 'Change laboratory details, logo and screen lock time' },
];

const inputCls =
  'h-9 w-full px-3 rounded-lg border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] placeholder:text-slate-400 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]';

const linkBtn =
  'text-[13px] font-medium rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]';

/** Shared dialog frame: title, body, Escape to close. */
const Modal: React.FC<{
  title: string;
  onClose: () => void;
  widthClass?: string;
  children: React.ReactNode;
}> = ({ title, onClose, widthClass = 'max-w-lg', children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`bg-white rounded-lg border border-[#E2E8F0] w-full ${widthClass} max-h-[92vh] flex flex-col overflow-hidden text-[#1F2937]`}
      >
        <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between shrink-0">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-[#64748B] hover:bg-slate-100 hover:text-[#1F2937] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const FieldLabel: React.FC<{ htmlFor: string; children: React.ReactNode }> = ({
  htmlFor,
  children,
}) => (
  <label htmlFor={htmlFor} className="block text-[13px] font-medium mb-1">
    {children}
  </label>
);

export const UserManagementTab: React.FC<UserManagementTabProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);
  const [passwordTargetUser, setPasswordTargetUser] = useState<SafeUser | null>(null);

  const [formUsername, setFormUsername] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'operator'>('operator');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const isAdmin = currentUser.role === 'admin';
  const anyModalOpen = isAddOpen || !!editingUser || !!passwordTargetUser;

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await window.electronAPI.users.list();
      if (res.success && res.data) {
        setUsers(res.data);
      } else {
        setErrorMsg(res.error || 'Could not load the user list.');
      }
    } catch {
      setErrorMsg('Could not reach the sign-in service.');
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
      setErrorMsg('Fill in the name, username and password.');
      return;
    }
    if (formPassword.length < 6) {
      setErrorMsg('The password must be at least 6 characters.');
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
        setSuccessMsg(`Account “${formUsername.trim().toLowerCase()}” created.`);
        setIsAddOpen(false);
        fetchUsers();
      } else {
        setErrorMsg(res.error || 'Could not create the account.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Something went wrong while creating the account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!formFullName.trim()) {
      setErrorMsg('The full name can’t be empty.');
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
        setSuccessMsg(`Account “${editingUser.username}” updated.`);
        setEditingUser(null);
        fetchUsers();
      } else {
        setErrorMsg(res.error || 'Could not update the account.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Something went wrong while updating the account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (user: SafeUser) => {
    const nextStatus = user.is_active !== 1;
    const confirmText = nextStatus
      ? `Turn on account “${user.username}”?`
      : `Turn off account “${user.username}”? This user will no longer be able to sign in.`;

    if (!window.confirm(confirmText)) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await window.electronAPI.users.toggleActive(user.id, nextStatus);
      if (res.success) {
        setSuccessMsg(`Account “${user.username}” is now ${nextStatus ? 'active' : 'disabled'}.`);
        fetchUsers();
      } else {
        setErrorMsg(res.error || 'Could not change the account status.');
      }
    } catch {
      setErrorMsg('Something went wrong while changing the account status.');
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
      setErrorMsg('The new password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('The two passwords don’t match.');
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
        setSuccessMsg(`Password changed for “${passwordTargetUser.username}”.`);
        setPasswordTargetUser(null);
      } else {
        setErrorMsg(res.error || 'Could not change the password.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Something went wrong while changing the password.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const closeModals = () => {
    setIsAddOpen(false);
    setEditingUser(null);
    setPasswordTargetUser(null);
    setErrorMsg(null);
  };

  /** Role select and module checklist, used by both Add and Edit. */
  const accessFields = (
    <>
      <div>
        <FieldLabel htmlFor="user-role">Role</FieldLabel>
        <select
          id="user-role"
          value={formRole}
          onChange={(e) => setFormRole(e.target.value as 'admin' | 'operator')}
          className={inputCls}
        >
          <option value="operator">Staff (choose which modules)</option>
          <option value="admin">Administrator (everything)</option>
        </select>
      </div>

      {formRole === 'operator' ? (
        <fieldset>
          <div className="flex items-baseline justify-between mb-1">
            <legend className="text-[13px] font-medium">Modules this user can open</legend>
            <span className="text-[13px]">
              <button
                type="button"
                className={`${linkBtn} text-[#0F766E] hover:text-[#115E59]`}
                onClick={() => setFormPermissions(AVAILABLE_MODULES.map((m) => m.id))}
              >
                Select all
              </button>
              <span className="text-[#CBD5E1] mx-2">|</span>
              <button
                type="button"
                className={`${linkBtn} text-[#0F766E] hover:text-[#115E59]`}
                onClick={() => setFormPermissions([])}
              >
                Clear
              </button>
            </span>
          </div>
          <div className="border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0] max-h-56 overflow-y-auto">
            {AVAILABLE_MODULES.map((m) => (
              <label
                key={m.id}
                className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-[#F8FAFC]"
              >
                <input
                  type="checkbox"
                  checked={formPermissions.includes(m.id)}
                  onChange={() => handleToggleModule(m.id)}
                  className="mt-0.5 h-4 w-4 rounded border-[#CBD5E1] accent-[#0F766E]"
                />
                <span>
                  <span className="block text-[13px] font-medium leading-5">{m.label}</span>
                  <span className="block text-xs text-[#64748B] leading-4">{m.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-[13px] text-[#64748B]">
          Administrators can open every module, including settings and user accounts.
        </p>
      )}
    </>
  );

  const modalFooter = (
    submitLabel: string,
    loading: boolean
  ) => (
    <div className="px-5 py-3 border-t border-[#E2E8F0] flex justify-end gap-2 shrink-0">
      <Button type="button" variant="outline" size="sm" onClick={closeModals} disabled={loading}>
        Cancel
      </Button>
      <Button
        type="submit"
        size="sm"
        isLoading={loading}
        className="bg-[#0F766E] hover:bg-[#115E59]"
      >
        {submitLabel}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4 text-[#1F2937]">
      {/* Messages (errors show inside an open dialog instead) */}
      {successMsg && <Alert type="success">{successMsg}</Alert>}
      {errorMsg && !anyModalOpen && <Alert type="error">{errorMsg}</Alert>}

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Users and access</h2>
          <p className="text-[13px] text-[#64748B] mt-0.5">
            Who can sign in to this workstation and which modules they can open.
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={handleOpenAdd} className="bg-[#0F766E] hover:bg-[#115E59]">
            <UserPlus className="w-4 h-4 mr-1.5" />
            Add user
          </Button>
        )}
      </div>

      {/* Users table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
            <tr className="text-left font-semibold">
              {['Name', 'Role', 'Modules', 'Status', 'Last sign-in', ''].map((h, i) => (
                <th
                  key={h || 'actions'}
                  scope="col"
                  className={`px-3 py-2.5 border-r border-[#E2E8F0] last:border-r-0 ${
                    i === 5 ? 'text-right' : ''
                  }`}
                >
                  {h || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-[#64748B]">
                  Loading users…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-[#64748B]">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUser.id;
                const isDisabled = u.is_active !== 1;
                const isFullAccess =
                  u.role === 'admin' || !u.permissions || u.permissions === 'all';
                const moduleLabels = isFullAccess
                  ? []
                  : u.permissions!
                      .split(',')
                      .map((p) => p.trim())
                      .map((p) => AVAILABLE_MODULES.find((m) => m.id === p)?.label || p);

                const cell =
                  'px-3 py-2.5 align-top border-r border-[#E2E8F0] last:border-r-0';

                return (
                  <tr
                    key={u.id}
                    className={`border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F8FAFC] ${
                      isDisabled ? 'text-[#64748B]' : ''
                    }`}
                  >
                    <td className={cell}>
                      <div className="font-medium">
                        {u.full_name}
                        {isSelf && (
                          <span className="ml-2 text-xs font-normal text-[#0F766E]">You</span>
                        )}
                      </div>
                      <div className="text-xs text-[#64748B]">{u.username}</div>
                    </td>

                    <td className={cell}>{u.role === 'admin' ? 'Administrator' : 'Staff'}</td>

                    <td className={cell}>
                      {isFullAccess ? (
                        'All modules'
                      ) : moduleLabels.length === 0 ? (
                        <span className="text-[#64748B]">None</span>
                      ) : (
                        <span title={moduleLabels.join(', ')}>
                          {moduleLabels.slice(0, 2).join(', ')}
                          {moduleLabels.length > 2 && (
                            <span className="text-[#64748B]">
                              {' '}
                              +{moduleLabels.length - 2} more
                            </span>
                          )}
                        </span>
                      )}
                    </td>

                    <td className={cell}>
                      <span className={isDisabled ? '' : 'text-[#15803D]'}>
                        {isDisabled ? 'Disabled' : 'Active'}
                      </span>
                    </td>

                    <td className={`${cell} text-[#64748B] whitespace-nowrap`}>
                      {u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}
                    </td>

                    <td className={`${cell} text-right whitespace-nowrap`}>
                      <div className="flex items-center justify-end gap-4">
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(u)}
                            className={`${linkBtn} text-[#0F766E] hover:text-[#115E59]`}
                          >
                            Edit
                          </button>
                        )}
                        {(isAdmin || isSelf) && (
                          <button
                            type="button"
                            onClick={() => handleOpenPasswordModal(u)}
                            className={`${linkBtn} text-[#0F766E] hover:text-[#115E59]`}
                          >
                            Password
                          </button>
                        )}
                        {isAdmin && !isSelf && (
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            className={`${linkBtn} ${
                              isDisabled
                                ? 'text-[#0F766E] hover:text-[#115E59]'
                                : 'text-[#DC2626] hover:text-[#B91C1C]'
                            }`}
                          >
                            {isDisabled ? 'Enable' : 'Disable'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add user */}
      {isAddOpen && (
        <Modal title="Add user" onClose={closeModals}>
          <form onSubmit={handleSubmitAdd} className="flex flex-col min-h-0" noValidate>
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              {errorMsg && <Alert type="error">{errorMsg}</Alert>}

              <div>
                <FieldLabel htmlFor="new-fullname">Full name</FieldLabel>
                <input
                  id="new-fullname"
                  type="text"
                  autoFocus
                  placeholder="Muhammad Ali"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="new-username">Username</FieldLabel>
                  <input
                    id="new-username"
                    type="text"
                    autoComplete="off"
                    placeholder="ali.reception"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="new-password">Password</FieldLabel>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {accessFields}
            </div>
            {modalFooter('Create account', isSubmitting)}
          </form>
        </Modal>
      )}

      {/* Edit user */}
      {editingUser && (
        <Modal title={`Edit ${editingUser.username}`} onClose={closeModals}>
          <form onSubmit={handleSubmitEdit} className="flex flex-col min-h-0" noValidate>
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              {errorMsg && <Alert type="error">{errorMsg}</Alert>}

              <div>
                <FieldLabel htmlFor="edit-fullname">Full name</FieldLabel>
                <input
                  id="edit-fullname"
                  type="text"
                  autoFocus
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  className={inputCls}
                />
              </div>

              {accessFields}
            </div>
            {modalFooter('Save changes', isSubmitting)}
          </form>
        </Modal>
      )}

      {/* Change password */}
      {passwordTargetUser && (
        <Modal
          title={`Change password for ${passwordTargetUser.username}`}
          onClose={closeModals}
          widthClass="max-w-sm"
        >
          <form onSubmit={handleSubmitPasswordChange} className="flex flex-col min-h-0" noValidate>
            <div className="px-5 py-4 space-y-4">
              {errorMsg && <Alert type="error">{errorMsg}</Alert>}

              <div>
                <FieldLabel htmlFor="pw-new">New password</FieldLabel>
                <input
                  id="pw-new"
                  type="password"
                  autoFocus
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <FieldLabel htmlFor="pw-confirm">Confirm new password</FieldLabel>
                <input
                  id="pw-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            {modalFooter('Change password', passwordSubmitting)}
          </form>
        </Modal>
      )}
    </div>
  );
};