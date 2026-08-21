import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { API_BASE_URL } from '../../context/ConfigContext';
import { useAuth, authHeader } from '../../context/AuthContext';
import type { UserRole } from '../../context/AuthContext';

// M365-eligible roles only — matches backend/src/routes/m365Users.routes.ts's
// M365_ELIGIBLE_ROLES. Real Entra SSO is restricted to Group A/B tier staff
// (NAVIGATION_AND_RBAC.md §3.1) — Group C stays on PIN login.
const M365_ROLE_OPTIONS: { role: UserRole; label: string }[] = [
  { role: 'ADMIN', label: 'Admin' },
  { role: 'EXECUTIVE', label: 'Executive' },
  { role: 'MANAGER', label: 'Manager' },
];

interface M365User {
  id: string;
  aadObjectId: string | null;
  userPrincipalName: string;
  displayName: string;
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
  const [m365Users, setM365Users] = useState<M365User[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingRoleById, setPendingRoleById] = useState<Record<string, UserRole>>({});

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('MANAGER');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Invite Form */}
      <div className="lg:col-span-1 bg-surface border border-gray-800 rounded-xl shadow-sm overflow-hidden h-fit">
        <div className="bg-canvas border-b border-gray-800 p-6 flex items-center gap-3">
          <UserPlus className="w-5 h-5 text-brand-secondary" />
          <h3 className="text-lg font-bold text-primary uppercase">Invite by Email</h3>
        </div>

        <form onSubmit={handleInvite} className="p-6 space-y-5">
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
      <div className="lg:col-span-2 bg-surface border border-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-canvas border-b border-gray-800 p-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-brand-secondary" />
            <div>
              <h3 className="text-lg font-bold text-primary uppercase">Microsoft 365 Access</h3>
              <p className="text-xs text-muted mt-0.5">
                Assign ADMIN / EXECUTIVE / MANAGER to real Entra SSO logins.
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
                <th className="px-6 py-3 text-right">Assign</th>
              </tr>
            </thead>
            <tbody>
              {m365Users.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted">
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
                return (
                  <tr key={mu.id} className="border-b border-gray-800/60 last:border-0">
                    <td className="px-6 py-3 text-primary font-medium">{mu.displayName}</td>
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
                          className="px-4 h-8"
                          onClick={() => handleAssign(mu.id)}
                          disabled={savingId === mu.id || !pendingRoleById[mu.id]}
                        >
                          {savingId === mu.id ? 'Saving...' : 'Save'}
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
    </div>
  );
}
