import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SetupWizard } from './components/auth/SetupWizard';
import { LoginView } from './components/auth/LoginView';
import { LockScreen } from './components/auth/LockScreen';
import { Header } from './components/layout/Header';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { DashboardView } from './features/dashboard/DashboardView';
import { DoctorListView } from './features/doctors/DoctorListView';
import { TestCatalogView } from './features/catalog/TestCatalogView';
import { NewVisitView } from './features/visits/NewVisitView';
import { VisitListView } from './features/visits/VisitListView';
import { HospitalSettingsView } from './features/settings/HospitalSettingsView';
import { AuditView } from './features/audit/AuditView';
import { AccessionWorklistView } from './features/results/AccessionWorklistView';
import { DoctorStatisticsView } from './features/reports/DoctorStatisticsView';
import { ReportTemplateDesignerView } from './features/reports/ReportTemplateDesignerView';
import { AssetsPurchasesView } from './features/assets/AssetsPurchasesView';
import { MyPercentageView } from './features/finance/MyPercentageView';
import { BackupRestoreView } from './features/backup/BackupRestoreView';
import { DeveloperPortalView } from './features/developer/DeveloperPortalView';
import { Loader2, AlertCircle, ShieldAlert } from 'lucide-react';
import { canUserAccessTab } from './lib/permissions';
import type { SessionInfo, SafeUser, HospitalSettings } from './types';

type AppState = 'loading' | 'setup' | 'login' | 'authenticated';

