import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, LoginInput, SessionInfo } from '../../types';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Alert } from '../common/Alert';
import { Badge } from '../common/Badge';
import { Lock, LogIn, Activity, ShieldCheck, WifiOff } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (session: SessionInfo) => void;
  hospitalName?: string;
}

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
    <div className="h-screen w-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-y-auto select-text">
      {/* Background Decorative Pattern */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      {/* Main Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-700/40 overflow-hidden relative z-10">
        {/* Header Header */}
        <div className="bg-brand-900 px-8 pt-8 pb-6 text-center text-white relative">
          <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-brand-500/30">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">
            {hospitalName || 'Offline Laboratory System'}
          </h1>
          <p className="text-xs text-brand-200 mt-1">Clinical Diagnostics & Recordkeeping Workstation</p>

          <div className="flex justify-center gap-2 mt-4">
            <Badge variant="info" className="bg-brand-800/80 text-brand-200 border-brand-700 gap-1">
              <WifiOff className="w-3 h-3" />
              Air-Gapped Offline
            </Badge>
            <Badge variant="success" className="bg-emerald-950/80 text-emerald-300 border-emerald-800 gap-1">
              <ShieldCheck className="w-3 h-3" />
              Encrypted Database
            </Badge>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-5">
          {errorMsg && (
            <Alert type="error" title="Authentication Failed">
              {errorMsg}
            </Alert>
          )}

          <Input
            label="Operator Username"
            placeholder="Enter username"
            autoFocus
            autoComplete="username"
            error={errors.username?.message}
            {...register('username')}
          />

          <Input
            type="password"
            label="Password"
            placeholder="Enter password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />

          <Button
            type="submit"
            className="w-full py-2.5 text-sm"
            isLoading={isLoading}
          >
            <LogIn className="w-4 h-4 mr-2" />
            Authenticate & Open Workspace
          </Button>

          <div className="pt-2 text-center">
            <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <Lock className="w-3 h-3 text-slate-400" />
              Protected by Windows DPAPI & scrypt key derivation
            </p>
          </div>
        </form>
      </div>

      {/* Footer System Notice */}
      <div className="mt-6 text-center text-xs text-slate-400 max-w-sm">
        Operating in single-workstation offline mode. All test configurations, financial records, and medical data reside solely on this machine.
      </div>
    </div>
  );
};

