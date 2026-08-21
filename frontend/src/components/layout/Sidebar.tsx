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
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, rolesInGroups } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { useWizardGuard } from '../../context/WizardGuardContext';
import { useHistoryIndicator } from '../../context/HistoryIndicatorContext';
import { PinChangeModal } from '../auth/PinChangeModal';
import {
  ClipboardCheck,
  History,
  ShieldAlert,
  BarChart3,
  Sliders,
  Settings,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  Factory,
  LogOut,
  KeyRound,
  AlertTriangle,
  X,
  Check,
} from 'lucide-react';

interface SidebarItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  roles: string[];
}

// Group A/B/C role lists (AUDIT_REPORT.md §11) — derived from the single
// source of truth in AuthContext.tsx rather than hardcoded per-item, so nav
// visibility can't drift from the RoleRoute gates in App.tsx the way it did
// before (Sidebar previously allowed SUPERVISOR into Approvals/Analytics
// while RoleRoute didn't, and vice versa omitted EXECUTIVE).
const GROUP_AB_ROLES = rolesInGroups('A', 'B');
const GROUP_A_ROLES = rolesInGroups('A');
const ALL_GROUP_ROLES = rolesInGroups('A', 'B', 'C');

const sidebarItems: SidebarItem[] = [
  { to: '/wizard', label: 'QUALITY ENTRY WIZARD', icon: ClipboardCheck, roles: ALL_GROUP_ROLES },
  { to: '/history', label: 'INSPECTION RECORDS', icon: History, roles: ALL_GROUP_ROLES },
  { to: '/approvals', label: 'APPROVALS QUEUE', icon: ShieldAlert, roles: GROUP_AB_ROLES },
  { to: '/analytics', label: 'QUALITY ANALYTICS', icon: BarChart3, roles: GROUP_AB_ROLES },
  { to: '/config', label: 'CONFIGURATION CONTROL', icon: Sliders, roles: GROUP_AB_ROLES },
  { to: '/pin-admin', label: 'STAFF PIN ACCESS', icon: Users, roles: GROUP_AB_ROLES },
  { to: '/system', label: 'SYSTEM ADMIN', icon: Settings, roles: GROUP_A_ROLES },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [showPinChange, setShowPinChange] = useState(false);
  const { user, logout } = useAuth();
  const { config } = useConfig();
  const companyName = config?.companyName?.trim() || 'ONE GLOVE GROUP';
  const logoImage = config?.logoImage || null;
  const portalTitle = config?.portalTitle?.trim() || 'QI PLATFORM v4.0';
  const canChangePin = user?.loginMethod === 'PIN';

  // ── Discard-unsaved-wizard-work navigation guard ─────────────────────────
  // Only relevant when currently on /wizard with unsaved work — moving
  // between the wizard's own internal steps never calls navigate() (see
  // WizardPage.tsx's handleTabClick/handleNextStep/handleBackStep), so this
  // never fires for in-wizard step changes, only for actual route changes
  // away from /wizard triggered here.
  const location = useLocation();
  const navigate = useNavigate();
  const { isWizardDirty } = useWizardGuard();
  const { hasNewSubmission } = useHistoryIndicator();
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  const handleNavClick = (e: React.MouseEvent, to: string) => {
    if (location.pathname === '/wizard' && isWizardDirty && to !== '/wizard') {
      e.preventDefault();
      setPendingTo(to);
    }
  };

  const confirmDiscardAndNavigate = () => {
    if (pendingTo) navigate(pendingTo);
    setPendingTo(null);
  };

  const cancelDiscard = () => setPendingTo(null);

  // Filter items based on user role. A null role (pending M365 assignment)
  // never sees any nav item — App.tsx's ProtectedRoute renders
  // PendingAccessPage instead of Sidebar in that case, but this stays
  // correct in isolation too.
  const visibleItems = sidebarItems.filter(item =>
    user && user.role ? item.roles.includes(user.role) : false
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
            <div className="w-10 h-10 rounded-lg bg-brand-primary flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
              {logoImage ? (
                <img src={logoImage} alt={companyName} className="w-full h-full object-contain" />
              ) : (
                <Factory className="w-5 h-5 text-white" strokeWidth={2} />
              )}
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider text-primary truncate">
                  {companyName}
                </span>
                <span className="text-[10px] font-mono uppercase text-muted tracking-wide">
                  {portalTitle}
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
                onClick={(e) => handleNavClick(e, item.to)}
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
                    <span className="relative shrink-0">
                      <Icon className="w-5 h-5" strokeWidth={2} />
                      {/* New-lot indicator: global (not per-user), cleared when
                          any user views Inspection Records or a new day begins —
                          see HistoryIndicatorContext.tsx / AppConfig.lastHistoryViewedAt. */}
                      {item.to === '/history' && hasNewSubmission && (
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brand-secondary animate-pulse" />
                      )}
                    </span>
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
                {(user.role ?? '??').substring(0, 2)}
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
                    {user.title}
                  </span>
                </div>
              )}
            </div>
            
            {!collapsed && (
              <div className="flex items-center gap-1 shrink-0">
                {canChangePin && (
                  <button
                    onClick={() => setShowPinChange(true)}
                    title="Change My PIN"
                    className="w-8 h-8 rounded-lg text-muted hover:text-brand-secondary hover:bg-brand-primary/10 flex items-center justify-center transition-colors outline-none"
                  >
                    <KeyRound className="w-4 h-4" strokeWidth={2} />
                  </button>
                )}
                <button
                  onClick={logout}
                  title="Log Out"
                  className="w-8 h-8 rounded-lg text-muted hover:text-danger hover:bg-danger/10 flex items-center justify-center shrink-0 transition-colors outline-none"
                >
                  <LogOut className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            )}
          </div>

          {collapsed && (
            <div className="space-y-2">
              {canChangePin && (
                <button
                  onClick={() => setShowPinChange(true)}
                  title="Change My PIN"
                  className="w-full h-12 rounded-lg text-muted hover:text-brand-secondary hover:bg-brand-primary/10 flex items-center justify-center transition-colors outline-none"
                >
                  <KeyRound className="w-5 h-5" strokeWidth={2} />
                </button>
              )}
              <button
                onClick={logout}
                title="Log Out"
                className="w-full h-12 rounded-lg text-muted hover:text-danger hover:bg-danger/10 flex items-center justify-center transition-colors outline-none"
              >
                <LogOut className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      )}

      <PinChangeModal open={showPinChange} onClose={() => setShowPinChange(false)} />

      {/* ── Discard Unsaved Wizard Work Confirmation ────────────────────────── */}
      {pendingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-canvas border border-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="flex items-start gap-4 p-4 border-b border-gray-800">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-400" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-lg font-bold uppercase tracking-wide text-primary mb-1">
                  UNSAVED CHANGES DETECTED
                </h3>
                <p className="text-sm text-muted">
                  You have unsaved entries in the Quality Entry Wizard. If you navigate away now, these changes will be permanently discarded.
                </p>
              </div>
            </div>

            <div className="p-4 bg-surface flex items-center justify-end gap-3">
              <button
                onClick={cancelDiscard}
                className="h-10 px-4 rounded-lg bg-canvas border border-gray-700 text-muted hover:text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none"
              >
                <X className="w-4 h-4" strokeWidth={2} />
                <span>RETURN TO WIZARD</span>
              </button>
              <button
                onClick={confirmDiscardAndNavigate}
                className="h-10 px-5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none border border-rose-500/50 shadow-sm"
              >
                <Check className="w-4 h-4" strokeWidth={2} />
                <span>DISCARD CHANGES</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

