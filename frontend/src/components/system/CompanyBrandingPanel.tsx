import { useEffect, useState } from 'react';
import { Building2, Upload, Palette, Save } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/ToastProvider';
import { useConfig, API_BASE_URL } from '../../context/ConfigContext';
import { useAuth, authHeader } from '../../context/AuthContext';
import { ACCENT_PRESETS, DEFAULT_ACCENT_FAMILY, isAccentFamily } from '../../lib/accentColors';
import type { AccentFamily } from '../../lib/accentColors';

const MAX_LOGO_BYTES = 500 * 1024; // 500KB

/**
 * Admin UI for AppConfig.companyName / .logoImage — the top-left nav
 * sidebar's branding (Sidebar.tsx). Both fields already existed in the
 * schema/API ("Blueprint Section 8: Dynamic White-Label") but had no
 * frontend reader or writer until now. Self-contained fetch/PATCH, same
 * shape as M365UserRolesPanel.tsx (the "Microsoft 365 Access" card this
 * sits next to) — real, persisted config.
 */
export function CompanyBrandingPanel() {
  const { user } = useAuth();
  const { config, refreshConfig } = useConfig();
  const { addToast } = useToast();

  const [companyName, setCompanyName] = useState('');
  const [portalTitle, setPortalTitle] = useState('');
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState<AccentFamily>(DEFAULT_ACCENT_FAMILY);
  const [saving, setSaving] = useState(false);

  // Seed local editable state from the loaded config, once it arrives.
  useEffect(() => {
    if (config) {
      setCompanyName(config.companyName ?? '');
      setPortalTitle(config.portalTitle ?? '');
      setLogoImage(config.logoImage ?? null);
      setAccentColor(isAccentFamily(config.accentColor) ? config.accentColor : DEFAULT_ACCENT_FAMILY);
    }
  }, [config]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;

    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('Logo must be under 500KB.');
      return;
    }

    setLogoError(null);
    const reader = new FileReader();
    reader.onload = () => setLogoImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader(user) },
        body: JSON.stringify({ companyName, portalTitle, logoImage, accentColor }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${res.status}`);
      }
      await refreshConfig();
      addToast('success', 'Company branding saved.');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save branding.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-surface border-b border-gray-800 p-4 flex items-center gap-3">
        <Building2 className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
        <div>
          <h3 className="text-lg font-semibold uppercase text-primary">Company Branding</h3>
          <p className="text-xs text-muted mt-1 font-normal normal-case">
            Name and logo shown in the top-left nav sidebar.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted">Company Name</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="ONE GLOVE GROUP"
            className="w-full bg-canvas border border-gray-700 text-sm text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted">Portal Title</label>
          <input
            type="text"
            value={portalTitle}
            onChange={(e) => setPortalTitle(e.target.value)}
            placeholder="QI PLATFORM v4.0"
            className="w-full bg-canvas border border-gray-700 text-sm text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
          />
          <p className="text-xs text-muted mt-1">
            Subtitle shown beneath the company name in the nav sidebar.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted">Logo</label>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-canvas border border-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
              {logoImage ? (
                <img src={logoImage} alt="Logo preview" className="w-full h-full object-contain" />
              ) : (
                <Building2 className="w-6 h-6 text-muted" />
              )}
            </div>
            <label className="flex items-center gap-2 px-4 h-10 rounded-lg bg-canvas border border-gray-700 text-xs font-semibold uppercase tracking-wider text-muted hover:text-primary hover:border-gray-500 cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              Upload Logo
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            </label>
          </div>
          {logoError && <p className="text-xs text-danger">{logoError}</p>}
          <p className="text-xs text-muted mt-1">PNG/JPG/SVG, under 500KB.</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <Palette className="w-3 h-3" />
            Accent Color
          </label>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg border border-gray-700 shrink-0"
              style={{ backgroundColor: ACCENT_PRESETS[accentColor].primary }}
            />
            <select
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value as AccentFamily)}
              className="w-full bg-canvas border border-gray-700 text-sm text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none appearance-none"
            >
              {(Object.keys(ACCENT_PRESETS) as AccentFamily[]).map((family) => (
                <option key={family} value={family}>{ACCENT_PRESETS[family].label}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted mt-1">
            Applies app-wide — buttons, active tabs, badges, and highlights.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button className="px-8 flex items-center gap-2" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4" strokeWidth={2} />
            {saving ? 'Saving...' : 'Save Branding'}
          </Button>
        </div>
      </div>
    </div>
  );
}