export const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('loading');
  const [user, setUser] = useState<SafeUser | null>(null);
  const [hospital, setHospital] = useState<HospitalSettings | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [isLocked, setIsLocked] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check setup & session status on startup
  const checkInitialStatus = useCallback(async () => {
    try {
      if (!window.electronAPI) {
        setStartupError('Electron IPC bridge is not available. Please launch within the Electron desktop application.');
        return;
      }

      const setupRes = await window.electronAPI.auth.checkSetup();
      if (!setupRes.success) {
        setStartupError(setupRes.error || 'Failed to verify database state.');
        return;
      }

      if (!setupRes.data?.isConfigured) {
        setAppState('setup');
        return;
      }

      // Check existing session
      const sessionRes = await window.electronAPI.auth.getSession();
      if (sessionRes.success && sessionRes.data) {
        setUser(sessionRes.data.user);
        setHospital(sessionRes.data.hospital);
        if (!canUserAccessTab(activeTab, sessionRes.data.user)) {
          setActiveTab('dashboard');
        }
        setAppState('authenticated');
      } else {
        // Also prefetch hospital profile for login screen branding
        const hospitalRes = await window.electronAPI.settings.getHospital();
        if (hospitalRes.success && hospitalRes.data) {
          setHospital(hospitalRes.data);
        }
        setAppState('login');
      }
    } catch (err: any) {
      setStartupError(err?.message || 'Unexpected application initialization failure.');
    }
  }, []);

  useEffect(() => {
    checkInitialStatus();
  }, [checkInitialStatus]);

  // Inactivity auto-lock timer
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    if (appState === 'authenticated' && hospital && !isLocked) {
      const timeoutMs = (hospital.inactivity_timeout_minutes || 15) * 60 * 1000;
      inactivityTimerRef.current = setTimeout(() => {
        setIsLocked(true);
      }, timeoutMs);
    }
  }, [appState, hospital, isLocked]);

  useEffect(() => {
    if (appState !== 'authenticated' || isLocked) return;

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => resetInactivityTimer();

    activityEvents.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));
    resetInactivityTimer();

    return () => {
      activityEvents.forEach((event) => window.removeEventListener(event, handleActivity));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [appState, isLocked, resetInactivityTimer]);

  // Global Keyboard shortcuts (Ctrl+L to lock workstation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (appState === 'authenticated') {
          setIsLocked(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState]);

  const handleLoginSuccess = (session: SessionInfo) => {
    setUser(session.user);
    setHospital(session.hospital);
    if (!canUserAccessTab(activeTab, session.user)) {
      setActiveTab('dashboard');
    }
    setAppState('authenticated');
    setIsLocked(false);
  };

  const handleLogout = async () => {
    try {
      await window.electronAPI.auth.logout();
    } catch {
      // ignore
    }
    setUser(null);
    setIsLocked(false);
    setActiveTab('dashboard');
    setAppState('login');
  };

  // Re-verify permission whenever user or activeTab changes
  useEffect(() => {
    if (user && !canUserAccessTab(activeTab, user)) {
      setActiveTab('dashboard');
    }
  }, [user, activeTab]);

  // 1. Loading & Startup Error States
  if (startupError) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 select-text">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4 border border-red-500/30">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-white mb-2">System Initialization Notice</h2>
          <p className="text-xs text-slate-300 mb-6 leading-relaxed">{startupError}</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                setStartupError(null);
                setAppState('setup');
              }}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-amber-600/20"
            >
              Enter Emergency Recovery Key
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-all"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6">
        <div className="w-12 h-12 rounded-2xl bg-brand-500 flex items-center justify-center mb-4 shadow-lg shadow-brand-500/40">
          <Loader2 className="w-6 h-6 animate-spin text-white" />
        </div>
        <h2 className="text-sm font-semibold tracking-wide">Starting Offline Laboratory System</h2>
        <p className="text-xs text-slate-400 mt-1">Initializing encrypted SQLite engine & DPAPI vault...</p>
      </div>
    );
  }

  // 2. Setup Wizard State (First Run)
  if (appState === 'setup') {
    return <SetupWizard onSetupComplete={checkInitialStatus} />;
  }

  // 3. Login Screen
  if (appState === 'login') {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        hospitalName={hospital?.hospital_name}
      />
    );
  }

  // 4. Main Authenticated Application Shell
  return (
    <ErrorBoundary>
      <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden select-none print:h-auto print:w-auto print:overflow-visible print:bg-white print:block">
        {/* Header */}
        {hospital && user && (
          <Header
            hospital={hospital}
            user={user}
            onLock={() => setIsLocked(true)}
            onLogout={handleLogout}
          />
        )}

        {/* Main Work Area: Sidebar + Content */}
        <div className="flex-1 flex overflow-hidden print:overflow-visible print:block">
          <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} user={user} />

          <main className="flex-1 overflow-y-auto p-6 bg-slate-100 print:p-0 print:m-0 print:bg-white print:overflow-visible print:block">
            {!canUserAccessTab(activeTab, user) ? (
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center shadow-sm">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <h2 className="text-base font-bold text-slate-900 mb-1">Access Restricted</h2>
                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                    Your account role does not have permission to view this section.
                    Please select an authorized module or return to the overview dashboard.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('dashboard')}
                    className="inline-flex items-center justify-center px-4 py-2 bg-[#0F766E] hover:bg-[#115E59] text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    Return to Overview
                  </button>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'dashboard' && hospital && user && (
                  <DashboardView
                    hospital={hospital}
                    user={user}
                    onNavigate={setActiveTab}
                  />
                )}

                {activeTab === 'doctors' && <DoctorListView />}

                {activeTab === 'tests' && <TestCatalogView />}

                {activeTab === 'assets' && <AssetsPurchasesView hospitalSettings={hospital} />}

                {activeTab === 'new-visit' && (
                  <NewVisitView
                    hospitalSettings={hospital}
                    onVisitCreated={() => setActiveTab('billing')}
                  />
                )}

                {activeTab === 'billing' && (
                  <VisitListView
                    hospitalSettings={hospital}
                    currentUser={user}
                    onNavigateNewVisit={() => setActiveTab('new-visit')}
                  />
                )}

                {activeTab === 'results' && <AccessionWorklistView currentUser={user} />}

                {activeTab === 'reports' && <DoctorStatisticsView />}

                {activeTab === 'report-designer' && <ReportTemplateDesignerView />}

                {activeTab === 'my-percentage' && <MyPercentageView />}

                {activeTab === 'backup' && <BackupRestoreView />}

                {activeTab === 'audit' && <AuditView />}

                {activeTab === 'settings' && hospital && (
                  <HospitalSettingsView
                    hospital={hospital}
                    currentUser={user || undefined}
                    onUpdate={(updated) => setHospital(updated)}
                  />
                )}

                {activeTab === 'developer' && (
                  <DeveloperPortalView onNavigate={(tab) => setActiveTab(tab)} />
                )}
              </>
            )}
          </main>
        </div>

        {/* Lock Screen Overlay (Active when workstation locked) */}
        {isLocked && user && (
          <LockScreen
            user={user}
            onUnlock={() => {
              setIsLocked(false);
              resetInactivityTimer();
            }}
            onLogout={handleLogout}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};

