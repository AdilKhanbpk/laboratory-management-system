import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateDoctorSchema, CreateDoctorInput, Doctor, DuplicateDoctorWarning } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { Stethoscope, X } from 'lucide-react';

interface DoctorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (doctor: Doctor) => void;
  doctorToEdit?: Doctor | null;
}

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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 select-text overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/30 border border-brand-400/40 flex items-center justify-center text-brand-300">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {doctorToEdit ? `Edit Doctor: ${doctorToEdit.full_name}` : 'Add Referring Physician / Doctor'}
              </h2>
              <p className="text-xs text-slate-300">
                Doctors appear in test prescription and referral dropdowns
              </p>
            </div>
          </div>
          <button
            onClick={handleSafeClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 overflow-y-auto space-y-4">
          {serverError && (
            <Alert type="error" title="Doctor Save Error">
              {serverError}
            </Alert>
          )}

          {duplicateWarning && (
            <Alert type="warning" title="Duplicate Doctor Name Notice">
              <p>
                A doctor with the name <strong>"{duplicateWarning.duplicateByName?.full_name}"</strong> ({duplicateWarning.duplicateByName?.specialization || 'General'}) already exists.
              </p>
              <p className="text-[11px] text-amber-800 font-medium pt-1">
                You may still add this doctor if they are an affiliated physician with the same name.
              </p>
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Doctor Full Name"
                required
                placeholder="e.g. Dr. Asadullah Khan"
                error={errors.fullName?.message}
                {...register('fullName')}
              />
            </div>

            <div>
              <Input
                label="Specialization (Optional)"
                placeholder="e.g. Pathologist, Cardiologist"
                error={errors.specialization?.message}
                {...register('specialization')}
              />
            </div>

            <div>
              <Input
                label="Contact Phone Number (Optional)"
                placeholder="+92-3XX-XXXXXXX"
                error={errors.phoneNumber?.message}
                {...register('phoneNumber')}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Referral Notes (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Consultation timings, referral details..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-500 transition-colors"
                {...register('notes')}
              />
              {errors.notes && <p className="mt-1 text-xs text-red-600 font-medium">{errors.notes.message}</p>}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleSafeClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {doctorToEdit ? 'Save Changes' : 'Register Doctor'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

