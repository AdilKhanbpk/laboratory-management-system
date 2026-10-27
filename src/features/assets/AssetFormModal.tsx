import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateAssetSchema, CreateAssetInput, LabAsset } from '../../types';
import { X, AlertCircle, Loader2 } from 'lucide-react';

interface AssetFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (asset: LabAsset) => void;
  assetToEdit?: LabAsset | null;
}

const inputClass =
  'block w-full h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] ' +
  'placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E] ' +
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:hidden';

const primaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md bg-[#0F766E] text-[13px] font-medium text-white ' +
  'hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 ' +
  'disabled:bg-[#94A3B8] disabled:cursor-not-allowed';

const secondaryBtn =
  'inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-[#CBD5E1] bg-white text-[13px] font-medium text-[#1F2937] ' +
  'hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]';

const CATEGORIES = [
  'Equipment',
  'Reagents & Chemicals',
  'Medical Supplies',
  'Maintenance & Repairs',
  'Utilities & Rent',
  'IT & Hardware',
  'General',
];

export const AssetFormModal: React.FC<AssetFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  assetToEdit,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pkrAmount, setPkrAmount] = useState<string>('');

  const todayStr = new Date().toISOString().split('T')[0];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateAssetInput>({
    resolver: zodResolver(CreateAssetSchema),
    defaultValues: {
      title: '',
      category: 'General',
      amountPaisa: 0,
      purchaseDate: todayStr,
      purchasedBy: 'technician',
      purchaserName: '',
      invoiceReceiptNo: '',
      vendorName: '',
      notes: '',
    },
  });

  const selectedPurchaser = watch('purchasedBy') || 'technician';

  useEffect(() => {
    if (isOpen) {
      if (assetToEdit) {
        const pkrVal = (assetToEdit.amount_paisa / 100).toString();
        setPkrAmount(pkrVal);
        reset({
          title: assetToEdit.title,
          category: assetToEdit.category || 'General',
          amountPaisa: assetToEdit.amount_paisa,
          purchaseDate: assetToEdit.purchase_date || todayStr,
          purchasedBy: assetToEdit.purchased_by || 'technician',
          purchaserName: assetToEdit.purchaser_name || '',
          invoiceReceiptNo: assetToEdit.invoice_receipt_no || '',
          vendorName: assetToEdit.vendor_name || '',
          notes: assetToEdit.notes || '',
        });
      } else {
        setPkrAmount('');
        reset({
          title: '',
          category: 'General',
          amountPaisa: 0,
          purchaseDate: todayStr,
          purchasedBy: 'technician',
          purchaserName: '',
          invoiceReceiptNo: '',
          vendorName: '',
          notes: '',
        });
      }
      setServerError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, assetToEdit, reset, todayStr]);

  if (!isOpen) return null;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPkrAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setValue('amountPaisa', Math.round(num * 100), { shouldValidate: true });
    } else {
      setValue('amountPaisa', 0, { shouldValidate: true });
    }
  };

  const onSubmit = async (data: CreateAssetInput) => {
    if (!data.amountPaisa || data.amountPaisa <= 0) {
      setServerError('Please enter a valid purchase amount greater than zero.');
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      if (assetToEdit) {
        const res = await window.electronAPI.assets.update({
          ...data,
          id: assetToEdit.id,
        });
        if (!res.success || !res.data) {
          setServerError(res.error || 'Failed to update asset entry.');
          setIsSubmitting(false);
          return;
        }
        onSuccess(res.data);
      } else {
        const res = await window.electronAPI.assets.create(data);
        if (!res.success || !res.data) {
          setServerError(res.error || 'Failed to create asset entry.');
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
        aria-labelledby="asset-form-title"
        className="bg-white rounded-lg border border-[#E2E8F0] max-w-xl w-full flex flex-col max-h-[92vh] text-[#1F2937]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#E2E8F0] shrink-0">
          <div>
            <h2 id="asset-form-title" className="text-base font-semibold">
              {assetToEdit ? 'Edit Asset / Purchase Entry' : 'New Asset or Purchase Entry'}
            </h2>
            <p className="mt-0.5 text-[13px] text-[#64748B]">
              Record expenses, equipment purchases, or laboratory supplies.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1F2937] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {serverError && (
              <div
                role="alert"
                className="flex gap-3 rounded-lg border border-[#E2E8F0] border-l-4 border-l-[#DC2626] bg-white px-4 py-3"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#DC2626]" />
                <div>
                  <p className="text-[13px] font-semibold">Could not save purchase entry</p>
                  <p className="text-[13px] text-[#64748B] mt-0.5">{serverError}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
              {/* Title */}
              <div className="sm:col-span-2">
                <label htmlFor="title" className="block text-[13px] font-medium text-[#1F2937] mb-1.5">
                  Item / Asset Description <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  id="title"
                  autoFocus
                  placeholder="e.g. Centrifuge Machine 4000 RPM, CBC Reagents Pack"
                  className={inputClass}
                  {...register('title')}
                />
                {errors.title && <p className="mt-1 text-xs text-[#DC2626]">{errors.title.message}</p>}
              </div>

              {/* Purchaser Selection: Technician vs Doctor */}
              <div className="sm:col-span-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-2">
                <span className="block text-[13px] font-semibold text-[#1F2937]">
                  Purchaser / Payment Source <span className="text-[#DC2626]">*</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                      selectedPurchaser === 'technician'
                        ? 'border-[#0F766E] bg-teal-50/60 ring-1 ring-[#0F766E]'
                        : 'border-[#CBD5E1] bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      value="technician"
                      className="mt-0.5 text-[#0F766E] focus:ring-[#0F766E]"
                      {...register('purchasedBy')}
                    />
                    <div>
                      <span className="block text-xs font-bold text-[#0F766E]">Technician</span>
                      <span className="block text-[11px] text-[#64748B] mt-0.5">
                        Added to technician share balance as reimbursement
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                      selectedPurchaser === 'doctor'
                        ? 'border-[#2563EB] bg-blue-50/60 ring-1 ring-[#2563EB]'
                        : 'border-[#CBD5E1] bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      value="doctor"
                      className="mt-0.5 text-[#2563EB] focus:ring-[#2563EB]"
                      {...register('purchasedBy')}
                    />
                    <div>
                      <span className="block text-xs font-bold text-[#2563EB]">Doctor / Investor</span>
                      <span className="block text-[11px] text-[#64748B] mt-0.5">
                        Lab expense; not added to technician balance
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Purchaser Name */}
              <div className="sm:col-span-2">
                <label htmlFor="purchaserName" className="block text-[13px] font-medium text-[#1F2937] mb-1.5">
                  {selectedPurchaser === 'doctor' ? 'Doctor Name' : 'Technician Name'}{' '}
                  <span className="text-[#64748B] font-normal">(optional)</span>
                </label>
                <input
                  id="purchaserName"
                  placeholder={selectedPurchaser === 'doctor' ? 'e.g. Dr. Tariq Mahmood' : 'e.g. Ahsan Khan'}
                  className={inputClass}
                  {...register('purchaserName')}
                />
              </div>

              {/* Amount (PKR) */}
              <div>
                <label htmlFor="amount" className="block text-[13px] font-medium text-[#1F2937] mb-1.5">
                  Amount (PKR) <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 15000"
                  value={pkrAmount}
                  onChange={handleAmountChange}
                  className={inputClass}
                />
                {errors.amountPaisa && (
                  <p className="mt-1 text-xs text-[#DC2626]">{errors.amountPaisa.message}</p>
                )}
              </div>

              {/* Purchase Date */}
              <div>
                <label htmlFor="purchaseDate" className="block text-[13px] font-medium text-[#1F2937] mb-1.5">
                  Purchase Date <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  id="purchaseDate"
                  type="date"
                  className={inputClass}
                  {...register('purchaseDate')}
                />
                {errors.purchaseDate && (
                  <p className="mt-1 text-xs text-[#DC2626]">{errors.purchaseDate.message}</p>
                )}
              </div>

              {/* Category */}
              <div>
                <label htmlFor="category" className="block text-[13px] font-medium text-[#1F2937] mb-1.5">
                  Category
                </label>
                <select id="category" className={inputClass} {...register('category')}>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vendor */}
              <div>
                <label htmlFor="vendorName" className="block text-[13px] font-medium text-[#1F2937] mb-1.5">
                  Vendor / Supplier <span className="text-[#64748B] font-normal">(optional)</span>
                </label>
                <input
                  id="vendorName"
                  placeholder="e.g. Al-Madina Scientific"
                  className={inputClass}
                  {...register('vendorName')}
                />
              </div>

              {/* Invoice / Receipt # */}
              <div>
                <label htmlFor="invoiceReceiptNo" className="block text-[13px] font-medium text-[#1F2937] mb-1.5">
                  Invoice / Receipt # <span className="text-[#64748B] font-normal">(optional)</span>
                </label>
                <input
                  id="invoiceReceiptNo"
                  placeholder="e.g. INV-2026-401"
                  className={inputClass}
                  {...register('invoiceReceiptNo')}
                />
              </div>

              {/* Notes */}
              <div className="sm:col-span-2">
                <label htmlFor="notes" className="block text-[13px] font-medium text-[#1F2937] mb-1.5">
                  Notes / Warranty Details <span className="text-[#64748B] font-normal">(optional)</span>
                </label>
                <textarea
                  id="notes"
                  rows={2}
                  placeholder="Additional details, warranty period, or purchase notes"
                  className="block w-full px-3 py-2 rounded-md border border-[#CBD5E1] bg-white text-[13px] text-[#1F2937] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]"
                  {...register('notes')}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E2E8F0] shrink-0 bg-[#F8FAFC]">
            <button type="button" onClick={onClose} disabled={isSubmitting} className={secondaryBtn}>
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className={primaryBtn}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Saving…' : assetToEdit ? 'Save Changes' : 'Record Purchase'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

