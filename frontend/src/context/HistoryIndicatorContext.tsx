/**
 * @file HistoryIndicatorContext.tsx
 * @description Shares "has any user submitted a new lot since Inspection
 * Records was last viewed" between Sidebar.tsx (renders the nav dot) and
 * HistoryFeed.tsx (clears it on view, flags individual new rows). The two
 * aren't in a parent/child relationship — both sit as siblings under
 * App.tsx's protected shell — so a small context is the natural fit,
 * matching WizardGuardContext.tsx's existing precedent for this exact
 * problem shape.
 *
 * Global (not per-user) by design — GET /api/submissions/new-indicator and
 * POST /api/submissions/mark-history-viewed both read/write a single shared
 * AppConfig.lastHistoryViewedAt timestamp. Refetched on mount and on every
 * route change (no setInterval polling — this codebase has no existing
 * "poll a backend endpoint" pattern, and route-change refetch is enough to
 * keep the sidebar dot reasonably fresh for the active user without
 * introducing one).
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { API_BASE_URL } from './ConfigContext';
import { useAuth, authHeader } from './AuthContext';

interface HistoryIndicatorContextType {
  hasNewSubmission: boolean;
  markHistoryViewed: () => void;
}

const HistoryIndicatorContext = createContext<HistoryIndicatorContextType>({
  hasNewSubmission: false,
  markHistoryViewed: () => {},
});

export function HistoryIndicatorProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [hasNewSubmission, setHasNewSubmission] = useState(false);

  const refresh = useCallback(() => {
    fetch(`${API_BASE_URL}/api/submissions/new-indicator`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { hasNew: boolean } | null) => {
        if (data) setHasNewSubmission(data.hasNew);
      })
      .catch(() => {
        // Advisory only — leave the current state as-is on failure.
      });
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, location.pathname]);

  const markHistoryViewed = useCallback(() => {
    fetch(`${API_BASE_URL}/api/submissions/mark-history-viewed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(user) },
    }).catch(() => {
      // Advisory only — the optimistic local clear below still applies to
      // this user's own view; other users pick up the real state on their
      // next route-change refresh regardless.
    });
    setHasNewSubmission(false);
  }, [user]);

  return (
    <HistoryIndicatorContext.Provider value={{ hasNewSubmission, markHistoryViewed }}>
      {children}
    </HistoryIndicatorContext.Provider>
  );
}

export function useHistoryIndicator(): HistoryIndicatorContextType {
  return useContext(HistoryIndicatorContext);
}
