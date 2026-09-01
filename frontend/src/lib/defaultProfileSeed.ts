/**
 * @file defaultProfileSeed.ts
 * @description Frontend MIRROR of backend/src/engine/defaultProfileSeed.ts —
 * the canonical zero-state default profile seed and unset-evalMode rules
 * (AUDIT_REPORT.md #10 / #17).
 *
 * ── This is a mirror, not the source ────────────────────────────────────────
 * The backend copy is canonical. The frontend cannot import from backend/
 * (frontend/tsconfig.app.json is `include: ["src"]`, no path aliases), which is
 * the same reason ~30 other constants in this codebase are mirrored by hand.
 *
 * UNLIKE those, this pair is MACHINE-ENFORCED: `__tests__/defaultProfileSeed.sync.test.ts`
 * imports BOTH this file and the backend original and asserts they are deeply
 * equal, so drift fails CI instead of shipping silently. Edit both halves
 * together; the test will catch you if you don't.
 *
 * Consumers (ConfigContext.tsx's zero-profile fallback, QualityRules.tsx's
 * defaultProfiles seed) adapt the neutral `aql`/`evalMode`/`categoryId` field
 * names below into their own local dialect — see the backend file's header.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL DEFAULT EVALUATION MODE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The canonical evaluation mode for a category that does not specify one.
 * CUMULATIVE deliberately — the strict/safe choice; '' would silently drop the
 * category from the verdict, which is the failure mode #17 was logged for.
 *
 * Last-resort DISPLAY value only: save-time validation now rejects profiles
 * carrying an unset evalMode, so no new category can persist without one.
 */
export const DEFAULT_EVAL_MODE = 'CUMULATIVE';

/**
 * An evaluation mode of `''` is a REAL, DELIBERATE value (RECORD ONLY / true
 * exclusion), never a missing one. It must never be treated as unset — doing so
 * would break the entire RECORD ONLY feature.
 */
export const EMPTY_EVAL_MODE_IS_RECORD_ONLY = true as const;

// ─────────────────────────────────────────────────────────────────────────────
// UNSET DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The two spellings an evaluation mode arrives under — admin-authored
 * categories persist `evalMode`, the engine and seeds use `evaluationMode`.
 * Unset-detection dual-reads both, or it would flag every real saved category.
 */
export interface EvalModeBearing {
  evaluationMode?: unknown;
  evalMode?: unknown;
}

/**
 * True when a category carries NO evaluation mode under either spelling.
 * Only `undefined`/`null`/absent counts — `''` (RECORD ONLY), `'N/A'`,
 * `'CUMULATIVE'` and `'GRANULAR'` are all SET. `??` rather than `||` so `''`
 * falls through as a real value.
 */
export function isEvalModeUnset(category: EvalModeBearing | null | undefined): boolean {
  if (!category) return true;
  const mode = category.evaluationMode ?? category.evalMode;
  return mode === undefined || mode === null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL ZERO-STATE SEED
// ─────────────────────────────────────────────────────────────────────────────

/** One seeded AQL category, in neutral field naming. */
export interface DefaultCategorySeed {
  readonly id: string;
  readonly name: string;
  readonly aql: string;
  readonly evalMode: string;
}

/** One seeded defect definition, in neutral field naming. */
export interface DefaultDefectSeed {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
}

/**
 * The zero-state default profile's categories. Per-category modes are
 * INDEPENDENT, not one blanket default:
 *   BARRIER   CUMULATIVE — numeric zero-tolerance AND category (the #10 fix;
 *                          NOT 'N/A', which means qualitative state-encoding).
 *   MINOR     GRANULAR   — each defect type checked independently.
 *   PACKAGING ''         — informational only, engine skips it (2026-08-25 fix).
 */
export const DEFAULT_AQL_CATEGORY_SEED: readonly DefaultCategorySeed[] = [
  { id: 'BARRIER',   name: 'BARRIER',   aql: 'AND',       evalMode: 'CUMULATIVE' },
  { id: 'CRITICAL',  name: 'CRITICAL',  aql: '1.5',       evalMode: 'CUMULATIVE' },
  { id: 'MAJOR',     name: 'MAJOR',     aql: '2.5',       evalMode: 'CUMULATIVE' },
  { id: 'MINOR',     name: 'MINOR',     aql: '4.0',       evalMode: 'GRANULAR'   },
  { id: 'PACKAGING', name: 'PACKAGING', aql: 'PASS/FAIL', evalMode: ''           },
] as const;

/** The zero-state default profile's defect definitions. */
export const DEFAULT_DEFECT_DEFINITION_SEED: readonly DefaultDefectSeed[] = [
  { id: 'def_hole',     name: 'Hole',       categoryId: 'BARRIER'   },
  { id: 'def_tear',     name: 'Tear',       categoryId: 'BARRIER'   },
  { id: 'def_stain',    name: 'Stain',      categoryId: 'CRITICAL'  },
  { id: 'def_particle', name: 'Particle',   categoryId: 'CRITICAL'  },
  { id: 'def_dirt',     name: 'Dirt',       categoryId: 'MAJOR'     },
  { id: 'def_flow',     name: 'Flow Mark',  categoryId: 'MINOR'     },
  { id: 'def_box',      name: 'Box Damage', categoryId: 'PACKAGING' },
] as const;

/** The zero-state default profile's id. */
export const DEFAULT_PROFILE_ID = 'prof_default';
