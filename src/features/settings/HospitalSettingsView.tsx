import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  UpdateHospitalSettingsSchema,
  UpdateHospitalSettingsInput,
  HospitalSettings,
  SafeUser,
} from '../../types';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { UserManagementTab } from './UserManagementTab';
import { Save, Upload } from 'lucide-react';

/*
 * Tokens shared with the rest of the app:
 *   primary #0F766E / hover #115E59, page #F5F7FA, surface #FFFFFF,
 *   text #1F2937, muted #64748B, border #E2E8F0, error #DC2626.
 *   Radius 8px, no shadows.
 */

interface HospitalSettingsViewProps {
  hospital: HospitalSettings;
  currentUser?: SafeUser;
  onUpdate: (updated: HospitalSettings) => void;
}

const FALLBACK_USER = {
  id: 1,
  username: 'admin',
  full_name: 'Administrator',
  role: 'admin',
  is_active: 1,
  failed_login_attempts: 0,
  locked_until: null,
  created_at: '',
  updated_at: '',
  last_login_at: null,
} as SafeUser;

const inputCls =
  'h-9 w-full px-3 rounded-lg border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] placeholder:text-slate-400 focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E] disabled:bg-[#F8FAFC] disabled:text-[#64748B] disabled:cursor-not-allowed aria-[invalid=true]:border-[#DC2626] aria-[invalid=true]:focus:ring-[#DC2626]';

const Field: React.FC<{
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, hint, error, className = '', children }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="block text-[13px] font-medium mb-1">
      {label}
    </label>
    {children}
    {error ? (
      <p className="text-xs text-[#DC2626] mt-1" role="alert">
        {error}
      </p>
    ) : hint ? (
      <p className="text-xs text-[#64748B] mt-1">{hint}</p>
    ) : null}
  </div>
);

