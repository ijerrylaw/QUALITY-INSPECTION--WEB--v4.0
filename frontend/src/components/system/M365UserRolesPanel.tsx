import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, UserPlus, UserX, RotateCcw, Trash2, AlertTriangle, X, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { API_BASE_URL } from '../../context/ConfigContext';
import { useAuth, authHeader } from '../../context/AuthContext';
import { useToast } from '../ui/ToastProvider';
import type { UserRole } from '../../context/AuthContext';

// M365-eligible roles only — matches backend/src/routes/m365Users.routes.ts's
// M365_ELIGIBLE_ROLES. Real Entra SSO is restricted to Group A/B tier staff
// (NAVIGATION_AND_RBAC.md §3.1) — Group C stays on PIN login.
// Company-hierarchy order (Manager outranks Executive here) — applied
// everywhere these three roles are listed together as a sequence.
const M365_ROLE_OPTIONS: { role: UserRole; label: string }[] = [
  { role: 'ADMIN', label: 'Admin' },
  { role: 'MANAGER', label: 'Manager' },
  { role: 'EXECUTIVE', label: 'Executive' },
];

interface M365User {
  id: string;
  aadObjectId: string | null;
  userPrincipalName: string;
  displayName: string;
  /**
   * Real job title from Microsoft Graph, captured/refreshed at login time
   * (AuthContext.tsx's resolveM365User). Null for an unclaimed invite or
   * if Graph never returned one. Display-only — NEVER used in any
   * permission/access-control decision.
   */
  jobTitle: string | null;
  role: UserRole | null;
  isActive: boolean;
  createdAt: string;
}

/**
 * Admin UI for the aadObjectId -> role mapping (backend/src/routes/m365Users.routes.ts).
 * A first-time M365 login auto-provisions a `role: null` row here rather
 * than being rejected — this panel is where a Group A admin sees and
 * resolves that "pending" state (NAVIGATION_AND_RBAC.md §3.1 / this
 * feature's design decision: visible and flaggable, not a dead end). Also
 * where a Group A admin can pre-register (invite) a future admin/exec/
 * manager by email before their first login.
 */
