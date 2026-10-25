// import React, { useState } from 'react';
// import { useForm } from 'react-hook-form';
// import { zodResolver } from '@hookform/resolvers/zod';
// import { LoginSchema, LoginInput, SessionInfo } from '../../types';
// import { Button } from '../common/Button';
// import { Input } from '../common/Input';
// import { Alert } from '../common/Alert';
// import { Badge } from '../common/Badge';
// import { Lock, LogIn, Activity, ShieldCheck, WifiOff } from 'lucide-react';

// interface LoginViewProps {
//   onLoginSuccess: (session: SessionInfo) => void;
//   hospitalName?: string;
// }

// export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, hospitalName }) => {
//   const [errorMsg, setErrorMsg] = useState<string | null>(null);
//   const [isLoading, setIsLoading] = useState(false);

//   const {
//     register,
//     handleSubmit,
//     formState: { errors },
//   } = useForm<LoginInput>({
//     resolver: zodResolver(LoginSchema),
//     defaultValues: {
//       username: '',
//       password: '',
//     },
//   });

//   const onSubmit = async (data: LoginInput) => {
//     setIsLoading(true);
//     setErrorMsg(null);

//     try {
//       const response = await window.electronAPI.auth.login(data);
//       if (!response.success || !response.data) {
//         setErrorMsg(response.error || 'Invalid username or password.');
//         setIsLoading(false);
//         return;
//       }

//       onLoginSuccess(response.data);
//     } catch {
//       setErrorMsg('An unexpected authentication error occurred.');
//       setIsLoading(false);
//     }
//   };

//   return (
//     <div className="h-screen w-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-y-auto select-text">
//       {/* Background Decorative Pattern */}
//       <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

//       {/* Main Card */}
//       <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-700/40 overflow-hidden relative z-10">
//         {/* Header Header */}
//         <div className="bg-brand-900 px-8 pt-8 pb-6 text-center text-white relative">
//           <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-brand-500/30">
//             <Activity className="w-8 h-8 text-white" />
//           </div>
//           <h1 className="text-lg font-bold tracking-tight">
//             {hospitalName || 'Offline Laboratory System'}
//           </h1>
//           <p className="text-xs text-brand-200 mt-1">Clinical Diagnostics & Recordkeeping Workstation</p>

//           <div className="flex justify-center gap-2 mt-4">
//             <Badge variant="info" className="bg-brand-800/80 text-brand-200 border-brand-700 gap-1">
//               <WifiOff className="w-3 h-3" />
//               Air-Gapped Offline
//             </Badge>
//             <Badge variant="success" className="bg-emerald-950/80 text-emerald-300 border-emerald-800 gap-1">
//               <ShieldCheck className="w-3 h-3" />
//               Encrypted Database
//             </Badge>
//           </div>
//         </div>

//         {/* Form Body */}
//         <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-5">
//           {errorMsg && (
//             <Alert type="error" title="Authentication Failed">
//               {errorMsg}
//             </Alert>
//           )}

//           <Input
//             label="Operator Username"
//             placeholder="Enter username"
//             autoFocus
//             autoComplete="username"
//             error={errors.username?.message}
//             {...register('username')}
//           />

//           <Input
//             type="password"
//             label="Password"
//             placeholder="Enter password"
//             autoComplete="current-password"
//             error={errors.password?.message}
//             {...register('password')}
//           />

//           <Button
//             type="submit"
//             className="w-full py-2.5 text-sm"
//             isLoading={isLoading}
//           >
//             <LogIn className="w-4 h-4 mr-2" />
//             Authenticate & Open Workspace
//           </Button>

//           <div className="pt-2 text-center">
//             <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
//               <Lock className="w-3 h-3 text-slate-400" />
//               Protected by Windows DPAPI & scrypt key derivation
//             </p>
//           </div>
//         </form>
//       </div>

