/**
 * @file FeatureRoute.tsx
 * @description Route-level guard for a build-time feature flag (see
 * lib/featureFlags.ts). When `enabled` is false the wrapped element is never
 * mounted and the user is redirected to `fallback` (the dashboard by default),
 * so a frozen feature cannot be reached by typed URL, bookmark, browser
 * back/forward, or deep link — only removed from the nav.
 *
 * When `enabled` is true this is a transparent pass-through: it renders
 * `children` verbatim with no added routing behavior, so an unfrozen feature
 * behaves exactly as if the guard were absent.
 */
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';

export function FeatureRoute({
  enabled,
  fallback = '/wizard',
  children,
}: {
  enabled: boolean;
  fallback?: string;
  children: ReactNode;
}) {
  if (!enabled) {
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}
