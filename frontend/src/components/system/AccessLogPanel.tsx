import { useEffect, useState } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { API_BASE_URL } from '../../context/ConfigContext';
import { useAuth, authHeader } from '../../context/AuthContext';

// Mirrors ApprovalsQueue.tsx's PAGE_SIZE/loadPage() pagination pattern — same
// backend page/limit contract (GET /api/access-log).
const PAGE_SIZE = 50;

interface AccessLogRow {
  id: string;
  userId: string | null;
  role: string | null;
  /** Copied in at write time, not a live join — see schema.prisma's AccessLog doc comment. Null for rows predating this field, or a login that never resolved an identity. */
  userDisplayName: string | null;
  action: string;
  detail: string | null;
  ipAddress: string | null;
  timestamp: string;
}

/** 'M365_LOGIN_SUCCESS' -> success, 'M365_LOGIN_FAILURE' -> danger, 'CONFIG_WRITE' -> warning. */
function actionBadgeVariant(action: string): 'success' | 'danger' | 'warning' {
  if (action.endsWith('_FAILURE')) return 'danger';
  if (action.endsWith('_SUCCESS')) return 'success';
  return 'warning';
}

/** 'M365_LOGIN_SUCCESS' -> 'M365 Login Success' */
function formatAction(action: string): string {
  return action
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Read-only, paginated audit trail — System Admin's ACCESS LOG tab
 * (Group A only, SystemPage.tsx). Rows are written server-side from three
 * places: M365 login, PIN login, and PATCH /api/config
 * (backend/src/lib/accessLog.ts). No filtering/search in v1, per spec.
 */
export function AccessLogPanel() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AccessLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = (pageNum: number, options: { replace: boolean }) => {
    const limit = options.replace ? pageNum * PAGE_SIZE : PAGE_SIZE;
    const fetchPage = options.replace ? 1 : pageNum;
    if (options.replace) setLoading(true); else setLoadingMore(true);

    fetch(`${API_BASE_URL}/api/access-log?page=${fetchPage}&limit=${limit}`, {
      headers: { ...authHeader(user) },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const incoming: AccessLogRow[] = data.logs ?? [];
        if (options.replace) {
          setLogs(incoming);
        } else {
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            return [...prev, ...incoming.filter((l) => !existingIds.has(l.id))];
          });
        }
        setPage(pageNum);
        setHasMore(Boolean(data.hasMore));
        setError(null);
      })
      .catch((err) => {
        console.error('[AccessLogPanel] Failed to fetch access log:', err);
        setError(err instanceof Error ? err.message : 'Failed to load access log');
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
  const handleRefresh = () => loadPage(1, { replace: true });

  return (
    <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-surface border-b border-gray-800 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ScrollText className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
          <div>
            <h3 className="text-lg font-semibold uppercase text-primary">Access Log</h3>
            <p className="text-xs text-muted mt-1 font-normal normal-case">
              Audit trail of M365/PIN logins and configuration changes.
            </p>
          </div>
        </div>
        <Button variant="secondary" className="px-4" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="secondary" className="px-4 shrink-0" onClick={handleRefresh} disabled={loading}>
              {loading ? 'RETRYING…' : 'RETRY'}
            </Button>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-8 h-8 text-brand-secondary mx-auto mb-3 opacity-50 animate-spin" strokeWidth={2} />
            <p className="text-muted text-xs font-mono uppercase tracking-wider">Loading access log...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <ScrollText className="w-10 h-10 text-brand-secondary mx-auto mb-3 opacity-50" strokeWidth={2} />
            <p className="text-muted text-sm">No access log entries yet.</p>
          </div>
        ) : (
          // Fixed-height, internally-scrolling box (Jerry's explicit sizing
          // call — ~7-8 rows visible, both directions via one overflow-auto
          // so a table wider than the box still scrolls horizontally too).
          // Sticky `th`s (not `thead`, for consistent cross-browser sticky
          // behavior with a bordered table) pin the header to the top of
          // THIS scroll container. Load More lives inside the same box,
          // below the last row, so its rows land in place — scroll position
          // is never touched, so appending never jumps the view.
          <div className="border border-gray-800 rounded-lg overflow-auto max-h-[420px]">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr>
                  <th className="sticky top-0 z-10 bg-surface text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">Timestamp</th>
                  <th className="sticky top-0 z-10 bg-surface text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">User / Role</th>
                  <th className="sticky top-0 z-10 bg-surface text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">Action</th>
                  <th className="sticky top-0 z-10 bg-surface text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">Detail</th>
                  <th className="sticky top-0 z-10 bg-surface text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4 text-xs border-b border-gray-800/50 font-mono text-muted">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm border-b border-gray-800/50">
                      <div className="font-bold text-primary">
                        {log.userDisplayName ?? '—'}{log.role ? ` · ${log.role}` : ''}
                      </div>
                      {log.userId && (
                        <div className="text-xs text-muted font-mono truncate max-w-[16rem]">{log.userId}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm border-b border-gray-800/50">
                      <Badge variant={actionBadgeVariant(log.action)}>{formatAction(log.action)}</Badge>
                    </td>
                    <td className="py-3 px-4 text-sm border-b border-gray-800/50 text-muted">
                      {log.detail ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-xs border-b border-gray-800/50 font-mono text-muted">
                      {log.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {hasMore && (
              <div className="flex justify-center py-3 border-t border-gray-800/50">
                <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore} className="px-8">
                  {loadingMore ? 'LOADING…' : 'LOAD MORE'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
