import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../context/ConfigContext';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastProvider';

/**
 * Shown in place of the full app shell (Sidebar + routes) whenever a
 * PIN-logged-in user's `mustChangePin` is true — App.tsx's ProtectedRoute is
 * the single place this gate is enforced, same cluster as PendingAccessPage/
 * RevokedAccessPage/BootstrapAdminPage. Non-dismissible by design: the
 * account's PIN was set by an ADMIN/MANAGER (creation or a PIN reset), and
 * the whole point of `mustChangePin` is that an admin-chosen PIN is only
 * ever a one-time temp credential — this screen is what stands between that
 * temp PIN and this becoming the account's actual, admin-unknown working
 * PIN. Applies uniformly to all four Group C PIN-eligible roles; the gate is
 * on `loginMethod`, not role.
 *
 * Reuses the same POST /api/auth/pin-change endpoint PinChangeModal.tsx's
 * self-service "Change My PIN" uses (currentPin = the temp PIN just used to
 * log in, newPin = the worker's own private choice) — just full-screen and
 * blocking instead of a dismissible modal. On success, calls
 * completePinChange() to mirror the server's cleared mustChangePin into
 * client state so this gate re-evaluates and lets the user through.
 */
export function SetPinPage() {
  const { user, completePinChange, logout } = useAuth();
  const { addToast } = useToast();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin) || !/^\d{6}$/.test(confirmPin)) {
      setFormError('All PIN fields must be exactly 6 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setFormError('New PIN and confirmation do not match.');
      return;
    }
    if (newPin === currentPin) {
      setFormError('Your new PIN must be different from the temporary PIN.');
      return;
    }
    if (!user) {
      setFormError('No active session — please log in again.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/pin-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, currentPin, newPin }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      addToast('success', 'PIN updated. Welcome!');
      completePinChange();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set PIN.';
      setFormError(message);
      addToast('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-canvas text-primary p-6">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-primary/10 flex items-center justify-center border border-brand-secondary/40">
              <KeyRound className="w-8 h-8 text-brand-secondary" strokeWidth={2} />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Set Your Own PIN</h1>
          <p className="text-muted">
            {user?.name ? `Welcome, ${user.name}. ` : ''}
            For your security, you must set a private PIN of your own before continuing —
            enter the temporary PIN you just used, then choose a new 6-digit PIN only you will know.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Temporary PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              required
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full bg-canvas border border-gray-700 text-sm font-mono text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
              placeholder="000000"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">New PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="new-password"
              required
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full bg-canvas border border-gray-700 text-sm font-mono text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
              placeholder="000000"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Confirm New PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="new-password"
              required
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full bg-canvas border border-gray-700 text-sm font-mono text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
              placeholder="000000"
            />
          </div>

          {formError && <p className="text-xs text-danger">{formError}</p>}

          <Button type="submit" className="w-full h-12" disabled={submitting}>
            {submitting ? 'Setting PIN...' : 'Set My PIN'}
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={logout}
            className="text-xs text-muted hover:text-white transition-colors outline-none"
          >
            Not you? Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
