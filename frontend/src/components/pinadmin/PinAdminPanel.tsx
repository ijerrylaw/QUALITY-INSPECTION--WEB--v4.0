import { useState, useEffect } from 'react';
import { UserPlus, UserX, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { API_BASE_URL } from '../../context/ConfigContext';
import { useAuth, authHeader } from '../../context/AuthContext';
import type { UserRole } from '../../context/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PinUser {
  id: string;
  name: string;
  jobTitle: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

// PIN-eligible roles only (AUDIT_REPORT.md §11) — the "no email" / "PIN
// fallback" roles per NAVIGATION_AND_RBAC.md §2. Matches the same allow-list
// enforced server-side in backend/src/routes/pinUsers.routes.ts.
const PIN_ROLE_OPTIONS: { role: UserRole; label: string }[] = [
  { role: 'OPERATOR', label: 'General Worker / Operator' },
  { role: 'LEADER', label: 'Line Leader' },
  { role: 'SUPERVISOR', label: 'Shift Supervisor (PIN Fallback)' },
];

// ── PinAdminPanel ─────────────────────────────────────────────────────────────

export function PinAdminPanel() {
  const { user } = useAuth();
  const [pinUsers, setPinUsers] = useState<PinUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);

  const visibleUsers = showDeactivated ? pinUsers : pinUsers.filter((pu) => pu.active);

  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole] = useState<UserRole>('OPERATOR');
  const [pin, setPin] = useState('');

  const fetchPinUsers = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/pin-users`, { headers: { ...authHeader(user) } })
      .then((res) => res.json())
      .then((data) => {
        setPinUsers(data.pinUsers ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[PinAdminPanel] Failed to fetch PIN users:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchPinUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!/^\d{6}$/.test(pin)) {
      setFormError('PIN must be exactly 6 digits.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/pin-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(user) },
        body: JSON.stringify({ name, jobTitle, role, pin }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      setName('');
      setJobTitle('');
      setRole('OPERATOR');
      setPin('');
      fetchPinUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create PIN user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/pin-users/${id}/deactivate`, {
        method: 'PATCH',
        headers: { ...authHeader(user) },
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      fetchPinUsers();
    } catch (err) {
      console.error('[PinAdminPanel] Deactivate failed:', err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Create Form */}
      <div className="lg:col-span-1 bg-surface border border-gray-800 rounded-xl shadow-sm overflow-hidden h-fit">
        <div className="bg-canvas border-b border-gray-800 p-6 flex items-center gap-3">
          <UserPlus className="w-5 h-5 text-brand-secondary" />
          <h3 className="text-lg font-bold text-primary uppercase">Add Staff PIN</h3>
        </div>

        <form onSubmit={handleCreate} className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-canvas border border-gray-700 text-sm text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
              placeholder="e.g. Ahmad Razak"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Job Title</label>
            <input
              type="text"
              required
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full bg-canvas border border-gray-700 text-sm text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
              placeholder="e.g. Packing Operator - Line 3"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Access Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full bg-canvas border border-gray-700 text-sm text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none appearance-none"
            >
              {PIN_ROLE_OPTIONS.map((opt) => (
                <option key={opt.role} value={opt.role}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">6-Digit PIN</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full bg-canvas border border-gray-700 text-sm font-mono text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
              placeholder="000000"
            />
          </div>

          {formError && (
            <p className="text-xs text-danger">{formError}</p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add Staff Member'}
          </Button>
        </form>
      </div>

      {/* Roster List */}
      <div className="lg:col-span-2 bg-surface border border-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-canvas border-b border-gray-800 p-6 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-primary uppercase">Staff Roster</h3>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="px-4 gap-2"
              onClick={() => setShowDeactivated((prev) => !prev)}
            >
              {showDeactivated ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{showDeactivated ? 'Hide Deactivated' : 'Show Deactivated'}</span>
            </Button>
            <Button variant="secondary" className="px-4" onClick={fetchPinUsers} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted border-b border-gray-800">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Job Title</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted">
                    {pinUsers.length === 0
                      ? 'No staff PIN logins yet.'
                      : 'No active staff. Toggle "Show Deactivated" to view deactivated staff.'}
                  </td>
                </tr>
              )}
              {visibleUsers.map((pu) => (
                <tr
                  key={pu.id}
                  className={`border-b border-gray-800/60 last:border-0 ${!pu.active ? 'opacity-50' : ''}`}
                >
                  <td className="px-6 py-3 text-primary font-medium">{pu.name}</td>
                  <td className="px-6 py-3 text-muted">{pu.jobTitle}</td>
                  <td className="px-6 py-3 text-muted font-mono text-xs uppercase">{pu.role}</td>
                  <td className="px-6 py-3">
                    <Badge variant={pu.active ? 'success' : 'danger'}>
                      {pu.active ? 'Active' : 'Deactivated'}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    {pu.active && (
                      <Button
                        variant="danger"
                        className="px-3 h-8 inline-flex items-center gap-1.5"
                        onClick={() => handleDeactivate(pu.id)}
                      >
                        <UserX className="w-3.5 h-3.5" /> Deactivate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
