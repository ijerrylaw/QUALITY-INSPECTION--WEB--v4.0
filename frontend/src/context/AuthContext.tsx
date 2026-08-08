import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { API_BASE_URL } from './ConfigContext';

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
  role: UserRole;
  tenantId: string;
  facilityId: string;
  /** Which login path resolved this session — idle-expiry only applies to 'PIN' (shared floor tablets). */
  loginMethod: 'M365' | 'PIN';
}

interface MockM365Identity {
  id: string;
  name: string;
  title: string;
  email: string;
  role: UserRole;
}

/**
 * Dev-only mock Microsoft 365 identities (AUDIT_REPORT.md §11, Task 6). Real
 * Azure AD/Entra ID login is blocked pending Jerry's IT manager providing real
 * credentials. The `import.meta.env.DEV ? [...] : []` conditional is written
 * at the ARRAY LITERAL's definition site (not just around its usages) so
 * `vite build`'s minifier can constant-fold the ternary and drop the whole
 * literal from production bundles — verified via
 * `npm run build --workspace=frontend && grep 'System Administrator' dist/assets/*.js`
 * (must return no matches). Covers both Group A/B and the Group-C-via-M365
 * (Supervisor) case so all three groups are reachable through this path for
 * testing, unlike the old mock which always resolved to ADMIN.
 */
export const MOCK_M365_IDENTITIES: readonly MockM365Identity[] = import.meta.env.DEV
  ? [
      { id: 'usr_admin_001', name: 'System Administrator', title: 'IT Administrator', email: 'admin@oneglove.com', role: 'ADMIN' },
      { id: 'usr_director_001', name: 'Amir Hassan', title: 'Plant Director', email: 'amir.hassan@oneglove.com', role: 'ADMIN' },
      { id: 'usr_manager_001', name: 'Lee Mei Ling', title: 'QA Manager', email: 'lee.meiling@oneglove.com', role: 'MANAGER' },
      { id: 'usr_exec_001', name: 'Farah Aziz', title: 'QA Executive', email: 'farah.aziz@oneglove.com', role: 'EXECUTIVE' },
      { id: 'usr_supervisor_001', name: 'Wong Wei Ming', title: 'Shift Supervisor', email: 'wong.weiming@oneglove.com', role: 'SUPERVISOR' },
    ]
  : [];

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loginWithM365: (mockIdentityId: string) => Promise<void>;
  loginWithPIN: (pin: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_TENANT_ID = 'TENANT_ONEGLOVE_01';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Dev-only mock M365 login (see MOCK_M365_IDENTITIES above). Self-guards
  // against any non-UI call path once real Azure AD wiring lands — the UI
  // itself hides this behind the same import.meta.env.DEV check.
  const loginWithM365 = useCallback(async (mockIdentityId: string) => {
    if (!import.meta.env.DEV) {
      throw new Error('Mock Microsoft 365 login is disabled outside development builds.');
    }

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const identity = MOCK_M365_IDENTITIES.find((i) => i.id === mockIdentityId);
    if (!identity) {
      throw new Error('Unknown mock identity.');
    }

    setUser({
      id: identity.id,
      name: identity.name,
      title: identity.title,
      email: identity.email,
      role: identity.role,
      tenantId: MOCK_TENANT_ID,
      facilityId: 'GLOBAL',
      loginMethod: 'M365',
    });
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
      tenantId: MOCK_TENANT_ID,
      facilityId: 'KLANG_PLANT',
      loginMethod: 'PIN',
    });
  }, []);

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loginWithM365,
        loginWithPIN,
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
 * mock-auth maturity of the rest of this app's login flows.
 */
export function authHeader(user: User | null): Record<string, string> {
  return user ? { 'X-User-Role': user.role } : {};
}
