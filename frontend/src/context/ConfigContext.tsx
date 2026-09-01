/**
 * @file ConfigContext.tsx
 * @description Global React Context for Quality Inspection v4.0 system configuration.
 *
 * Fetches GET /api/config on application mount and exposes the parsed AppConfig
 * to all descendant components via the `useConfig()` hook.
 *
 * Also exposes a `refreshConfig()` function that any component can call after a
 * successful PATCH /api/config to re-hydrate the global cache without a page reload.
 *
 * KEY ADDITIONS (Wizard Remapping):
 * - Strongly typed InspectionProfile, AQLCategory, DefectDefinition interfaces
 *   matching DATA_SCHEMAS_AND_TYPES.md exactly.
 * - `getResolvedProfile(profileId?)` — finds the active profile by id, falling
 *   back to the isDefault profile, then the first profile in the list.
 * - `resolvedAqlCategories` / `resolvedDefectDefinitions` — always-available
 *   computed arrays derived from the default profile so wizard steps can safely
 *   read category and defect data without nested lookups.
 *
 * PROFILE DESIGN: InspectionProfiles are PRODUCT-AGNOSTIC. They are selected
 * by the user in Step 1 of the wizard. productProfileMap has been removed.
 *
 * Level 1 System Precedence: AI_RULES.md & UI_DESIGN_SYSTEM.md
 * Data Contracts: DATA_SCHEMAS_AND_TYPES.md
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import type { ReactNode } from 'react';
import { resolveAccentPair } from '../lib/accentColors';
import {
  DEFAULT_AQL_CATEGORY_SEED,
  DEFAULT_DEFECT_DEFINITION_SEED,
  DEFAULT_EVAL_MODE,
  DEFAULT_PROFILE_ID,
  isEvalModeUnset,
} from '../lib/defaultProfileSeed';

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVE OPTION TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface LineOption {
  id: string;
  name: string;
}

export interface ShiftOption {
  id: string;
  name: string;
  startHour: number;
  startMinute: number;
  durationHours: number;
}

export interface SideOption {
  id: string;
  name: string;
}

export interface SKUOption {
  value: string;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT MATRIX TYPES  (DATA_SCHEMAS_AND_TYPES.md §3)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductDimensionDef {
  id: string;
  name: string;
  unit: string;
  isMin?: boolean;
  /**
   * Record-only mode when explicitly `false`: the operator still captures all
   * 5 measurements, but they are never compared against a threshold and never
   * affect the verdict. Absent/true = graded.
   *
   * The default is intentionally NOT written onto stored defs — see
   * isDimensionGraded() below, which is the single place that rule lives.
   */
  isGraded?: boolean;
  /**
   * Wizard-visibility mode when explicitly `false`: the field is completely
   * hidden from the operator in StepDimensions.tsx/BatchEntry.tsx — not
   * greyed out, absent from the rendered list entirely. Independent of
   * `isGraded`: toggling this never touches or clears isGraded, so a
   * field's prior Graded/Record-only state is preserved and resumes as-is
   * once visibility is restored. Absent/true = visible — same "default
   * never materialized" convention as isGraded. See isWizardVisible() below.
   */
  wizardVisible?: boolean;
  /** Number of decimal places (0–3). Controls both the config setup grid and the Wizard entry inputs. Default: 0 (integer). */
  decimals?: number;
}

/**
 * Client-side twin of backend/src/engine/dimensionEvaluator.ts's
 * isDimensionGraded() — kept in sync deliberately, same pairing convention as
 * hasUsableProductMatrix()/hasUsableRules().
 *
 * Only the explicit literal `false` means record-only. Every other value
 * (absent, undefined, true) grades, so the 51 existing dimension defs — none
 * of which carry this key — are unaffected until someone toggles one.
 *
 * Never materialize the `true` default onto a stored def: PATCH /api/config
 * deep-diffs a locked product code's whole matrix subtree and ProductEngine
 * re-sends every code on every save, so an injected default would 409 the
 * request. The key appears only when a human toggles it.
 */
export function isDimensionGraded(dim: { isGraded?: boolean } | null | undefined): boolean {
  return dim?.isGraded !== false;
}

