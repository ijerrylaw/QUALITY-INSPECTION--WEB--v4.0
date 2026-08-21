import { ShieldX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';

/**
 * Shown in place of the full app shell whenever a logged-in M365 user's
 * status is 'revoked' — someone who HAD access (or an invite) and had it
 * deactivated by a Group A admin. Distinct from PendingAccessPage (which
 * covers "never had access") so the messaging doesn't imply this is a new
 * account waiting on first assignment (App.tsx's ProtectedRoute is the
 * single place this gate is enforced).
 */
export function RevokedAccessPage() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-canvas text-primary p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/40">
            <ShieldX size={32} />
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight">Access Revoked</h1>
          <p className="text-muted">
            Your Microsoft 365 account{user?.email ? ` (${user.email})` : ''}'s access has been
            revoked. Contact your administrator if you believe this is a mistake.
          </p>
        </div>
        <Button variant="secondary" className="w-full h-12" onClick={logout}>
          Sign Out
        </Button>
      </div>
    </div>
  );
}
