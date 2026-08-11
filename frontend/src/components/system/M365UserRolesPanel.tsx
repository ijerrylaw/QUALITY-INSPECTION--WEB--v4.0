import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
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
  aadObjectId: string;
  userPrincipalName: string;
  displayName: string;
  role: UserRole | null;
  createdAt: string;
}

/**
 * Admin UI for the aadObjectId -> role mapping (backend/src/routes/m365Users.routes.ts).
 * A first-time M365 login auto-provisions a `role: null` row here rather
 * than being rejected — this panel is where a Group A admin sees and
 * resolves that "pending" state (NAVIGATION_AND_RBAC.md §3.1 / this
 * feature's design decision: visible and flaggable, not a dead end).
 */
export function M365UserRolesPanel() {
  const { user } = useAuth();
  const [m365Users, setM365Users] = useState<M365User[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingRoleById, setPendingRoleById] = useState<Record<string, UserRole>>({});

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

  return (
    <div className="bg-surface border border-gray-800 rounded-xl shadow-sm overflow-hidden">
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
                  someone signs in with Microsoft 365.
                </td>
              </tr>
            )}
            {m365Users.map((mu) => (
              <tr key={mu.id} className="border-b border-gray-800/60 last:border-0">
                <td className="px-6 py-3 text-primary font-medium">{mu.displayName}</td>
                <td className="px-6 py-3 text-muted">{mu.userPrincipalName}</td>
                <td className="px-6 py-3">
                  {mu.role ? (
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
