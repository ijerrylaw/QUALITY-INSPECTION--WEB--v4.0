/**
 * @file defaultProfileSeed.ts
 * @description CANONICAL source of truth for the zero-state default inspection
 * profile's category/defect seed values, and for what an "unset" evaluation
 * mode means.
 *
 * ── Why this file exists (AUDIT_REPORT.md #10 / #17) ────────────────────────
 * Three independent hand-written copies of this seed had drifted apart:
 *   - backend/src/engine/resolveVerdict.ts  HARDCODED_DEFAULT_PROFILE
 *   - frontend/src/context/ConfigContext.tsx  fetchConfig()'s empty-list fallback
 *   - frontend/src/pages/config/QualityRules.tsx  defaultProfiles seed
 * BARRIER in particular was CUMULATIVE in one and 'N/A' in the other two, so the
 * wizard could DISPLAY one evaluation mode while the server GRADED under another.
 * All three now derive from the constants below instead of restating them.
 *
 * ── Cross-boundary convention ───────────────────────────────────────────────
 * The frontend cannot import from backend/ (frontend/tsconfig.app.json is
 * `include: ["src"]`, and there are no path aliases), so this file has a
 * deliberate mirror at frontend/src/lib/defaultProfileSeed.ts — the same
 * "kept in sync deliberately" convention used throughout this codebase.
 *
 * UNLIKE those other mirrors, this pair is MACHINE-ENFORCED: the sync-guard test
 * at frontend/src/lib/__tests__/defaultProfileSeed.sync.test.ts imports BOTH this
 * file and the mirror and asserts deep equality, so drift fails CI instead of
 * shipping silently. If you change anything here, change the mirror too — the
 * test will tell you if you forget.
 *
 * ── Field naming ────────────────────────────────────────────────────────────
 * The seed below uses NEUTRAL field names (`aql` / `evalMode` / `categoryId`).
 * Each consumer adapts them to its own local convention:
 *   - the engine wants  aqlLevel / evaluationMode  and currentClass/defaultClass
 *   - ConfigContext     wants aqlLevel / evaluationMode  and categoryId
 *   - QualityRules      wants aql / evalMode            and categoryId
 * Adapting at the consumer keeps THIS file free of any one caller's dialect.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL DEFAULT EVALUATION MODE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The canonical evaluation mode for a category that does not specify one.
 *
 * CUMULATIVE deliberately — it is the strict/safe choice. The alternative ('',
 * the true-exclusion skip path) would silently drop the category from the lot
 * verdict entirely, which is exactly the failure mode #17 was logged for. A
 * category that is *meant* to be excluded must say so explicitly by being saved
 * as RECORD ONLY (see EMPTY_EVAL_MODE_IS_RECORD_ONLY below).
 *
 * NOTE: as of the #10/#17 fix this is a LAST-RESORT display value only. Save-time
 * validation (validateInspectionProfiles(), backend/src/routes/config.routes.ts)
 * rejects any profile carrying an unset evalMode, so no NEW category can persist
 * without one. It remains here for pre-existing rows saved before that validation.
 */
export const DEFAULT_EVAL_MODE = 'CUMULATIVE';

/**
 * Documentation anchor for a rule that is easy to get wrong and expensive to
 * break: an evaluation mode of `''` (empty string) is a REAL, DELIBERATE value,
 * not a missing one. It is what RECORD ONLY writes, and it is the only thing
 * that triggers aqlEvaluator.ts's true-exclusion skip path
 * (`if (!category.evaluationMode) continue;`).
 *
 * Therefore `''` must NEVER be treated as unset — not by isEvalModeUnset()
 * below, not by save validation, not by the admin UI's warning badge. Doing so
 * would break the entire RECORD ONLY feature.
 */
export const EMPTY_EVAL_MODE_IS_RECORD_ONLY = true as const;

// ─────────────────────────────────────────────────────────────────────────────
// UNSET DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The two field-name spellings an evaluation mode can arrive under. Categories
 * authored by the admin UI (QualityRules.tsx) persist `evalMode`; the engine and
 * the hardcoded seeds use `evaluationMode`. Every reader in this codebase
 * dual-reads, so unset-detection must too — checking only one spelling would
 * flag every real admin-saved category as unset.
 */
