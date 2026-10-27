import React, { useState, useEffect } from 'react';
import {
  X,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  KeyRound,
  Phone,
  MessageCircle,
  Mail,
  Copy,
  Check,
} from 'lucide-react';
import { VerifyResetKeyResult } from '../../types';

/*
 * Same tokens as the rest of the app:
 *   primary #0F766E / hover #115E59, navy #111827, surface #FFFFFF, subtle #F8FAFC,
 *   text #1F2937, muted #64748B, border #E2E8F0 (inputs #CBD5E1),
 *   success #15803D, error #DC2626.
 * Layout: navy side panel (steps and developer card) next to the form, like the setup and login screens.
 * It is deliberately large, because it is used rarely and under stress.
 */

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetSuccess?: (username: string) => void;
}

type Step = 'verify' | 'reset' | 'success';

const STEPS: Array<{ id: Step; label: string; title: string; description: string }> = [
  {
    id: 'verify',
    label: 'Enter the reset key',
    title: 'Enter the reset key',
    description: 'Get the secure key from the developer, then paste it here.',
  },
  {
    id: 'reset',
    label: 'Choose a new password',
    title: 'Choose a new password',
    description: 'Pick the account, then set its new password.',
  },
  {
    id: 'success',
    label: 'Done',
    title: 'Password changed',
    description: 'You can sign in with the new password.',
  },
];

// Developer details. Edit them here if they ever change.
const DEVELOPER = {
  name: 'Muhammad Adil',
  initials: 'MA',
  role: 'Software developer',
  phoneDisplay: '0317 8261618',
  phoneLocal: '03178261618',
  phoneInternational: '923178261618',
  email: 'adilkhanbpk@gmail.com',
};

const inputClass =
  'block w-full h-11 px-3.5 rounded-md border border-[#CBD5E1] bg-white text-[15px] text-[#1F2937] ' +
  'placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/30';

const primaryBtn =
  'inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-[#0F766E] text-sm font-medium text-white ' +
  'hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 ' +
  'disabled:bg-[#94A3B8] disabled:cursor-not-allowed';

const secondaryBtn =
  'inline-flex items-center justify-center h-11 px-5 rounded-md border border-[#CBD5E1] bg-white text-sm font-medium text-[#1F2937] ' +
  'hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]';

const labelClass = 'block text-sm font-medium text-[#1F2937] mb-2';