export function M365UserRolesPanel() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [m365Users, setM365Users] = useState<M365User[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingRoleById, setPendingRoleById] = useState<Record<string, UserRole>>({});

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('MANAGER');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchM365Users = () => {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/m365-users`, { headers: { ...authHeader(user) } })
      .then((res) => res.json())
      .then((data) => {
        setM365Users(data.m365Users ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[M365UserRolesPanel] Failed to fetch M365 users:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchM365Users();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAssign = async (id: string) => {
    const nextRole = pendingRoleById[id];
    if (!nextRole) return;

    setSavingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/m365-users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader(user) },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      fetchM365Users();
    } catch (err) {
      console.error('[M365UserRolesPanel] Role assignment failed:', err);
    } finally {
      setSavingId(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);

    const userPrincipalName = inviteEmail.trim();
    if (!userPrincipalName) {
      setInviteError('Email is required.');
      return;
    }

    setInviting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/m365-users/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(user) },
        body: JSON.stringify({ userPrincipalName, role: inviteRole }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      setInviteEmail('');
      setInviteRole('MANAGER');
      fetchM365Users();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  };

  // No confirmation step for Deactivate — matches PinAdminPanel's roster
  // convention (only Delete confirms there). Errors (e.g. the last-active-
  // admin lockout 409) surface as a toast since there's no modal for this
  // action to show an inline error in.
  const handleDeactivate = async (mu: M365User) => {
    setTogglingId(mu.id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/m365-users/${mu.id}/deactivate`, {
        method: 'PATCH',
        headers: { ...authHeader(user) },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${res.status}`);
      }
      fetchM365Users();
    } catch (err) {
      console.error('[M365UserRolesPanel] Deactivate failed:', err);
      addToast('error', err instanceof Error ? err.message : 'Failed to deactivate.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleReactivate = async (mu: M365User) => {
    setTogglingId(mu.id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/m365-users/${mu.id}/reactivate`, {
        method: 'PATCH',
        headers: { ...authHeader(user) },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${res.status}`);
      }
      fetchM365Users();
    } catch (err) {
      console.error('[M365UserRolesPanel] Reactivate failed:', err);
      addToast('error', err instanceof Error ? err.message : 'Failed to reactivate.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    setDeleteError(null);
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/api/m365-users/${id}`, {
        method: 'DELETE',
        headers: { ...authHeader(user) },
      });
    } catch (err) {
      console.error('[M365UserRolesPanel] Delete failed (network):', err);
      setDeleteError('Something went wrong — please try again.');
      setDeleting(false);
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('[M365UserRolesPanel] Delete failed:', res.status, data);
      setDeleteError(data.error || 'Something went wrong — please try again.');
      setDeleting(false);
      return;
    }

    setConfirmDeleteId(null);
    setDeleting(false);
    fetchM365Users();
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Invite Form — stacked above the roster (not a side-by-side column):
          at the 1:2 column split this used to have, the email + role +
          submit controls were squeezed into just 1/3 of the tab's width.
          Full-width top-to-bottom gives the form room without needing to
          widen the shared tab wrapper itself. */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-surface border-b border-gray-800 p-4 flex items-center gap-3">
          <UserPlus className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
          <h3 className="text-lg font-semibold uppercase text-primary">Invite by Email</h3>
        </div>

        <form onSubmit={handleInvite} className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Microsoft 365 Email
            </label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full bg-canvas border border-gray-700 text-sm text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
              placeholder="e.g. jane.tan@company.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Access Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              className="w-full bg-canvas border border-gray-700 text-sm text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none appearance-none"
            >
              {M365_ROLE_OPTIONS.map((opt) => (
                <option key={opt.role} value={opt.role}>{opt.label}</option>
              ))}
            </select>
          </div>

          {inviteError && (
            <p className="text-xs text-danger">{inviteError}</p>
          )}

          <Button type="submit" className="w-full" disabled={inviting}>
            {inviting ? 'Sending Invite...' : 'Send Invite'}
          </Button>
        </form>
      </div>

      {/* Roster List */}
      <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-surface border-b border-gray-800 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            <div>
              <h3 className="text-lg font-semibold uppercase text-primary">Microsoft 365 Access</h3>
              <p className="text-xs text-muted mt-1 font-normal normal-case">
                Assign ADMIN / MANAGER / EXECUTIVE to real Entra SSO logins.
              </p>
            </div>
          </div>
          <Button variant="secondary" className="px-4" onClick={fetchM365Users} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted border-b border-gray-800">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">UPN</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Assign</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {m365Users.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted">
                    No Microsoft 365 logins yet. Rows appear here automatically the first time
                    someone signs in with Microsoft 365, or after you send an invite.
                  </td>
                </tr>
              )}
              {m365Users.map((mu) => {
                // Invited-but-unclaimed: pre-registered by email (a Group A
                // admin's invite), no aadObjectId yet since they haven't
                // logged in. Distinct from a self-registered 'pending' row
                // (role: null) — this row already has a role, just no login.
                const isUnclaimedInvite = mu.aadObjectId === null;
                const isToggling = togglingId === mu.id;
                return (
                  <tr
                    key={mu.id}
                    className={`border-b border-gray-800/60 last:border-0 ${!mu.isActive ? 'opacity-50' : ''}`}
                  >
                    <td className="px-6 py-3">
                      <div className="text-primary font-medium">{mu.displayName}</div>
                      {mu.jobTitle && (
                        <div className="text-xs text-muted mt-0.5">{mu.jobTitle}</div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-muted">{mu.userPrincipalName}</td>
                    <td className="px-6 py-3">
                      {isUnclaimedInvite ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs uppercase text-muted">{mu.role}</span>
                          <Badge variant="warning">Pending Invite</Badge>
                        </div>
                      ) : mu.role ? (
                        <span className="font-mono text-xs uppercase text-muted">{mu.role}</span>
                      ) : (
                        <Badge variant="warning">Pending</Badge>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={mu.isActive ? 'success' : 'danger'}>
                        {mu.isActive ? 'Active' : 'Deactivated'}
                      </Badge>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={pendingRoleById[mu.id] ?? mu.role ?? ''}
                          onChange={(e) =>
                            setPendingRoleById((prev) => ({ ...prev, [mu.id]: e.target.value as UserRole }))
                          }
                          className="bg-canvas border border-gray-700 text-xs text-primary rounded-lg px-3 py-2 focus:border-brand-primary outline-none appearance-none"
                        >
                          <option value="" disabled>Select role...</option>
                          {M365_ROLE_OPTIONS.map((opt) => (
                            <option key={opt.role} value={opt.role}>{opt.label}</option>
                          ))}
                        </select>
                        <Button
                          size="icon"
                          onClick={() => handleAssign(mu.id)}
                          disabled={savingId === mu.id || !pendingRoleById[mu.id]}
                          title="Save role assignment"
                        >
                          {savingId === mu.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" strokeWidth={2} />
                          )}
                        </Button>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {/* Icon-only + title tooltip (matches FactorySetup.tsx's
                          inline-edit Save/Cancel and SystemSettings.tsx's
                          show/hide-secret toggle) — full-text buttons here
                          pushed this column, combined with Assign, past the
                          card's width and forced the table into horizontal
                          scroll. */}
                      <div className="inline-flex items-center gap-2">
                        {mu.isActive ? (
                          <Button
                            variant="danger"
                            size="icon"
                            onClick={() => handleDeactivate(mu)}
                            disabled={isToggling}
                            title="Deactivate"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => handleReactivate(mu)}
                            disabled={isToggling}
                            title="Reactivate"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          size="icon"
                          onClick={() => {
                            setDeleteError(null);
                            setConfirmDeleteId(mu.id);
                          }}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Delete Confirmation Modal — matches PinAdminPanel.tsx's delete
           modal pattern (bg-black/70 backdrop, bg-canvas card, rose
           AlertTriangle icon, cancel/confirm pair) ── */}
      {confirmDeleteId && (() => {
        const target = m365Users.find((mu) => mu.id === confirmDeleteId);
        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-canvas border border-gray-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
              <div className="flex items-start gap-4 p-4 border-b border-gray-800">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 text-rose-400" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-wide text-primary mb-1">
                    DELETE M365 ACCESS?
                  </h3>
                  <p className="text-sm text-muted">
                    Are you sure you want to permanently delete{' '}
                    <span className="font-bold text-white uppercase">{target?.displayName}</span>? This
                    cannot be undone.
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
