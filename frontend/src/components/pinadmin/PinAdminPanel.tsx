import { useState, useEffect } from 'react';
import { UserPlus, UserX, RefreshCw, Eye, EyeOff, Trash2, AlertTriangle, X, Check, Pencil } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { API_BASE_URL } from '../../context/ConfigContext';
import { useAuth, authHeader } from '../../context/AuthContext';
import type { UserRole } from '../../context/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PinUser {
  id: string;
  name: string;
  employeeId: string;
  jobTitle: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

// PIN-eligible roles only (AUDIT_REPORT.md §11) — the "no email" / "PIN
// fallback" roles per NAVIGATION_AND_RBAC.md §2. Matches the same allow-list
// enforced server-side in backend/src/routes/pinUsers.routes.ts. Labels are
// deliberately plain role names (not descriptive phrases) — single source of
// truth for both the create-form dropdown and the roster table's ROLE column
// (via ROLE_LABELS below), so the two surfaces can never drift apart.
const PIN_ROLE_OPTIONS: { role: UserRole; label: string }[] = [
  { role: 'OPERATOR', label: 'Operator' },
  { role: 'LEADER', label: 'Leader' },
  { role: 'SUPERVISOR', label: 'Supervisor' },
  { role: 'INTERN', label: 'Intern' },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  PIN_ROLE_OPTIONS.map((opt) => [opt.role, opt.label])
);

// ── PinAdminPanel ─────────────────────────────────────────────────────────────

