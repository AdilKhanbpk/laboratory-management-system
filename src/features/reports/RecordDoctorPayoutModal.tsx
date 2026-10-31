import React, { useState, useEffect } from 'react';
import type { Doctor, RecordDoctorPayoutInput } from '../../types';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { formatCurrency } from '../../lib/utils';
import { X, DollarSign } from 'lucide-react';

interface RecordDoctorPayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  doctors: Doctor[];
  defaultDoctorId?: number;
  pendingBalancePaisa?: number;
}

const getTodayDateString = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const RecordDoctorPayoutModal: React.FC<RecordDoctorPayoutModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  doctors,
  defaultDoctorId,
  pendingBalancePaisa = 0,
}) => {
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | ''>(defaultDoctorId || '');
  const [amountStr, setAmountStr] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(getTodayDateString());
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'cheque' | 'other'>('cash');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const docId = defaultDoctorId || (doctors.length > 0 ? doctors[0].id : '');
      setSelectedDoctorId(docId);
      if (pendingBalancePaisa > 0) {
        setAmountStr((pendingBalancePaisa / 100).toString());
      } else {
        setAmountStr('');
      }
      setPaymentDate(getTodayDateString());
      setPaymentMethod('cash');
      setReference('');
      setNotes('');
      setErrorMessage(null);
    }
  }, [isOpen, defaultDoctorId, pendingBalancePaisa, doctors]);

  if (!isOpen) return null;

  const currentDoctor = doctors.find((d) => d.id === selectedDoctorId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId) {
      setErrorMessage('Please select a doctor.');
      return;
    }
    const num = parseFloat(amountStr);
    if (isNaN(num) || num <= 0) {
      setErrorMessage('Please enter a valid positive payment amount.');
      return;
    }
    if (!paymentDate) {
      setErrorMessage('Please select a payment date.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const payload: RecordDoctorPayoutInput = {
        doctorId: Number(selectedDoctorId),
        amountPaisa: Math.round(num * 100),
        paymentDate,
        paymentMethod,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const res = await window.electronAPI.doctorCommission.recordPayout(payload);
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || 'Failed to record doctor payout.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error communicating with server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetFullPending = () => {
    if (pendingBalancePaisa > 0) {
      setAmountStr((pendingBalancePaisa / 100).toString());
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-600 text-white flex items-center justify-center shadow-sm">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Record Doctor Commission Payout</h3>
              <p className="text-xs text-slate-500">Record a payment or settlement to referring doctor</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && <Alert type="error">{errorMessage}</Alert>}

          {/* Doctor Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Doctor <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(Number(e.target.value))}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              required
            >
              <option value="" disabled>
                -- Choose a doctor --
              </option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} {d.commission_percentage > 0 ? `(${d.commission_percentage}% share)` : '(0% share)'}
                </option>
              ))}
            </select>
            {currentDoctor && (
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Configured Rate: <strong className="text-teal-700 font-semibold">{currentDoctor.commission_percentage}%</strong>
                </span>
                {pendingBalancePaisa > 0 && (
                  <button
                    type="button"
                    onClick={handleSetFullPending}
                    className="text-teal-700 hover:underline font-medium"
                  >
                    Outstanding: {formatCurrency(pendingBalancePaisa)} (Fill)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Amount and Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Amount (PKR) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-400">Rs.</span>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  placeholder="0.00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full h-10 pl-10 pr-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              />
            </div>
          </div>

          {/* Payment Method & Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer / Online</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reference / Cheque # <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. CHQ-98124 or Trx #..."
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Remarks / Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. October first half settlement, cash handed over to doctor clinic..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 resize-none"
            />
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading} className="bg-teal-700 hover:bg-teal-800">
              {isLoading ? 'Saving Payout...' : 'Record Payment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
