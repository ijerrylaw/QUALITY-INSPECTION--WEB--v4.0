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
  /** Number of decimal places (0–3). Controls both the config setup grid and the Wizard entry inputs. Default: 0 (integer). */
  decimals?: number;
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
 * aqlLevel values: '0.65' | '1.0' | '1.5' | '2.5' | '4.0' | '6.5' | 'AND' | 'PASS/FAIL/NIL'
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
 * output — its category normalisation defaults a missing evalMode to
 * 'CUMULATIVE', which would mask exactly the unusable state this checks for.
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
  productMatrixConfig: Record<string, ProductConfig>;
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
 * In development: falls back to http://localhost:4009
 * In production: set VITE_API_URL in the frontend build environment.
 */
export const API_BASE_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:4009';

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
        data.inspectionProfiles = [
          {
            id: 'prof_default',
            name: 'GLOBAL STANDARD',
            isDefault: true,
            aqlCategories: [
              { id: 'BARRIER',   name: 'BARRIER',   aqlLevel: 'AND',           evaluationMode: 'N/A' },
              { id: 'CRITICAL',  name: 'CRITICAL',  aqlLevel: '1.5',           evaluationMode: 'CUMULATIVE' },
              { id: 'MAJOR',     name: 'MAJOR',     aqlLevel: '2.5',           evaluationMode: 'CUMULATIVE' },
              { id: 'MINOR',     name: 'MINOR',     aqlLevel: '4.0',           evaluationMode: 'GRANULAR' },
              { id: 'PACKAGING', name: 'PACKAGING', aqlLevel: 'PASS/FAIL/NIL', evaluationMode: 'N/A' },
            ],
            defectDefinitions: [
              { id: 'def_hole',     name: 'Hole',       categoryId: 'BARRIER' },
              { id: 'def_tear',     name: 'Tear',       categoryId: 'BARRIER' },
              { id: 'def_stain',    name: 'Stain',      categoryId: 'CRITICAL' },
              { id: 'def_particle', name: 'Particle',   categoryId: 'CRITICAL' },
              { id: 'def_dirt',     name: 'Dirt',       categoryId: 'MAJOR' },
              { id: 'def_flow',     name: 'Flow Mark',  categoryId: 'MINOR' },
              { id: 'def_box',      name: 'Box Damage', categoryId: 'PACKAGING' },
            ],
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

    // Normalise AQLCategory aliases so both `aql` and `aqlLevel` are always set
    const normalisedCategories: AQLCategory[] = (profile.aqlCategories ?? []).map(cat => ({
      ...cat,
      aql: cat.aql ?? cat.aqlLevel ?? '',
      aqlLevel: cat.aqlLevel ?? cat.aql ?? '',
      evalMode: cat.evalMode ?? cat.evaluationMode ?? 'CUMULATIVE',
      evaluationMode: (cat.evaluationMode ?? cat.evalMode ?? 'CUMULATIVE') as EvaluationMode,
    }));

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