/**
 * Wizard-visibility rule, in exactly one place — same shape/rationale as
 * isDimensionGraded() above, but an independent flag: a field can be
 * RECORD ONLY and still wizard-visible (Arc 1 behavior, unchanged), or
 * wizard-invisible regardless of its Graded/Record-only state. Only the
 * explicit literal `false` hides a field.
 *
 * Server-side twin: backend/src/engine/dimensionEvaluator.ts's own
 * isWizardVisible() — kept in sync deliberately.
 */
export function isWizardVisible(dim: { wizardVisible?: boolean } | null | undefined): boolean {
  return dim?.wizardVisible !== false;
}

/**
 * Canonical ids for the 3 dynamic dimensions that become permanent,
 * non-deletable presence slots on every product — Cuff/Palm/Finger
 * Thickness ONLY. Beading Thickness is deliberately excluded and stays a
 * fully optional, admin-added, deletable custom dimension. These specific
 * ids were chosen because 18/19 real products in dev.db already converge
 * on them independently (a pre-existing de-facto convention).
 */
export const CANONICAL_THICKNESS_DEFS: { id: string; name: string }[] = [
  { id: 'cuffThickness', name: 'CUFF THICKNESS' },
  { id: 'palmThickness', name: 'PALM THICKNESS' },
  { id: 'fingerThickness', name: 'FINGER THICKNESS' },
];

