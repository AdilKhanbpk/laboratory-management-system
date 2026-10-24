import React, { useState } from 'react';
import { Visit, Payment } from '../../types';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { formatCurrency, parseCurrencyToPaisa } from '../../lib/utils';
import { Coins, X, Receipt } from 'lucide-react';

interface RecordPaymentModalProps {
  visit: Visit | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (payment: Payment) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  visit,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [amountInput, setAmountInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'cheque' | 'other'>('cash');
  const [reference, setReference] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !visit) return null;

  const currentBalancePaisa = visit.balance_amount ?? 0;

  const handleQuickPayFull = () => {
    setAmountInput((currentBalancePaisa / 100).toFixed(2));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const amountPaisa = parseCurrencyToPaisa(amountInput);
    if (amountPaisa <= 0) {
      setServerError('Payment amount must be greater than zero.');
      return;
    }

    if (amountPaisa > currentBalancePaisa) {
      setServerError(`Payment amount exceeds outstanding balance (${formatCurrency(currentBalancePaisa)}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await window.electronAPI.billing.recordPayment({
        invoiceId: visit.id, // Visit and invoice are 1:1, or pass visit invoice
        amountPaisa,
        paymentMethod,
        transactionReference: reference.trim() || undefined,
      });

      if (res.success && res.data) {
        onSuccess(res.data);
        onClose();
      } else {
        setServerError(res.error || 'Failed to record payment.');
      }
    } catch (err: any) {
      setServerError(err?.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Coins className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold">Collect Invoice Payment</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {serverError && <Alert type="error">{serverError}</Alert>}

          {/* Visit & Balance Summary */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Visit / Invoice:</span>
              <span className="font-mono font-bold text-slate-800">
                {visit.visit_number} ({visit.invoice_number})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Patient:</span>
              <span className="font-semibold text-slate-800">{visit.patient_name}</span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200 text-amber-800">
              <span>Outstanding Balance:</span>
              <span className="font-mono">{formatCurrency(currentBalancePaisa)}</span>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-700">Payment Amount (PKR)</label>
              <button
                type="button"
                onClick={handleQuickPayFull}
                className="text-[11px] font-bold text-brand-600 hover:underline"
              >
                Pay Full Balance
              </button>
            </div>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={(currentBalancePaisa / 100).toFixed(2)}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="cash">Cash</option>
              <option value="credit_card">Credit Card</option>
              <option value="debit_card">Debit Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Reference */}
          <div>
            <Input
              label="Transaction / Receipt Reference (Optional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. Cash drawer slot or check ref"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex justify-end gap-3 border-t border-slate-100">
            <Button size="sm" variant="secondary" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" isLoading={isSubmitting}>
              <Receipt className="w-4 h-4 mr-1.5" />
              Confirm & Issue Receipt
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
