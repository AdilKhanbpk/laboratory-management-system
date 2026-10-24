import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreatePatientSchema, CreatePatientInput, Patient, DuplicatePatientWarning } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { calculateAge } from '../../lib/utils';
import { UserPlus, UserCheck, X } from 'lucide-react';

interface PatientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (patient: Patient) => void;
  patientToEdit?: Patient | null;
}

export const PatientFormModal: React.FC<PatientFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  patientToEdit,
}) => {
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicatePatientWarning | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<CreatePatientInput>({
    resolver: zodResolver(CreatePatientSchema),
    defaultValues: {
      fullName: '',
      dateOfBirth: '',
      gender: 'male',
      phoneNumber: '',
      address: '',
      notes: '',
    },
  });

  const watchedDob = watch('dateOfBirth');
  const watchedName = watch('fullName');
  const watchedPhone = watch('phoneNumber');

  const derivedAge = calculateAge(watchedDob);

  // Reset form when modal opens or patientToEdit changes
  useEffect(() => {
    if (isOpen) {
      if (patientToEdit) {
        reset({
          fullName: patientToEdit.full_name,
          dateOfBirth: patientToEdit.date_of_birth || '',
          gender: patientToEdit.gender,
          phoneNumber: patientToEdit.phone_number || '',
          address: patientToEdit.address || '',
          notes: patientToEdit.notes || '',
        });
      } else {
        reset({
          fullName: '',
          dateOfBirth: '',
          gender: 'male',
          phoneNumber: '',
          address: '',
          notes: '',
        });
      }
      setDuplicateWarning(null);
      setServerError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, patientToEdit, reset]);

  // Check for duplicates when name or phone changes (debounced)
  useEffect(() => {
    if (!isOpen || !watchedName || watchedName.trim().length < 3) {
      setDuplicateWarning(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await window.electronAPI.patients.checkDuplicates(
          watchedName,
          watchedPhone,
          patientToEdit?.id
        );
        if (res.success && res.data?.hasDuplicate) {
          setDuplicateWarning(res.data);
        } else {
          setDuplicateWarning(null);
        }
      } catch {
        // ignore duplicate check errors
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [isOpen, watchedName, watchedPhone, patientToEdit?.id]);

  if (!isOpen) return null;

  const handleSafeClose = () => {
    if (isDirty) {
      if (window.confirm('You have unsaved patient details. Are you sure you want to close this form?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const onSubmit = async (data: CreatePatientInput) => {
    setIsSubmitting(true);
    setServerError(null);

    try {
      if (patientToEdit) {
        const res = await window.electronAPI.patients.update({
          ...data,
          id: patientToEdit.id,
        });
        if (!res.success || !res.data) {
          setServerError(res.error || 'Failed to update patient record.');
          setIsSubmitting(false);
          return;
        }
        onSuccess(res.data);
      } else {
        const res = await window.electronAPI.patients.create(data);
        if (!res.success || !res.data) {
          setServerError(res.error || 'Failed to register patient.');
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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 select-text overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-brand-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/30 border border-brand-400/40 flex items-center justify-center text-brand-300">
              {patientToEdit ? <UserCheck className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold">
                {patientToEdit ? `Edit Patient Record: ${patientToEdit.patient_mrn}` : 'Register New Patient'}
              </h2>
              <p className="text-xs text-brand-200">
                {patientToEdit ? 'Update demographic and contact details' : 'Assigns a permanent Medical Record Number (MRN)'}
              </p>
            </div>
          </div>
          <button
            onClick={handleSafeClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-brand-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 overflow-y-auto space-y-5">
          {serverError && (
            <Alert type="error" title="Registration Error">
              {serverError}
            </Alert>
          )}

          {/* Non-blocking duplicate warning */}
          {duplicateWarning && (
            <Alert type="warning" title="Potential Duplicate Patient Notice">
              <div className="space-y-1">
                {duplicateWarning.duplicateByName && (
                  <p>
                    A patient with the name <strong>"{duplicateWarning.duplicateByName.full_name}"</strong> already exists (MRN: {duplicateWarning.duplicateByName.patient_mrn}).
                  </p>
                )}
                {duplicateWarning.duplicateByPhone && (
                  <p>
                    A patient with phone number <strong>{duplicateWarning.duplicateByPhone.phone_number}</strong> already exists (MRN: {duplicateWarning.duplicateByPhone.patient_mrn}).
                  </p>
                )}
                <p className="text-[11px] text-amber-800 font-medium pt-1">
                  You may still proceed if this is a different individual sharing the same name or family contact.
                </p>
              </div>
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Full Patient Name"
                required
                placeholder="e.g. Fatima Bibi or Muhammad Tariq"
                error={errors.fullName?.message}
                {...register('fullName')}
              />
            </div>

            {/* Gender Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Biological Sex <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-500 transition-colors"
                {...register('gender')}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              {errors.gender && <p className="mt-1 text-xs text-red-600 font-medium">{errors.gender.message}</p>}
            </div>

            {/* Date of Birth */}
            <div>
              <Input
                type="date"
                label="Date of Birth (Optional)"
                error={errors.dateOfBirth?.message}
                helperText={derivedAge ? `Calculated Age: ${derivedAge.formatted}` : 'Leave empty if unknown'}
                {...register('dateOfBirth')}
              />
            </div>

            {/* Phone */}
            <div>
              <Input
                label="Phone / Mobile Number"
                placeholder="+92-300-XXXXXXX (Optional)"
                error={errors.phoneNumber?.message}
                {...register('phoneNumber')}
              />
            </div>

            {/* Address */}
            <div>
              <Input
                label="Residential Address"
                placeholder="Street address, sector, city (Optional)"
                error={errors.address?.message}
                {...register('address')}
              />
            </div>

            {/* Medical / Nonessential Notes */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Clinical / Nonessential Notes (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Referred by Dr. Khan, diabetic history, emergency contact..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-500 transition-colors"
                {...register('notes')}
              />
              {errors.notes && <p className="mt-1 text-xs text-red-600 font-medium">{errors.notes.message}</p>}
            </div>
          </div>

          {/* Modal Action Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleSafeClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {patientToEdit ? 'Save Changes' : 'Register Patient & Generate MRN'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