/** Normalizes a dimension name for identity comparison: uppercased, whitespace-collapsed. */
function normalizeDimName(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Ensures the 3 canonical thickness dims are present in a product's
 * dimension list, WITHOUT renaming or re-iding any existing entry. Matches
 * by normalized name, not id — a product whose canonical dim already
 * exists under a legacy/mismatched id (e.g. a `dim_<timestamp>` id, or the
 * N035MNV-OC-24FT id/name-swap data bug) already satisfies presence and is
 * left completely untouched. Only a name with no match at all gets a new
 * virtual def appended, carrying no stored spec.
 *
 * Server-side twin: backend/src/engine/dimensionEvaluator.ts's own
 * mergeCanonicalDimensionDefs() — kept in sync deliberately, same
 * duplication convention as isDimensionGraded().
 */
export function mergeCanonicalDimensionDefs(dimensionDefs: ProductDimensionDef[]): ProductDimensionDef[] {
  const existingNames = new Set(dimensionDefs.map((d) => normalizeDimName(d.name)));
  const merged = [...dimensionDefs];
  for (const canonical of CANONICAL_THICKNESS_DEFS) {
    if (!existingNames.has(normalizeDimName(canonical.name))) {
      merged.push({ id: canonical.id, name: canonical.name, unit: 'mm', decimals: 0 });
    }
  }
  return merged;
}

/** True if `def`'s (normalized) name matches one of the 3 canonical, non-deletable thickness dims. */
export function isCanonicalThicknessDim(def: { name: string }): boolean {
  const normalized = normalizeDimName(def.name);
  return CANONICAL_THICKNESS_DEFS.some((c) => normalizeDimName(c.name) === normalized);
}

export interface ProductDimensionValue {
  minSpec: string;
  tolerance: string;
}

export interface SizeConfig {
  weightTarget: string;
  weightTolerance: string;
  lengthTarget?: string;
  lengthTolerance?: string;
  palmWidthTarget?: string;
  palmWidthTolerance?: string;
  dimensions: Record<string, ProductDimensionValue>; // keyed by dimension id
}

export interface ProductConfig {
  dimensionDefs: ProductDimensionDef[];
  sizes: Record<string, SizeConfig>;
  lastAmended?: string;
  /** Decimal places for fixed rows. Default: 0. */
  weightDecimals?: number;
  lengthDecimals?: number;
  palmWidthDecimals?: number;
  /**
   * Graded/Record-only for the fixed GLOVE LENGTH / PALM WIDTH rows — same
   * "only literal `false` means record-only, default never materialized"
   * convention as ProductDimensionDef.isGraded (see isDimensionGraded()
   * above). No `weightIsGraded`: Glove Weight has no record-only mode.
   */
  lengthIsGraded?: boolean;
  palmWidthIsGraded?: boolean;
  /** Wizard-visibility for the fixed rows — see ProductDimensionDef.wizardVisible. No Weight counterpart. */
  lengthWizardVisible?: boolean;
  palmWidthWizardVisible?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSOLIDATED PRODUCT STRUCTURE  (DATA_SCHEMAS_AND_TYPES.md §3.1)
// Mirrors backend/src/lib/productEntry.ts. Exposed by GET /api/config as of
// Session B3, which made `products` the read source of truth for the admin/
// config surface. The legacy productCodes/productMatrixConfig/
// productProfileMap fields are still returned (as projections of this) and
// still written, so nothing outside the admin surface changed.
// ─────────────────────────────────────────────────────────────────────────────

/** The six SKU dictionary VALUES that composed this code, or null if unknown. */
export interface ProductAttributes {
  material: string | null;
  weight: string | null;
  color: string | null;
  innerSurface: string | null;
  length: string | null;
  texture: string | null;
}

/** One product code's full record — attributes + matrix + profile link. */
export interface ProductEntry {
  attributes: ProductAttributes;
  matrix: ProductConfig;
  profileId: string | null;
}

/**
 * Resolves one product code's dimension/size matrix from the consolidated
 * `products` structure — the single place the admin/config surface and the
 * wizard's entry gate read a matrix from, as of B3.
 *
 * Falls back to productMatrixConfig when `products` is absent, which covers
 * a backend still serving a pre-B3 response shape (and mirrors the server's
 * own unmigrated-database fallback in config.routes.ts). Returns the same
 * object either way, so callers — and hasUsableProductMatrix() below — behave
 * identically regardless of which source supplied it.
 */
export function resolveProductMatrix(
  config: { products?: Record<string, ProductEntry>; productMatrixConfig?: Record<string, ProductConfig> } | null | undefined,
  productCode: string | null | undefined,
): ProductConfig | null {
  if (!productCode) return null;
  const fromProducts = config?.products?.[productCode]?.matrix;
  if (fromProducts) return fromProducts;
  return config?.productMatrixConfig?.[productCode] ?? null;
}

/**
 * Projects the whole registry out of `products` — the client-side counterpart
 * to the server's deriveLegacyStructures(), for callers that need the full
 * ordered code list and matrix map rather than a single code's matrix
 * (ProductEngine.tsx's registered-products list).
 *
 * `products` key order IS the registry order (B2 made it track the
 * user-controlled Product Engine ordering), so Object.keys() preserves the
 * move up/down arrangement without a separate sort.
 *
 * Same all-or-nothing fallback rationale as resolveProductMatrix(): if
 * `products` is absent or empty, fall back to the legacy pair wholesale
 * rather than merging per-code, so genuine drift stays visible instead of
 * being silently papered over.
 */
export function resolveProductRegistry(
  config: { products?: Record<string, ProductEntry>; productCodes?: string[]; productMatrixConfig?: Record<string, ProductConfig> } | null | undefined,
): { productCodes: string[]; productMatrixConfig: Record<string, ProductConfig> } {
  const products = config?.products;
  if (products && Object.keys(products).length > 0) {
    const productCodes: string[] = [];
    const productMatrixConfig: Record<string, ProductConfig> = {};
    for (const [code, entry] of Object.entries(products)) {
      productCodes.push(code);
      productMatrixConfig[code] = entry.matrix;
    }
    return { productCodes, productMatrixConfig };
  }
  return {
    productCodes: config?.productCodes ?? [],
    productMatrixConfig: config?.productMatrixConfig ?? {},
  };
}

/**
 * A product's dimension matrix is usable for the two always-graded fixed
 * dimensions (GLOVE LENGTH, PALM WIDTH) only if the selected size has a real,
 * non-zero target for BOTH — unlike AQL categories (many, independent,
 * partial-config is normal), there are always exactly two fixed dimensions
 * and both are graded unconditionally every time, so a target missing on
 * either one leaves that one silently zeroed out (threshold=0,
 * maxThreshold=Infinity — see AUDIT_REPORT.md finding #5). Mirrors
 * `hasUsableProductMatrix()` in `backend/src/engine/dimensionEvaluator.ts`
 * exactly — kept in sync deliberately, same pairing as
 * `hasUsableRules()`/`hasUsableCategories()`.
 *
 * B3 NOTE — this signature is deliberately UNCHANGED. The cutover onto
 * `products` happens at the CALL SITES, which now source `matrixEntry` via
 * resolveProductMatrix() above instead of indexing productMatrixConfig
 * directly. Keeping the function itself a pure (matrixEntry, size) predicate
 * preserves its byte-for-byte correspondence with the backend twin, which
 * B4 has to migrate in lockstep — changing the signature here would have
 * broken that mirror and made B4's job harder, for no behavioral gain. The
 * data reaching this function is identical either way (B2 keeps `products`
 * and productMatrixConfig in sync on every write), so every caller's
 * block/allow decision is unchanged.
 */
export function hasUsableProductMatrix(
  matrixEntry: ProductConfig | null | undefined,
  size: string | null | undefined,
): boolean {
  if (!size) return false;
  const sizeEntry = matrixEntry?.sizes?.[size];
  if (!sizeEntry) return false;
  const lengthTarget = parseFloat(sizeEntry.lengthTarget ?? '0') || 0;
  const palmWidthTarget = parseFloat(sizeEntry.palmWidthTarget ?? '0') || 0;
  return lengthTarget > 0 && palmWidthTarget > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// INSPECTION PROFILE TYPES  (DATA_SCHEMAS_AND_TYPES.md §2)
// ─────────────────────────────────────────────────────────────────────────────

/** EvaluationMode — ISO2859_MATH_ENGINE.md §2 */
export type EvaluationMode = 'CUMULATIVE' | 'GRANULAR' | 'N/A' | '';

/**
 * AQLCategory — a severity tier within an inspection profile.
 * aqlLevel values: '0.65' | '1.0' | '1.5' | '2.5' | '4.0' | '6.5' | 'AND' | 'PASS/FAIL' | 'RECORD ONLY'
 */
export interface AQLCategory {
  id: string;
  name: string;
  /** Legacy field alias for aqlLevel — used by QualityRules component */
  aql?: string;
  /** Canonical field per DATA_SCHEMAS_AND_TYPES.md */
  aqlLevel?: string;
  evaluationMode?: EvaluationMode;
  /** Legacy alias used by QualityRules */
  evalMode?: EvaluationMode | string;
  /**
   * Set by getResolvedProfile() ONLY — true when this category carried no
   * evaluation mode under either spelling and one was substituted for display
   * (AUDIT_REPORT.md #17). Never persisted, and never present on raw
   * `config.inspectionProfiles` data.
   *
   * A `true` here means "misconfigured, needs an admin to pick a mode", NOT a
   * real evaluation mode — `evalMode`/`evaluationMode` alongside it carry the
   * substituted DEFAULT_EVAL_MODE, not anything the admin chose. Readers that
   * care about configuration validity (QualityRules.tsx's warning badge) must
   * check this flag rather than trusting the resolved mode.
   */
  evalModeUnset?: boolean;
  // UI decoration fields (optional — used by Kanban in QualityRules)
  iconName?: string;
  color?: string;
  bg?: string;
  border?: string;
}

/** DefectDefinition — an individual defect item belonging to a category */
export interface DefectDefinition {
  id: string;
  name: string;
  /** Links this defect to an AQLCategory.id within the same profile */
  categoryId: string;
  defaultClass?: string;
  currentClass?: string;
}

/** InspectionProfile — a named set of AQL categories and defect definitions */
export interface InspectionProfile {
  id: string;
  name: string;
  isDefault: boolean;
  aqlCategories: AQLCategory[];
  defectDefinitions: DefectDefinition[];
}

/**
 * A profile is usable for AQL evaluation only if at least one category has
 * both aqlLevel and evaluationMode configured (checking both field-name
 * variants). Mirrors `hasUsableRules()` in `backend/src/engine/resolveVerdict.ts`
 * exactly — kept in sync deliberately, see AUDIT_REPORT.md finding #10.
 *
 * Callers must pass the RAW profile object (e.g. from
 * `config.inspectionProfiles.find(...)`), never `getResolvedProfile()`'s
 * output — its category normalisation substitutes DEFAULT_EVAL_MODE for a
 * missing evalMode, which would mask exactly the unusable state this checks
 * for. (Since AUDIT_REPORT.md #17 that substitution is at least tagged with
 * `evalModeUnset: true`, so it is no longer silent — but this function reads
 * the mode itself, so the raw-profile rule still stands.)
 */
export function hasUsableCategories(profile: { aqlCategories?: AQLCategory[] } | null | undefined): boolean {
  return (profile?.aqlCategories ?? []).some((c) => {
    const aqlLevel       = c.aqlLevel       ?? c.aql;
    const evaluationMode = c.evaluationMode ?? c.evalMode;
    return aqlLevel && String(aqlLevel).trim() !== ''
        && evaluationMode && String(evaluationMode).trim() !== '';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// APP CONFIG  (DATA_SCHEMAS_AND_TYPES.md §3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsed AppConfig — all JSON string fields from the backend are already
 * deserialized into their native JS types by formatAppConfig() in config.routes.ts.
 */
export interface AppConfig {
  id: string;
  companyName: string;
  portalTitle: string;
  logoImage: string | null;
  accentColor: string;
  productCodes: string[];
  lines: LineOption[];
  shifts: ShiftOption[];
  sides: SideOption[];
  sizes: string[];
  /** ISO 2859-1 global bracket sizes — stored at AppConfig root level */
  sampleSizes: number[];
  /**
   * @deprecated for READS as of B3 — use `products` (or resolveProductMatrix())
   * instead. Still returned by GET /api/config as a projection of `products`,
   * and still the field PATCH /api/config expects on writes (write-path
   * consolidation is B6), so this is not removable yet.
   */
  productMatrixConfig: Record<string, ProductConfig>;
  /**
   * @deprecated for READS as of B3 — use `products[code].profileId` instead.
   * Still returned by GET /api/config as a projection of `products` (only
   * codes with a non-null profileId are present, matching the legacy
   * structure's own convention), and still an accepted PATCH field — see
   * config.routes.ts's formatAppConfig(). No live admin UI writes this
   * today (product-level profile defaults aren't used by this app — every
   * submission carries its own explicit profileId), but the rename feature
   * reads and re-sends it so a renamed code's profile link (if it ever has
   * one) isn't silently dropped.
   */
  productProfileMap?: Record<string, string>;
  /**
   * Consolidated per-product-code registry — the read source of truth for the
   * admin/config surface as of B3. Keyed by product code, in the user-
   * controlled Product Engine ordering.
   */
  products: Record<string, ProductEntry>;
  /**
   * Computed server-side (not stored) — maps a productCode string to the
   * count of Submission rows referencing it. A code with a count > 0 is
   * "locked": its registry entry and dimension/size matrix must not be
   * editable or deletable, since real inspection records depend on it.
   * See backend/src/routes/config.routes.ts getProductCodeUsage().
   */
  productCodeUsage?: Record<string, number>;
  skuMaterials: SKUOption[];
  skuWeights: SKUOption[];
  skuColors: SKUOption[];
  skuTreatments: SKUOption[];
  skuLengths: SKUOption[];
  skuTextures: SKUOption[];
  dimensions: ProductDimensionDef[];
  targetWeight: { target: number; tolerance: number };
  /**
   * All inspection profiles. AQL categories and defect definitions live
   * NESTED inside each profile — NOT at the AppConfig root level.
   * Profile selection is user-driven in Wizard Step 1 (product-agnostic).
   */
  inspectionProfiles?: InspectionProfile[];
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT TYPE
// ─────────────────────────────────────────────────────────────────────────────

interface ConfigContextType {
  /** The current system configuration. Null while loading or on fetch failure. */
  config: AppConfig | null;
  /** True while the initial or refresh fetch is in-flight. */
  isLoading: boolean;
  /** Error message if the fetch failed; null when healthy. */
  error: string | null;
  /**
   * Re-fetches GET /api/config and updates the global cache.
   * Call this after a successful PATCH /api/config to reflect changes instantly.
   */
  refreshConfig: () => Promise<void>;
  /**
   * Updates the global config state in memory (Prototype only).
   */
  updateLocalConfig: (partial: Partial<AppConfig>) => void;

  // ── WIZARD HELPERS ────────────────────────────────────────────────────────

  /**
   * Returns the InspectionProfile matching the given profileId.
   * Falls back to the profile flagged `isDefault: true`, then to the first
   * profile in the list. Returns null if no profiles are configured.
   *
   * Profiles are PRODUCT-AGNOSTIC — selected by the user in Wizard Step 1.
   * Used by StepDefects and StepReviewSubmit to source live AQL categories
   * and defect definitions configured in Configuration Control > Quality Rules.
   */
  getResolvedProfile: (profileId?: string) => InspectionProfile | null;

  /**
   * AQL categories from the default inspection profile.
   * Safe fallback for wizard steps before a profileId is selected.
   */
  resolvedAqlCategories: AQLCategory[];

  /**
   * Defect definitions from the default inspection profile.
   * Safe fallback for wizard steps before a profileId is selected.
   */
  resolvedDefectDefinitions: DefectDefinition[];
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
// API BASE URL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * API base URL.
 * In development: falls back to https://<the hostname the page was loaded from>:4009 —
 * derived from window.location.hostname (not a hardcoded 'localhost') so a device
 * loading the frontend from a LAN IP targets the backend at that same IP instead of
 * its own machine's localhost. HTTPS (not HTTP) because both dev servers now serve
 * over HTTPS via the mkcert-generated cert (frontend/vite.config.ts, backend/server.ts)
 * — required for Entra ID's non-localhost redirect URI restriction.
 * In production: set VITE_API_URL in the frontend build environment.
 */
export const API_BASE_URL =
  (import.meta.env['VITE_API_URL'] as string | undefined) ?? `https://${window.location.hostname}:4009`;

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    // Retry a few times with backoff — the backend may still be starting up
    // (e.g. both dev servers launched together) and a single dropped request
    // should not permanently strand the app on a null config.
    const RETRY_DELAYS_MS = [500, 1000, 2000];
    let lastError: unknown;
    let data: AppConfig | undefined;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/config`);
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }
        data = (await response.json()) as AppConfig;
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < RETRY_DELAYS_MS.length) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
      }
    }

    try {
      if (lastError !== undefined || !data) {
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }

      // If the backend has no profiles configured yet, inject the built-in
      // default profile so the wizard dropdown is never empty.
      if (!data.inspectionProfiles || data.inspectionProfiles.length === 0) {
        // Values come from defaultProfileSeed.ts — the canonical seed shared with
        // resolveVerdict.ts's HARDCODED_DEFAULT_PROFILE (machine-enforced mirror,
        // see that file's header). Previously restated inline here, which is how
        // BARRIER drifted to 'N/A' while the backend graded it CUMULATIVE:
        // AUDIT_REPORT.md #10. Only the field-name adaptation is local.
        data.inspectionProfiles = [
          {
            id: DEFAULT_PROFILE_ID,
            name: 'GLOBAL STANDARD',
            isDefault: true,
            aqlCategories: DEFAULT_AQL_CATEGORY_SEED.map(c => ({
              id: c.id,
              name: c.name,
              aqlLevel: c.aql,
              evaluationMode: c.evalMode as EvaluationMode,
            })),
            defectDefinitions: DEFAULT_DEFECT_DEFINITION_SEED.map(d => ({
              id: d.id,
              name: d.name,
              categoryId: d.categoryId,
            })),
          }
        ];
      }

      setConfig(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ConfigContext] Failed to fetch /api/config:', message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateLocalConfig = useCallback((partial: Partial<AppConfig>) => {
    setConfig(prev => prev ? { ...prev, ...partial } : null);
  }, []);

  // Fetch once on application mount
  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  // Runtime app-wide accent theming (accentColors.ts). Tailwind v4's @theme
  // colors in index.css already compile to CSS custom properties, not baked
  // hex — confirmed against the actual build output — so overriding these
  // two variables on the root element retroactively re-themes every
  // bg-/text-/border-/ring-brand-primary(-secondary) utility across the
  // whole app, no rebuild needed. Runs with config === null (pre-fetch) too:
  // resolveAccentPair(undefined) resolves to the Cobalt preset, which is
  // byte-for-byte index.css's own hardcoded default, so there's no flash of
  // a different color before the first fetch resolves.
  useEffect(() => {
    const pair = resolveAccentPair(config?.accentColor);
    document.documentElement.style.setProperty('--color-brand-primary', pair.primary);
    document.documentElement.style.setProperty('--color-brand-secondary', pair.secondary);
  }, [config?.accentColor]);

  // ── Profile Resolution Logic ─────────────────────────────────────────────
  //
  // InspectionProfiles are PRODUCT-AGNOSTIC. The user selects a profile
  // in Wizard Step 1 via a dropdown. Configuration Control > Quality Rules
  // saves AQL categories and defect definitions NESTED inside each profile.
  //
  // Wizard steps resolve profile data from inspectionProfiles[n] — never
  // from the legacy top-level flat fields (removed from schema in Turn 1).
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Finds the InspectionProfile matching profileId.
   * Falls back to isDefault:true, then first in list.
   * Normalises the `aql` / `aqlLevel` and `evalMode` / `evaluationMode`
   * field aliases so downstream components can read either form.
   */
  const getResolvedProfile = useCallback((profileId?: string): InspectionProfile | null => {
    const profiles = config?.inspectionProfiles;
    if (!profiles || profiles.length === 0) return null;

    let profile: InspectionProfile | undefined;

    if (profileId) {
      profile = profiles.find(p => p.id === profileId);
    }
    if (!profile) {
      profile = profiles.find(p => p.isDefault) ?? profiles[0];
    }

    if (!profile) return null;

    // Normalise AQLCategory aliases so both `aql` and `aqlLevel` are always set.
    //
    // AUDIT_REPORT.md #17 — this step used to write `?? 'CUMULATIVE'` SILENTLY,
    // so a category with no evaluation mode at all became indistinguishable from
    // one deliberately configured as CUMULATIVE. Every caller then rendered and
    // behaved as if a real quantitative mode had been chosen.
    //
    // It still resolves to a safe display value (throwing here would take down
    // the six render-path callers that read this through useMemo — HistoryFeed,
    // StepDefects, StepReviewSubmit, SubmissionSummary, WizardPage), but the
    // substitution is no longer silent: `evalModeUnset` tags exactly which
    // categories were defaulted, so the admin UI can warn and save-time
    // validation can reject. `''` (RECORD ONLY) is NOT unset — see
    // isEvalModeUnset()'s docs.
    const normalisedCategories: AQLCategory[] = (profile.aqlCategories ?? []).map(cat => {
      const unset = isEvalModeUnset(cat);
      const resolvedMode = unset
        ? DEFAULT_EVAL_MODE
        : (cat.evaluationMode ?? cat.evalMode) as string;

      return {
        ...cat,
        aql: cat.aql ?? cat.aqlLevel ?? '',
        aqlLevel: cat.aqlLevel ?? cat.aql ?? '',
        evalMode: resolvedMode,
        evaluationMode: resolvedMode as EvaluationMode,
        evalModeUnset: unset,
      };
    });

    return {
      ...profile,
      aqlCategories: normalisedCategories,
    };
  }, [config]);

  /**
   * Always-available AQL categories from the default profile.
   * Wizard step components use this as a safe starting point before the
   * user's profileId selection flows through from Step 1.
   */
  const resolvedAqlCategories = useMemo<AQLCategory[]>(() => {
    const profile = getResolvedProfile();
    return profile?.aqlCategories ?? [];
  }, [getResolvedProfile]);

  /**
   * Always-available defect definitions from the default profile.
   */
  const resolvedDefectDefinitions = useMemo<DefectDefinition[]>(() => {
    const profile = getResolvedProfile();
    return profile?.defectDefinitions ?? [];
  }, [getResolvedProfile]);

  return (
    <ConfigContext.Provider
      value={{
        config,
        isLoading,
        error,
        refreshConfig: fetchConfig,
        updateLocalConfig,
        getResolvedProfile,
        resolvedAqlCategories,
        resolvedDefectDefinitions,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Access the global system configuration from any component.
 * Must be used inside a <ConfigProvider> — throws if not.
 */
export function useConfig(): ConfigContextType {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a <ConfigProvider>');
  }
  return context;
}
