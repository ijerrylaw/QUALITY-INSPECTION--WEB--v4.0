import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Building2, Server } from 'lucide-react';
import { M365UserRolesPanel } from '../components/system/M365UserRolesPanel';
import { CompanyBrandingPanel } from '../components/system/CompanyBrandingPanel';
import { EnvironmentInfoPanel } from '../components/system/EnvironmentInfoPanel';

// 3-tab architecture, same pattern as Configuration Control's
// FACTORY & LINE SETUP / PRODUCT ENGINE / QUALITY RULES (ConfigPage.tsx) —
// plain component state, no URL/router persistence, resets to the first
// tab on navigation away and back. Unlike ConfigPage, there's no shared
// draft/save-bar here: each panel below already self-fetches and
// self-PATCHes independently, so tabs are pure layout, nothing else.
type SystemTab = 'access' | 'branding' | 'environment';

export function SystemPage() {
  const [activeTab, setActiveTab] = useState<SystemTab>('access');

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto min-h-screen bg-canvas text-primary">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-6">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-primary">
            SYSTEM ADMIN
          </h1>
          <p className="text-xs font-normal text-muted mt-1">
            Microsoft 365 access, company branding, and environment configuration.
          </p>
        </div>
      </div>

      {/* ── 3-Tab Architecture (matches ConfigPage.tsx's submenu pattern) ──── */}
      <div className="flex overflow-x-auto items-center gap-0 border-b border-gray-800 pb-0 scrollbar-hide">
        <button
          onClick={() => setActiveTab('access')}
          className={`h-10 px-6 gap-2 flex items-center justify-center rounded-t-lg text-xs font-bold uppercase tracking-wider transition-all outline-none shrink-0 ${
            activeTab === 'access'
              ? 'bg-brand-primary text-white shadow-md'
              : 'bg-surface text-muted hover:text-primary hover:bg-surface-light'
          }`}
        >
          <ShieldCheck className="w-4 h-4" strokeWidth={2} />
          <span>ACCESS MANAGEMENT</span>
        </button>

        <button
          onClick={() => setActiveTab('branding')}
          className={`h-10 px-6 gap-2 flex items-center justify-center rounded-t-lg text-xs font-bold uppercase tracking-wider transition-all outline-none shrink-0 ${
            activeTab === 'branding'
              ? 'bg-brand-primary text-white shadow-md'
              : 'bg-surface text-muted hover:text-primary hover:bg-surface-light'
          }`}
        >
          <Building2 className="w-4 h-4" strokeWidth={2} />
          <span>BRANDING</span>
        </button>

        <button
          onClick={() => setActiveTab('environment')}
          className={`h-10 px-6 gap-2 flex items-center justify-center rounded-t-lg text-xs font-bold uppercase tracking-wider transition-all outline-none shrink-0 ${
            activeTab === 'environment'
              ? 'bg-brand-primary text-white shadow-md'
              : 'bg-surface text-muted hover:text-primary hover:bg-surface-light'
          }`}
        >
          <Server className="w-4 h-4" strokeWidth={2} />
          <span>ENVIRONMENT</span>
        </button>
      </div>

      <div className={activeTab === 'access' ? 'pt-2' : 'hidden'}>
        <M365UserRolesPanel />
      </div>

      <div className={activeTab === 'branding' ? 'pt-2' : 'hidden'}>
        <CompanyBrandingPanel />
      </div>

      <div className={activeTab === 'environment' ? 'pt-2' : 'hidden'}>
        <EnvironmentInfoPanel />
      </div>

      {/* Dev-only discoverability pointer to /dev-tools (DevToolsPage.tsx) —
          deliberately not a nav item or button, just a barely-there text
          link. Same import.meta.env.PROD gate as DevToolsPage.tsx itself:
          a link to a dev-only destructive tool must not exist in a
          production build even as a dead link. */}
      {!import.meta.env.PROD && (
        <div className="pt-8 text-right">
          <Link to="/dev-tools" className="text-[11px] text-muted/60 hover:text-muted transition-colors">
            Dev Tools
          </Link>
        </div>
      )}
    </div>
  );
}
