import { useEffect, useState } from 'react';
import { Server, KeyRound, Link2, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../../context/ConfigContext';
import { clientId, tenantId } from '../../lib/msalConfig';

// Manually maintained — no runtime source of truth models "every address
// this app is reachable from" (see the Azure AD App Registration's own
// Redirect URIs allowlist, which is the actual authority). Update this list
// if the LAN IP (see frontend/vite.config.ts's mkcert cert) or either dev
// port ever changes.
const EXPECTED_REDIRECT_URIS = ['https://localhost:4001', 'https://10.10.110.31:4001'];

type BackendHealth = {
  status: 'loading' | 'ok' | 'error';
  port?: number;
  protocol?: string;
};

/**
 * Read-only diagnostic panel for System Admin's ENVIRONMENT tab (Group A
 * only, via the page-level /system route gate — see App.tsx's RoleRoute).
 * Nothing here is editable; it exists so Jerry can confirm live port/
 * protocol/Entra config at a glance without opening devtools or .env files.
 */
export function EnvironmentInfoPanel() {
  const [backend, setBackend] = useState<BackendHealth>({ status: 'loading' });

  const fetchBackendHealth = () => {
    setBackend({ status: 'loading' });
    fetch(`${API_BASE_URL}/api/health`)
      .then((res) => res.json())
      .then((data) => setBackend({ status: 'ok', port: data.port, protocol: data.protocol }))
      .catch((err) => {
        console.error('[EnvironmentInfoPanel] Failed to fetch backend health:', err);
        setBackend({ status: 'error' });
      });
  };

  useEffect(() => {
    fetchBackendHealth();
  }, []);

  const readOnlyFieldClass =
    'w-full bg-surface-light/50 border border-transparent text-sm font-mono text-muted rounded-lg px-4 py-2.5 cursor-not-allowed opacity-80';

  return (
    <div className="flex flex-col gap-8">
      {/* Runtime Addresses */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-surface border-b border-gray-800 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Server className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            <div>
              <h3 className="text-lg font-semibold uppercase text-primary">Runtime Addresses</h3>
              <p className="text-xs text-muted mt-1 font-normal normal-case">
                Frontend is read directly from the browser; backend is a live call, not a guess.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchBackendHealth}
            className="text-muted hover:text-primary outline-none"
            title="Re-check backend"
          >
            <RefreshCw className={`w-4 h-4 ${backend.status === 'loading' ? 'animate-spin' : ''}`} strokeWidth={2} />
          </button>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Frontend</label>
            <div className={readOnlyFieldClass}>
              {window.location.protocol}//{window.location.hostname}:{window.location.port || '(default)'}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Backend</label>
            <div className={readOnlyFieldClass}>
              {backend.status === 'loading' && 'Checking...'}
              {backend.status === 'error' && 'Unreachable'}
              {backend.status === 'ok' && `${backend.protocol}://<host>:${backend.port}`}
            </div>
          </div>
        </div>
      </div>

      {/* Azure AD App Registration */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-surface border-b border-gray-800 p-4 flex items-center gap-3">
          <KeyRound className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
          <h3 className="text-lg font-semibold uppercase text-primary">Azure AD App Registration</h3>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Tenant ID</label>
            <div className={readOnlyFieldClass}>{tenantId || '(not set)'}</div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Client ID (Application ID)</label>
            <div className={readOnlyFieldClass}>{clientId || '(not set)'}</div>
          </div>
        </div>
      </div>

      {/* Expected Redirect URIs */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-surface border-b border-gray-800 p-4 flex items-center gap-3">
          <Link2 className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
          <h3 className="text-lg font-semibold uppercase text-primary">Expected Redirect URIs</h3>
        </div>

        <div className="p-4 space-y-2">
          {EXPECTED_REDIRECT_URIS.map((uri) => (
            <div key={uri} className={readOnlyFieldClass}>{uri}</div>
          ))}
          <p className="text-xs text-muted mt-1">
            Manually maintained — update this list if the LAN IP or either dev port ever changes.
          </p>
        </div>
      </div>
    </div>
  );
}
