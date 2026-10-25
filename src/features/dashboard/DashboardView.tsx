import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../lib/utils';
import { PlusCircle, FileCheck2 } from 'lucide-react';
import type { HospitalSettings, SafeUser, DoctorReferralStats } from '../../types';

/*
 * Same tokens as the rest of the app:
 *   primary #0F766E / hover #115E59, page #F5F7FA, surface #FFFFFF,
 *   text #1F2937, muted #64748B, border #E2E8F0, warning #D97706.
 * Numbers stay neutral. Color is used only for the primary action and
 * for the pending-results indicator (a warning state).
 */

interface DashboardViewProps {
  hospital: HospitalSettings;
  user: SafeUser;
  onNavigate: (tab: any) => void;
}

interface StatProps {
  label: string;
  value: number | null;
  note: string;
  onClick: () => void;
  warn?: boolean;
}

const Stat: React.FC<StatProps> = ({ label, value, note, onClick, warn }) => (
  <button
    type="button"
    onClick={onClick}
    className="bg-white px-5 py-4 text-left hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F766E]"
  >
    <span className="flex items-center gap-2 text-[13px] text-[#64748B]">
      {warn && value ? <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" aria-hidden="true" /> : null}
      {label}
    </span>
    <span className="block mt-1 text-[28px] leading-9 font-semibold text-[#1F2937] tabular-nums">
      {value === null ? '–' : value.toLocaleString()}
    </span>
    <span className="block mt-0.5 text-xs text-[#64748B]">{note}</span>
  </button>
);

const primaryBtn =
  'inline-flex items-center gap-2 h-9 px-4 rounded-md bg-[#0F766E] text-[13px] font-medium text-white ' +
  'hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2';

const secondaryBtn =
  'inline-flex items-center gap-2 h-9 px-4 rounded-md border border-[#CBD5E1] bg-white text-[13px] font-medium text-[#1F2937] ' +
  'hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]';

const th = 'px-5 py-2.5 text-xs font-medium text-[#64748B] whitespace-nowrap';
const td = 'px-5 py-3 text-[13px] whitespace-nowrap';

export const DashboardView: React.FC<DashboardViewProps> = ({ hospital, user, onNavigate }) => {
  const [doctorCount, setDoctorCount] = useState<number | null>(null);
  const [testCount, setTestCount] = useState<number | null>(null);
  const [visitCount, setVisitCount] = useState<number | null>(null);
  const [pendingResultsCount, setPendingResultsCount] = useState<number | null>(null);
  const [doctorStats, setDoctorStats] = useState<DoctorReferralStats[]>([]);
  const [statsLoaded, setStatsLoaded] = useState(false);

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
      setStatsLoaded(true);
    });
  }, []);

  const today = new Date().toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const topDoctors = doctorStats.slice(0, 5);

  return (
    <div className="space-y-6 text-[#1F2937]">
      {/* Page heading with the two daily actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Welcome back, {user.full_name}</h1>
          <p className="mt-1 text-[13px] text-[#64748B]">
            {hospital.hospital_name}, {today}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onNavigate('results')} className={secondaryBtn}>
            <FileCheck2 className="w-4 h-4 text-[#64748B]" />
            Open worklist
          </button>
          <button type="button" onClick={() => onNavigate('new-visit')} className={primaryBtn}>
            <PlusCircle className="w-4 h-4" />
            New visit and bill
          </button>
        </div>
      </div>

      {/* One panel, four figures. Pending results comes first: it is the work to do. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#E2E8F0] border border-[#E2E8F0] rounded-lg overflow-hidden">
        <Stat
          label="Pending results"
          value={pendingResultsCount}
          note="Waiting for result entry"
          warn
          onClick={() => onNavigate('results')}
        />
        <Stat
          label="Visits"
          value={visitCount}
          note="Orders and invoices on record"
          onClick={() => onNavigate('billing')}
        />
        <Stat
          label="Referring doctors"
          value={doctorCount}
          note="Registered"
          onClick={() => onNavigate('doctors')}
        />
        <Stat
          label="Tests in catalog"
          value={testCount}
          note="Tests and profiles"
          onClick={() => onNavigate('tests')}
        />
      </div>

      {/* Referring doctors */}
      <section className="bg-white border border-[#E2E8F0] rounded-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="text-sm font-semibold">Top referring doctors</h2>
            <p className="text-xs text-[#64748B] mt-0.5">Visits, tests ordered and billing per doctor</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="text-[13px] font-medium text-[#0F766E] hover:text-[#115E59] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] rounded"
          >
            View all
          </button>
        </div>

        {topDoctors.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr>
                  <th scope="col" className={th}>Doctor</th>
                  <th scope="col" className={th}>Specialization</th>
                  <th scope="col" className={`${th} text-right`}>Visits</th>
                  <th scope="col" className={`${th} text-right`}>Tests</th>
                  <th scope="col" className={`${th} text-right`}>Gross billing</th>
                  <th scope="col" className={`${th} text-right`}>Net revenue</th>
                </tr>
              </thead>
              <tbody>
                {topDoctors.map((s) => (
                  <tr
                    key={s.doctorId}
                    className="border-b border-[#E2E8F0] last:border-b-0 hover:bg-[#F8FAFC]"
                  >
                    <td className={`${td} font-medium`}>{s.doctorName}</td>
                    <td className={`${td} text-[#64748B]`}>{s.specialization || 'General'}</td>
                    <td className={`${td} text-right tabular-nums`}>{s.totalVisits}</td>
                    <td className={`${td} text-right tabular-nums`}>{s.totalTestsOrdered}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatCurrency(s.grossRevenuePaisa)}</td>
                    <td className={`${td} text-right tabular-nums font-semibold`}>
                      {formatCurrency(s.netRevenuePaisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-8 text-[13px] text-[#64748B]">
            {statsLoaded
              ? 'No referrals recorded yet. Doctors appear here once a visit is billed with a referring doctor.'
              : 'Loading…'}
          </p>
        )}
      </section>
    </div>
  );
};