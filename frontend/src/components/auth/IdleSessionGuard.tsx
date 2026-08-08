import { useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/ToastProvider';

/**
 * Auto-expires PIN-based sessions after a period of inactivity — shared
 * floor-tablet kiosks (AUDIT_REPORT.md §11, Task 5). Does NOT apply to M365
 * sessions (personal devices, not shared).
 *
 * PLACEHOLDER VALUE — Jerry can tune this once real floor usage patterns are
 * observed; 15 minutes is a reasonable starting default, not a settled spec.
 */
export const PIN_SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'wheel'] as const;

/**
 * Non-visual guard. Lives inside ToastProvider (not inside AuthContext
 * itself) because AuthProvider is a parent of ToastProvider in App.tsx's
 * provider tree and therefore can't call useToast().
 */
export function IdleSessionGuard() {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || user.loginMethod !== 'PIN') {
      return;
    }

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        logout();
        addToast('info', 'Session expired due to inactivity. Please log in again.');
      }, PIN_SESSION_IDLE_TIMEOUT_MS);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [user, logout, addToast]);

  return null;
}
