import React, { useState, useEffect } from 'react';
import type { DoctorPayoutItem, UpdateDoctorPayoutInput } from '../../types';
import { Button } from '../../components/common/Button';
import { Alert } from '../../components/common/Alert';
import { formatCurrency } from '../../lib/utils';
import { X, Pencil, History } from 'lucide-react';

interface EditDoctorPayoutModalProps {
  isOpen: boolean;
  payout: DoctorPayoutItem | null;
  doctorName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditDoctorPayoutModal: React.FC<EditDoctorPayoutModalProps> = ({
  isOpen,
  payout,
  doctorName,
  onClose,
  onSuccess,
}) => {
  const [amountStr, setAmountStr] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'cheque' | 'other'>('cash');
  const [reference, setReference] = useState<string>('');
  const [baseNotes, setBaseNotes] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && payout) {
      setAmountStr((payout.amountPaisa / 100).toString());
      setPaymentDate(payout.paymentDate.slice(0, 10));
      setPaymentMethod((payout.paymentMethod as any) || 'cash');
      setReference(payout.reference || '');

      // Strip prior edit histories so user only edits base remarks
      const rawNotes = payout.notes || '';
      const histIdx = rawNotes.search(/\[EDIT HISTORY/i);
      const clean = histIdx >= 0 ? rawNotes.slice(0, histIdx).trim() : rawNotes.trim();
      setBaseNotes(clean);

      setEditReason('');
      setErrorMessage(null);
    }
  }, [isOpen, payout]);

  if (!isOpen || !payout) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amountStr);
    if (isNaN(num) || num <= 0) {
      setErrorMessage('Please enter a valid positive payout amount.');
      return;
    }
    if (!paymentDate) {
      setErrorMessage('Please enter a valid payment date.');
      return;
    }
    if (!editReason.trim()) {
      setErrorMessage('Reason for modification is required to maintain audit compliance.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const payload: UpdateDoctorPayoutInput = {
        id: payout.id,
        doctorId: payout.doctorId,
        amountPaisa: Math.round(num * 100),
        paymentDate,
        paymentMethod,
        reference: reference.trim() || undefined,
        notes: baseNotes.trim() || undefined,
        editReason: editReason.trim(),
      };

      const res = await window.electronAPI.doctorCommission.updatePayout(payload);
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || 'Failed to update payout entry.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error communicating with server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-600 text-white flex items-center justify-center shadow-sm">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Edit Doctor Payout Entry</h3>
              <p className="text-xs text-slate-500">
                Editing settlement for <span className="font-semibold text-teal-800">{doctorName}</span>
              </p>
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

          {/* Current / Before values info pill */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-slate-500" /> Current Entry Values:
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div>Amount: <strong className="text-slate-900">{formatCurrency(payout.amountPaisa)}</strong></div>
              <div>Date: <strong className="text-slate-900">{payout.paymentDate.slice(0, 10)}</strong></div>
              <div>Method: <strong className="text-slate-900 capitalize">{payout.paymentMethod}</strong></div>
              <div>Ref: <strong className="text-slate-900">{payout.reference || 'None'}</strong></div>
            </div>
          </div>

          {/* Amount and Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Amount (PKR) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-400">Rs.</span>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full h-10 pl-10 pr-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
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
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
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
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
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
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600"
              />
            </div>
          </div>

          {/* Base Remarks */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Base Remarks / Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Base remarks..."
              value={baseNotes}
              onChange={(e) => setBaseNotes(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 resize-none"
            />
          </div>

          {/* Mandatory Reason for Change */}
          <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg">
            <label className="block text-xs font-bold text-amber-900 mb-1">
              Reason for Modification <span className="text-red-600">*</span>
            </label>
            <p className="text-[11px] text-amber-800 mb-2">
              Explain why this payout record is being modified (e.g. corrected amount entered by mistake, change in payment mode, etc.). This audit note will be permanently logged.
            </p>
            <textarea
              rows={2}
              required
              placeholder="e.g. Corrected payout amount entered by mistake, actual payment was 2,000..."
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-amber-300 bg-white text-sm text-slate-800 focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 resize-none"
            />
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading} className="bg-amber-600 hover:bg-amber-700">
              {isLoading ? 'Saving Modification...' : 'Save Changes & Log Audit'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
