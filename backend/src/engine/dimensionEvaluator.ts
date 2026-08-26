/**
 * @file dimensionEvaluator.ts
 * @description Server-side physical dimension pass/fail engine (§5.9 fix).
 *
 * Mirrors frontend/src/pages/wizard/StepDimensions.tsx's real-time evaluation
 * engine (its `stats` useMemo) exactly, including its quirks — this module's
 * job is to match what the operator already sees in the wizard, not to
 * "improve" on it. Notably: `ProductDimensionDef.isMin` is intentionally never
 * read here, same as the frontend — `isMin` is derived purely from whether a
 * size's tolerance field is the literal string `'MIN'`.
 *
 * `isGraded` is the one exception to that "def fields are not read" rule: it
 * is a per-dimension mode switch rather than a spec value, and StepDimensions
 * applies it identically client-side (see isDimensionGraded below).
 *
 * Historically dimension pass/fail existed ONLY client-side (ISO2859_MATH_ENGINE.md
 * §5 documents it as a system fully independent from AQL). This evaluator gives
 * resolveVerdict.ts a server-side equivalent so persisted verdicts (initial
 * submit and amendment approval) can no longer silently drop a dimension-only
 * failure the way the client-only computation allowed.
 */

/** 5 measurement slots per dimension — mirrors StepDimensions.tsx's SLOTS_PER_DIM. */
const SLOTS_PER_DIM = 5;

/** Sentinel IDs for the always-visible fixed-row dimensions. */
const FIXED_DIM_LENGTH = '__fixed_length__';
const FIXED_DIM_PALM = '__fixed_palm__';
const FIXED_DIM_WEIGHT = '__fixed_weight__';

export interface ProductDimensionDef {
  id: string;
  name: string;
  /**
   * Record-only mode. `false` means the operator still captures all 5
   * measurements but they are NEVER compared against a threshold and never
   * contribute to pass/fail — see isDimensionGraded() for the default rule.
   * Only ever set on CUSTOM dimensions; the two fixed rows (GLOVE LENGTH,
   * PALM WIDTH) are always graded and never carry this flag.
   */
  isGraded?: boolean;
  /** Legacy flat-format fallback fields — rarely populated, mirrored for parity. */
  minSpec?: string;
  tolerance?: string;
}

/**
 * The graded/record-only rule, in exactly one place.
 *
 * The default is DELIBERATELY IMPLICIT: only the explicit literal `false`
 * means record-only. Absent, undefined, or `true` all mean graded, so every
 * pre-existing dimension def — none of which carry this key — keeps grading
 * with byte-identical behavior and no backfill.
 *
 * That implicitness is load-bearing, not merely tidy. PATCH /api/config
 * rejects ANY change to a locked product code's matrix via a recursive deep
 * diff of the whole subtree (config.routes.ts), and ProductEngine.tsx always
 * re-sends every product's matrix on every save. Materializing a default
 * `isGraded: true` onto existing defs would therefore register as
 * `undefined -> true` on locked codes and 409 the entire request, breaking
 * every configuration save in the app. The key must only ever appear because
 * a human actually toggled it.
 */
export function isDimensionGraded(dim: { isGraded?: boolean } | null | undefined): boolean {
  return dim?.isGraded !== false;
}

export interface ProductDimensionValue {
  minSpec: string;
  tolerance: string; // may be the literal string 'MIN' (case-insensitive)
}

export interface SizeConfig {
  weightTarget?: string;
  weightTolerance?: string;
  lengthTarget?: string;
  lengthTolerance?: string;
  palmWidthTarget?: string;
  palmWidthTolerance?: string;
  dimensions?: Record<string, ProductDimensionValue>;
}

export interface ProductConfig {
  dimensionDefs?: ProductDimensionDef[];
  sizes?: Record<string, SizeConfig>;
  /**
   * Graded/Record-only for the fixed GLOVE LENGTH / PALM WIDTH rows — same
   * "only literal `false` means record-only" convention as
   * ProductDimensionDef.isGraded. No `weightIsGraded`: Glove Weight has no
   * record-only mode, see evaluateWeight() below.
   */
  lengthIsGraded?: boolean;
  palmWidthIsGraded?: boolean;
}

