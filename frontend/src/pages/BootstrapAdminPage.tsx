import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';

/**
 * Shown in place of the full app shell whenever a logged-in M365 user's
 * status is 'bootstrap-eligible' — the M365UserRole table is completely
 * empty, so this person can claim the first-ever ADMIN row (backend/src/
 * routes/m365Users.routes.ts's POST /api/auth/claim-bootstrap-admin).
 * Requires an explicit confirm rather than auto-claiming, since a stray
 * first login by the wrong person shouldn't silently become the sole admin.
 *
 * The claim call re-checks emptiness server-side and can 409 if another
 * concurrent claim won it first (BOOTSTRAP_ADMIN_ROW_ID's race-safety) — that
 * failure is surfaced here with a Sign Out path back to normal login, not a
 * dead end: signing back in re-resolves status against the now-non-empty
 * table (landing on 'pending' instead).
 */
export function BootstrapAdminPage() {
  const { user, logout, claimBootstrapAdmin } = useAuth();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setClaiming(true);
    setError(null);
    try {
      await claimBootstrapAdmin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim bootstrap admin.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-canvas text-primary p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-primary/20 text-brand-secondary flex items-center justify-center border border-brand-secondary/40">
            <ShieldCheck size={32} />
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight">Become the First Administrator</h1>
          <p className="text-muted">
            No administrator is configured for this installation yet. You're about to become the
            first Administrator{user?.email ? ` as ${user.email}` : ''}. Continue?
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <div className="space-y-3">
          <Button className="w-full h-12" onClick={handleConfirm} disabled={claiming}>
            {claiming ? 'Claiming...' : 'Confirm — Become Administrator'}
          </Button>
          <Button variant="secondary" className="w-full h-12" onClick={logout} disabled={claiming}>
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
