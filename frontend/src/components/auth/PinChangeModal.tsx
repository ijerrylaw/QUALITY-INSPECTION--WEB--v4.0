/**
 * @file PinChangeModal.tsx
 * @description Self-service PIN change for PIN-logged-in staff (AUDIT_REPORT.md,
 * Staff PIN Access task). Reachable from Sidebar.tsx's footer for any
 * user.loginMethod === 'PIN' session — no Group A/B auth required. Identity
 * is scoped to the already-authenticated session's own `user.id`, and the
 * correct current PIN is still required as the proof-of-identity factor
 * (verified server-side against POST /api/auth/pin-change's `{ userId,
 * currentPin, newPin }`). Scoped by userId rather than a bare currentPin
 * scan-all — PIN uniqueness across staff is no longer enforced (identity-
 * first login, LoginPage.tsx), so a scan with no userId could no longer
 * reliably tell which of potentially several same-PIN active users this
 * session actually belongs to.
 *
 * Modal shell follows QualityRules.tsx's delete-confirmation modal pattern
 * (bg-black/70 backdrop, bg-canvas card) sized for a form instead.
 */
import { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { API_BASE_URL } from '../../context/ConfigContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/ToastProvider';

interface PinChangeModalProps {
  open: boolean;
  onClose: () => void;
}

function PinField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        maxLength={6}
        required
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="w-full bg-canvas border border-gray-700 text-sm font-mono text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
        placeholder="000000"
      />
    </div>
  );
}

export function PinChangeModal({ open, onClose }: PinChangeModalProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const reset = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setFormError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

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

      addToast('success', 'PIN updated successfully.');
      reset();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change PIN.';
      setFormError(message);
      addToast('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-canvas border border-gray-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
        <div className="flex items-start gap-4 p-4 border-b border-gray-800">
          <div className="w-12 h-12 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
            <KeyRound className="w-6 h-6 text-brand-secondary" strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-lg font-bold uppercase tracking-wide text-primary mb-1">
              Change My PIN
            </h3>
            <p className="text-sm text-muted">
              Enter your current PIN and choose a new 6-digit PIN.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <PinField label="Current PIN" value={currentPin} onChange={setCurrentPin} />
          <PinField label="New PIN" value={newPin} onChange={setNewPin} />
          <PinField label="Confirm New PIN" value={confirmPin} onChange={setConfirmPin} />

          {formError && <p className="text-xs text-danger">{formError}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="h-10 px-4 rounded-lg bg-canvas border border-gray-700 text-muted hover:text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none"
            >
              <X className="w-4 h-4" strokeWidth={2} />
              <span>Cancel</span>
            </button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Updating...' : 'Update PIN'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
