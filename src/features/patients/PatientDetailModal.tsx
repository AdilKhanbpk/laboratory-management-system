import React, { useState, useEffect } from 'react';
import { Patient, Visit } from '../../types';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { formatDateTime, calculateAge, formatCurrency } from '../../lib/utils';
import {
  X,
  FileText,
  Clock,
  Edit2,
  FolderOpen,
} from 'lucide-react';

interface PatientDetailModalProps {
  patient: Patient | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (patient: Patient) => void;
}

export const PatientDetailModal: React.FC<PatientDetailModalProps> = ({
  patient,
  isOpen,
  onClose,
  onEdit,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'history'>('profile');
  const [historyVisits, setHistoryVisits] = useState<Visit[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (activeTab === 'history' && patient?.id) {
      setIsLoadingHistory(true);
      window.electronAPI.visits
        .getPatientHistory(patient.id)
        .then((res) => {
          if (res.success && res.data) {
            setHistoryVisits(res.data);
          }
        })
        .catch((err) => console.error('Failed to load patient history:', err))
        .finally(() => setIsLoadingHistory(false));
    }
  }, [activeTab, patient?.id]);

  if (!isOpen || !patient) return null;

  const ageInfo = calculateAge(patient.date_of_birth);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 select-text overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-500 text-white flex items-center justify-center font-bold text-base shadow-md">
              {patient.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white leading-tight">{patient.full_name}</h2>
                <Badge variant="info" className="font-mono text-xs">
                  {patient.patient_mrn}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Registered on {formatDateTime(patient.created_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-slate-200 border-slate-700 hover:bg-slate-800"
              onClick={() => onEdit(patient)}
            >
              <Edit2 className="w-3.5 h-3.5 mr-1.5" />
              Edit Record
            </Button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="px-6 border-b border-slate-200 flex gap-6 bg-slate-50 text-xs font-semibold shrink-0">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'profile'
                ? 'border-brand-500 text-brand-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Demographic Profile
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-brand-500 text-brand-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Medical & Visit History (Phases 3-4)
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {activeTab === 'profile' ? (
            <div className="space-y-6 text-xs">
              {/* Demographic Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Biological Sex
                  </span>
                  <span className="text-sm font-bold text-slate-800 capitalize">
                    {patient.gender}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Age & Date of Birth
                  </span>
                  <span className="text-sm font-bold text-slate-800">
                    {ageInfo ? `${ageInfo.formatted} (${patient.date_of_birth})` : 'Not specified'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Phone Number
                  </span>
                  <span className="text-sm font-bold text-slate-800">
                    {patient.phone_number || 'No phone number recorded'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Residential Address
                  </span>
                  <span className="text-sm font-medium text-slate-800">
                    {patient.address || 'No residential address recorded'}
                  </span>
                </div>
              </div>

              {/* Notes */}
              {patient.notes && (
                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80">
                  <h4 className="font-semibold text-amber-900 mb-1 flex items-center gap-1.5 text-xs">
                    <FileText className="w-3.5 h-3.5 text-amber-700" />
                    Clinical / Personal Notes
                  </h4>
                  <p className="text-amber-800 leading-relaxed whitespace-pre-wrap">{patient.notes}</p>
                </div>
              )}
            </div>
          ) : (
            /* History Tab Entry Point */
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-700">
                  Visits & Order History ({historyVisits.length})
                </span>
                <span className="text-[11px] font-mono text-slate-400">MRN: {patient.patient_mrn}</span>
              </div>

              {isLoadingHistory ? (
                <p className="text-center py-8 text-xs text-slate-400">Loading visit history...</p>
              ) : historyVisits.length > 0 ? (
                <div className="space-y-2.5">
                  {historyVisits.map((v) => (
                    <div
                      key={v.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-brand-700">{v.visit_number}</span>
                          <Badge
                            variant={
                              v.payment_status === 'paid'
                                ? 'success'
                                : v.payment_status === 'partially_paid'
                                ? 'warning'
                                : 'danger'
                            }
                            className="text-[10px] uppercase font-bold"
                          >
                            {v.payment_status || 'unpaid'}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {formatDateTime(v.order_date)}
                          {v.doctor_name && ` • Ref: ${v.doctor_name}`}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="font-mono font-bold text-slate-900 block">
                          {v.final_total !== undefined ? formatCurrency(v.final_total) : '—'}
                        </span>
                        {(v.balance_amount || 0) > 0 && (
                          <span className="font-mono text-[10px] text-amber-700 font-semibold block">
                            Bal: {formatCurrency(v.balance_amount!)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center mx-auto mb-2.5">
                    <FolderOpen className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">
                    No Orders Recorded Yet
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    This patient does not have any visits or invoices recorded. Use the "New Visit & Bill" desk to create their first order.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Last modified: {formatDateTime(patient.updated_at)}</span>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

