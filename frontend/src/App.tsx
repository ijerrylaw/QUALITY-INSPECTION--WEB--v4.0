import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { ToastProvider } from './components/ui/ToastProvider';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfigProvider } from './context/ConfigContext';
import { LoginPage } from './pages/LoginPage';
import { WizardPage } from './pages/WizardPage';
import { HistoryPage } from './pages/HistoryPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ConfigPage } from './pages/ConfigPage';
import { SystemPage } from './pages/SystemPage';

// Protected Route Wrapper
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-primary">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-canvas">
        {children}
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ConfigProvider>
        <ToastProvider>
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
                    <Route path="/approvals" element={<ApprovalsPage />} />
                    <Route path="/analytics" element={<AnalyticsPage />} />
                    <Route path="/config" element={<ConfigPage />} />
                    <Route path="/system" element={<SystemPage />} />
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
