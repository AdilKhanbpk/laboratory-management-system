import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateDoctorSchema, CreateDoctorInput, Doctor, DuplicateDoctorWarning } from '../../types';
import { X, AlertCircle, TriangleAlert, Loader2 } from 'lucide-react';

/*
 * Same tokens as the rest of the app:
 *   primary #0F766E / hover #115E59, surface #FFFFFF, text #1F2937, muted #64748B,
 *   border #E2E8F0 (inputs #CBD5E1), warning #D97706, error #DC2626.
 */

interface DoctorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (doctor: Doctor) => void;
  doctorToEdit?: Doctor | null;
}

const inputClass =
  'block w-full h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] ' +
  'placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]';

const primaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-[#0F766E] text-[13px] font-medium text-white ' +
  'hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 ' +
  'disabled:bg-[#94A3B8] disabled:cursor-not-allowed';

const secondaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] font-medium text-[#1F2937] ' +
  'hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]';

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ id, label, required, optional, error, className, children }) => (
  <div className={className}>
    <label htmlFor={id} className="block text-[13px] font-medium text-[#1F2937] mb-1.5">
      {label}
      {required && <span className="text-[#DC2626] ml-0.5">*</span>}
      {optional && <span className="text-[#64748B] font-normal ml-1">(optional)</span>}
    </label>
    {children}
    {error && <p className="mt-1.5 text-xs text-[#DC2626]">{error}</p>}
  </div>
);

export const DoctorFormModal: React.FC<DoctorFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  doctorToEdit,
}) => {
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateDoctorWarning | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<CreateDoctorInput>({
    resolver: zodResolver(CreateDoctorSchema),
    defaultValues: {
      fullName: '',
      specialization: '',
      phoneNumber: '',
      clinicHospitalName: '',
      address: '',
      notes: '',
    },
  });

  const watchedName = watch('fullName');

  useEffect(() => {
    if (isOpen) {
      if (doctorToEdit) {
        reset({
          fullName: doctorToEdit.full_name,
          specialization: doctorToEdit.specialization || '',
          phoneNumber: doctorToEdit.phone_number || '',
          clinicHospitalName: doctorToEdit.clinic_hospital_name || '',
          address: doctorToEdit.address || '',
          notes: doctorToEdit.notes || '',
        });
      } else {
        reset({
          fullName: '',
          specialization: '',
          phoneNumber: '',
          clinicHospitalName: '',
          address: '',
          notes: '',
        });
      }
      setDuplicateWarning(null);
      setServerError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, doctorToEdit, reset]);

  // Duplicate check
  useEffect(() => {
    if (!isOpen || !watchedName || watchedName.trim().length < 3) {
      setDuplicateWarning(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await window.electronAPI.doctors.checkDuplicates(watchedName, doctorToEdit?.id);
        if (res.success && res.data?.hasDuplicate) {
          setDuplicateWarning(res.data);
        } else {
          setDuplicateWarning(null);
        }
      } catch {
        // ignore
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [isOpen, watchedName, doctorToEdit?.id]);

  if (!isOpen) return null;

  const handleSafeClose = () => {
    if (isDirty) {
      if (window.confirm('You have unsaved doctor information. Discard changes?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const onSubmit = async (data: CreateDoctorInput) => {
    setIsSubmitting(true);
    setServerError(null);

    try {
      if (doctorToEdit) {
        const res = await window.electronAPI.doctors.update({
          ...data,
          id: doctorToEdit.id,
          isActive: doctorToEdit.is_active,
        });
        if (!res.success || !res.data) {
          setServerError(res.error || 'Failed to update doctor.');
          setIsSubmitting(false);
          return;
        }
        onSuccess(res.data);
      } else {
        const res = await window.electronAPI.doctors.create(data);
        if (!res.success || !res.data) {
          setServerError(res.error || 'Failed to add doctor.');
          setIsSubmitting(false);
          return;
        }
        onSuccess(res.data);
      }
      onClose();
    } catch (err: any) {
      setServerError(err?.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111827]/50 flex items-center justify-center p-4 sm:p-6 select-text">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="doctor-form-title"
        className="bg-white rounded-lg border border-[#E2E8F0] max-w-xl w-full flex flex-col max-h-[90vh] text-[#1F2937]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#E2E8F0] shrink-0">
          <div>
            <h2 id="doctor-form-title" className="text-base font-semibold">
              {doctorToEdit ? `Edit doctor: ${doctorToEdit.full_name}` : 'New referring doctor'}
            </h2>
            <p className="mt-0.5 text-[13px] text-[#64748B]">
              Doctors appear in the referral list when you create a visit.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSafeClose}
            aria-label="Close"
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1F2937] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col min-h-0">
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {serverError && (
              <div
                role="alert"
                className="flex gap-3 rounded-lg border border-[#E2E8F0] border-l-4 border-l-[#DC2626] bg-white px-4 py-3"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#DC2626]" />
                <div>
                  <p className="text-[13px] font-semibold">Could not save the doctor</p>
                  <p className="text-[13px] text-[#64748B] mt-0.5">{serverError}</p>
                </div>
              </div>
            )}

            {duplicateWarning && (
              <div
                role="status"
                className="flex gap-3 rounded-lg border border-[#E2E8F0] border-l-4 border-l-[#D97706] bg-white px-4 py-3"
              >
                <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-[#D97706]" />
                <div>
                  <p className="text-[13px] font-semibold">A doctor with this name already exists</p>
                  <p className="text-[13px] text-[#64748B] mt-0.5">
                    {duplicateWarning.duplicateByName?.full_name} (
                    {duplicateWarning.duplicateByName?.specialization || 'General'}) is already registered. You can
                    still save this doctor if they are a different person with the same name.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
              <Field
                id="fullName"
                label="Full name"
                required
                error={errors.fullName?.message}
                className="sm:col-span-2"
              >
                <input id="fullName" autoFocus className={inputClass} {...register('fullName')} />
              </Field>

              <Field id="specialization" label="Specialization" optional error={errors.specialization?.message}>
                <input
                  id="specialization"
                  placeholder="Pathologist, Cardiologist"
                  className={inputClass}
                  {...register('specialization')}
                />
              </Field>

              <Field id="phoneNumber" label="Phone" optional error={errors.phoneNumber?.message}>
                <input
                  id="phoneNumber"
                  placeholder="+92-300-0000000"
                  className={inputClass}
                  {...register('phoneNumber')}
                />
              </Field>

              <Field
                id="notes"
                label="Notes"
                optional
                error={errors.notes?.message}
                className="sm:col-span-2"
              >
                <textarea
                  id="notes"
                  rows={3}
                  placeholder="Consultation timings, referral details"
                  className="block w-full px-3 py-2 rounded-md border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
                  {...register('notes')}
                />
              </Field>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] rounded-b-lg shrink-0">
            <button type="button" onClick={handleSafeClose} className={secondaryBtn}>
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className={primaryBtn}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Saving…' : doctorToEdit ? 'Save changes' : 'Save doctor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};