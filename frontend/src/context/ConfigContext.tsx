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
 * Level 1 System Precedence: AI_RULES.md & UI_DESIGN_SYSTEM.md
 * Level 2 Feature Spec: v4_optimized_blueprint.md & implementation_plan.md
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import type { ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — mirrors the response shape of GET /api/config (config.routes.ts)
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

export interface ProductDimensionDef {
  id: string;
  name: string;
  unit: string;
  isMin?: boolean;
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
  lastAmended?: string; // ISO date string tracking the last time this config was successfully saved
}


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
  sampleSizes: number[];
  productProfileMap: Record<string, string[]>;
  productMatrixConfig: Record<string, ProductConfig>;
  skuMaterials: SKUOption[];
  skuWeights: SKUOption[];
  skuColors: SKUOption[];
  skuTreatments: SKUOption[];
  skuLengths: SKUOption[];
  skuTextures: SKUOption[];
  dimensions: any[];
  targetWeight: { target: number; tolerance: number };
  aqlCategories?: any[];
  defectDefinitions?: any[];
  inspectionProfiles?: any[];
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT
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
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * API base URL.
 * In development: falls back to http://localhost:4009
 * In production: set VITE_API_URL in the frontend build environment.
 */
export const API_BASE_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:4009';

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/config`);
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      const data = (await response.json()) as AppConfig;
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

  // Fetch once on application mount (Global Context Hydration per v4_optimized_blueprint.md § 3)
  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  return (
    <ConfigContext.Provider
      value={{
        config,
        isLoading,
        error,
        refreshConfig: fetchConfig,
        updateLocalConfig,
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