/** One contact row: icon, label, value, then the actions, all on one aligned line. */
const ContactRow: React.FC<{
  dark?: boolean;
  icon: React.ReactNode;
  label: string;
  value: string;
  actions: React.ReactNode;
}> = ({ dark, icon, label, value, actions }) => (
  <div
    className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 py-3 ${
      dark ? 'border-t border-white/10' : 'border-t border-[#E2E8F0]'
    }`}
  >
    <span
      className={`w-8 h-8 rounded-md inline-flex items-center justify-center ${
        dark ? 'bg-white/10 text-[#CBD5E1]' : 'bg-[#F1F5F9] text-[#64748B]'
      }`}
      aria-hidden="true"
    >
      {icon}
    </span>
    <div className="min-w-0">
      <p className={`text-xs ${dark ? 'text-[#94A3B8]' : 'text-[#64748B]'}`}>{label}</p>
      <p
        className={`font-mono text-[13px] truncate ${dark ? 'text-white' : 'text-[#1F2937]'}`}
        title={value}
      >
        {value}
      </p>
    </div>
    <div className="flex items-center gap-1.5">{actions}</div>
  </div>
);

const DeveloperCard: React.FC<{ dark?: boolean }> = ({ dark }) => {
  const [copied, setCopied] = useState<'phone' | 'email' | null>(null);

  const copy = async (kind: 'phone' | 'email', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard not available, nothing to do
    }
  };

  const actionClass = dark
    ? 'h-8 px-2.5 rounded-md border border-white/15 text-xs font-medium text-[#E5E7EB] hover:bg-white/10 inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5EEAD4]'
    : 'h-8 px-2.5 rounded-md border border-[#CBD5E1] text-xs font-medium text-[#1F2937] hover:bg-[#F8FAFC] inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]';

  return (
    <div className={dark ? '' : 'rounded-lg border border-[#E2E8F0] bg-white px-5 py-4'}>
      <p className={`text-xs font-medium ${dark ? 'text-[#94A3B8]' : 'text-[#64748B]'}`}>Need a key? Contact the developer</p>

      <div className="mt-3 flex items-center gap-3.5 pb-4">
        <div
          aria-hidden="true"
          className="w-12 h-12 rounded-lg bg-[#0F766E] text-white font-mono text-base font-semibold flex items-center justify-center shrink-0"
        >
          {DEVELOPER.initials}
        </div>
        <div className="min-w-0">
          <p className={`text-base font-semibold leading-tight ${dark ? 'text-white' : 'text-[#1F2937]'}`}>
            {DEVELOPER.name}
          </p>
          <p className={`text-[13px] ${dark ? 'text-[#94A3B8]' : 'text-[#64748B]'}`}>{DEVELOPER.role}</p>
        </div>
      </div>

      <ContactRow
        dark={dark}
        icon={<Phone className="w-4 h-4" />}
        label="Phone"
        value={DEVELOPER.phoneDisplay}
        actions={
          <>
            <a href={`tel:${DEVELOPER.phoneLocal}`} className={actionClass} aria-label="Call the developer">
              Call
            </a>
            <button
              type="button"
              onClick={() => copy('phone', DEVELOPER.phoneLocal)}
              aria-label="Copy phone number"
              title="Copy phone number"
              className={`${actionClass} !px-2`}
            >
              {copied === 'phone' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </>
        }
      />

      <ContactRow
        dark={dark}
        icon={<MessageCircle className="w-4 h-4" />}
        label="WhatsApp"
        value={DEVELOPER.phoneDisplay}
        actions={
          <a
            href={`https://wa.me/${DEVELOPER.phoneInternational}`}
            target="_blank"
            rel="noreferrer"
            className={actionClass}
            aria-label="Message the developer on WhatsApp"
          >
            Message
          </a>
        }
      />

      <ContactRow
        dark={dark}
        icon={<Mail className="w-4 h-4" />}
        label="Email"
        value={DEVELOPER.email}
        actions={
          <>
            <a href={`mailto:${DEVELOPER.email}`} className={actionClass} aria-label="Email the developer">
              Write
            </a>
            <button
              type="button"
              onClick={() => copy('email', DEVELOPER.email)}
              aria-label="Copy email address"
              title="Copy email address"
              className={`${actionClass} !px-2`}
            >
              {copied === 'email' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </>
        }
      />
    </div>
  );
};

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  onResetSuccess,
}) => {
  const [step, setStep] = useState<Step>('verify');
  const [keyInput, setKeyInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [verifiedData, setVerifiedData] = useState<VerifyResetKeyResult | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [successUsername, setSuccessUsername] = useState('');

  // Start clean every time the dialog opens, so an old key or password never stays in memory
  useEffect(() => {
    if (isOpen) {
      setStep('verify');
      setKeyInput('');
      setErrorMsg(null);
      setVerifiedData(null);
      setSelectedUserId(null);
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setSuccessUsername('');
      setIsVerifying(false);
      setIsResetting(false);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleVerifyKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanKey = keyInput.trim();
    if (cleanKey.length !== 102) {
      setErrorMsg(`The key must be exactly 102 characters. You have entered ${cleanKey.length}.`);
      return;
    }

    const suffix = cleanKey.slice(100).toLowerCase();
    if (suffix !== 'aa' && suffix !== 'uu') {
      setErrorMsg('This key is not valid. Check that you copied the whole key, or ask the developer for a new one.');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await window.electronAPI.auth.verifyResetKey({ key: cleanKey });
      if (!res.success || !res.data) {
        setErrorMsg(res.error || 'The key is invalid or has expired.');
        return;
      }

      setVerifiedData(res.data);
      if (res.data.users.length > 0) {
        setSelectedUserId(res.data.users[0].id);
      }
      setStep('reset');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not verify the key.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedUserId) {
      setErrorMsg('Choose the account to reset.');
      return;
    }

    if (newPassword.length < 4) {
      setErrorMsg('The new password must be at least 4 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('The two passwords do not match.');
      return;
    }

    setIsResetting(true);
    try {
      const res = await window.electronAPI.auth.resetPasswordWithKey({
        key: keyInput.trim(),
        userId: selectedUserId,
        newPassword,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Could not reset the password.');
        return;
      }

      const u = verifiedData?.users.find((user) => user.id === selectedUserId);
      const uname = u?.username || 'User';
      setSuccessUsername(uname);
      setStep('success');

      if (onResetSuccess) {
        onResetSuccess(uname);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'An unexpected error occurred while resetting the password.');
    } finally {
      setIsResetting(false);
    }
  };

  const cleanKeyLen = keyInput.trim().length;
  const currentIndex = STEPS.findIndex((s) => s.id === step);
  const info = STEPS[currentIndex];
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <div className="fixed inset-0 z-50 bg-[#111827]/60 flex items-center justify-center p-3 sm:p-6 select-text overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-password-title"
        className="w-full max-w-4xl bg-white rounded-lg border border-[#E2E8F0] my-auto overflow-hidden flex flex-col md:flex-row text-[#1F2937]"
      >
        {/* Side panel (tablet and up) */}
        <aside className="hidden md:flex md:w-[340px] shrink-0 flex-col bg-[#111827] text-[#E5E7EB] px-7 py-7">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-[#0F766E] flex items-center justify-center">
              <KeyRound className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-white">Reset password</p>
              <p className="text-xs text-[#94A3B8]">Emergency access recovery</p>
            </div>
          </div>

          <ol className="mt-7 space-y-1" aria-label="Steps">
            {STEPS.map((s, i) => {
              const isCurrent = i === currentIndex;
              const isDone = i < currentIndex || step === 'success';
              return (
                <li
                  key={s.id}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm ${
                    isCurrent ? 'bg-[#0F766E] text-white font-medium' : 'text-[#CBD5E1]'
                  }`}
                >
                  <span className="w-5 h-5 inline-flex items-center justify-center text-xs tabular-nums">
                    {isDone && !isCurrent ? <Check className="w-4 h-4 text-[#5EEAD4]" /> : i + 1}
                  </span>
                  {s.label}
                </li>
              );
            })}
          </ol>

          <div className="mt-auto pt-8">
            <DeveloperCard dark />
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="px-6 sm:px-8 pt-6 pb-5 border-b border-[#E2E8F0] flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-[#64748B] md:hidden">Step {currentIndex + 1} of 3</p>
              <h2 id="forgot-password-title" className="text-2xl font-semibold">
                {info.title}
              </h2>
              <p className="mt-1 text-[15px] text-[#64748B]">{info.description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1F2937] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 sm:px-8 py-6 space-y-6">
            {errorMsg && (
              <div
                role="alert"
                className="flex gap-3 rounded-lg border border-[#E2E8F0] border-l-4 border-l-[#DC2626] bg-white px-4 py-3.5"
              >
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-[#DC2626]" />
                <p className="text-[15px]">{errorMsg}</p>
              </div>
            )}

            {/* Step 1: key */}
            {step === 'verify' && (
              <form onSubmit={handleVerifyKey} className="space-y-6">
                <div className="flex gap-3.5 rounded-lg border border-[#E2E8F0] border-l-4 border-l-[#0F766E] bg-[#F8FAFC] px-4 py-4">
                  <KeyRound className="w-5 h-5 mt-0.5 shrink-0 text-[#0F766E]" />
                  <div>
                    <p className="text-base font-semibold">You need a secure key from the developer</p>
                    <p className="mt-1 text-[15px] text-[#64748B] leading-relaxed">
                      A password cannot be reset without it. Contact the developer by phone, WhatsApp or email, tell
                      them which account is locked, and ask for a password reset key. Then paste the key below.
                    </p>
                  </div>
                </div>

                {/* On small screens the side panel is hidden, so the developer card sits here */}
                <div className="md:hidden">
                  <DeveloperCard />
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <label htmlFor="resetKey" className="text-sm font-medium">
                      Reset key <span className="text-[#DC2626]">*</span>
                    </label>
                    <span
                      className={`text-sm tabular-nums ${
                        cleanKeyLen === 102 ? 'text-[#15803D] font-medium' : 'text-[#64748B]'
                      }`}
                    >
                      {cleanKeyLen} of 102 characters
                    </span>
                  </div>
                  <textarea
                    id="resetKey"
                    rows={4}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Paste the key here"
                    spellCheck={false}
                    autoComplete="off"
                    autoFocus
                    required
                    className="block w-full px-3.5 py-3 rounded-md border border-[#CBD5E1] bg-white font-mono text-sm leading-6 text-[#1F2937] placeholder:text-[#94A3B8] break-all focus:outline-none focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/30"
                  />
                  <p className="mt-2 text-sm text-[#64748B]">
                    Keys are time-limited. If it stops working, ask the developer for a new one.
                  </p>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                  <button type="button" onClick={onClose} className={secondaryBtn}>
                    Cancel
                  </button>
                  <button type="submit" disabled={isVerifying || cleanKeyLen !== 102} className={primaryBtn}>
                    {isVerifying && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isVerifying ? 'Checking…' : 'Check key and continue'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: new password */}
            {step === 'reset' && verifiedData && (
              <form onSubmit={handleResetPassword} className="space-y-6">
                <div className="flex gap-3 rounded-lg border border-[#E2E8F0] border-l-4 border-l-[#15803D] bg-white px-4 py-3.5">
                  <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-[#15803D]" />
                  <div>
                    <p className="text-[15px] font-semibold">Key accepted</p>
                    <p className="text-[15px] text-[#64748B]">Now choose the account and set a new password.</p>
                  </div>
                </div>

                <div>
                  <label htmlFor="userSelect" className={labelClass}>
                    Account to reset <span className="text-[#DC2626]">*</span>
                  </label>
                  <select
                    id="userSelect"
                    value={selectedUserId || ''}
                    onChange={(e) => setSelectedUserId(Number(e.target.value))}
                    className={inputClass}
                    required
                  >
                    {verifiedData.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.username}), {u.role}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-6">
                  <div>
                    <label htmlFor="newPassword" className={labelClass}>
                      New password <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      id="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      autoFocus
                      required
                      className={inputClass}
                    />
                    <p className="mt-2 text-sm text-[#64748B]">At least 4 characters.</p>
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className={labelClass}>
                      Confirm new password <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      aria-invalid={mismatch}
                      required
                      className={`${inputClass} ${mismatch ? '!border-[#DC2626] focus:!ring-[#DC2626]/30' : ''}`}
                    />
                    {mismatch ? (
                      <p className="mt-2 text-sm text-[#DC2626]">The passwords do not match yet.</p>
                    ) : (
                      confirmPassword.length > 0 && <p className="mt-2 text-sm text-[#15803D]">The passwords match.</p>
                    )}
                  </div>
                </div>

                <label className="inline-flex items-center gap-2.5 text-[15px] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    className="w-4 h-4 rounded border-[#CBD5E1] accent-[#0F766E]"
                  />
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-[#64748B]" />
                  ) : (
                    <Eye className="w-4 h-4 text-[#64748B]" />
                  )}
                  Show passwords
                </label>

                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setStep('verify');
                    }}
                    className="text-sm font-medium text-[#64748B] hover:text-[#1F2937] hover:underline text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] rounded"
                  >
                    Back to the key
                  </button>
                  <div className="flex flex-col-reverse sm:flex-row gap-3">
                    <button type="button" onClick={onClose} className={secondaryBtn}>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isResetting || !newPassword || newPassword !== confirmPassword}
                      className={primaryBtn}
                    >
                      {isResetting && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isResetting ? 'Saving…' : 'Reset password'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Step 3: done */}
            {step === 'success' && (
              <div className="space-y-6">
                <div className="flex gap-3 rounded-lg border border-[#E2E8F0] border-l-4 border-l-[#15803D] bg-white px-4 py-4">
                  <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-[#15803D]" />
                  <div>
                    <p className="text-base font-semibold">The password was changed</p>
                    <p className="mt-1 text-[15px] text-[#64748B]">
                      The password for <span className="font-medium text-[#1F2937]">{successUsername}</span> is
                      updated. Sign in with the new password.
                    </p>
                  </div>
                </div>

                <div className="flex sm:justify-end">
                  <button type="button" onClick={onClose} className={`${primaryBtn} w-full sm:w-auto`}>
                    Back to sign in
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};