/**
 * A product's dimension matrix is usable for the two always-graded fixed
 * dimensions (GLOVE LENGTH, PALM WIDTH) only if the selected size has a real,
 * non-zero target for BOTH — unlike AQL categories (many, independent,
 * partial-config is normal), there are always exactly two fixed dimensions
 * and both are graded unconditionally every time, so a target missing on
 * either one leaves that one silently zeroed out (threshold=0,
 * maxThreshold=Infinity — see AUDIT_REPORT.md finding #5). Mirrors
 * `hasUsableProductMatrix()` in `frontend/src/context/ConfigContext.tsx`
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

export interface DimensionResult {
  id: string;
  name: string;
  min: number;
  max: number;
  avg: number;
  fails: boolean[];
  failed: boolean; // true if ANY slot fails — this is what failedDimensions counts
  threshold: number;
  maxThreshold: number;
  isMin: boolean;
  /**
   * false for a record-only dimension: `fails` is all-false and `failed` is
   * false because no comparison was ATTEMPTED, not because the measurements
   * were in spec. `threshold`/`maxThreshold` are still reported — they are
   * real stored config, and this flag exists so a reader can tell "not
   * evaluated" apart from "evaluated and passed".
   */
  isGraded: boolean;
}

export interface DimensionEvalParams {
  /** AppConfig.productMatrixConfig, keyed by productCode. */
  productMatrixConfig: Record<string, ProductConfig | undefined>;
  /** AppConfig.dimensions — global dimension defs used when a product has none of its own. */
  globalDimensionDefs: ProductDimensionDef[];
  productCode: string;
  size: string;
  /** Raw measurements, keyed by dimension id: dimId -> slot value strings. */
  measurements: Record<string, string[]>;
}

export interface DimensionEvalResult {
  /** Count of DIMENSIONS with at least one out-of-spec slot (not slot count). */
  failedDimensions: number;
  dimensionResults: DimensionResult[];
}

/**
 * Resolves minSpec/tolerance/isMin for one dimension id, same precedence chain
 * as StepDimensions.tsx's getDimSpec(): fixed rows -> per-size dynamic value ->
 * legacy flat dimension-def fallback.
 */
function getDimSpec(
  dimId: string,
  sizeEntry: SizeConfig | undefined,
  dynamicDimensions: ProductDimensionDef[],
): { minSpec: number; tolerance: number; isMin: boolean } {
  if (dimId === FIXED_DIM_LENGTH) {
    const target = parseFloat(sizeEntry?.lengthTarget ?? '0') || 0;
    const tolRaw = sizeEntry?.lengthTolerance ?? '0';
    const isMin = tolRaw.toUpperCase() === 'MIN';
    return { minSpec: target, tolerance: isMin ? 0 : (parseFloat(tolRaw) || 0), isMin };
  }
  if (dimId === FIXED_DIM_PALM) {
    const target = parseFloat(sizeEntry?.palmWidthTarget ?? '0') || 0;
    const tolRaw = sizeEntry?.palmWidthTolerance ?? '0';
    const isMin = tolRaw.toUpperCase() === 'MIN';
    return { minSpec: target, tolerance: isMin ? 0 : (parseFloat(tolRaw) || 0), isMin };
  }

  const dimValue = sizeEntry?.dimensions?.[dimId];
  if (dimValue) {
    const tolRaw = dimValue.tolerance ?? '0';
    const isMin = tolRaw.toUpperCase() === 'MIN';
    return {
      minSpec: parseFloat(dimValue.minSpec) || 0,
      tolerance: isMin ? 0 : (parseFloat(tolRaw) || 0),
      isMin,
    };
  }

  // Legacy fallback: read from the dimension def itself (flat format).
  const dimDef = dynamicDimensions.find((d) => d.id === dimId);
  return {
    minSpec: parseFloat(dimDef?.minSpec ?? '0') || 0,
    tolerance: parseFloat(dimDef?.tolerance ?? '0') || 0,
    isMin: false,
  };
}

/**
 * Evaluates physical dimension pass/fail for one submission's measurements,
 * against the same product/size spec config StepDimensions.tsx reads from.
 *
 * Pure function — no DB access. Caller (resolveVerdict.ts) is responsible for
 * resolving productMatrixConfig/globalDimensionDefs from AppConfig first.
 */
