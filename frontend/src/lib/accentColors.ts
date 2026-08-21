/**
 * @file accentColors.ts
 * @description Named accent-color presets for AppConfig.accentColor
 * (DATA_SCHEMAS_AND_TYPES.md §"AppConfig") — a family selector, not a raw
 * hex value (per the original blueprint's design intent: "Swapping the
 * primary interface highlights between Emerald, Cobalt, Violet, etc.").
 *
 * Each preset swaps BOTH brand-primary and brand-secondary together, since
 * they're designed as a pair (a saturated ~600-weight tone for solid
 * white-text surfaces like buttons/active-tabs, plus a brighter ~400-weight
 * tone for text-on-dark accents like focus rings/highlights) — mirroring
 * the existing Cobalt pair's own primary/secondary relationship
 * (#3F48CC / #08C8CD).
 *
 * Single source of truth for BOTH the runtime CSS-variable effect
 * (ConfigContext.tsx's ConfigProvider) and any component that needs the
 * resolved hex directly rather than via the CSS variable (e.g.
 * AnalyticsDashboard.tsx's Recharts fill/stroke props, which take literal
 * color values, not Tailwind classes — UI_DESIGN_SYSTEM.md §1.1's Chart
 * Library Exemption).
 */

export type AccentFamily = 'cobalt' | 'emerald' | 'violet' | 'amber' | 'rose';

export interface AccentPair {
  label: string;
  /** Maps to --color-brand-primary. */
  primary: string;
  /** Maps to --color-brand-secondary. */
  secondary: string;
}

/**
 * 'cobalt' is today's actual shipped visual identity — index.css's
 * @theme block hardcodes these exact same two hex values as the default
 * --color-brand-primary/-secondary. Keeping this pair byte-for-byte
 * identical means an install that never touches accentColor (or whose
 * stored value doesn't match a known preset) looks pixel-identical to
 * before this feature existed.
 */
export const ACCENT_PRESETS: Record<AccentFamily, AccentPair> = {
  cobalt:  { label: 'Cobalt (Default)', primary: '#3F48CC', secondary: '#08C8CD' },
  emerald: { label: 'Emerald',          primary: '#059669', secondary: '#34D399' },
  violet:  { label: 'Violet',           primary: '#7C3AED', secondary: '#C084FC' },
  amber:   { label: 'Amber',            primary: '#B45309', secondary: '#FBBF24' },
  rose:    { label: 'Rose',             primary: '#E11D48', secondary: '#FB7185' },
};

export const DEFAULT_ACCENT_FAMILY: AccentFamily = 'cobalt';

export function isAccentFamily(value: unknown): value is AccentFamily {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ACCENT_PRESETS, value);
}

/**
 * Resolves any AppConfig.accentColor value (including null/undefined while
 * config is still loading, or an unrecognized legacy string) to a known
 * preset — falling back to Cobalt, never to an unstyled/undefined state.
 */
export function resolveAccentPair(accentColor: string | null | undefined): AccentPair {
  return ACCENT_PRESETS[isAccentFamily(accentColor) ? accentColor : DEFAULT_ACCENT_FAMILY];
}
