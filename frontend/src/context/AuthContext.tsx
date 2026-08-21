import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { AccountInfo } from '@azure/msal-browser';
import { API_BASE_URL } from './ConfigContext';
import { msalInstance, loginRequest, graphRequest, GRAPH_ME_ENDPOINT } from '../lib/msalConfig';

// Define the valid roles in the system
export type UserRole = 'OPERATOR' | 'LEADER' | 'SUPERVISOR' | 'EXECUTIVE' | 'MANAGER' | 'ADMIN';

/**
 * Permission GROUPS (AUDIT_REPORT.md §11) — a coarser layer on top of the six
 * real-job-title-mapped roles above, independent of login method (a
 * Supervisor logs in via M365 like Group B does, but sits in Group C for
 * access purposes). Keep in sync with backend/src/middleware/auth.ts's
 * PERMISSION_GROUPS.
 *
 *   Group A — IT Admin, C-Suite, Directors     — full access incl. System Admin
 *   Group B — department Managers, Executives  — full access except System Admin
 *   Group C — Supervisors, Operators, Leaders   — Wizard + Inspection Records only
 */
export type PermissionGroup = 'A' | 'B' | 'C';

/**
 * Mirrors the backend's POST /api/auth/m365-login response envelope
 * (backend/src/routes/m365Users.routes.ts). PIN logins are always 'active' —
 * this status model only has meaning for M365/SSO logins.
 */
export type LoginStatus = 'active' | 'revoked' | 'invite-claimed' | 'bootstrap-eligible' | 'pending';

export const PERMISSION_GROUPS: Record<UserRole, PermissionGroup> = {
  ADMIN: 'A',
  EXECUTIVE: 'B',
  MANAGER: 'B',
  SUPERVISOR: 'C',
  LEADER: 'C',
  OPERATOR: 'C',
};

export function getPermissionGroup(role: UserRole): PermissionGroup {
  return PERMISSION_GROUPS[role];
}

/** Role lists derived from the group mapping, for RoleRoute/Sidebar allow-lists. */
export function rolesInGroups(...groups: PermissionGroup[]): UserRole[] {
  return (Object.keys(PERMISSION_GROUPS) as UserRole[]).filter((role) =>
    groups.includes(PERMISSION_GROUPS[role])
  );
}

export interface User {
  id: string;
  name: string;
  /** Real job title, e.g. "Plant Director", "Line Leader" — display/audit only, never used for permission checks. */
  title: string;
  email?: string;
  /**
   * null only ever occurs for an M365 login whose aadObjectId has no row (or
   * a role: null row) in the backend's M365UserRole table yet — a real,
   * Entra-authenticated person who hasn't been assigned a role by a Group A
   * admin. Every consumer of `role` must treat null as "no access", not
   * "some access" — see App.tsx's ProtectedRoute pending-access gate, which
   * is the single place this is enforced for the whole app. PIN logins never
   * produce null; the backend only ever returns a real Group-C role for them.
   */
  role: UserRole | null;
  tenantId: string;
  facilityId: string;
  /** Which login path resolved this session — idle-expiry only applies to 'PIN' (shared floor tablets). */
  loginMethod: 'M365' | 'PIN';
  /** Always 'active' for PIN logins — see LoginStatus's doc comment. */
  status: LoginStatus;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loginWithM365: () => Promise<User>;
  loginWithPIN: (pin: string) => Promise<void>;
  claimBootstrapAdmin: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// PIN logins have no real tenant concept (NAVIGATION_AND_RBAC.md §1 — vestigial
// display field, never sent to the backend). M365 logins use the real Entra
// tenant ID from the account instead — see resolveM365User below.
const PIN_PLACEHOLDER_TENANT_ID = 'TENANT_ONEGLOVE_01';

/**
 * Fetches jobTitle from Microsoft Graph (not available as an ID token claim
 * in this tenant — NAVIGATION_AND_RBAC.md §3.1) and resolves the account's
 * role via POST /api/auth/m365-login. Shared by loginWithM365 (fresh popup
 * login) and the silent-reauth-on-mount effect (existing cached account) so
 * both paths re-resolve role from the backend rather than trusting a stale
 * cached value — an admin may have (re)assigned the role since last session.
 *
 * If the Graph call fails, login still proceeds with an empty title — title
 * is display/audit only and is never read by any permission check (see the
 * User.title doc comment above), so a Graph hiccup must not block access.
 */
async function resolveM365User(account: AccountInfo): Promise<User> {
  let jobTitle = '';
  try {
    const tokenResponse = await msalInstance.acquireTokenSilent({ ...graphRequest, account });
    const graphRes = await fetch(GRAPH_ME_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
    });
    if (graphRes.ok) {
      const graphData = (await graphRes.json()) as { jobTitle?: string | null };
      jobTitle = graphData.jobTitle ?? '';
    } else {
      console.warn('[AuthContext] Microsoft Graph User.Read call returned', graphRes.status);
    }
  } catch (graphError) {
    console.warn('[AuthContext] Failed to fetch jobTitle from Microsoft Graph; proceeding without it.', graphError);
  }

