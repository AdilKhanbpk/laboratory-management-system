import React, { useState } from 'react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Alert } from '../common/Alert';
import { Lock, LogOut, ShieldAlert } from 'lucide-react';
import type { SafeUser } from '../../types';

interface LockScreenProps {
  user: SafeUser;
  onUnlock: () => void;
  onLogout: () => void;
}

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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6 select-text">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-800 text-white p-6 text-center">
          <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-3 border border-amber-500/30">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold">Session Locked</h2>
          <p className="text-xs text-slate-300 mt-1">
            Workstation locked due to inactivity or operator request
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
              {user.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <h4 className="text-sm font-semibold text-slate-900 truncate">{user.full_name}</h4>
              <p className="text-xs text-slate-500 truncate">@{user.username} • {user.role.toUpperCase()}</p>
            </div>
          </div>

          {error && (
            <Alert type="error" title="Unlock Failed">
              {error}
            </Alert>
          )}

          <Input
            type="password"
            label="Enter Password to Unlock"
            placeholder="Account password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              className="flex-1"
              isLoading={isUnlocking}
            >
              Resume Session
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onLogout}
              className="text-slate-600 hover:text-red-600 hover:border-red-200"
            >
              <LogOut className="w-4 h-4 mr-1.5" />
              Sign Out
            </Button>
          </div>
        </form>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
          All active records preserved in local encrypted memory
        </div>
      </div>
    </div>
  );
};

