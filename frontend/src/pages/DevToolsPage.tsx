import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../context/ConfigContext';
import { useAuth, authHeader } from '../context/AuthContext';
import { useToast } from '../components/ui/ToastProvider';

/**
 * Dev-only destructive testing utility — wipes Submission + AmendmentLog
 * rows (backend/src/routes/devTools.routes.ts). Deliberately NOT in
 * App.tsx's role-gated route list and NOT linked from Sidebar.tsx — reach
 * it only by typing /dev-tools directly.
 *
 * `import.meta.env.PROD` is Vite's build-time mirror of `NODE_ENV ===
 * 'production'` (true for `vite build`, false for `vite dev`) — checked here
 * at the component level, not just by the route being unlinked, so a
 * production bundle never renders this UI at all even if someone guesses
 * the URL. The backend endpoints carry the authoritative, structural
 * version of the same check.
 *
 * One "Delete Submissions" section with a mode selector: "All product
 * codes" hits DELETE /api/dev/submissions/all, a specific code hits
 * DELETE /api/dev/submissions/by-product-code. The confirm input's
 * required text follows the mode — the wipe-all phrase, or the exact
 * product code — and switching modes clears it so a half-typed
 * confirmation can't carry over.
 */
const CONFIRM_PHRASE = 'DELETE ALL';

// Sentinel mode value for "all product codes"; any other value is a literal
// product code. Kept distinct from '' so the <select> always has a real
// selection.
const MODE_ALL = '__ALL__';

interface PreConfirmSummary {
  totalCount: number;
  lockedProductCodes: string[];
  productCodeUsage: Record<string, number>;
}

interface DeleteAllResult {
  beforeCount: number;
  afterCount: number;
  unlockedProductCodes: string[];
}

interface DeleteByCodeResult {
  productCode: string;
  beforeCount: number;
  afterCount: number;
  unlocked: boolean;
}

type LastResult =
  | { kind: 'ALL'; data: DeleteAllResult }
  | { kind: 'CODE'; data: DeleteByCodeResult };

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

  // '' collapses to MODE_ALL in every derived value below, so an unset
  // selector still behaves as "all product codes".
  const [mode, setMode] = useState<string>(MODE_ALL);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

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
        productCodeUsage,
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

  const isAllMode = mode === MODE_ALL || mode === '';
  const codeOptions = summary ? Object.keys(summary.productCodeUsage).sort() : [];

  // The text that must be typed to arm the delete button for the active mode.
  const requiredText = isAllMode ? CONFIRM_PHRASE : mode;
  const currentCount = !summary
    ? 0
    : isAllMode
      ? summary.totalCount
      : summary.productCodeUsage[mode] ?? 0;
  const canConfirm = confirmText === requiredText && !deleting;

  const handleModeChange = (next: string) => {
    setMode(next);
    // Requirement 6: a half-typed confirmation for one mode must not carry
    // into the other.
    setConfirmText('');
    setDeleteError(null);
    setLastResult(null);
  };

  const handleDelete = async () => {
    if (!canConfirm) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = isAllMode
        ? await fetch(`${API_BASE_URL}/api/dev/submissions/all`, {
            method: 'DELETE',
            headers: { ...authHeader(user) },
          })
        : await fetch(`${API_BASE_URL}/api/dev/submissions/by-product-code`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', ...authHeader(user) },
            body: JSON.stringify({ productCode: mode }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      if (isAllMode) {
        setLastResult({ kind: 'ALL', data: data as DeleteAllResult });
        addToast('success', 'All submissions deleted.');
      } else {
        setLastResult({ kind: 'CODE', data: data as DeleteByCodeResult });
        addToast('success', `Submissions for ${(data as DeleteByCodeResult).productCode} deleted.`);
      }
      setConfirmText('');
      // The deleted code is gone from productCodeUsage after the refetch, so
      // its <option> would vanish — fall back to "all product codes".
      setMode(MODE_ALL);
      fetchSummary();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed — please try again.');
    } finally {
      setDeleting(false);
    }
  };

  if (isProd) {
    return null;
  }

  const deleteButtonLabel = deleting
    ? 'Deleting…'
    : isAllMode
      ? 'Delete All Submissions'
      : `Delete Submissions For ${mode}`;

  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto min-h-screen bg-canvas text-primary">
      <div className="border-b border-gray-800/80 pb-6">
        <h1 className="text-3xl font-bold uppercase tracking-tight text-primary flex items-center gap-3">
          <AlertTriangle className="w-7 h-7 text-red-500" strokeWidth={2} />
          Dev Tools — Delete Submissions
        </h1>
        <p className="text-xs font-normal text-muted mt-1">
          Development/testing cleanup only. Not linked from any menu. Permanently deletes
          Submission and AmendmentLog rows — every one, or just those for a chosen product code.
          PinUser and M365User accounts are never touched.
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
          <h3 className="text-lg font-semibold text-primary uppercase">Delete Submissions</h3>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-muted">
            Deletes Submission and AmendmentLog rows for the selected scope. All other product
            codes are untouched when a specific code is chosen. PinUser and M365User accounts are
            never touched. This cannot be undone.
          </p>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Scope
            </label>
            <select
              value={mode}
              onChange={(e) => handleModeChange(e.target.value)}
              disabled={deleting}
              className="w-full px-3 py-2 rounded-md bg-surface border border-gray-800 text-primary font-mono focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            >
              <option value={MODE_ALL}>All product codes</option>
              {codeOptions.map((code) => (
                <option key={code} value={code}>
                  {code} ({summary?.productCodeUsage[code] ?? 0})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              {isAllMode ? 'Total Submissions' : 'Matching Submissions'}
            </span>
            <span className="text-2xl font-bold text-primary">{currentCount}</span>
          </div>

          <p className="text-sm text-muted">
            This cannot be undone. Type{' '}
            <span className="font-mono font-bold text-primary">{requiredText}</span>{' '}
            below to enable the delete button.
          </p>

          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={requiredText}
            disabled={deleting}
            className="w-full px-3 py-2 rounded-md bg-surface border border-gray-800 text-primary font-mono focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
          />

          {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}

          <button
            type="button"
            onClick={handleDelete}
            disabled={!canConfirm}
            className="w-full py-2.5 rounded-md bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-muted disabled:cursor-not-allowed text-white font-semibold uppercase tracking-wide transition-colors"
          >
            {deleteButtonLabel}
          </button>

          {lastResult?.kind === 'ALL' && (
            <div className="pt-2 border-t border-gray-800 space-y-2">
              <p className="text-sm text-primary">
                Before: <span className="font-bold">{lastResult.data.beforeCount}</span> → After:{' '}
                <span className="font-bold">{lastResult.data.afterCount}</span>
              </p>
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Unlocked Product Codes ({lastResult.data.unlockedProductCodes.length})
                </span>
                {lastResult.data.unlockedProductCodes.length === 0 ? (
                  <p className="text-sm text-muted">None.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {lastResult.data.unlockedProductCodes.map((code) => (
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

          {lastResult?.kind === 'CODE' && (
            <div className="pt-2 border-t border-gray-800 space-y-2">
              <p className="text-sm text-primary">
                <span className="font-mono font-bold">{lastResult.data.productCode}</span> — Before:{' '}
                <span className="font-bold">{lastResult.data.beforeCount}</span> → After:{' '}
                <span className="font-bold">{lastResult.data.afterCount}</span>
              </p>
              <p className="text-sm text-muted">
                {lastResult.data.unlocked
                  ? 'Product code is now unlocked (0 referencing submissions).'
                  : 'Product code still has referencing submissions.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
