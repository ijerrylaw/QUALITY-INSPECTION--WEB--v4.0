import { useState } from 'react';
import { ShieldCheck, Building2 } from 'lucide-react';
import { M365UserRolesPanel } from '../components/system/M365UserRolesPanel';
import { CompanyBrandingPanel } from '../components/system/CompanyBrandingPanel';

// 2-tab architecture, same pattern as Configuration Control's
// FACTORY & LINE SETUP / PRODUCT ENGINE / QUALITY RULES (ConfigPage.tsx) —
// plain component state, no URL/router persistence, resets to the first
// tab on navigation away and back. Unlike ConfigPage, there's no shared
// draft/save-bar here: each panel below already self-fetches and
// self-PATCHes independently, so tabs are pure layout, nothing else.
type SystemTab = 'access' | 'branding';

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
            Microsoft 365 access and company branding.
          </p>
        </div>
      </div>

      {/* ── 2-Tab Architecture (matches ConfigPage.tsx's submenu pattern) ──── */}
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
      </div>

      <div className={activeTab === 'access' ? 'pt-2' : 'hidden'}>
        <M365UserRolesPanel />
      </div>

      <div className={activeTab === 'branding' ? 'pt-2' : 'hidden'}>
        <CompanyBrandingPanel />
      </div>
    </div>
  );
}