export function PinAdminPanel() {
  const { user } = useAuth();
  const [pinUsers, setPinUsers] = useState<PinUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const visibleUsers = showDeactivated ? pinUsers : pinUsers.filter((pu) => pu.active);

  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole] = useState<UserRole>('OPERATOR');
  const [pin, setPin] = useState('');

  // Inline Editing State (Employee ID only — the sole PinUser field editable
  // after creation, per the scoped PATCH /api/pin-users/:id endpoint).
  const [editingEmployeeIdFor, setEditingEmployeeIdFor] = useState<string | null>(null);
  const [editEmployeeIdValue, setEditEmployeeIdValue] = useState('');
  const [editEmployeeIdError, setEditEmployeeIdError] = useState<string | null>(null);
  const [savingEmployeeId, setSavingEmployeeId] = useState(false);

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
        body: JSON.stringify({ name, employeeId, jobTitle, role, pin }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      setName('');
      setEmployeeId('');
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

  const startEditingEmployeeId = (pu: PinUser) => {
    setEditingEmployeeIdFor(pu.id);
    setEditEmployeeIdValue(pu.employeeId);
    setEditEmployeeIdError(null);
  };

  const cancelEditingEmployeeId = () => {
    setEditingEmployeeIdFor(null);
    setEditEmployeeIdError(null);
  };

  const saveEditingEmployeeId = async (id: string) => {
    setEditEmployeeIdError(null);
    setSavingEmployeeId(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/pin-users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader(user) },
        body: JSON.stringify({ employeeId: editEmployeeIdValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${res.status}`);
      }
      setEditingEmployeeIdFor(null);
      fetchPinUsers();
    } catch (err) {
      setEditEmployeeIdError(err instanceof Error ? err.message : 'Failed to update Employee ID.');
    } finally {
      setSavingEmployeeId(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    setDeleteError(null);
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/api/pin-users/${id}`, {
        method: 'DELETE',
        headers: { ...authHeader(user) },
      });
    } catch (err) {
      console.error('[PinAdminPanel] Delete failed (network):', err);
      setDeleteError('Something went wrong — please try again.');
      setDeleting(false);
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('[PinAdminPanel] Delete failed:', res.status, data);
      setDeleteError(data.error || 'Something went wrong — please try again.');
      setDeleting(false);
      return;
    }

    setConfirmDeleteId(null);
    setDeleting(false);
    fetchPinUsers();
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
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">Employee ID</label>
            <input
              type="text"
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
              className="w-full bg-canvas border border-gray-700 text-sm font-mono uppercase placeholder:normal-case text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
              placeholder="e.g. OT1234 or FOT1234"
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
              placeholder="e.g. IPQA Operator or PSQA Leader"
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
                <th className="px-6 py-3">Employee ID</th>
                <th className="px-6 py-3">Job Title</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted">
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
                  <td className="px-6 py-3">
                    {editingEmployeeIdFor === pu.id ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            autoFocus
                            value={editEmployeeIdValue}
                            onChange={(e) => setEditEmployeeIdValue(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditingEmployeeId(pu.id);
                              if (e.key === 'Escape') cancelEditingEmployeeId();
                            }}
                            className="w-32 h-8 px-2 bg-canvas border border-gray-700 rounded font-mono text-xs uppercase text-primary focus:border-brand-primary outline-none"
                          />
                          <button
                            onClick={() => saveEditingEmployeeId(pu.id)}
                            disabled={savingEmployeeId}
                            className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/20 transition-colors outline-none disabled:opacity-50"
                            title="Save (Enter)"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelEditingEmployeeId}
                            className="p-1.5 rounded-md text-rose-400 hover:bg-rose-500/20 transition-colors outline-none"
                            title="Cancel (Esc)"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {editEmployeeIdError && (
                          <p className="text-[10px] text-danger">{editEmployeeIdError}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group/eid">
                        <span className="font-mono text-xs uppercase text-muted">{pu.employeeId}</span>
                        <button
                          onClick={() => startEditingEmployeeId(pu)}
                          className="p-1 rounded text-muted hover:text-white hover:bg-gray-800 opacity-0 group-hover/eid:opacity-100 transition-opacity outline-none"
                          title="Edit Employee ID"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-3 text-muted">{pu.jobTitle}</td>
                  <td className="px-6 py-3 text-muted text-xs">{ROLE_LABELS[pu.role] ?? pu.role}</td>
                  <td className="px-6 py-3">
                    <Badge variant={pu.active ? 'success' : 'danger'}>
                      {pu.active ? 'Active' : 'Deactivated'}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      {pu.active && (
                        <Button
                          variant="danger"
                          className="px-3 h-8 inline-flex items-center gap-1.5"
                          onClick={() => handleDeactivate(pu.id)}
                        >
                          <UserX className="w-3.5 h-3.5" /> Deactivate
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        className="px-3 h-8 inline-flex items-center gap-1.5"
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmDeleteId(pu.id);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Delete Confirmation Modal — matches QualityRules.tsx's delete-profile
           modal pattern (bg-black/70 backdrop, bg-canvas card, rose AlertTriangle
           icon, cancel/confirm pair) ── */}
      {confirmDeleteId && (() => {
        const target = pinUsers.find((pu) => pu.id === confirmDeleteId);
        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-canvas border border-gray-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
              <div className="flex items-start gap-4 p-4 border-b border-gray-800">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 text-rose-400" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-wide text-primary mb-1">
                    DELETE STAFF MEMBER?
                  </h3>
                  <p className="text-sm text-muted">
                    Are you sure you want to permanently delete{' '}
                    <span className="font-bold text-white uppercase">{target?.name}</span>? This cannot be undone.
                  </p>
                  {deleteError && (
                    <p className="text-xs text-danger mt-2">{deleteError}</p>
                  )}
                </div>
              </div>

              <div className="p-4 bg-surface flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setConfirmDeleteId(null);
                    setDeleteError(null);
                  }}
                  className="h-10 px-4 rounded-lg bg-canvas border border-gray-700 text-muted hover:text-white font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none"
                >
                  <X className="w-4 h-4" strokeWidth={2} />
                  <span>CANCEL</span>
                </button>
                <button
                  onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
                  disabled={deleting}
                  className="h-10 px-5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none border border-rose-500/50 shadow-sm disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2} />
                  <span>{deleting ? 'DELETING...' : 'CONFIRM DELETE'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
