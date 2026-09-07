/**
 * @file featureFlags.ts
 * @description Build-time (frontend-only) feature flags. No backend, schema, or
 * dev.db involvement — flipping a value here and rebuilding is the entire
 * lifecycle of a flag.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUALITY_ANALYTICS_ENABLED — TEMPORARY FREEZE (2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * The "Quality Analytics" area (side-menu item + `/analytics` route) is frozen
 * pending the next version release. While this is `false`:
 *   • Sidebar.tsx keeps the "QUALITY ANALYTICS" menu item VISIBLE but renders it
 *     as a non-interactive row with a "Coming soon" badge — no navigation, no
 *     keyboard/focus activation, disabled cursor + dimmed styling.
 *   • App.tsx wraps the `/analytics` route in <FeatureRoute enabled={...}> so
 *     direct navigation (typed URL, bookmark, back/forward, deep link) redirects
 *     to the dashboard (`/wizard`) instead of rendering <AnalyticsPage>.
 *
 * Nothing about <AnalyticsPage>, <AnalyticsDashboard>, or the route/nav wiring
 * was removed. Setting this back to `true` and rebuilding FULLY restores the
 * feature exactly as it behaved before the freeze — that is the only change
 * required to unfreeze.
 */
export const QUALITY_ANALYTICS_ENABLED = false;
