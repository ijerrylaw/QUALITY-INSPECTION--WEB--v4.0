/**
 * @file Sidebar.tsx
 * @description Main Left Sidebar Navigation layout for Quality Inspection v4.0.
 *
 * Strict Compliance with UI_DESIGN_SYSTEM.md:
 *  - Canvas Background: bg-canvas (#0B0F19)
 *  - Primary Brand Accent: bg-brand-primary (#3F48CC)
 *  - Secondary Brand Accent: bg-brand-secondary (#08C8CD)
 *  - Touch Target Size: Minimum h-12 (48px) on all interactive links
 *  - Icons: lucide-react with strokeWidth={2}
 *  - Geometry: rounded-lg (8px)
 */

import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  ClipboardCheck, 
  History, 
  ShieldAlert, 
  BarChart3, 
  Sliders, 
  Settings, 
  PanelLeftClose, 
  PanelLeftOpen,
  Factory,
  LogOut
} from 'lucide-react';

interface SidebarItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  roles: string[];
}

const sidebarItems: SidebarItem[] = [
  { to: '/wizard', label: 'QUALITY INSPECTION', icon: ClipboardCheck, roles: ['OPERATOR', 'LEADER', 'SUPERVISOR', 'MANAGER', 'ADMIN'] },
  { to: '/history', label: 'INSPECTION RECORDS', icon: History, roles: ['OPERATOR', 'LEADER', 'SUPERVISOR', 'MANAGER', 'ADMIN'] },
  { to: '/approvals', label: 'APPROVALS QUEUE', icon: ShieldAlert, roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'] },
  { to: '/analytics', label: 'QUALITY ANALYTICS', icon: BarChart3, roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'] },
  { to: '/config', label: 'CONFIGURATION CONTROL', icon: Sliders, roles: ['MANAGER', 'ADMIN'] },
  { to: '/system', label: 'SYSTEM & TENANT ADMIN', icon: Settings, roles: ['ADMIN'] },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();

  // Filter items based on user role
  const visibleItems = sidebarItems.filter(item => 
    user ? item.roles.includes(user.role) : false
  );

  return (
    <aside 
      className={`h-screen bg-canvas border-r border-gray-800/80 flex flex-col justify-between transition-all duration-300 shrink-0 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* ── Top Header & Branding ────────────────────────────────────────────── */}
      <div>
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-800/60">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-lg bg-brand-primary flex items-center justify-center shrink-0 shadow-sm">
              <Factory className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider text-primary truncate">
                  ONE GLOVE GROUP
                </span>
                <span className="text-[10px] font-mono uppercase text-muted tracking-wide">
                  QI PLATFORM v4.0
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-muted hover:text-primary hover:bg-surface transition-colors outline-none shrink-0"
            title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-5 h-5" strokeWidth={2} />
            ) : (
              <PanelLeftClose className="w-5 h-5" strokeWidth={2} />
            )}
          </button>
        </div>

        {/* ── Navigation Links ─────────────────────────────────────────────── */}
        <nav className="p-3 space-y-1.5">
          {!collapsed && (
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
              NAVIGATION
            </div>
          )}

          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `h-12 px-3.5 rounded-lg flex items-center gap-3.5 transition-all text-xs font-semibold uppercase tracking-wide outline-none relative ${
                    isActive
                      ? 'bg-brand-primary text-white shadow-md'
                      : 'text-muted hover:text-primary hover:bg-surface'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="w-5 h-5 shrink-0" strokeWidth={2} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {isActive && (
                      <span className="absolute left-0 top-2 bottom-2 w-1 bg-brand-secondary rounded-r-full" />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* ── Footer User Info / Role Status ──────────────────────────────────── */}
      {user && (
        <div className="p-3 border-t border-gray-800/60 space-y-2">
          <div className="h-12 px-3 rounded-lg bg-surface border border-gray-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className={`w-8 h-8 rounded-lg font-mono font-bold text-xs flex items-center justify-center shrink-0 ${
                user.role === 'OPERATOR' || user.role === 'LEADER' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                user.role === 'SUPERVISOR' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                'bg-brand-primary/20 text-brand-secondary border border-brand-secondary/30'
              }`}>
                {user.role.substring(0, 2)}
              </div>
              {!collapsed && (
                <div className="flex flex-col truncate min-w-0">
                  <span className="text-xs font-semibold text-primary truncate">
                    {user.name}
                  </span>
                  <span className={`text-[10px] uppercase font-mono tracking-wider truncate ${
                    user.role === 'OPERATOR' || user.role === 'LEADER' ? 'text-emerald-400' :
                    user.role === 'SUPERVISOR' ? 'text-amber-400' :
                    'text-brand-secondary'
                  }`}>
                    {user.role === 'LEADER' ? 'LINE LEADER' : 
                     user.role === 'MANAGER' ? 'QA MANAGER' :
                     user.role === 'ADMIN' ? 'SYSTEM ADMIN' : user.role}
                  </span>
                </div>
              )}
            </div>
            
            {!collapsed && (
              <button 
                onClick={logout}
                title="Log Out"
                className="w-8 h-8 rounded-lg text-muted hover:text-danger hover:bg-danger/10 flex items-center justify-center shrink-0 transition-colors outline-none"
              >
                <LogOut className="w-4 h-4" strokeWidth={2} />
              </button>
            )}
          </div>
          
          {collapsed && (
            <button 
              onClick={logout}
              title="Log Out"
              className="w-full h-12 rounded-lg text-muted hover:text-danger hover:bg-danger/10 flex items-center justify-center transition-colors outline-none"
            >
              <LogOut className="w-5 h-5" strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
