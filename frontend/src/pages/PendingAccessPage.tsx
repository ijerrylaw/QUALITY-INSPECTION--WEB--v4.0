import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';

/**
 * Shown in place of the full app shell (Sidebar + routes) whenever a
 * logged-in M365 user has `role: null` — a real, Entra-authenticated
 * person who hasn't been assigned a role by a Group A admin yet
 * (App.tsx's ProtectedRoute is the single place this gate is enforced).
 * Intentionally blocks every route, not just the Group A/B-only ones —
 * "SSO-side equivalent of an unconfigured account, not a dead end."
 */
export function PendingAccessPage() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-canvas text-primary p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
            <ShieldAlert size={32} />
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight">Access Pending</h1>
          <p className="text-muted">
            Your Microsoft 365 account{user?.email ? ` (${user.email})` : ''} is verified but
            hasn't been assigned a role yet. Contact your administrator to be granted access.
          </p>
        </div>
        <Button variant="secondary" className="w-full h-12" onClick={logout}>
          Sign Out
        </Button>
      </div>
    </div>
  );
}