//       {/* Footer System Notice */}
//       <div className="mt-6 text-center text-xs text-slate-400 max-w-sm">
//         Operating in single-workstation offline mode. All test configurations, financial records, and medical data reside solely on this machine.
//       </div>
//     </div>
//   );
// };

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, LoginInput, SessionInfo } from '../../types';
import { FlaskConical, AlertCircle, Loader2 } from 'lucide-react';

/*
 * Same tokens as SetupWizard and Sidebar:
 *   primary #0F766E / hover #115E59, sidebar #111827, page #F5F7FA,
 *   text #1F2937, muted #64748B, border #E2E8F0, error #DC2626.
 */

interface LoginViewProps {
  onLoginSuccess: (session: SessionInfo) => void;
  hospitalName?: string;
}

const inputClass =
  'block w-full h-10 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] ' +
  'placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]';

const facts: Array<[string, string]> = [
  ['Storage', 'Encrypted database on this computer only'],
  ['Network', 'Fully offline, no telemetry'],
  ['Sign-in', 'Five failed attempts lock the account'],
];

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, hospitalName }) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const response = await window.electronAPI.auth.login(data);
      if (!response.success || !response.data) {
        setErrorMsg(response.error || 'Invalid username or password.');
        setIsLoading(false);
        return;
      }

      onLoginSuccess(response.data);
    } catch {
      setErrorMsg('An unexpected authentication error occurred.');
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex bg-[#F5F7FA] text-[#1F2937] overflow-hidden select-text">
      {/* Identity panel */}
      <aside className="hidden md:flex w-[400px] lg:w-[440px] shrink-0 flex-col justify-between bg-[#111827] px-10 py-10">
        <div className="w-9 h-9 rounded-md bg-[#0F766E] flex items-center justify-center">
          <FlaskConical className="w-[18px] h-[18px] text-white" />
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-white leading-snug">
            {hospitalName || 'Laboratory Manager'}
          </h1>
          <p className="mt-2 text-[13px] text-[#94A3B8]">
            Patient visits, results, billing and reports for this laboratory.
          </p>

          <dl className="mt-10 border-t border-white/10">
            {facts.map(([term, detail]) => (
              <div key={term} className="py-3 border-b border-white/10">
                <dt className="text-xs text-[#94A3B8]">{term}</dt>
                <dd className="text-[13px] text-[#E5E7EB] mt-0.5">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs text-[#94A3B8]">Version 1.0.0</p>
      </aside>

      {/* Sign-in form */}
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm">
            {/* Shown only when the identity panel is hidden */}
            <div className="md:hidden flex items-center gap-3 mb-8">
              <div className="w-8 h-8 rounded-md bg-[#0F766E] flex items-center justify-center">
                <FlaskConical className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-semibold">{hospitalName || 'Laboratory Manager'}</span>
            </div>

            <h2 className="text-xl font-semibold">Sign in</h2>
            <p className="mt-1 text-[13px] text-[#64748B]">Use your operator account for this workstation.</p>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
              {errorMsg && (
                <div
                  role="alert"
                  className="flex gap-3 rounded-lg border border-[#E2E8F0] border-l-4 border-l-[#DC2626] bg-white px-4 py-3"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#DC2626]" />
                  <div>
                    <p className="text-[13px] font-semibold">Sign-in failed</p>
                    <p className="text-[13px] text-[#64748B] mt-0.5">{errorMsg}</p>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="username" className="block text-[13px] font-medium mb-1.5">
                  Username
                </label>
                <input
                  id="username"
                  autoFocus
                  autoComplete="username"
                  className={inputClass}
                  {...register('username')}
                />
                {errors.username?.message && (
                  <p className="mt-1.5 text-xs text-[#DC2626]">{errors.username.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-[13px] font-medium mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className={inputClass}
                  {...register('password')}
                />
                {errors.password?.message && (
                  <p className="mt-1.5 text-xs text-[#DC2626]">{errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md bg-[#0F766E] text-[13px] font-medium text-white hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 disabled:bg-[#94A3B8] disabled:cursor-not-allowed"
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {isLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-8 text-xs text-[#64748B] leading-relaxed">
              All test configurations, financial records and patient data stay on this computer.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};