export interface EvalModeBearing {
  evaluationMode?: unknown;
  evalMode?: unknown;
}

/**
 * True when a category carries NO evaluation mode at all under either spelling.
 *
 * Deliberately narrow. Only `undefined`/`null`/absent counts as unset:
 *   - `''`           → SET (RECORD ONLY / true exclusion) — see EMPTY_EVAL_MODE_IS_RECORD_ONLY
 *   - `'N/A'`        → SET (qualitative PASS/FAIL)
 *   - `'CUMULATIVE'` → SET
 *   - `'GRANULAR'`   → SET
 *
 * `??` is used rather than `||` precisely so that `''` falls through as a real
 * value instead of being coerced away.
 */
export function isEvalModeUnset(category: EvalModeBearing | null | undefined): boolean {
  if (!category) return true;
  const mode = category.evaluationMode ?? category.evalMode;
  return mode === undefined || mode === null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL ZERO-STATE SEED
// ─────────────────────────────────────────────────────────────────────────────

/** One seeded AQL category, in neutral field naming — see the file header. */
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
 * The zero-state default profile's categories.
 *
 * Per-category evaluation modes — these are INDEPENDENT of each other, not a
 * single blanket default:
 *   BARRIER   CUMULATIVE — a numeric zero-tolerance AND category. `{ac:0,re:1}`
 *                          via the zero-tolerance override, counted cumulatively.
 *                          NOT 'N/A': that would mean qualitative state-encoding
 *                          (0=unset/1=pass/2=fail), which is a different data
 *                          contract entirely. This is the #10 disagreement.
 *   CRITICAL  CUMULATIVE
 *   MAJOR     CUMULATIVE
 *   MINOR     GRANULAR   — each defect type checked against Ac/Re independently.
 *   PACKAGING ''         — informational only; the engine skips it via the
 *                          true-exclusion path. Fixed 2026-08-25; preserved here
 *                          verbatim. NOT 'N/A' (which would be evaluated as a
 *                          qualitative pass/fail rather than skipped).
 */
export const DEFAULT_AQL_CATEGORY_SEED: readonly DefaultCategorySeed[] = [
  { id: 'BARRIER',   name: 'BARRIER',   aql: 'AND',       evalMode: 'CUMULATIVE' },
  { id: 'CRITICAL',  name: 'CRITICAL',  aql: '1.5',       evalMode: 'CUMULATIVE' },
  { id: 'MAJOR',     name: 'MAJOR',     aql: '2.5',       evalMode: 'CUMULATIVE' },
  { id: 'MINOR',     name: 'MINOR',     aql: '4.0',       evalMode: 'GRANULAR'   },
  { id: 'PACKAGING', name: 'PACKAGING', aql: 'PASS/FAIL', evalMode: ''           },
] as const;

/**
 * The zero-state default profile's defect definitions. `categoryId` matches a
 * seeded category's `id`; the engine resolves membership by
 * `currentClass === category.name || category.id`, and every seeded id equals
 * its own name here, so either match path works.
 */
export const DEFAULT_DEFECT_DEFINITION_SEED: readonly DefaultDefectSeed[] = [
  { id: 'def_hole',     name: 'Hole',       categoryId: 'BARRIER'   },
  { id: 'def_tear',     name: 'Tear',       categoryId: 'BARRIER'   },
  { id: 'def_stain',    name: 'Stain',      categoryId: 'CRITICAL'  },
  { id: 'def_particle', name: 'Particle',   categoryId: 'CRITICAL'  },
  { id: 'def_dirt',     name: 'Dirt',       categoryId: 'MAJOR'     },
  { id: 'def_flow',     name: 'Flow Mark',  categoryId: 'MINOR'     },
  { id: 'def_box',      name: 'Box Damage', categoryId: 'PACKAGING' },
] as const;

/** The zero-state default profile's id — the sentinel every fallback path uses. */
export const DEFAULT_PROFILE_ID = 'prof_default';