export function evaluateDimensions(params: DimensionEvalParams): DimensionEvalResult {
  const { productMatrixConfig, globalDimensionDefs, productCode, size, measurements } = params;

  const matrixEntry = productMatrixConfig?.[productCode];
  const sizeEntry = matrixEntry?.sizes?.[size];

  const fixedDimensions: ProductDimensionDef[] = [
    { id: FIXED_DIM_LENGTH, name: 'GLOVE LENGTH', isGraded: matrixEntry?.lengthIsGraded },
    { id: FIXED_DIM_PALM, name: 'PALM WIDTH', isGraded: matrixEntry?.palmWidthIsGraded },
  ];

  const dynamicDimensions: ProductDimensionDef[] =
    matrixEntry?.dimensionDefs && matrixEntry.dimensionDefs.length > 0
      ? matrixEntry.dimensionDefs
      : globalDimensionDefs && globalDimensionDefs.length > 0
        ? globalDimensionDefs
        : [];

  const activeDimensions = [...fixedDimensions, ...dynamicDimensions];

  const dimensionResults: DimensionResult[] = [];
  let failedDimensions = 0;

  activeDimensions.forEach((dim) => {
    const graded = isDimensionGraded(dim);
    const { minSpec, tolerance, isMin } = getDimSpec(dim.id, sizeEntry, dynamicDimensions);
    const threshold = minSpec > 0 ? minSpec - tolerance : 0;
    const maxThreshold = minSpec > 0 && tolerance > 0 && !isMin ? minSpec + tolerance : Infinity;

    const vals = measurements[dim.id] ?? Array(SLOTS_PER_DIM).fill('');
    // Record-only: no threshold comparison is attempted at all. The slots are
    // still read and summarized below (min/max/avg are recorded data, wanted
    // for reporting/trending) — only the pass/fail judgement is skipped.
    const fails = graded
      ? vals.map((v) => {
          const num = parseFloat(v);
          if (isNaN(num)) return false;
          return num < threshold || (!isMin && tolerance > 0 && num > maxThreshold);
        })
      : vals.map(() => false);

    const numVals = vals.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
    const min = numVals.length > 0 ? Math.min(...numVals) : 0;
    const max = numVals.length > 0 ? Math.max(...numVals) : 0;
    const avg = numVals.length > 0 ? numVals.reduce((a, b) => a + b, 0) / numVals.length : 0;

    // Unreachable for a record-only dimension (fails is all-false above), so
    // it can never reach failedDimensions and therefore never flip the verdict.
    const failed = fails.some((f) => f === true);
    if (failed) failedDimensions++;

    dimensionResults.push({ id: dim.id, name: dim.name, min, max, avg, fails, failed, threshold, maxThreshold, isMin, isGraded: graded });
  });

  return { failedDimensions, dimensionResults };
}

export interface WeightEvalParams {
  /** The single recorded glove weight value (Submission.gloveWeight) — never a 5-slot measurement. */
  gloveWeight: number;
  weightTarget?: string;
  weightTolerance?: string;
}

/**
 * Evaluates GLOVE WEIGHT pass/fail — a single scalar value against
 * weightTarget/weightTolerance, unlike every other dimension's 5-slot
 * measurement. No evaluator existed for Weight before this; `weightTolerance`
 * was stored but never read for grading. Reuses the exact threshold formula
 * `evaluateDimensions` already uses (including the `'MIN'` tolerance
 * sentinel) — just a 1-value input instead of 5.
 *
 * Deliberately has NO isGraded parameter and no record-only skip-path:
 * Glove Weight is always graded once this is wired in (see
 * ProductConfig.lengthIsGraded/palmWidthIsGraded docs — there is no
 * `weightIsGraded` counterpart, by design).
 */
export function evaluateWeight(params: WeightEvalParams): DimensionResult {
  const { gloveWeight, weightTarget, weightTolerance } = params;

  const target = parseFloat(weightTarget ?? '0') || 0;
  const tolRaw = weightTolerance ?? '0';
  const isMin = tolRaw.toUpperCase() === 'MIN';
  const tolerance = isMin ? 0 : (parseFloat(tolRaw) || 0);
  const threshold = target > 0 ? target - tolerance : 0;
  const maxThreshold = target > 0 && tolerance > 0 && !isMin ? target + tolerance : Infinity;

  const fails = [gloveWeight < threshold || (!isMin && tolerance > 0 && gloveWeight > maxThreshold)];
  const failed = fails[0];

  return {
    id: FIXED_DIM_WEIGHT,
    name: 'GLOVE WEIGHT',
    min: gloveWeight,
    max: gloveWeight,
    avg: gloveWeight,
    fails,
    failed,
    threshold,
    maxThreshold,
    isMin,
    isGraded: true,
  };
}
