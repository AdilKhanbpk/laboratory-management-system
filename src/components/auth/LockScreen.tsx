import React, { useState } from 'react';
import { Lock, AlertCircle, Loader2 } from 'lucide-react';
import type { SafeUser } from '../../types';

/*
 * Same tokens as the rest of the app:
 *   primary #0F766E / hover #115E59, overlay #111827, surface #FFFFFF,
 *   text #1F2937, muted #64748B, border #E2E8F0 (inputs #CBD5E1), error #DC2626.
 */

interface LockScreenProps {
  user: SafeUser;
  onUnlock: () => void;
  onLogout: () => void;
}

const inputClass =
  'block w-full h-10 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] ' +
  'placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]';

export const LockScreen: React.FC<LockScreenProps> = ({ user, onUnlock, onLogout }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter your password.');
      return;
    }

    setIsUnlocking(true);
    setError(null);

    try {
      const res = await window.electronAPI.auth.unlock({ password });
      if (!res.success) {
        setError(res.error || 'Incorrect password.');
        setIsUnlocking(false);
        return;
      }

      onUnlock();
    } catch {
      setError('Unlock verification failed.');
      setIsUnlocking(false);
    }
  };

  const initials = user.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    // Opaque overlay: patient data behind a locked session must not show through.
    <div className="fixed inset-0 z-50 bg-[#111827] flex items-center justify-center p-6 select-text">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-title"
        className="w-full max-w-sm bg-white rounded-lg border border-[#E2E8F0] text-[#1F2937]"
      >
        <div className="px-6 pt-6 pb-5 border-b border-[#E2E8F0]">
          <div className="w-9 h-9 rounded-md bg-[#F1F5F9] flex items-center justify-center">
            <Lock className="w-4 h-4 text-[#1F2937]" />
          </div>
          <h2 id="lock-title" className="mt-4 text-xl font-semibold">
            Workstation locked
          </h2>
          <p className="mt-1 text-[13px] text-[#64748B]">
            Locked after inactivity or by the operator. Enter your password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="w-9 h-9 rounded-full bg-[#F1F5F9] text-[#1F2937] text-xs font-semibold flex items-center justify-center shrink-0"
            >
              {initials}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="text-[13px] font-medium truncate">{user.full_name}</p>
              <p className="text-xs text-[#64748B] truncate">
                {user.username}, <span className="capitalize">{user.role}</span>
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex gap-3 rounded-lg border border-[#E2E8F0] border-l-4 border-l-[#DC2626] bg-white px-4 py-3"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#DC2626]" />
              <div>
                <p className="text-[13px] font-semibold">Could not unlock</p>
                <p className="text-[13px] text-[#64748B] mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="unlock-password" className="block text-[13px] font-medium mb-1.5">
              Password
            </label>
            <input
              id="unlock-password"
              type="password"
              autoFocus
              autoComplete="current-password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={isUnlocking}
              className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-md bg-[#0F766E] text-[13px] font-medium text-white hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 disabled:bg-[#94A3B8] disabled:cursor-not-allowed"
            >
              {isUnlocking && <Loader2 className="w-4 h-4 animate-spin" />}
              {isUnlocking ? 'Unlocking…' : 'Unlock'}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center justify-center h-10 px-4 rounded-md border border-[#CBD5E1] bg-white text-[13px] font-medium text-[#1F2937] hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
            >
              Sign out
            </button>
          </div>
        </form>

        <p className="px-6 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] rounded-b-lg text-xs text-[#64748B]">
          Open records are kept in encrypted local memory while locked.
        </p>
      </div>
    </div>
  );
};