  const res = await fetch(`${API_BASE_URL}/api/auth/m365-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aadObjectId: account.localAccountId,
      userPrincipalName: account.username,
      displayName: account.name ?? account.username,
      // '' when the Graph call above failed/returned none — the backend
      // only overwrites a stored jobTitle when this is non-empty, so a
      // transient Graph hiccup here never blanks out a previously
      // captured value for this person (M365UserRolesPanel.tsx's table).
      jobTitle,
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to resolve Microsoft 365 role assignment.');
  }

  const { role, status } = (await res.json()) as { role: UserRole | null; status: LoginStatus };

  return {
    id: account.localAccountId,
    name: account.name ?? account.username,
    title: jobTitle,
    email: account.username,
    role,
    tenantId: account.tenantId ?? PIN_PLACEHOLDER_TENANT_ID,
    facilityId: 'GLOBAL',
    loginMethod: 'M365',
    status,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Guards against double-firing the silent-reauth effect under StrictMode's
  // dev double-invoke and against a stray run after an explicit logout.
  const silentReauthAttempted = useRef(false);

  // Session persistence on page refresh/browser restart — standard MSAL.js
  // pattern: if a cached account exists, silently re-establish `user` state
  // (and re-resolve role from the backend) without a visible login prompt.
  useEffect(() => {
    if (silentReauthAttempted.current) return;
    silentReauthAttempted.current = true;

    const accounts = msalInstance.getAllAccounts();
    const account = accounts[0];
    if (!account) return;

    msalInstance.setActiveAccount(account);
    resolveM365User(account)
      .then(setUser)
      .catch((err) => {
        console.warn('[AuthContext] Silent M365 re-auth failed; user must sign in again.', err);
      });
  }, []);

  const loginWithM365 = useCallback(async () => {
    const loginResponse = await msalInstance.loginPopup(loginRequest);
    if (!loginResponse.account) {
      throw new Error('Microsoft 365 login did not return an account.');
    }
    msalInstance.setActiveAccount(loginResponse.account);
    const resolvedUser = await resolveM365User(loginResponse.account);
    setUser(resolvedUser);
    return resolvedUser;
  }, []);

  // Confirms the 'bootstrap-eligible' status's "become the first Administrator"
  // screen (BootstrapAdminPage). Only called with an active MSAL account
  // already set (loginWithM365/silent-reauth ran first) — re-resolves the
  // active account's identity fields rather than trusting cached state, same
  // as resolveM365User does for the initial login call.
  const claimBootstrapAdmin = useCallback(async () => {
    const account = msalInstance.getActiveAccount();
    if (!account) {
      throw new Error('No active Microsoft 365 session.');
    }

    const res = await fetch(`${API_BASE_URL}/api/auth/claim-bootstrap-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aadObjectId: account.localAccountId,
        userPrincipalName: account.username,
        displayName: account.name ?? account.username,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to claim bootstrap admin.');
    }

    const { role, status } = (await res.json()) as { role: UserRole; status: LoginStatus };
    setUser((prev) => (prev ? { ...prev, role, status } : prev));
  }, []);

  // Real PIN login — verified server-side against backend/src/routes/pinUsers.routes.ts's
  // POST /api/auth/pin-login (PinUser table), not a client-side hardcoded check.
  const loginWithPIN = useCallback(async (pin: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/pin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });

    if (!res.ok) {
      throw new Error('Invalid PIN');
    }

    const identity = (await res.json()) as { id: string; name: string; jobTitle: string; role: UserRole };

    setUser({
      id: identity.id,
      name: identity.name,
      title: identity.jobTitle,
      role: identity.role,
      tenantId: PIN_PLACEHOLDER_TENANT_ID,
      facilityId: 'KLANG_PLANT',
      loginMethod: 'PIN',
      status: 'active',
    });
  }, []);

  const logout = useCallback(() => {
    const account = msalInstance.getActiveAccount();
    setUser(null);
    if (account) {
      msalInstance.logoutPopup({ account }).catch((err) => {
        console.warn('[AuthContext] MSAL logout popup failed:', err);
      });
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loginWithM365,
        loginWithPIN,
        claimBootstrapAdmin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Claimed-role request header for the backend's requireRole() middleware
 * (backend/src/middleware/auth.ts, AUDIT_REPORT.md §9.1/§10 Part 1). Not a
 * verified token — just the currently logged-in user's role, mirroring the
 * mock-auth maturity of the rest of this app's login flows. Omitted entirely
 * for a pending (role: null) M365 user — App.tsx's ProtectedRoute never lets
 * such a user reach any route that would call an API needing this header,
 * but the guard here keeps this function correct in isolation too.
 */
export function authHeader(user: User | null): Record<string, string> {
  return user && user.role ? { 'X-User-Role': user.role } : {};
}

/** The identity fragment shape the backend's resolveIdentity() (backend/src/lib/identity.ts) expects. */
export type IdentityPayload =
  | { loginMethod: 'PIN'; pinUserId: string }
  | { loginMethod: 'M365'; aadObjectId: string; userPrincipalName: string; displayName: string };

/**
 * Single source of truth for the identity fragment spread into every
 * submission/amendment write payload. Branches on `user.loginMethod` so
 * call sites never have to know the difference between a PIN user (a real
 * PinUser row, identified by `pinUserId`) and an M365/SSO user (free-text
 * `aadObjectId`/`userPrincipalName`/`displayName`, since SSO users have no
 * row in this database). Returns `{}` when there's no logged-in user, which
 * the backend rejects with a 400 rather than writing an unattributed row.
 */
export function authIdentity(user: User | null): Partial<IdentityPayload> {
  if (!user) return {};
  if (user.loginMethod === 'PIN') {
    return { loginMethod: 'PIN', pinUserId: user.id };
  }
  return {
    loginMethod: 'M365',
    aadObjectId: user.id,
    userPrincipalName: user.email ?? '',
    displayName: user.name,
  };
}
