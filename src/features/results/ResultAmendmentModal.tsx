import React, { useState } from 'react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { Edit3, X, AlertTriangle } from 'lucide-react';

interface ResultAmendmentModalProps {
  resultId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ResultAmendmentModal: React.FC<ResultAmendmentModalProps> = ({
  resultId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !resultId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!newValue.trim()) {
      setServerError('Please enter the corrected result value.');
      return;
    }

    if (reason.trim().length < 10) {
      setServerError('A detailed clinical amendment explanation of at least 10 characters is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await window.electronAPI.results.amendResult({
        resultId,
        newValue: newValue.trim(),
        amendmentReason: reason.trim(),
      });

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setServerError(res.error || 'Failed to record clinical amendment.');
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
        <div className="px-6 py-4 bg-amber-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-300" />
            <h2 className="text-base font-bold">Formal Clinical Amendment</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-amber-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {serverError && <Alert type="error">{serverError}</Alert>}

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
            <p className="font-bold">Audit-Trailed Modification Guard:</p>
            <p>
              This report has already been finalized. Any change creates an immutable amendment record preserving the previous value and reasons.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Corrected Observed Value <span className="text-red-500">*</span>
            </label>
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Enter new verified result..."
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mandatory Clinical Reason / Justification <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Sample re-tested on alternate analyzer due to clinical query; verified value..."
              rows={3}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <p className="text-[11px] text-slate-400 mt-0.5">Minimum 10 characters required.</p>
          </div>

          {/* Footer */}
          <div className="pt-2 flex justify-end gap-3 border-t border-slate-100">
            <Button size="sm" variant="secondary" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit" isLoading={isSubmitting} className="bg-amber-700 hover:bg-amber-800">
              <Edit3 className="w-3.5 h-3.5 mr-1.5" />
              Sign & Save Amendment
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

