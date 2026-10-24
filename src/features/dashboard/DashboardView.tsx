import React, { useState, useEffect } from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { formatCurrency } from '../../lib/utils';
import {
  FlaskConical,
  Receipt,
  Stethoscope,
  PlusCircle,
  FileCheck2,
  TrendingUp,
  Clock,
} from 'lucide-react';
import type { HospitalSettings, SafeUser, DoctorReferralStats } from '../../types';

interface DashboardViewProps {
  hospital: HospitalSettings;
  user: SafeUser;
  onNavigate: (tab: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ hospital, user, onNavigate }) => {
  const [doctorCount, setDoctorCount] = useState<number>(0);
  const [testCount, setTestCount] = useState<number>(0);
  const [visitCount, setVisitCount] = useState<number>(0);
  const [pendingResultsCount, setPendingResultsCount] = useState<number>(0);
  const [doctorStats, setDoctorStats] = useState<DoctorReferralStats[]>([]);

  useEffect(() => {
    window.electronAPI.doctors.list().then((res) => {
      if (res.success && res.data) {
        setDoctorCount(res.data.length);
      }
    });

    window.electronAPI.tests.list().then((res) => {
      if (res.success && res.data) {
        setTestCount(res.data.length);
      }
    });

    window.electronAPI.visits.search({ limit: 1 }).then((res) => {
      if (res.success && res.data) {
        setVisitCount(res.data.total);
      }
    });

    window.electronAPI.results.getWorklist({ status: 'pending' }).then((res) => {
      if (res.success && res.data) {
        setPendingResultsCount(res.data.length);
      }
    });

    window.electronAPI.reports.getDoctorStats().then((res) => {
      if (res.success && res.data) {
        setDoctorStats(res.data);
      }
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Welcome Banner */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Welcome, {user.full_name}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {hospital.hospital_name} • Laboratory Management Desk
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate('new-visit')}
            className="bg-emerald-600 hover:bg-emerald-700 shadow-sm"
          >
            <PlusCircle className="w-4 h-4 mr-1.5" />
            New Patient Bill
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('results')}
          >
            <FileCheck2 className="w-4 h-4 mr-1.5 text-sky-600" />
            Lab Worklist
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className="p-4 cursor-pointer hover:border-brand-300 transition-colors"
          onClick={() => onNavigate('billing')}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase">Total Visits & Bills</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{visitCount}</div>
          <p className="text-[11px] text-slate-400 mt-1">Patient orders & receipts</p>
        </Card>

        <Card
          className="p-4 cursor-pointer hover:border-brand-300 transition-colors"
          onClick={() => onNavigate('results')}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase">Pending Test Results</span>
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600">{pendingResultsCount}</div>
          <p className="text-[11px] text-slate-400 mt-1">Tests awaiting result entry</p>
        </Card>

        <Card
          className="p-4 cursor-pointer hover:border-brand-300 transition-colors"
          onClick={() => onNavigate('doctors')}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase">Referring Doctors</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <Stethoscope className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{doctorCount}</div>
          <p className="text-[11px] text-slate-400 mt-1">Registered physicians</p>
        </Card>

        <Card
          className="p-4 cursor-pointer hover:border-brand-300 transition-colors"
          onClick={() => onNavigate('tests')}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase">Test Catalog</span>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <FlaskConical className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{testCount}</div>
          <p className="text-[11px] text-slate-400 mt-1">Diagnostic tests & profiles</p>
        </Card>
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigate('new-visit')}
          className="p-4 rounded-xl bg-white border border-slate-200/90 hover:border-emerald-400 hover:shadow-sm cursor-pointer transition-all flex items-center gap-3.5"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <PlusCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Create Patient Bill</h3>
            <p className="text-[11px] text-slate-500">Book visit, select tests, and print receipt</p>
          </div>
        </div>

        <div
          onClick={() => onNavigate('results')}
          className="p-4 rounded-xl bg-white border border-slate-200/90 hover:border-sky-400 hover:shadow-sm cursor-pointer transition-all flex items-center gap-3.5"
        >
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Enter Test Results</h3>
            <p className="text-[11px] text-slate-500">Fill parameters and print diagnostic reports</p>
          </div>
        </div>

        <div
          onClick={() => onNavigate('billing')}
          className="p-4 rounded-xl bg-white border border-slate-200/90 hover:border-amber-400 hover:shadow-sm cursor-pointer transition-all flex items-center gap-3.5"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Orders & Invoices</h3>
            <p className="text-[11px] text-slate-500">View recent bills, receipts, and payments</p>
          </div>
        </div>
      </div>

      {/* Doctor Referral Statistics */}
      {doctorStats.length > 0 && (
        <Card
          title="Referring Doctor Analytics"
          subtitle="Recent doctor referrals, test orders, and billing summaries"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Doctor Name</th>
                  <th className="py-2.5 px-3">Specialization</th>
                  <th className="py-2.5 px-3 text-center">Visits</th>
                  <th className="py-2.5 px-3 text-center">Tests</th>
                  <th className="py-2.5 px-3 text-right">Gross Billing</th>
                  <th className="py-2.5 px-3 text-right">Net Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doctorStats.slice(0, 5).map((s) => (
                  <tr key={s.doctorId} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-brand-500" />
                      {s.doctorName}
                    </td>
                    <td className="py-2 px-3 text-slate-500">{s.specialization || 'General'}</td>
                    <td className="py-2 px-3 text-center font-bold text-slate-800">{s.totalVisits}</td>
                    <td className="py-2 px-3 text-center text-slate-600">{s.totalTestsOrdered}</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-700">
                      {formatCurrency(s.grossRevenuePaisa)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                      {formatCurrency(s.netRevenuePaisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
