import { useState, useEffect } from 'react';
import { ShieldAlert, Check, X, ArrowRight, User, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { JsonViewer } from '../ui/JsonViewer';
import { API_BASE_URL } from '../../context/ConfigContext';
import { useAuth, authHeader, authIdentity } from '../../context/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AmendmentLog {
  id: string;
  submissionId: string;
  originalValues: string; // JSON string
  newValues: string;      // JSON string
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
  supervisorNote?: string;
  status: string;
}

interface PendingAmendment {
  id: string;             // submission ID
  batchNumber: string;
  productCode: string;
  amendmentLogs: AmendmentLog[];
}

// ── ApprovalsQueue ────────────────────────────────────────────────────────────

// Mirrors HistoryFeed.tsx's PAGE_SIZE/loadPage() pagination pattern — same
// backend page/limit contract (GET /api/amendments/pending, AUDIT_REPORT.md).
const PAGE_SIZE = 50;

export function ApprovalsQueue() {
  const { user } = useAuth();
  const [amendments, setAmendments] = useState<PendingAmendment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedAmend, setSelectedAmend] = useState<PendingAmendment | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Fetch pending amendments from real backend ────────────────────────────
  // `replace: true` (mount, and after approve/reject) re-fetches page 1 at
  // whatever depth was already loaded, so a mutation that shrinks the pending
  // set can't leave stale rows or break "Load More" depth. `replace: false`
  // (Load More) fetches the next page and appends with id-based de-dupe —
  // same convention as HistoryFeed.tsx's loadPage().
  const loadPage = (pageNum: number, options: { replace: boolean }) => {
    const limit = options.replace ? pageNum * PAGE_SIZE : PAGE_SIZE;
    const fetchPage = options.replace ? 1 : pageNum;
    if (options.replace) setLoading(true); else setLoadingMore(true);

    fetch(`${API_BASE_URL}/api/amendments/pending?page=${fetchPage}&limit=${limit}`)
      .then((res) => res.json())
      .then((data) => {
        const incoming: PendingAmendment[] = data.amendments ?? [];
        if (options.replace) {
          setAmendments(incoming);
        } else {
          setAmendments((prev) => {
            const existingIds = new Set(prev.map((a) => a.id));
            return [...prev, ...incoming.filter((a) => !existingIds.has(a.id))];
          });
        }
        setPage(pageNum);
        setHasMore(Boolean(data.hasMore));
      })
      .catch((err) => {
        console.error('[ApprovalsQueue] Failed to fetch pending amendments:', err);
      })
      .finally(() => {
        if (options.replace) setLoading(false); else setLoadingMore(false);
      });
  };

  useEffect(() => {
    loadPage(1, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadMore = () => loadPage(page + 1, { replace: false });

  // ── Approve / Reject ──────────────────────────────────────────────────────
  const handleAction = async (submissionId: string, action: 'approve' | 'reject') => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/amendments/${submissionId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(user) },
        body: JSON.stringify(authIdentity(user)),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      // Refresh list after action — re-fetches at the current loaded depth
      // rather than resetting to page 1.
      setSelectedAmend(null);
      loadPage(page, { replace: true });
    } catch (err) {
      console.error(`[ApprovalsQueue] ${action} failed:`, err);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Parse diff helpers ────────────────────────────────────────────────────
  const getLog = (amend: PendingAmendment): AmendmentLog | null =>
    amend.amendmentLogs?.[0] ?? null;

  const parseJSON = (raw: string | undefined): Record<string, unknown> => {
    if (!raw) return {};
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
  };

  // Only show keys that differ between original and proposed
  const getDiffKeys = (original: Record<string, unknown>, proposed: Record<string, unknown>): string[] => {
    const allKeys = Array.from(new Set([...Object.keys(original), ...Object.keys(proposed)]));
    return allKeys.filter((k) => JSON.stringify(original[k]) !== JSON.stringify(proposed[k]));
  };

  // ── Loading / Empty states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-surface border border-gray-800 rounded-xl p-12 text-center">
        <RefreshCw className="w-10 h-10 text-brand-secondary mx-auto mb-4 opacity-50 animate-spin" strokeWidth={2} />
        <p className="text-muted text-sm font-mono animate-pulse uppercase tracking-wider">Loading approvals queue...</p>
      </div>
    );
  }

  if (amendments.length === 0) {
    return (
      <div className="bg-surface border border-gray-800 rounded-xl p-12 text-center">
        <ShieldAlert className="w-12 h-12 text-brand-secondary mx-auto mb-4 opacity-50" strokeWidth={2} />
        <h3 className="text-xl font-bold text-primary uppercase">No Pending Approvals</h3>
        <p className="text-muted mt-2 text-sm">All amendment requests have been processed.</p>
        <button
          onClick={() => loadPage(1, { replace: true })}
          className="mt-6 h-9 px-4 rounded-lg bg-canvas border border-brand-primary/50 text-brand-secondary hover:bg-brand-primary/10 hover:border-brand-primary font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none mx-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Data Table */}
      <div className="bg-surface border border-gray-800 rounded-lg overflow-x-auto shadow-sm">
        <table className="w-full text-left whitespace-nowrap">
          <thead>
            <tr>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Lot Number
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Requested By
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Requested At
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Status
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {amendments.map((amend) => {
              const log = getLog(amend);
              return (
                <tr key={amend.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 font-mono font-bold text-primary">
                    {amend.batchNumber || amend.id}
                  </td>
                  <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-muted font-sans">
                    {log?.requestedByName ?? '—'}
                  </td>
                  <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 font-mono text-muted">
                    {log?.requestedAt ? new Date(log.requestedAt).toLocaleString() : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-sm border-b border-gray-800/50">
                    {/* §4.9 Amber for pending approval state */}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      PENDING APPROVAL
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-right">
                    <Button variant="primary" onClick={() => setSelectedAmend(amend)}>
                      Review Diff
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore} className="px-8">
            {loadingMore ? 'LOADING…' : 'LOAD MORE'}
          </Button>
        </div>
      )}

      {/* Diff Viewer Modal */}
      {selectedAmend && (() => {
        const log = getLog(selectedAmend);
        const originalValues = parseJSON(log?.originalValues);
        const proposedValues = parseJSON(log?.newValues);
        const diffKeys = getDiffKeys(originalValues, proposedValues);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface border border-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 flex flex-col">

              {/* Modal Header */}
              <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-canvas/50">
                <div>
                  <h3 className="text-lg font-semibold uppercase text-primary">Amendment Request</h3>
                  <p className="text-sm font-mono text-muted mt-1">{selectedAmend.batchNumber} &bull; {selectedAmend.productCode}</p>
                </div>
                <button
                  onClick={() => setSelectedAmend(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-gray-800 hover:text-primary transition-colors"
                >
                  <X className="w-5 h-5" strokeWidth={2} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 flex-1 overflow-y-auto space-y-6">

                {/* Reason */}
                {log?.supervisorNote && (
                  <div className="p-4 border border-brand-secondary/30 bg-brand-primary/5 rounded-lg">
                    <h4 className="text-xs font-bold text-brand-secondary uppercase tracking-widest mb-2 flex items-center gap-2">
                      <User className="w-4 h-4" strokeWidth={2} /> Reason for Amendment
                    </h4>
                    <p className="text-sm text-primary italic">
                      &ldquo;{log.supervisorNote}&rdquo;
                    </p>
                  </div>
                )}

                {/* Show notice if no fields differ */}
                {diffKeys.length === 0 ? (
                  <div className="text-center text-sm text-muted py-6">
                    No field differences detected between original and proposed values.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 rounded-lg border border-gray-800 overflow-hidden">

                    {/* Original */}
                    <div className="p-6 bg-canvas/50 relative border-b md:border-b-0 md:border-r border-gray-800">
                      <h4 className="text-xs font-bold text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <X className="w-4 h-4" strokeWidth={2} /> Original Submission
                      </h4>
                      <div className="space-y-3">
                        {diffKeys.map((key) => (
                          <div key={key} className="p-3 rounded-lg border bg-rose-500/10 border-rose-500/30">
                            {/* §4.4 Key label */}
                            <span className="block text-[10px] font-bold text-muted uppercase mb-1">{key}</span>
                            {typeof originalValues[key] === 'object' || (typeof originalValues[key] === 'string' && /^[[{]/.test((originalValues[key] as string).trim())) ? (
                              <JsonViewer data={originalValues[key]} />
                            ) : (
                              <span className="text-sm font-mono text-rose-400">
                                {String(originalValues[key] ?? '—')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Proposed */}
                    <div className="p-6 bg-canvas/50 relative">
                      <h4 className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Check className="w-4 h-4" strokeWidth={2} /> Proposed Amendment
                      </h4>
                      <div className="absolute top-1/2 -left-3 md:-left-4 -translate-y-1/2 w-6 h-6 md:w-8 md:h-8 rounded-full bg-surface border border-gray-800 flex items-center justify-center z-10 shadow-lg hidden md:flex">
                        <ArrowRight className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
                      </div>
                      <div className="space-y-3">
                        {diffKeys.map((key) => (
                          <div key={key} className="p-3 rounded-lg border bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                            <span className="block text-[10px] font-bold text-muted uppercase mb-1">{key}</span>
                            {typeof proposedValues[key] === 'object' || (typeof proposedValues[key] === 'string' && /^[[{]/.test((proposedValues[key] as string).trim())) ? (
                              <JsonViewer data={proposedValues[key]} />
                            ) : (
                              <span className="text-sm font-mono text-emerald-400">
                                {String(proposedValues[key] ?? '—')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                )}

              </div>

              {/* Modal Footer Actions */}
              <div className="p-6 border-t border-gray-800 flex justify-end gap-4 bg-canvas/30 rounded-b-lg">
                <Button
                  variant="danger"
                  className="px-8"
                  onClick={() => handleAction(selectedAmend.id, 'reject')}
                  disabled={actionLoading}
                >
                  REJECT
                </Button>
                <Button
                  className="px-8 bg-emerald-600 hover:bg-emerald-500 text-white"
                  onClick={() => handleAction(selectedAmend.id, 'approve')}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing...' : 'APPROVE & MERGE'}
                </Button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}
