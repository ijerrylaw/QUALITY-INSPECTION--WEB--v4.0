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
 * Historically dimension pass/fail existed ONLY client-side (ISO2859_MATH_ENGINE.md
 * §5 documents it as a system fully independent from AQL). This evaluator gives
 * resolveVerdict.ts a server-side equivalent so persisted verdicts (initial
 * submit and amendment approval) can no longer silently drop a dimension-only
 * failure the way the client-only computation allowed.
 */

/** 5 measurement slots per dimension — mirrors StepDimensions.tsx's SLOTS_PER_DIM. */
const SLOTS_PER_DIM = 5;

/** Sentinel IDs for the two always-visible fixed-row dimensions. */
const FIXED_DIM_LENGTH = '__fixed_length__';
const FIXED_DIM_PALM = '__fixed_palm__';

export interface ProductDimensionDef {
  id: string;
  name: string;
  /** Legacy flat-format fallback fields — rarely populated, mirrored for parity. */
  minSpec?: string;
  tolerance?: string;
}

export interface ProductDimensionValue {
  minSpec: string;
  tolerance: string; // may be the literal string 'MIN' (case-insensitive)
}

export interface SizeConfig {
  lengthTarget?: string;
  lengthTolerance?: string;
  palmWidthTarget?: string;
  palmWidthTolerance?: string;
  dimensions?: Record<string, ProductDimensionValue>;
}

export interface ProductConfig {
  dimensionDefs?: ProductDimensionDef[];
  sizes?: Record<string, SizeConfig>;
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
    { id: FIXED_DIM_LENGTH, name: 'GLOVE LENGTH' },
    { id: FIXED_DIM_PALM, name: 'PALM WIDTH' },
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
    const { minSpec, tolerance, isMin } = getDimSpec(dim.id, sizeEntry, dynamicDimensions);
    const threshold = minSpec > 0 ? minSpec - tolerance : 0;
    const maxThreshold = minSpec > 0 && tolerance > 0 && !isMin ? minSpec + tolerance : Infinity;

    const vals = measurements[dim.id] ?? Array(SLOTS_PER_DIM).fill('');
    const fails = vals.map((v) => {
      const num = parseFloat(v);
      if (isNaN(num)) return false;
      return num < threshold || (!isMin && tolerance > 0 && num > maxThreshold);
    });

    const numVals = vals.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
    const min = numVals.length > 0 ? Math.min(...numVals) : 0;
    const max = numVals.length > 0 ? Math.max(...numVals) : 0;
    const avg = numVals.length > 0 ? numVals.reduce((a, b) => a + b, 0) / numVals.length : 0;

    const failed = fails.some((f) => f === true);
    if (failed) failedDimensions++;

    dimensionResults.push({ id: dim.id, name: dim.name, min, max, avg, fails, failed, threshold, maxThreshold, isMin });
  });

  return { failedDimensions, dimensionResults };
}
