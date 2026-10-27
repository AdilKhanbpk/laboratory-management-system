import React, { useState, useEffect, useCallback } from 'react';
import type {
  PartnershipDashboardData,
  RecordPartnerPaymentInput,
} from '../../types';
import {
  Save,
  Wallet,
  ChevronDown,
  ShieldAlert,
  Download,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Percent,
  DollarSign,
  X,
  Pencil,
} from 'lucide-react';

type DatePreset = 'lifetime' | 'today' | 'last7' | 'this_month' | 'last_month' | 'custom';
type PaymentPartner = 'technician' | 'investor';
type TransactionType = 'profit_distribution' | 'advance' | 'expense_reimbursement' | 'adjustment';
type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'other';

interface NoticeState {
  tone: 'success' | 'error' | 'warning' | 'info';
  text: string;
}

interface EditingTxState {
  id: number;
  partner: PaymentPartner;
  type: TransactionType;
  amountPaisa: number;
  paymentDate: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  before: {
    partner: PaymentPartner;
    type: TransactionType;
    amountPaisa: number;
    paymentDate: string;
    method: PaymentMethod;
    reference: string;
    notes: string;
  };
}

const inputClass =
  'block w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-[13px] text-slate-800 ' +
  'placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700 ' +
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:hidden';

const buttonClass =
  'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-lg bg-[#0F766E] text-[13px] font-medium text-white ' +
  'hover:bg-[#115E59] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

const secondaryButton =
  'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 ' +
  'hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] disabled:opacity-50 transition-colors';

