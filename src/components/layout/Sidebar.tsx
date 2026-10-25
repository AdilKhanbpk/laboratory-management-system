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
  PlusCircle,
  HardDrive,
  History as HistoryIcon,
  Terminal,
  Palette,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'new-visit'
  | 'billing'
  | 'results'
  | 'doctors'
  | 'tests'
  | 'reports'
  | 'report-designer'
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

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

/*
 * Colors: sidebar #111827, active item #0F766E, hover white/5,
 * text #CBD5E1 (default) / #FFFFFF (active), muted #94A3B8, dividers white/10.
 * Icons inherit the text color. No per-item icon colors.
 */
const navGroups: NavGroup[] = [
  {
    title: 'Front desk',
    items: [
      { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
      { id: 'new-visit', label: 'New visit and bill', icon: <PlusCircle className="w-4 h-4" /> },
      { id: 'billing', label: 'Orders and invoices', icon: <Receipt className="w-4 h-4" /> },
    ],
  },
  {
    title: 'Laboratory',
    items: [
      { id: 'results', label: 'Specimens and results', icon: <FileCheck2 className="w-4 h-4" /> },
      { id: 'tests', label: 'Test catalog', icon: <FlaskConical className="w-4 h-4" /> },
      { id: 'doctors', label: 'Referring doctors', icon: <Stethoscope className="w-4 h-4" /> },
      { id: 'report-designer', label: 'Report design', icon: <Palette className="w-4 h-4" /> },
    ],
  },
  {
    title: 'Administration',
    items: [
      { id: 'reports', label: 'Doctor statistics', icon: <TrendingUp className="w-4 h-4" /> },
      { id: 'audit', label: 'Audit log', icon: <HistoryIcon className="w-4 h-4" /> },
      { id: 'backup', label: 'Backup and recovery', icon: <HardDrive className="w-4 h-4" /> },
      { id: 'settings', label: 'Laboratory settings', icon: <Sliders className="w-4 h-4" /> },
    ],
  },
];

const itemClass = (isActive: boolean, isCollapsed: boolean) =>
  cn(
    'w-full flex items-center h-9 rounded-md text-[13px] text-left transition-colors',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-1 focus-visible:ring-offset-[#111827]',
    isCollapsed ? 'justify-center' : 'gap-3 px-3',
    isActive
      ? 'bg-[#0F766E] text-white font-medium'
      : 'text-[#CBD5E1] hover:bg-white/5 hover:text-white'
  );

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed = false,
  user,
}) => {
  // Filter navigation items by role and permissions
  const canSee = (id: NavTab) => {
    if (!user || user.role === 'admin') return true;
    if (id === 'dashboard') return true;
    if (!user.permissions || user.permissions === 'all') return true;
    const allowed = user.permissions.split(',').map((p) => p.trim());
    return allowed.includes(id);
  };

  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => canSee(item.id)) }))
    .filter((group) => group.items.length > 0);

  return (
    <aside
      className={cn(
        'bg-[#111827] flex flex-col shrink-0 select-none border-r border-white/10 transition-[width] duration-200',
        isCollapsed ? 'w-16' : 'w-60'
      )}
    >
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {visibleGroups.map((group, index) => (
          <div key={group.title} className={cn(index > 0 && 'mt-5')}>
            {isCollapsed ? (
              index > 0 && <div className="mb-3 border-t border-white/10" />
            ) : (
              <p className="px-3 mb-1.5 text-xs font-medium text-[#94A3B8]">{group.title}</p>
            )}

            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelectTab(item.id)}
                      title={isCollapsed ? item.label : undefined}
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      className={itemClass(isActive, isCollapsed)}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-3">
        <button
          type="button"
          onClick={() => onSelectTab('developer')}
          title="Developer and disaster recovery portal (password required)"
          aria-label="Developer portal"
          aria-current={activeTab === 'developer' ? 'page' : undefined}
          className={itemClass(activeTab === 'developer', isCollapsed)}
        >
          <Terminal className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span className="truncate">Developer portal</span>}
        </button>

        {!isCollapsed && <p className="mt-3 px-3 text-xs text-[#94A3B8]">Version 1.0.0</p>}
      </div>
    </aside>
  );
};
