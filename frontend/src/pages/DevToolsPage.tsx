import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../context/ConfigContext';
import { useAuth, authHeader } from '../context/AuthContext';
import { useToast } from '../components/ui/ToastProvider';

/**
 * Dev-only destructive testing utility — wipes every Submission +
 * AmendmentLog row (backend/src/routes/devTools.routes.ts). Deliberately NOT
 * in App.tsx's role-gated route list and NOT linked from Sidebar.tsx — reach
 * it only by typing /dev-tools directly.
 *
 * `import.meta.env.PROD` is Vite's build-time mirror of `NODE_ENV ===
 * 'production'` (true for `vite build`, false for `vite dev`) — checked here
 * at the component level, not just by the route being unlinked, so a
 * production bundle never renders this UI at all even if someone guesses
 * the URL. The backend endpoint carries the authoritative, structural
 * version of the same check.
 */
const CONFIRM_PHRASE = 'DELETE ALL';

interface PreConfirmSummary {
  totalCount: number;
  lockedProductCodes: string[];
}

interface DeleteResult {
  beforeCount: number;
  afterCount: number;
  unlockedProductCodes: string[];
}

export function DevToolsPage() {
  // Vite's build-time mirror of NODE_ENV === 'production' — a static
  // constant per bundle, so gating the render on it below (after every hook
  // call, to keep hook order stable) still means a production bundle never
  // shows this UI, not just an unlinked route.
  const isProd = import.meta.env.PROD;

  const { user } = useAuth();
  const { addToast } = useToast();

  const [summary, setSummary] = useState<PreConfirmSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [result, setResult] = useState<DeleteResult | null>(null);

  const fetchSummary = async () => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const [configRes, submissionsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/config`),
        fetch(`${API_BASE_URL}/api/submissions?limit=1`),
      ]);
      if (!configRes.ok || !submissionsRes.ok) {
        throw new Error('Failed to load current submission data.');
      }
      const configData = await configRes.json();
      const submissionsData = await submissionsRes.json();

      const productCodeUsage = (configData.productCodeUsage ?? {}) as Record<string, number>;
      const lockedProductCodes = Object.entries(productCodeUsage)
        .filter(([, count]) => count > 0)
        .map(([code]) => code)
        .sort();

      setSummary({
        totalCount: submissionsData.totalCount ?? 0,
        lockedProductCodes,
      });
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Failed to load summary.');
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    if (isProd) return;
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async () => {
    if (confirmText !== CONFIRM_PHRASE) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dev/submissions/all`, {
        method: 'DELETE',
        headers: { ...authHeader(user) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Server error: ${res.status}`);
      }
      setResult(data as DeleteResult);
      setConfirmText('');
      addToast('success', 'All submissions deleted.');
      fetchSummary();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed — please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const canConfirm = confirmText === CONFIRM_PHRASE && !deleting;

  if (isProd) {
    return null;
  }

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto min-h-screen bg-canvas text-primary">
      <div className="border-b border-gray-800/80 pb-6">
        <h1 className="text-3xl font-bold uppercase tracking-tight text-primary flex items-center gap-3">
          <AlertTriangle className="w-7 h-7 text-red-500" strokeWidth={2} />
          Dev Tools — Delete All Submissions
        </h1>
        <p className="text-xs font-normal text-muted mt-1">
          Development/testing cleanup only. Not linked from any menu. Permanently deletes every
          Submission and AmendmentLog row. PinUser and M365User accounts are never touched.
        </p>
      </div>

      <div className="bg-canvas border border-red-900/60 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-surface border-b border-gray-800 p-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-primary uppercase">Current State</h3>
          <button
            type="button"
            onClick={fetchSummary}
            disabled={loadingSummary}
            className="text-muted hover:text-primary transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loadingSummary ? 'animate-spin' : ''}`} strokeWidth={2} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {summaryError && (
            <p className="text-sm text-red-400">{summaryError}</p>
          )}

          {summary && !summaryError && (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Total Submissions
                </span>
                <span className="text-2xl font-bold text-primary">{summary.totalCount}</span>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Product Codes That Will Unlock ({summary.lockedProductCodes.length})
                </span>
                {summary.lockedProductCodes.length === 0 ? (
                  <p className="text-sm text-muted">None — no product code is currently locked.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {summary.lockedProductCodes.map((code) => (
                      <span
                        key={code}
                        className="px-2 py-1 rounded-md bg-surface border border-gray-800 text-xs font-mono text-primary"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-canvas border border-red-900/60 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-surface border-b border-gray-800 p-4 flex items-center gap-3">
          <Trash2 className="w-4 h-4 text-red-500" strokeWidth={2} />
          <h3 className="text-lg font-semibold text-primary uppercase">Delete All Submissions</h3>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-muted">
            This cannot be undone. Type <span className="font-mono font-bold text-primary">{CONFIRM_PHRASE}</span> below
            to enable the delete button.
          </p>

          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            className="w-full px-3 py-2 rounded-md bg-surface border border-gray-800 text-primary font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
            disabled={deleting}
          />

          {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}

          <button
            type="button"
            onClick={handleDelete}
            disabled={!canConfirm}
            className="w-full py-2.5 rounded-md bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-muted disabled:cursor-not-allowed text-white font-semibold uppercase tracking-wide transition-colors"
          >
            {deleting ? 'Deleting…' : 'Delete All Submissions'}
          </button>

          {result && (
            <div className="pt-2 border-t border-gray-800 space-y-2">
              <p className="text-sm text-primary">
                Before: <span className="font-bold">{result.beforeCount}</span> → After:{' '}
                <span className="font-bold">{result.afterCount}</span>
              </p>
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Unlocked Product Codes ({result.unlockedProductCodes.length})
                </span>
                {result.unlockedProductCodes.length === 0 ? (
                  <p className="text-sm text-muted">None.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {result.unlockedProductCodes.map((code) => (
                      <span
                        key={code}
                        className="px-2 py-1 rounded-md bg-surface border border-gray-800 text-xs font-mono text-primary"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