const money = (paisa?: number | null): string => {
  if (paisa === undefined || paisa === null) return '—';
  const val = paisa / 100;
  return `Rs. ${val.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const getLocalDateString = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block text-xs font-medium text-slate-700">
    <span className="mb-1 block">{label}</span>
    {children}
  </label>
);

const Panel: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, action, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-none">
    <div className="flex flex-col gap-1 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
    {children}
  </section>
);

const Notice: React.FC<{ notice: NoticeState | null; onDismiss?: () => void }> = ({ notice, onDismiss }) => {
  if (!notice) return null;
  const isErr = notice.tone === 'error';
  const isWarn = notice.tone === 'warning';
  const isSuccess = notice.tone === 'success';

  const bg = isErr
    ? 'bg-red-50 border-red-200 text-red-800'
    : isWarn
    ? 'bg-amber-50 border-amber-200 text-amber-800'
    : isSuccess
    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : 'bg-blue-50 border-blue-200 text-blue-800';

  return (
    <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border text-xs ${bg}`}>
      <div className="flex items-center gap-2">
        {isErr && <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
        {isWarn && <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />}
        {isSuccess && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />}
        <span>{notice.text}</span>
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-slate-400 hover:text-slate-600">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export const MyPercentageView: React.FC = () => {
  const [data, setData] = useState<PartnershipDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  // Filters
  const [preset, setPreset] = useState<DatePreset>('lifetime');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Split settings
  const [ownerPct, setOwnerPct] = useState<string>('50');

  // Partner Payment Form
  const todayStr = getLocalDateString();
  const [paymentPartner, setPaymentPartner] = useState<PaymentPartner>('technician');
  const [paymentType, setPaymentType] = useState<TransactionType>('profit_distribution');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayStr);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Collapsibles
  const [showDoctors, setShowDoctors] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [showTransactions, setShowTransactions] = useState(true);

  // Expanded Audits in My Percentage
  const [expandedTxAudits, setExpandedTxAudits] = useState<Record<number, boolean>>({});
  const [expandedAssetAudits, setExpandedAssetAudits] = useState<Record<number, boolean>>({});

  // Edit Transaction state
  const [editingTx, setEditingTx] = useState<EditingTxState | null>(null);
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editReason, setEditReason] = useState('');

  const fetchDashboard = useCallback(
    async (startOverride?: string, endOverride?: string) => {
      const sDate = startOverride !== undefined ? startOverride : startDate;
      const eDate = endOverride !== undefined ? endOverride : endDate;
      setIsLoading(true);
      try {
        const query = {
          startDate: sDate || undefined,
          endDate: eDate || undefined,
        };

        const partnershipApi = window.electronAPI.partnership || (window.electronAPI.finance as any);
        const res = await partnershipApi.getDashboard(query);

        if (res && res.success && res.data) {
          setData(res.data);
          if (res.data.period?.technicianPct !== undefined) {
            setOwnerPct(String(res.data.period.technicianPct));
          }
        } else {
          // Fallback to legacy summary if getDashboard is not ready
          const legacyRes = await window.electronAPI.finance.getMyPercentageSummary(query);
          if (legacyRes && legacyRes.success && legacyRes.data) {
            const l = legacyRes.data;
            const techPct = l.period.ownerPercentage || 50;
            const invPct = 100 - techPct;
            const invShare = Math.round((l.period.netProfitPaisa * invPct) / 100);
            setData({
              period: {
                ...l.period,
                totalCollectedPaisa: l.period.totalPaidPaisa,
                unpaidPatientBillsPaisa: Math.max(0, l.period.totalSalesPaisa - l.period.totalPaidPaisa),
                technicianPct: techPct,
                investorPct: invPct,
                investorSharePaisa: invShare,
                investorPaidPaisa: 0,
                investorRemainingBalancePaisa: invShare,
              },
              lifetime: {
                ...l.lifetime,
                totalCollectedPaisa: l.lifetime.totalPaidPaisa,
                investorSharePaisa: Math.round((l.lifetime.netProfitPaisa * invPct) / 100),
              },
              collection: {
                billedPaisa: l.period.totalSalesPaisa,
                collectedPaisa: l.period.totalPaidPaisa,
                outstandingPaisa: Math.max(0, l.period.totalSalesPaisa - l.period.totalPaidPaisa),
                collectionDifferencePaisa: 0,
                investorCollectedPaisa: l.period.totalPaidPaisa,
                technicianCollectedPaisa: 0,
                transferToTechnicianPaisa: l.period.totalReceivedPaisa,
              },
              doctorCommissions: l.doctorCommissions.map((d) => ({
                ...d,
                paidPaisa: 0,
                unpaidPaisa: d.commissionPaisa,
              })),
              transactions: [],
              expenses: [],
              closedMonths: [],
              capital: { investorCapitalPaisa: 0, capitalReturnedPaisa: 0, capitalRemainingPaisa: 0 },
              payouts: l.payouts || [],
            });
            setOwnerPct(String(techPct));
          }
        }
      } catch (err: any) {
        setNotice({ tone: 'error', text: err?.message || 'Failed to load partnership dashboard.' });
      } finally {
        setIsLoading(false);
      }
    },
    [startDate, endDate]
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handlePresetChange = (newPreset: DatePreset) => {
    setPreset(newPreset);
    const today = new Date();
    const todayIso = getLocalDateString(today);

    let start = '';
    let end = '';

    if (newPreset === 'lifetime') {
      start = '';
      end = '';
    } else if (newPreset === 'today') {
      start = todayIso;
      end = todayIso;
    } else if (newPreset === 'last7') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      start = getLocalDateString(d);
      end = todayIso;
    } else if (newPreset === 'this_month') {
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      start = `${y}-${m}-01`;
      end = todayIso;
    } else if (newPreset === 'last_month') {
      const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
      start = `${y}-${m}-01`;
      end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    } else if (newPreset === 'custom') {
      start = startDate || todayIso;
      end = endDate || todayIso;
    }

    setStartDate(start);
    setEndDate(end);
    fetchDashboard(start, end);
  };

  // Helper API caller
  const invoke = async (action: string, fn: () => Promise<any>, successMsg: string) => {
    setBusy(action);
    setNotice(null);
    try {
      const res = await fn();
      if (res && res.success === false) {
        setNotice({ tone: 'error', text: res.error || 'Operation failed.' });
      } else {
        setNotice({ tone: 'success', text: successMsg });
        await fetchDashboard();
      }
    } catch (err: any) {
      setNotice({ tone: 'error', text: err?.message || 'Unexpected failure.' });
    } finally {
      setBusy(null);
    }
  };

  // Split submission
  const submitSplit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(ownerPct);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setNotice({ tone: 'error', text: 'Enter a valid percentage from 0 to 100.' });
      return;
    }
    const partnershipApi = window.electronAPI.partnership || (window.electronAPI.finance as any);
    await invoke(
      'updateOwnerPercentage',
      () =>
        partnershipApi.updateSplit
          ? partnershipApi.updateSplit({ technicianPercentage: n, investorPercentage: 100 - n })
          : window.electronAPI.finance.updateOwnerPercentage(n),
      `Profit split updated: Technician ${n}% · Investor ${100 - n}%.`
    );
  };

  // Payment submission
  const submitPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setNotice({ tone: 'error', text: 'Enter a valid positive payout amount.' });
      return;
    }
    const payload: RecordPartnerPaymentInput = {
      paymentDate,
      amountPaisa: Math.round(amt * 100),
      partner: paymentPartner,
      type: paymentType,
      method: paymentMethod,
      reference: paymentReference.trim() || undefined,
      notes: paymentNotes.trim() || undefined,
    };
    const partnershipApi = window.electronAPI.partnership || (window.electronAPI.finance as any);
    await invoke(
      'recordPartnerPayment',
      () =>
        partnershipApi.recordPayment
          ? partnershipApi.recordPayment(payload)
          : window.electronAPI.finance.recordPayout({
              amountPaisa: Math.round(amt * 100),
              payoutDate: paymentDate,
              notes: `${paymentType}: ${paymentNotes}`,
            }),
      `Payment of Rs. ${amt.toLocaleString()} to ${paymentPartner} recorded.`
    );
    setAmount('');
    setPaymentReference('');
    setPaymentNotes('');
  };

  // Edit Payment Handlers
  const handleOpenEdit = (t: PartnershipDashboardData['transactions'][0]) => {
    // Strip previous audit trail messages from editable notes field so the user only edits base notes
    const rawNotes = t.notes || '';
    const histIdx = rawNotes.search(/\[EDIT HISTORY/i);
    const cleanNotes = histIdx >= 0 ? rawNotes.slice(0, histIdx).trim() : rawNotes.trim();

    setEditingTx({
      id: t.id,
      partner: t.partner,
      type: t.type,
      amountPaisa: t.amountPaisa,
      paymentDate: t.date,
      method: t.method,
      reference: t.reference || '',
      notes: cleanNotes,
      before: {
        partner: t.partner,
        type: t.type,
        amountPaisa: t.amountPaisa,
        paymentDate: t.date,
        method: t.method,
        reference: t.reference || '',
        notes: t.notes || '',
      },
    });
    setEditAmountStr((t.amountPaisa / 100).toString());
    setEditReason('');
  };

  const submitUpdateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || busy) return;
    const num = parseFloat(editAmountStr);
    if (isNaN(num) || num <= 0) {
      setNotice({ tone: 'error', text: 'Enter a valid positive amount.' });
      return;
    }
    if (!editReason.trim()) {
      setNotice({
        tone: 'error',
        text: 'Please enter details explaining why you are changing this payment record.',
      });
      return;
    }
    const partnershipApi = window.electronAPI.partnership;
    await invoke(
      'updatePartnerTransaction',
      () =>
        partnershipApi.updateTransaction({
          id: editingTx.id,
          partner: editingTx.partner,
          type: editingTx.type,
          amountPaisa: Math.round(num * 100),
          paymentDate: editingTx.paymentDate,
          method: editingTx.method,
          reference: editingTx.reference.trim() || undefined,
          notes: editingTx.notes.trim() || undefined,
          editReason: editReason.trim(),
        }),
      'Payment record updated and modification details logged.'
    );
    setEditingTx(null);
  };

  const closeMonth = async () => {
    const today = new Date();
    const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const targetMonth = prompt('Enter the month to finalize and lock (YYYY-MM):', defaultMonth);
    if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) return;

    const confirmClose = window.confirm(
      `Are you sure you want to finalize and lock settlement for ${targetMonth}? Records will be marked as closed.`
    );
    if (!confirmClose) return;

    const partnershipApi = window.electronAPI.partnership || (window.electronAPI.finance as any);
    await invoke(
      'closePartnershipMonth',
      () => partnershipApi.closeMonth({ month: targetMonth }),
      `Month ${targetMonth} successfully finalized and recorded in settlements ledger.`
    );
  };

  const exportStatement = async () => {
    const partnershipApi = window.electronAPI.partnership || (window.electronAPI.finance as any);
    try {
      const res: any = await (partnershipApi.exportStatement
        ? partnershipApi.exportStatement({ startDate: startDate || undefined, endDate: endDate || undefined })
        : window.electronAPI.finance.exportPartnershipStatement({ startDate: startDate || undefined, endDate: endDate || undefined }));
      if (res?.data?.cancelled || res?.cancelled) {
        return;
      }
      if (res?.success) {
        setNotice({ tone: 'success', text: 'Partnership settlement statement exported successfully.' });
      }
    } catch (err: any) {
      setNotice({ tone: 'error', text: err?.message || 'Failed to export statement.' });
    }
  };

  const period = data?.period;
  const extra = data;
  const technicianPct = period?.technicianPct ?? 50;
  const investorPct = period?.investorPct ?? 100 - technicianPct;
  // const periodInvestorShare = period?.investorSharePaisa;
  const doctorRows = data?.doctorCommissions || [];
  const activeTransactions = extra?.transactions ?? [];
  const periodAssets = extra?.assets ?? [];

  const periodLabel =
    startDate && endDate
      ? `${startDate} to ${endDate}`
      : startDate
      ? `From ${startDate}`
      : endDate
      ? `Up to ${endDate}`
      : 'All time / Lifetime';

  // Prominent banner calculation
  const techBalanceOwed = period?.remainingBalancePaisa ?? 0;
  let bannerMessage = 'All partner accounts are fully settled';
  let bannerColor = 'bg-teal-50 border-teal-200 text-teal-900';

  if (techBalanceOwed > 0) {
    bannerMessage = `Investor owes Technician ${money(techBalanceOwed)}`;
    bannerColor = 'bg-emerald-50 border-emerald-300 text-emerald-950';
  } else if (techBalanceOwed < 0) {
    bannerMessage = `Technician balance is ahead by ${money(Math.abs(techBalanceOwed))}`;
    bannerColor = 'bg-blue-50 border-blue-200 text-blue-900';
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Percent className="w-5 h-5 text-teal-700" />
            Partnership Profit &amp; Settlement Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Transparent revenue tracking, laboratory expenses, doctor commissions, and partner profit division
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportStatement}
            disabled={busy === 'exportStatement'}
            className={secondaryButton}
            title="Export clean PDF statement"
          >
            <Download className="w-4 h-4 text-slate-600" />
            Export Statement
          </button>
          <button
            type="button"
            onClick={() => fetchDashboard()}
            disabled={isLoading}
            className={secondaryButton}
            title="Refresh calculations"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

      {/* Prominent Outstanding Status Banner - Hidden when any date filter is applied */}
      {preset === 'lifetime' && !startDate && !endDate && (
        <div className={`p-4 sm:p-5 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 shadow-none ${bannerColor}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/80 border border-current flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold opacity-75">Settlement Status ({periodLabel})</p>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight mt-0.5">{bannerMessage}</h2>
            </div>
          </div>

          <div className="text-right sm:border-l sm:border-slate-200/50 sm:pl-5">
            <p className="text-xs text-slate-500">Period Net Profit</p>
            <p className="text-base font-bold text-slate-900 tabular-nums">{money(period?.netProfitPaisa)}</p>
          </div>
        </div>
      )}

      {/* Section A: 4 Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-teal-600" />
            Net Profit ({preset === 'lifetime' ? 'Lifetime' : 'Period'})
          </p>
          <p className="text-lg sm:text-xl font-bold text-slate-900 mt-2 tabular-nums">
            {money(period?.netProfitPaisa)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Billed sales less commissions &amp; expenses</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5 text-teal-600" />
            Technician Share ({technicianPct}%)
          </p>
          <p className="text-lg sm:text-xl font-bold text-teal-700 mt-2 tabular-nums">
            {money(period?.mySharePaisa)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Calculated profit entitlement</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-emerald-600" />
            Already Received ({preset === 'lifetime' ? 'Lifetime' : 'Period'})
          </p>
          <p className="text-lg sm:text-xl font-bold text-emerald-700 mt-2 tabular-nums">
            {money(period?.totalReceivedPaisa)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {preset === 'lifetime' ? 'Lifetime payments recorded' : `Payments in ${periodLabel}`}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-teal-600" />
            Remaining to Receive ({preset === 'lifetime' ? 'Lifetime' : 'Period'})
          </p>
          <p className="text-lg sm:text-xl font-bold text-slate-900 mt-2 tabular-nums">
            {money(period?.remainingBalancePaisa)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {preset === 'lifetime' ? 'Net pending balance' : `Net balance for ${periodLabel}`}
          </p>
        </div>
      </div>

      {/* Net Profit Preview Box: (Total Sales − Assets / Purchases − Doctors Percentage = Net Distributable Profit) */}
      <div className="rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50/70 via-slate-50 to-teal-50/40 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-teal-200/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-700 text-white font-bold text-xs">
              %
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Net Profit Preview
              </h3>
              <p className="text-xs text-slate-600">
                Total Sales − Assets &amp; Purchases − Doctors Percentage = Net Distributable Profit
              </p>
            </div>
          </div>
          <span className="self-start sm:self-auto rounded-full bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
            {periodLabel}
          </span>
        </div>

        {/* Formula Equation Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
          <div className="rounded-lg bg-white p-3 border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Sales / Bills
            </span>
            <span className="mt-1 block text-lg font-bold text-slate-900 tabular-nums">
              {money(period?.totalSalesPaisa)}
            </span>
            <span className="text-[11px] text-slate-400">Gross billed sales</span>
          </div>

          <div className="rounded-lg bg-white p-3 border border-amber-200">
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block flex items-center justify-between">
              <span>Assets / Purchases</span>
              <span className="text-xs font-bold text-amber-600">− Less</span>
            </span>
            <span className="mt-1 block text-lg font-bold text-amber-700 tabular-nums">
              {money(period?.totalAssetsPaisa)}
            </span>
            <span className="text-[11px] text-slate-500">
              {periodAssets.length > 0 ? `${periodAssets.length} items (${periodLabel})` : 'Lab operational expenses'}
            </span>
          </div>

          <div className="rounded-lg bg-white p-3 border border-blue-200">
            <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block flex items-center justify-between">
              <span>Doctors Percentage</span>
              <span className="text-xs font-bold text-blue-600">− Less</span>
            </span>
            <span className="mt-1 block text-lg font-bold text-blue-700 tabular-nums">
              {money(period?.totalDoctorsCommissionPaisa)}
            </span>
            <span className="text-[11px] text-slate-400">Referral commissions</span>
          </div>

          <div className="rounded-lg bg-teal-700 p-3 text-white">
            <span className="text-[11px] font-semibold text-teal-100 uppercase tracking-wider block flex items-center justify-between">
              <span>Net Profit</span>
              <span className="text-xs font-bold text-teal-200">= Result</span>
            </span>
            <span className="mt-1 block text-xl font-extrabold text-white tabular-nums">
              {money(period?.netProfitPaisa)}
            </span>
            <span className="text-[11px] text-teal-100">Distributable profit</span>
          </div>
        </div>

        {/* Split Breakdown */}
        {/* <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/80 p-3 border border-teal-200/50 text-xs text-slate-700">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              <strong>Technician Share ({technicianPct}%):</strong>{' '}
              <span className="font-semibold text-teal-800">{money(period?.mySharePaisa)}</span>
              {(period?.techOutOfPocketPaisa || 0) > 0 && (
                <span className="text-emerald-700 ml-1 font-medium">
                  (+{money(period?.techOutOfPocketPaisa)} tech asset reimbursement)
                </span>
              )}
            </span>
            <span>•</span>
            <span>
              <strong>Investor Share ({investorPct}%):</strong>{' '}
              <span className="font-semibold text-slate-900">{money(periodInvestorShare)}</span>
            </span>
          </div>
          <div className="text-slate-500 text-[11px]">
            Remaining Owed to Technician: <strong className="text-teal-800 font-bold">{money(period?.remainingBalancePaisa)}</strong>
          </div>
        </div> */}
      </div>

      {/* Section B: Date Filter Controls */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['lifetime', 'All time / Lifetime'],
              ['today', 'Today'],
              ['last7', 'Last 7 days'],
              ['this_month', 'This month'],
              ['last_month', 'Last month'],
              ['custom', 'Custom dates...'],
            ] as const
          ).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => handlePresetChange(val)}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
                preset === val
                  ? 'bg-teal-700 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <Field label="From Date">
              <input
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setStartDate(val);
                  fetchDashboard(val, endDate);
                }}
              />
            </Field>
            <Field label="To Date">
              <input
                type="date"
                className={inputClass}
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => {
                  const val = e.target.value;
                  setEndDate(val);
                  fetchDashboard(startDate, val);
                }}
              />
            </Field>
          </div>
        )}
      </section>

      {/* Section C: Profit Calculation & Partner Profit Split */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Profit calculation" subtitle={periodLabel}>
          <dl className="divide-y divide-slate-100">
            {[
              ['Sales / bills issued', period?.totalSalesPaisa],
              ['Less: doctor commissions', period?.totalDoctorsCommissionPaisa],
              ['Less: lab expenses / purchases', period?.totalAssetsPaisa],
              ['Net distributable profit', period?.netProfitPaisa],
            ].map(([label, value], i) => (
              <div
                key={String(label)}
                className={`flex items-center justify-between gap-4 px-4 py-3 sm:px-5 ${
                  i === 3 ? 'bg-slate-50 font-semibold' : ''
                }`}
              >
                <dt className="text-sm text-slate-800">{label}</dt>
                <dd className={`break-words text-right text-sm font-medium tabular-nums ${i === 3 ? 'text-teal-800 font-bold' : ''}`}>
                  {money(value as number | undefined)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-slate-200 px-4 py-3 text-xs leading-5 text-slate-500 sm:px-5">
            Current calculation follows billing records. Expenses are sourced from the Assets &amp; Purchases register.
          </p>
        </Panel>

        <Panel
          title="Technician Partnership Calculation"
          subtitle={`Technician ${technicianPct}% · Investor ${investorPct}%`}
        >
          <div className="divide-y divide-slate-100">
            {[
              {
                name: 'Technician',
                pct: technicianPct,
                share: period?.mySharePaisa,
                oop: period?.techOutOfPocketPaisa,
                paid: period?.totalReceivedPaisa,
                balance: period?.remainingBalancePaisa,
              }
              // {
              //   name: 'Investor',
              //   pct: investorPct,
              //   share: periodInvestorShare,
              //   oop: period?.investorOutOfPocketPaisa,
              //   paid: period?.investorPaidPaisa,
              //   balance: period?.investorRemainingBalancePaisa,
              // },
            ].map((row) => (
              <div key={row.name} className="p-4 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">{row.name}</p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {row.pct}%
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Base Share</dt>
                    <dd className="mt-1 font-medium tabular-nums text-slate-900">{money(row.share)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Asset / Out-of-pocket</dt>
                    <dd className={`mt-1 font-medium tabular-nums ${row.oop ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                      {row.oop ? `+${money(row.oop)}` : 'Rs. 0'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Payment recorded</dt>
                    <dd className="mt-1 font-medium tabular-nums text-slate-900">{money(row.paid)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Remaining Balance</dt>
                    <dd className="mt-1 font-semibold tabular-nums text-teal-800">{money(row.balance)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
          <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:px-5">
            Both partners' payments and balances are maintained in the persistent partnership ledger.
          </p>
        </Panel>
      </div>

      {/* Profit Split Settings Form */}
      <Panel
        title="Profit split settings"
        subtitle="This ratio divides net profit. Adjusting the percentage stores an effective-dated history record."
      >
        <form
          className="grid gap-3 p-4 sm:grid-cols-[minmax(0,220px)_1fr_auto] sm:items-end sm:p-5"
          onSubmit={submitSplit}
        >
          <Field label="Technician share (%)">
            <input
              className={inputClass}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={ownerPct}
              onChange={(e) => setOwnerPct(e.target.value)}
            />
          </Field>
          <p className="text-sm text-slate-600">
            Investor share:{' '}
            <strong>
              {Number.isFinite(Number(ownerPct)) ? `${Math.max(0, 100 - Number(ownerPct))}%` : '—'}
            </strong>
          </p>
          <button className={buttonClass} disabled={busy === 'updateOwnerPercentage'}>
            <Save className="h-4 w-4" />
            Save split
          </button>
        </form>
      </Panel>

      {/* Partner Settlement / Payment Form */}
      <Panel
        title="Record Technician settlement / payment"
        subtitle="Record profit distributions, advances, expense reimbursements, or adjustments."
      >
        <form className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5" onSubmit={submitPayout}>
          <Field label="Partner receiving payment">
            <select
              className={inputClass}
              value={paymentPartner}
              onChange={(e) => setPaymentPartner(e.target.value as PaymentPartner)}
            >
              <option value="technician">Technician</option>
              {/* <option value="investor">Investor</option> */}
            </select>
          </Field>
          <Field label="Payment type">
            <select
              className={inputClass}
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value as TransactionType)}
            >
              <option value="profit_distribution">Profit distribution</option>
              <option value="advance">Advance</option>
              <option value="expense_reimbursement">Expense reimbursement</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </Field>
          <Field label="Amount (PKR)">
            <input
              className={inputClass}
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 15000"
              required
            />
          </Field>
          <Field label="Payment date">
            <input
              className={inputClass}
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Method">
            <select
              className={inputClass}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Reference (optional)">
            <input
              className={inputClass}
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Receipt / transaction number"
            />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Notes (optional)">
              <input
                className={inputClass}
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Additional settlement details"
              />
            </Field>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <button
              className={buttonClass}
              disabled={busy === 'recordPartnerPayment'}
            >
              <Wallet className="h-4 w-4" />
              Save payment
            </button>
          </div>
        </form>
      </Panel>

      {/* Doctor Commission Status Accordion */}
      <Panel
        title="Doctor commission status"
        subtitle="Summary reports calculated referral commissions for each referring doctor."
      >
        <div className="p-4 sm:p-5">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-medium text-teal-800 hover:text-teal-900"
            onClick={() => setShowDoctors((v) => !v)}
            aria-expanded={showDoctors}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showDoctors ? 'rotate-180' : ''}`} />
            {showDoctors
              ? 'Hide doctor commissions'
              : `Show ${doctorRows.length} calculated doctor commissions`}
          </button>

          {showDoctors && (
            <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-2">
              {doctorRows.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">No doctor commission records in this period.</p>
              ) : (
                doctorRows.map((d) => (
                  <div key={d.doctorId} className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-3 text-sm">
                    <div className="col-span-2 sm:col-span-1">
                      <p className="font-semibold text-slate-900">{d.doctorName}</p>
                      <p className="text-xs text-slate-500">
                        {d.commissionPercentage}% · {d.referredVisits} visits
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Earned</p>
                      <p className="text-sm font-medium tabular-nums">{money(d.commissionPaisa)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Paid</p>
                      <p className="text-sm font-medium tabular-nums">{money(d.paidPaisa || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Unpaid Liability</p>
                      <p className="text-sm font-semibold tabular-nums text-teal-800">
                        {money(d.unpaidPaisa !== undefined ? d.unpaidPaisa : d.commissionPaisa)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </Panel>

      {/* Laboratory Assets & Purchases in Period Accordion */}
      <Panel
        title="Laboratory assets & purchases"
        subtitle={`Recorded equipment, materials, and supplies in selected period (${periodLabel}).`}
      >
        <div className="p-4 sm:p-5">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-medium text-teal-800 hover:text-teal-900"
            onClick={() => setShowAssets((v) => !v)}
            aria-expanded={showAssets}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showAssets ? 'rotate-180' : ''}`} />
            {showAssets
              ? 'Hide assets & purchases'
              : `Show ${periodAssets.length} asset purchases (${money(period?.totalAssetsPaisa)})`}
          </button>

          {showAssets && (
            <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-2">
              {periodAssets.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">No asset purchases recorded in this period.</p>
              ) : (
                periodAssets.map((a) => (
                  <div key={a.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{a.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {a.purchaseDate} · <span className="capitalize">{a.category}</span>
                        {a.purchasedBy ? ` · Purchased by: ${a.purchasedBy === 'technician' ? 'Technician' : 'Doctor'}` : ''}
                        {a.purchaserName ? ` (${a.purchaserName})` : ''}
                        {a.vendorName ? ` · Vendor: ${a.vendorName}` : ''}
                        {a.invoiceReceiptNo ? ` · Inv: ${a.invoiceReceiptNo}` : ''}
                        {a.recordedByName ? ` · By: ${a.recordedByName}` : ''}
                      </p>
                      {a.notes && (
                        <div className="mt-1.5 space-y-1.5 text-xs">
                          {(() => {
                            const isEditHistory = (str: string) =>
                              /\[EDIT HISTORY/i.test(str) ||
                              /Reason for change:/i.test(str) ||
                              /What changed:/i.test(str);
                            let baseNote = '';
                            const editTrails: string[] = [];

                            const parts = a.notes.split(/(?=\[EDIT HISTORY)/i).map((p) => p.trim()).filter(Boolean);
                            for (const p of parts) {
                              if (isEditHistory(p)) {
                                if (!editTrails.includes(p)) {
                                  editTrails.push(p);
                                }
                              } else {
                                baseNote = baseNote ? `${baseNote}\n${p}` : p;
                              }
                            }

                            const isExpanded = !!expandedAssetAudits[a.id];

                            return (
                              <>
                                {baseNote && <p className="text-slate-600 break-words">{baseNote}</p>}
                                {editTrails.length > 0 && (
                                  <div className="pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedAssetAudits((prev) => ({
                                          ...prev,
                                          [a.id]: !prev[a.id],
                                        }))
                                      }
                                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                                        isExpanded
                                          ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                          : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                      }`}
                                      title={isExpanded ? 'Hide audit modification records' : 'Show audit modification records'}
                                    >
                                      <span>📝 {isExpanded ? 'Hide Audits' : `Show Audits (${editTrails.length})`}</span>
                                    </button>
                                  </div>
                                )}
                                {isExpanded && editTrails.length > 0 && (
                                  <div className="space-y-1 pt-1">
                                    {editTrails.map((trail, idx) => (
                                      <div
                                        key={idx}
                                        className="rounded-md bg-amber-50/90 border border-amber-200/90 p-2 text-[11px] text-amber-950 whitespace-pre-wrap font-sans leading-relaxed"
                                      >
                                        <div className="font-semibold text-amber-800 flex items-center gap-1.5 mb-0.5">
                                          <span>📝 Modification Record:</span>
                                        </div>
                                        {trail}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <strong className="text-sm font-bold text-amber-700 tabular-nums">{money(a.amountPaisa)}</strong>
                      {a.purchasedBy === 'technician' && (
                        <span className="block text-[11px] text-emerald-700 font-medium">+reimbursed to technician</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </Panel>

      {/* Payment and Transaction History Panel */}
      <Panel
        title="Payment and transaction history"
        subtitle={`Manage and edit recorded payouts and settlements (${periodLabel}).`}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setShowTransactions((v) => !v)}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${showTransactions ? 'rotate-180' : ''}`} />
              {showTransactions ? 'Hide history' : 'Show history'}
            </button>
          </div>
        }
      >
        {showTransactions && (
          <div className="divide-y divide-slate-200">
            {activeTransactions.map((t) => (
              <div
                key={t.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50/50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {t.type.replace(/_/g, ' ')} ·{' '}
                    <span className="capitalize text-teal-800">{t.partner}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t.date}
                    {t.method ? ` · ${t.method}` : ''}
                    {t.reference ? ` · Ref: ${t.reference}` : ''}
                    {t.recordedByName ? ` · By: ${t.recordedByName}` : ''}
                  </p>
                  {t.notes && (
                    <div className="mt-1.5 space-y-1.5 text-xs">
                      {(() => {
                        const isEditHistory = (str: string) =>
                          /\[EDIT HISTORY/i.test(str) ||
                          /Reason for change:/i.test(str) ||
                          /What changed:/i.test(str);
                        let baseNote = '';
                        const editTrails: string[] = [];

                        const parts = t.notes.split(/(?=\[EDIT HISTORY)/i).map((p) => p.trim()).filter(Boolean);
                        for (const p of parts) {
                          if (isEditHistory(p)) {
                            if (!editTrails.includes(p)) {
                              editTrails.push(p);
                            }
                          } else {
                            baseNote = baseNote ? `${baseNote}\n${p}` : p;
                          }
                        }

                        const isExpanded = !!expandedTxAudits[t.id];

                        return (
                          <>
                            {baseNote && <p className="text-slate-600 break-words">{baseNote}</p>}
                            {editTrails.length > 0 && (
                              <div className="pt-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedTxAudits((prev) => ({
                                      ...prev,
                                      [t.id]: !prev[t.id],
                                    }))
                                  }
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                                    isExpanded
                                      ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                  }`}
                                  title={isExpanded ? 'Hide audit modification records' : 'Show audit modification records'}
                                >
                                  <span>📝 {isExpanded ? 'Hide Audits' : `Show Audits (${editTrails.length})`}</span>
                                </button>
                              </div>
                            )}
                            {isExpanded && editTrails.length > 0 && (
                              <div className="space-y-1 pt-1">
                                {editTrails.map((trail, idx) => (
                                  <div
                                    key={idx}
                                    className="rounded-md bg-amber-50/90 border border-amber-200/90 p-2 text-[11px] text-amber-950 whitespace-pre-wrap font-sans leading-relaxed"
                                  >
                                    <div className="font-semibold text-amber-800 flex items-center gap-1.5 mb-0.5">
                                      <span>📝 Modification Record:</span>
                                    </div>
                                    {trail}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <strong className="text-sm tabular-nums text-slate-900 min-w-[100px]">{money(t.amountPaisa)}</strong>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-teal-700 transition-colors"
                      onClick={() => handleOpenEdit(t)}
                      title="Edit payout entry"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {!activeTransactions.length && (
              <p className="p-5 text-sm text-slate-500">No payment records found for {periodLabel}.</p>
            )}
          </div>
        )}
      </Panel>

      {/* Monthly Settlement & Investor Capital Panels */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Monthly settlement"
          subtitle="Finalize and lock monthly periods after verifying collections, expenses, and doctor shares."
        >
          <div className="space-y-3 p-4 sm:p-5">
            <button
              type="button"
              className={buttonClass}
              onClick={closeMonth}
              disabled={busy === 'closePartnershipMonth'}
            >
              <ShieldAlert className="h-4 w-4" />
              Finalize / Close selected month
            </button>

            {extra?.closedMonths?.length ? (
              <div className="pt-3 border-t border-slate-100">
                <p className="mb-2 text-xs font-semibold text-slate-600">Previously finalized months</p>
                <div className="space-y-1">
                  {extra.closedMonths.map((m) => (
                    <div
                      key={m.month}
                      className="flex justify-between items-center gap-3 py-2 text-xs border-b border-slate-100 last:border-b-0"
                    >
                      <span className="font-semibold text-slate-800">{m.month}</span>
                      <span className="text-slate-500">
                        Closed {m.closedAt.slice(0, 10)}
                        {m.closedByName ? ` by ${m.closedByName}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">No months finalized yet.</p>
            )}
          </div>
        </Panel>

        {/* <Panel
          title="Statement &amp; Investor capital"
          subtitle="Printable settlement statement and optional initial capital tracking."
        >
          <div className="space-y-4 p-4 sm:p-5">
            <button
              type="button"
              className={buttonClass}
              onClick={exportStatement}
              disabled={busy === 'exportStatement'}
            >
              <Download className="h-4 w-4" />
              Export settlement statement (PDF)
            </button>

            {extra?.capital ? (
              <dl className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 sm:grid-cols-3">
                {[
                  ['Investor capital', extra.capital.investorCapitalPaisa],
                  ['Capital returned', extra.capital.capitalReturnedPaisa],
                  ['Capital remaining', extra.capital.capitalRemainingPaisa],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                      {money(value as number)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs leading-5 text-slate-500">
                Investor capital tracking is available if your partnership agreement treats initial capital separately from profit.
              </p>
            )}
          </div>
        </Panel> */}
      </div>

      {/* Accounting Note Footer */}
      <footer className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
        <strong className="text-slate-800">Accounting note:</strong> This dashboard displays net profit (sales less commissions and laboratory expenses) divided according to your partnership ratio, along with recorded partner payments and remaining settlement balances.
      </footer>

      {/* Edit Payment Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-teal-700" />
                Edit Payment Record #{editingTx.id}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Original / Before Values Card */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <span>Original / Before Values</span>
                <span>ID #{editingTx.id}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
                <div>Amount: <strong className="text-slate-900 font-bold">{money(editingTx.before.amountPaisa)}</strong></div>
                <div>Date: <strong className="text-slate-900 font-bold">{editingTx.before.paymentDate}</strong></div>
                <div>Partner: <strong className="text-slate-900 font-bold capitalize">{editingTx.before.partner}</strong></div>
                <div>Type: <strong className="text-slate-900 font-bold">{editingTx.before.type.replace(/_/g, ' ')}</strong></div>
              </div>
            </div>

            <form onSubmit={submitUpdateTx} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Partner receiving payment">
                  <select
                    className={inputClass}
                    value={editingTx.partner}
                    onChange={(e) =>
                      setEditingTx({ ...editingTx, partner: e.target.value as PaymentPartner })
                    }
                  >
                    <option value="technician">Technician</option>
                    {/* <option value="investor">Investor</option> */}
                  </select>
                </Field>

                <Field label="Payment type">
                  <select
                    className={inputClass}
                    value={editingTx.type}
                    onChange={(e) =>
                      setEditingTx({ ...editingTx, type: e.target.value as TransactionType })
                    }
                  >
                    <option value="profit_distribution">Profit distribution</option>
                    <option value="advance">Advance</option>
                    <option value="expense_reimbursement">Expense reimbursement</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Amount (PKR)">
                  <input
                    className={inputClass}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editAmountStr}
                    onChange={(e) => setEditAmountStr(e.target.value)}
                    required
                  />
                </Field>

                <Field label="Payment date">
                  <input
                    className={inputClass}
                    type="date"
                    value={editingTx.paymentDate}
                    onChange={(e) =>
                      setEditingTx({ ...editingTx, paymentDate: e.target.value })
                    }
                    required
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Payment method">
                  <select
                    className={inputClass}
                    value={editingTx.method}
                    onChange={(e) =>
                      setEditingTx({ ...editingTx, method: e.target.value as PaymentMethod })
                    }
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </Field>

                <Field label="Reference (optional)">
                  <input
                    className={inputClass}
                    value={editingTx.reference}
                    onChange={(e) =>
                      setEditingTx({ ...editingTx, reference: e.target.value })
                    }
                    placeholder="Receipt / transaction number"
                  />
                </Field>
              </div>

              <Field label="Notes (optional)">
                <input
                  className={inputClass}
                  value={editingTx.notes}
                  onChange={(e) =>
                    setEditingTx({ ...editingTx, notes: e.target.value })
                  }
                  placeholder="Additional details"
                />
              </Field>

              {/* Mandatory Reason for Change */}
              <div className="pt-1">
                <Field label="Detail / Reason for modification (Mandatory) *">
                  <textarea
                    className="block w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
                    rows={2}
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="Explain why this record is being modified (e.g. Corrected typo in amount, adjusted payment date)"
                    required
                  />
                </Field>
                <p className="mt-1 text-[11px] text-slate-500">
                  The original values and your reason will be preserved in a tracking audit message (not used for calculation).
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => setEditingTx(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={buttonClass}
                  disabled={busy === 'updatePartnerTransaction'}
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
