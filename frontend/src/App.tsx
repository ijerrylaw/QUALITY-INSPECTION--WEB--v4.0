import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { ToastProvider } from './components/ui/ToastProvider';
import { AuthProvider, useAuth, rolesInGroups } from './context/AuthContext';
import type { UserRole } from './context/AuthContext';
import { ConfigProvider } from './context/ConfigContext';
import { WizardGuardProvider } from './context/WizardGuardContext';
import { LoginPage } from './pages/LoginPage';
import { WizardPage } from './pages/WizardPage';
import { HistoryPage } from './pages/HistoryPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ConfigPage } from './pages/ConfigPage';
import { SystemPage } from './pages/SystemPage';
import { PinAdminPage } from './pages/PinAdminPage';
import { IdleSessionGuard } from './components/auth/IdleSessionGuard';

// Group A/B/C role lists (AUDIT_REPORT.md §11) — single source of truth in
// AuthContext.tsx, shared with Sidebar.tsx's nav-visibility gates.
const GROUP_AB_ROLES = rolesInGroups('A', 'B');
const GROUP_A_ROLES = rolesInGroups('A');

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <WizardGuardProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-canvas text-primary">
        <Sidebar />
        <main className="flex-1 overflow-y-scroll bg-canvas">
          {children}
        </main>
      </div>
    </WizardGuardProvider>
  );
}

// Role-Based Route Wrapper
function RoleRoute({ children, allowedRoles }: { children: ReactNode, allowedRoles: UserRole[] }) {
  const { user } = useAuth();
  
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/wizard" replace />;
  }
  
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <ConfigProvider>
        <ToastProvider>
          <IdleSessionGuard />
          <BrowserRouter>
            <Routes>
              {/* Public Route */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected Routes (Wrapped in Main Shell) */}
              <Route path="/*" element={
                <ProtectedRoute>
                  <Routes>
                    <Route path="/" element={<Navigate to="/wizard" replace />} />
                    <Route path="/wizard" element={<WizardPage />} />
                    <Route path="/history" element={<HistoryPage />} />
                    <Route path="/approvals" element={
                      <RoleRoute allowedRoles={GROUP_AB_ROLES}>
                        <ApprovalsPage />
                      </RoleRoute>
                    } />
                    <Route path="/analytics" element={
                      <RoleRoute allowedRoles={GROUP_AB_ROLES}>
                        <AnalyticsPage />
                      </RoleRoute>
                    } />
                    <Route path="/config" element={
                      <RoleRoute allowedRoles={GROUP_AB_ROLES}>
                        <ConfigPage />
                      </RoleRoute>
                    } />
                    <Route path="/pin-admin" element={
                      <RoleRoute allowedRoles={GROUP_AB_ROLES}>
                        <PinAdminPage />
                      </RoleRoute>
                    } />
                    <Route path="/system" element={
                      <RoleRoute allowedRoles={GROUP_A_ROLES}>
                        <SystemPage />
                      </RoleRoute>
                    } />
                    <Route path="*" element={<Navigate to="/wizard" replace />} />
                  </Routes>
                </ProtectedRoute>
              } />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </ConfigProvider>
    </AuthProvider>
  );
}

export default App;

