import React from 'react';
import { cn } from '../../lib/utils';
import { SafeUser } from '../../types';
import {
  LayoutDashboard,
  Stethoscope,
  FlaskConical,
  Receipt,
  FileCheck2,
  TrendingUp,
  Sliders,
  ShieldCheck,
  PlusCircle,
  HardDrive,
  History as HistoryIcon,
  Terminal,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'new-visit'
  | 'billing'
  | 'results'
  | 'doctors'
  | 'tests'
  | 'reports'
  | 'backup'
  | 'audit'
  | 'settings'
  | 'developer';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isCollapsed?: boolean;
  user?: SafeUser | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed = false,
  user,
}) => {
  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    phaseBadge?: string;
  }> = [
    {
      id: 'dashboard',
      label: 'Laboratory Overview',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'new-visit',
      label: 'New Visit & Bill',
      icon: <PlusCircle className="w-4 h-4 text-emerald-400" />,
    },
    {
      id: 'billing',
      label: 'Orders & Invoices',
      icon: <Receipt className="w-4 h-4 text-amber-400" />,
    },
    {
      id: 'results',
      label: 'Specimen & Results',
      icon: <FileCheck2 className="w-4 h-4 text-sky-400" />,
    },
    {
      id: 'doctors',
      label: 'Referring Doctors',
      icon: <Stethoscope className="w-4 h-4" />,
    },
    {
      id: 'tests',
      label: 'Test Catalog & Ranges',
      icon: <FlaskConical className="w-4 h-4" />,
    },
    {
      id: 'reports',
      label: 'Doctor Statistics',
      icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
    },
    {
      id: 'backup',
      label: 'Backup & Recovery',
      icon: <HardDrive className="w-4 h-4 text-cyan-400" />,
    },
    {
      id: 'audit',
      label: 'Security Audit Log',
      icon: <HistoryIcon className="w-4 h-4" />,
    },
    {
      id: 'settings',
      label: 'Hospital & System',
      icon: <Sliders className="w-4 h-4" />,
    },
  ];

  // Filter navigation items by role and permissions
  const filteredNavItems = navItems.filter((item) => {
    if (!user || user.role === 'admin') return true;
    if (item.id === 'dashboard') return true;
    if (!user.permissions || user.permissions === 'all') return true;
    const allowed = user.permissions.split(',').map((p) => p.trim());
    return allowed.includes(item.id);
  });

  return (
    <aside
      className={cn(
        'bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 transition-all duration-200 select-none border-r border-slate-800',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Navigation List */}
      <div className="py-4 px-3 space-y-1">
        <div className="px-3 pb-2 text-[10px] uppercase font-bold tracking-wider text-slate-500">
          {!isCollapsed && 'Clinical Modules'}
        </div>

        {filteredNavItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left relative group',
                isActive
                  ? 'bg-brand-500 text-white shadow-sm font-semibold'
                  : 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
              )}
            >
              <span className={cn('shrink-0', isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200')}>
                {item.icon}
              </span>

              {!isCollapsed && (
                <div className="flex-1 flex items-center justify-between truncate">
                  <span className="truncate">{item.label}</span>
                  {item.phaseBadge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                      {item.phaseBadge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Info Box */}
      {!isCollapsed && (
        <div className="p-3 border-t border-slate-800/80 text-xs text-slate-400">
          <button
            onClick={() => onSelectTab('developer')}
            className={`w-full flex items-center justify-between p-2 rounded-lg border text-left transition-colors group ${
              activeTab === 'developer'
                ? 'bg-amber-950/40 border-amber-600/60 text-amber-300'
                : 'bg-slate-950/50 hover:bg-slate-800/80 border-slate-800 text-slate-300'
            }`}
            title="Open Developer & Disaster Recovery Portal (Password Required)"
          >
            <div className="flex items-center gap-2 font-semibold text-xs">
              <Terminal className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-300" />
              <span>Clinical Workstation</span>
            </div>
            <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              Dev
            </span>
          </button>
          <p className="text-[10px] text-slate-500 leading-snug mt-2 px-1">
            Offline Laboratory System v1.0
          </p>
        </div>
      )}
    </aside>
  );
};
