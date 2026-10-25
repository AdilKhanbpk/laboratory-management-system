// import React, { useState, useEffect } from 'react';
// import { HospitalSettings, SafeUser } from '../../types';
// import {
//   Lock,
//   LogOut,
//   Clock,
//   User,
//   Activity,
// } from 'lucide-react';

// interface HeaderProps {
//   hospital: HospitalSettings;
//   user: SafeUser;
//   onLock: () => void;
//   onLogout: () => void;
// }

// export const Header: React.FC<HeaderProps> = ({ hospital, user, onLock, onLogout }) => {
//   const [timeStr, setTimeStr] = useState<string>('');

//   useEffect(() => {
//     const updateTime = () => {
//       const now = new Date();
//       setTimeStr(
//         now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
//       );
//     };
//     updateTime();
//     const timer = setInterval(updateTime, 1000);
//     return () => clearInterval(timer);
//   }, []);

//   return (
//     <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between select-none shrink-0 shadow-sm z-20">
//       {/* Hospital Identity */}
//       <div className="flex items-center gap-3">
//         {hospital.logo_url ? (
//           <div className="w-10 h-10 rounded-xl border border-slate-200 bg-white p-0.5 flex items-center justify-center overflow-hidden shadow-sm shrink-0">
//             <img
//               src={hospital.logo_url}
//               alt={hospital.hospital_name}
//               className="max-h-full max-w-full object-contain"
//             />
//           </div>
//         ) : (
//           <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center font-bold shadow-md shadow-brand-500/20 shrink-0">
//             <Activity className="w-6 h-6" />
//           </div>
//         )}
//         <div>
//           <h2 className="text-sm font-bold text-slate-900 tracking-tight leading-tight">
//             {hospital.hospital_name}
//           </h2>
//           <p className="text-xs text-slate-500 leading-none mt-0.5">
//             {hospital.tagline || 'Clinical Diagnostics & Laboratory System'}
//           </p>
//         </div>
//       </div>

//       {/* Center System Status */}
//       {/* <div className="hidden md:flex items-center gap-2">
//         <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
//           <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
//           Workstation Ready
//         </span>
//       </div> */}

//       {/* Right Controls: Clock & User */}
//       <div className="flex items-center gap-4">
//         {/* Clock */}
//         <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono">
//           <Clock className="w-3.5 h-3.5 text-slate-400" />
//           <span>{timeStr}</span>
//         </div>

//         {/* User Pill */}
//         <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
//           <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
//             <User className="w-4 h-4" />
//           </div>
//           <div className="text-left hidden sm:block">
//             <p className="text-xs font-semibold text-slate-800 leading-tight">{user.full_name}</p>
//             <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{user.role}</p>
//           </div>
//         </div>

//         {/* Quick Actions */}
//         <div className="flex items-center gap-1">
//           <button
//             onClick={onLock}
//             title="Lock Workstation (Ctrl+L)"
//             className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
//           >
//             <Lock className="w-4 h-4" />
//           </button>
//           <button
//             onClick={onLogout}
//             title="Sign Out"
//             className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
//           >
//             <LogOut className="w-4 h-4" />
//           </button>
//         </div>
//       </div>
//     </header>
//   );
// };

import React, { useState, useEffect } from 'react';
import { HospitalSettings, SafeUser } from '../../types';
import { Lock, LogOut, FlaskConical } from 'lucide-react';

/*
 * Same tokens as Sidebar, SetupWizard and LoginView:
 *   surface #FFFFFF, border #E2E8F0, text #1F2937, muted #64748B,
 *   primary #0F766E. No shadows. Icon buttons are neutral gray.
 */

interface HeaderProps {
  hospital: HospitalSettings;
  user: SafeUser;
  onLock: () => void;
  onLogout: () => void;
}

const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

const iconButtonClass =
  'w-9 h-9 inline-flex items-center justify-center rounded-md text-[#64748B] ' +
  'hover:bg-[#F1F5F9] hover:text-[#1F2937] ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]';

export const Header: React.FC<HeaderProps> = ({ hospital, user, onLock, onLogout }) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <header className="h-14 bg-white border-b border-[#E2E8F0] px-5 flex items-center justify-between select-none shrink-0 z-20">
      {/* Laboratory identity */}
      <div className="flex items-center gap-3 min-w-0">
        {hospital.logo_url ? (
          <div className="w-8 h-8 rounded-md border border-[#E2E8F0] bg-white flex items-center justify-center overflow-hidden shrink-0">
            <img
              src={hospital.logo_url}
              alt={hospital.hospital_name}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-md bg-[#0F766E] flex items-center justify-center shrink-0">
            <FlaskConical className="w-4 h-4 text-white" />
          </div>
        )}
        <div className="min-w-0 leading-tight">
          <h2 className="text-sm font-semibold text-[#1F2937] truncate">{hospital.hospital_name}</h2>
        </div>
      </div>

      {/* Clock, user, actions */}
      <div className="flex items-center gap-5 shrink-0">
        <div className="hidden lg:block text-right leading-tight">
          <p className="text-[13px] font-medium text-[#1F2937] tabular-nums">{timeStr}</p>
          <p className="text-xs text-[#64748B]">{dateStr}</p>
        </div>

        <div className="flex items-center gap-3 pl-5 border-l border-[#E2E8F0]">
          <div
            aria-hidden="true"
            className="w-8 h-8 rounded-full bg-[#F1F5F9] text-[#1F2937] text-xs font-semibold flex items-center justify-center"
          >
            {getInitials(user.full_name)}
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-[13px] font-medium text-[#1F2937]">{user.full_name}</p>
            <p className="text-xs text-[#64748B] capitalize">{user.role}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onLock}
            title="Lock workstation (Ctrl+L)"
            aria-label="Lock workstation"
            className={iconButtonClass}
          >
            <Lock className="w-4 h-4" />
          </button>
          <button type="button" onClick={onLogout} title="Sign out" aria-label="Sign out" className={iconButtonClass}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};