/** A block inside the settings panel: heading, one-line help, then its fields. */
const Block: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <section className="px-6 py-5 border-b border-[#E2E8F0]">
    <h2 className="text-sm font-semibold">{title}</h2>
    {description && <p className="text-[13px] text-[#64748B] mt-0.5">{description}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

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
      if (res.success && res.data) setLogoUrl(res.data);
    });
  }, [hospital.logo_relative_path]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
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

  const live = watch();

  const switchTab = (tab: 'facility' | 'users') => {
    setActiveTab(tab);
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  const onSubmit = async (data: UpdateHospitalSettingsInput) => {
    setIsSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await window.electronAPI.settings.updateHospital(data);
      if (!res.success || !res.data) {
        setErrorMsg(res.error || 'Could not save the settings.');
        return;
      }
      onUpdate(res.data);
      reset(data);
      setSuccessMsg('Settings saved.');
    } catch {
      setErrorMsg('Something went wrong while saving. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('The logo is larger than 2 MB. Choose a smaller image.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setIsUploadingLogo(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      try {
        const res = await window.electronAPI.settings.uploadLogo(base64);
        if (res.success && res.data) {
          setLogoUrl(res.data.logoUrl);
          onUpdate({
            ...hospital,
            logo_relative_path: res.data.logoPath,
            logo_url: res.data.logoUrl,
          });
          setSuccessMsg('Logo updated.');
        } else {
          setErrorMsg(res.error || 'Could not save the logo.');
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'Could not upload the logo.');
      } finally {
        setIsUploadingLogo(false);
        input.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const tabCls = (active: boolean) =>
    `pb-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] rounded-sm ${
      active
        ? 'border-[#0F766E] text-[#0F766E]'
        : 'border-transparent text-[#64748B] hover:text-[#1F2937]'
    }`;

  // Preview text, built from what is typed right now
  const phones = [live.phone_primary, live.phone_secondary].filter(Boolean).join(' / ');
  const contactLine = [live.address, phones && `Tel ${phones}`, live.email]
    .filter(Boolean)
    .join('  |  ');

  return (
    <div className="max-w-[1200px] text-[#1F2937]">
      {/* Page header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold leading-6">Laboratory settings</h1>
        <p className="text-[13px] text-[#64748B] mt-0.5">
          Details printed on reports and receipts, and who can sign in.
        </p>
      </div>

      <div className="flex items-center gap-6 border-b border-[#E2E8F0] mb-5" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'facility'}
          onClick={() => switchTab('facility')}
          className={tabCls(activeTab === 'facility')}
        >
          Laboratory
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          onClick={() => switchTab('users')}
          className={tabCls(activeTab === 'users')}
        >
          Users and access
        </button>
      </div>

      {activeTab === 'facility' && (
        <>
          {(successMsg || errorMsg) && (
            <div className="mb-4 space-y-2">
              {successMsg && <Alert type="success">{successMsg}</Alert>}
              {errorMsg && <Alert type="error">{errorMsg}</Alert>}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
            {/* Settings panel */}
            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden"
            >
              {/* Logo */}
              <Block
                title="Logo"
                description="Printed at the top of reports, receipts and patient slips."
              >
                <div className="flex items-center gap-4">
                  <div className="w-[72px] h-[72px] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-center p-1.5 shrink-0">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Laboratory logo"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-[#64748B]">No logo</span>
                    )}
                  </div>

                  <div>
                    <label
                      className={`inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-[#CBD5E1] bg-white text-[13px] font-medium hover:bg-slate-50 focus-within:ring-2 focus-within:ring-[#0F766E] ${
                        isUploadingLogo ? 'opacity-60 cursor-wait' : 'cursor-pointer'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 text-[#64748B]" />
                      {isUploadingLogo
                        ? 'Uploading…'
                        : logoUrl
                        ? 'Replace logo'
                        : 'Choose image'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={handleLogoFileSelect}
                        disabled={isUploadingLogo}
                      />
                    </label>
                    <p className="text-xs text-[#64748B] mt-1.5">
                      PNG, JPEG or WebP, up to 2 MB. A transparent PNG prints best.
                    </p>
                  </div>
                </div>
              </Block>

              {/* Details */}
              <Block title="Laboratory details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                  <Field
                    label="Laboratory name"
                    htmlFor="hospital_name"
                    className="sm:col-span-2"
                    error={errors.hospital_name?.message}
                  >
                    <input
                      id="hospital_name"
                      className={inputCls}
                      aria-invalid={!!errors.hospital_name}
                      {...register('hospital_name')}
                    />
                  </Field>

                  <Field
                    label="Address"
                    htmlFor="address"
                    className="sm:col-span-2"
                    error={errors.address?.message}
                  >
                    <input
                      id="address"
                      className={inputCls}
                      aria-invalid={!!errors.address}
                      {...register('address')}
                    />
                  </Field>

                  <Field
                    label="Phone"
                    htmlFor="phone_primary"
                    error={errors.phone_primary?.message}
                  >
                    <input
                      id="phone_primary"
                      className={inputCls}
                      aria-invalid={!!errors.phone_primary}
                      {...register('phone_primary')}
                    />
                  </Field>

                  <Field
                    label="Second phone"
                    htmlFor="phone_secondary"
                    hint="Optional."
                    error={errors.phone_secondary?.message}
                  >
                    <input
                      id="phone_secondary"
                      className={inputCls}
                      aria-invalid={!!errors.phone_secondary}
                      {...register('phone_secondary')}
                    />
                  </Field>

                  <Field
                    label="Email"
                    htmlFor="email"
                    className="sm:col-span-2"
                    error={errors.email?.message}
                  >
                    <input
                      id="email"
                      type="email"
                      className={inputCls}
                      aria-invalid={!!errors.email}
                      {...register('email')}
                    />
                  </Field>
                </div>
              </Block>

              {/* System */}
              <Block title="System" description="Applies to this workstation.">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4">
                  <Field
                    label="Currency"
                    htmlFor="currency_code"
                    hint="Fixed. Amounts are stored in paisa."
                    error={errors.currency_code?.message}
                  >
                    <input
                      id="currency_code"
                      className={inputCls}
                      disabled
                      {...register('currency_code')}
                    />
                  </Field>

                  <Field
                    label="Time zone"
                    htmlFor="timezone"
                    hint="For example, Asia/Karachi."
                    error={errors.timezone?.message}
                  >
                    <input
                      id="timezone"
                      className={inputCls}
                      aria-invalid={!!errors.timezone}
                      {...register('timezone')}
                    />
                  </Field>

                  <Field
                    label="Lock screen after"
                    htmlFor="inactivity_timeout_minutes"
                    hint="Minutes without activity."
                    error={errors.inactivity_timeout_minutes?.message}
                  >
                    <input
                      id="inactivity_timeout_minutes"
                      type="number"
                      min={1}
                      className={inputCls}
                      aria-invalid={!!errors.inactivity_timeout_minutes}
                      {...register('inactivity_timeout_minutes', { valueAsNumber: true })}
                    />
                  </Field>
                </div>
              </Block>

              {/* Save bar stays in view while scrolling */}
              <div className="sticky bottom-0 bg-white border-t border-[#E2E8F0] px-6 py-3 flex items-center justify-between gap-3">
                <span className="text-[13px] text-[#64748B]">
                  {isDirty ? 'You have unsaved changes' : 'All changes saved'}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!isDirty || isSubmitting}
                    onClick={() => reset()}
                  >
                    Discard
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    isLoading={isSubmitting}
                    disabled={!isDirty}
                    className="bg-[#0F766E] hover:bg-[#115E59]"
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    Save changes
                  </Button>
                </div>
              </div>
            </form>

            {/* Live preview of the printed header */}
            <aside className="bg-white border border-[#E2E8F0] rounded-lg xl:sticky xl:top-4">
              <div className="px-5 py-3 border-b border-[#E2E8F0]">
                <h2 className="text-sm font-semibold">Printed header</h2>
                <p className="text-[13px] text-[#64748B] mt-0.5">
                  How reports and receipts will start. Updates as you type.
                </p>
              </div>

              <div className="p-4 bg-[#F5F7FA]">
                <div className="bg-white border border-[#E2E8F0] rounded-lg px-4 py-5 text-center">
                  {logoUrl && (
                    <img
                      src={logoUrl}
                      alt=""
                      className="h-12 w-auto mx-auto mb-2 object-contain"
                    />
                  )}
                  <p
                    className={`text-[15px] font-semibold leading-5 ${
                      live.hospital_name ? '' : 'text-[#94A3B8]'
                    }`}
                  >
                    {live.hospital_name || 'Laboratory name'}
                  </p>
                  <p
                    className={`text-xs mt-1.5 leading-4 ${
                      contactLine ? 'text-[#64748B]' : 'text-[#94A3B8]'
                    }`}
                  >
                    {contactLine || 'Address, phone and email'}
                  </p>

                  <div className="mt-4 pt-3 border-t border-[#E2E8F0] text-left text-xs text-[#94A3B8]">
                    Report content starts here
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </>
      )}

      {activeTab === 'users' && <UserManagementTab currentUser={currentUser || FALLBACK_USER} />}
    </div>
  );
};