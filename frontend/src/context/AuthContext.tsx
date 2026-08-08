import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

// Define the valid roles in the system
export type UserRole = 'OPERATOR' | 'LEADER' | 'SUPERVISOR' | 'EXECUTIVE' | 'MANAGER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  tenantId: string;
  facilityId: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loginWithM365: () => Promise<void>;
  loginWithPIN: (userId: string, pin: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Mock M365 Login for Management/Executives
  const loginWithM365 = useCallback(async () => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    
    // Mock Admin User
    setUser({
      id: 'usr_admin_001',
      name: 'System Administrator',
      email: 'admin@oneglove.com',
      role: 'ADMIN',
      tenantId: 'TENANT_ONEGLOVE_01',
      facilityId: 'GLOBAL',
    });
  }, []);

  // Mock PIN Login for Factory Floor
  const loginWithPIN = useCallback(async (userId: string, pin: string) => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Basic mock validation (accepts '123456' for testing)
    if (pin !== '123456') {
      throw new Error('Invalid PIN');
    }

    // Mock Operator User
    setUser({
      id: userId || 'usr_floor_104',
      name: 'Factory Worker',
      role: 'OPERATOR',
      tenantId: 'TENANT_ONEGLOVE_01',
      facilityId: 'KLANG_PLANT',
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
