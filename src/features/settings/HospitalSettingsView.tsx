import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  UpdateHospitalSettingsSchema,
  UpdateHospitalSettingsInput,
  HospitalSettings,
  SafeUser,
} from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { UserManagementTab } from './UserManagementTab';
import {
  Save,
  KeyRound,
  Upload,
  Image as ImageIcon,
  Building2,
  Users,
} from 'lucide-react';

interface HospitalSettingsViewProps {
  hospital: HospitalSettings;
  currentUser?: SafeUser;
  onUpdate: (updated: HospitalSettings) => void;
}

export const HospitalSettingsView: React.FC<HospitalSettingsViewProps> = ({
  hospital,
  currentUser,
  onUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<'facility' | 'users'>('facility');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => {
    window.electronAPI.settings.getLogoUrl().then((res) => {
      if (res.success && res.data) {
        setLogoUrl(res.data);
      }
    });
  }, [hospital.logo_relative_path]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateHospitalSettingsInput>({
    resolver: zodResolver(UpdateHospitalSettingsSchema),
    defaultValues: {
      hospital_name: hospital.hospital_name,
      tagline: hospital.tagline || '',
      address: hospital.address,
      phone_primary: hospital.phone_primary,
      phone_secondary: hospital.phone_secondary || '',
      email: hospital.email || '',
      currency_code: hospital.currency_code,
      timezone: hospital.timezone,
      inactivity_timeout_minutes: hospital.inactivity_timeout_minutes,
    },
  });

  const onSubmit = async (data: UpdateHospitalSettingsInput) => {
    setIsSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await window.electronAPI.settings.updateHospital(data);
      if (!res.success || !res.data) {
        setErrorMsg(res.error || 'Failed to update settings.');
        setIsSubmitting(false);
        return;
      }

      onUpdate(res.data);
      setSuccessMsg('Hospital configuration updated successfully.');
    } catch {
      setErrorMsg('An unexpected error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Logo file exceeds the 2 MB maximum limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setIsUploadingLogo(true);
      setErrorMsg(null);
      try {
        const res = await window.electronAPI.settings.uploadLogo(base64);
        if (res.success && res.data) {
          setLogoUrl(res.data.logoUrl);
          onUpdate({
            ...hospital,
            logo_relative_path: res.data.logoPath,
            logo_url: res.data.logoUrl,
          });
          setSuccessMsg('Hospital logo updated successfully.');
        } else {
          setErrorMsg(res.error || 'Failed to save logo image.');
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'Error processing logo upload.');
      } finally {
        setIsUploadingLogo(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Hospital & System Settings</h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure facility information, official logo, contact headers, and user account access permissions.
        </p>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex items-center gap-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('facility')}
          className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'facility'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Facility Profile & Official Logo
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'users'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          User Accounts & Access Control
        </button>
      </div>

      {activeTab === 'facility' && (
        <div className="space-y-6">

      {successMsg && (
        <Alert type="success" title="Success">
          {successMsg}
        </Alert>
      )}

      {errorMsg && (
        <Alert type="error" title="Error">
          {errorMsg}
        </Alert>
      )}

      {/* Laboratory Logo Upload Card */}
      <Card title="Official Laboratory Logo" subtitle="Appears on printed diagnostic reports, bills, and patient slips">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center p-2 overflow-hidden shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Laboratory Logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <div className="text-center text-slate-400">
                <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-50" />
                <span className="text-[10px]">No Logo Set</span>
              </div>
            )}
          </div>

          <div className="space-y-2 flex-1">
            <h4 className="text-xs font-semibold text-slate-800">Upload High-Resolution Logo</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Supports PNG (transparent backgrounds recommended), JPEG, and WebP up to 2 MB. Stored securely in application local storage with automated magic byte verification.
            </p>
            <div className="pt-1">
              <label className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer shadow-sm transition-colors">
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>{isUploadingLogo ? 'Uploading...' : 'Choose Image File'}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleLogoFileSelect}
                  disabled={isUploadingLogo}
                />
              </label>
            </div>
          </div>
        </div>
      </Card>

      {/* Facility Profile Form */}
      <Card title="Facility Profile & Report Header" subtitle="These details will appear on printed test reports and bills">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input
                label="Hospital / Diagnostic Laboratory Name"
                error={errors.hospital_name?.message}
                {...register('hospital_name')}
              />
            </div>

            <div className="md:col-span-2">
              <Input
                label="Department / Tagline Subtitle"
                error={errors.tagline?.message}
                {...register('tagline')}
              />
            </div>

            <div className="md:col-span-2">
              <Input
                label="Physical Address"
                error={errors.address?.message}
                {...register('address')}
              />
            </div>

            <div>
              <Input
                label="Primary Phone"
                error={errors.phone_primary?.message}
                {...register('phone_primary')}
              />
            </div>

            <div>
              <Input
                label="Secondary Phone"
                error={errors.phone_secondary?.message}
                {...register('phone_secondary')}
              />
            </div>

            <div>
              <Input
                label="Laboratory Email"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>

            <div>
              <Input
                label="Currency Code"
                disabled
                helperText="Fixed to PKR (stored as minor unit paisa)"
                error={errors.currency_code?.message}
                {...register('currency_code')}
              />
            </div>

            <div>
              <Input
                label="Timezone"
                helperText="e.g. Asia/Karachi"
                error={errors.timezone?.message}
                {...register('timezone')}
              />
            </div>

            <div>
              <Input
                type="number"
                label="Inactivity Lockout (Minutes)"
                helperText="Screen will automatically lock after this period"
                error={errors.inactivity_timeout_minutes?.message}
                {...register('inactivity_timeout_minutes', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <Button type="submit" isLoading={isSubmitting}>
              <Save className="w-4 h-4 mr-1.5" />
              Save Configuration
            </Button>
          </div>
        </form>
      </Card>

      {/* Security Architecture & Disaster Recovery Explanation Card */}
      <Card title="Security & Key Recovery Protocol" subtitle="Mandatory operational safety rules for the workstation">
        <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900">
            <div className="flex items-center gap-2 font-semibold mb-1 text-amber-800">
              <KeyRound className="w-4 h-4 text-amber-600" />
              Windows DPAPI Key Protection
            </div>
            <p>
              The 256-bit database encryption key is protected using Windows DPAPI (Data Protection API), which ties cryptographic access to this specific Windows user account.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <h4 className="font-semibold text-slate-800 mb-1">Single-Operator Protection</h4>
              <p className="text-slate-500">
                The initial administrator account cannot be deleted. All failed login attempts enforce a 15-minute lockout after 5 consecutive failures.
              </p>
            </div>

            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <h4 className="font-semibold text-slate-800 mb-1">Encrypted Offline Backups</h4>
              <p className="text-slate-500">
                Backups generated by the application preserve the exact AES cipher encryption and cannot be read as plaintext on any computer without authorized credentials.
              </p>
            </div>
          </div>
        </div>
      </Card>
        </div>
      )}

      {activeTab === 'users' && (
        <UserManagementTab currentUser={currentUser || { id: 1, username: 'admin', full_name: 'Administrator', role: 'admin', is_active: 1, failed_login_attempts: 0, locked_until: null, created_at: '', updated_at: '', last_login_at: null }} />
      )}
    </div>
  );
};
