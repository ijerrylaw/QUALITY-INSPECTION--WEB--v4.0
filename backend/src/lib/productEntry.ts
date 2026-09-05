/**
 * @file productEntry.ts
 * @description Consolidated per-product-code record type — Session A of the
 * fix for the productCodes / productMatrixConfig / productProfileMap
 * three-way drift risk (see CHANGELOG.md's documented productProfileMap
 * corrupted-key incident, and the Product Engine discovery report §2/§5).
 *
 * NO LONGER ADDITIVE — this header described the Session-A state and was left
 * behind by the cutover it predicted. AppConfig.products is now the sole read
 * AND write target for the product registry: B3 moved the admin/config
 * surface's reads onto it, B4 moved the grading engine's (both through
 * resolveProductRegistry() below), and B6 made it the only column written.
 * The three legacy columns were frozen after B6, then DROPPED from the schema
 * entirely (AUDIT_REPORT.md #37 Part 2) once resolveProductRegistry()'s
 * unmigrated-database fallback — their last reader — was confirmed no longer
 * needed (every real deployment had long since migrated onto `products`).
 *
 * Mirrors DATA_SCHEMAS_AND_TYPES.md §3's ProductConfig/SizeConfig/
 * ProductDimensionDef shapes exactly — kept intentionally separate from
 * dimensionEvaluator.ts's own local ProductConfig type, which is a smaller,
 * grading-only subset (no lastAmended/decimals fields) unsuitable for a
 * lossless migration.
 */

export interface ProductDimensionValue {
  minSpec: string;
  tolerance: string;
}

export interface ProductDimensionDef {
  id: string;
  name: string;
  unit: string;
  /** When true: minimum-only boundary — see dimensionEvaluator.ts's isMin handling. */
  isMin?: boolean;
  /**
   * Record-only mode when explicitly `false`: measured but excluded from
   * grading. Absent/true = graded — the default is deliberately never
   * materialized onto stored defs, because PATCH /api/config's locked-code
   * deep diff would read that as a change. See isDimensionGraded() in
   * engine/dimensionEvaluator.ts for the full rationale.
   */
  isGraded?: boolean;
  /**
   * Wizard-visibility mode when explicitly `false`: the field is completely
   * hidden from the operator in StepDimensions.tsx/BatchEntry.tsx — not
   * greyed out, absent from the rendered list, never captured, never
   * evaluated. Independent of `isGraded`: switching this to `false` does
   * NOT touch or clear `isGraded`, so a field's prior Graded/Record-only
   * state is preserved and simply resumes once wizard-visibility is
   * restored. Absent/true = visible — same "default never materialized"
   * convention as isGraded, for the same locked-code deep-diff reason. See
   * isWizardVisible() in engine/dimensionEvaluator.ts.
   */
  wizardVisible?: boolean;
  /** Format precision for this dynamic dimension (0–3 decimals). */
  decimals?: number;
}

export interface SizeConfig {
  weightTarget: string;
  weightTolerance: string;
  lengthTarget?: string;
  lengthTolerance?: string;
  palmWidthTarget?: string;
  palmWidthTolerance?: string;
  dimensions: Record<string, ProductDimensionValue>;
}

export interface ProductConfig {
  dimensionDefs: ProductDimensionDef[];
  sizes: Record<string, SizeConfig>;
  lastAmended?: string;
  weightDecimals?: number;
  lengthDecimals?: number;
  palmWidthDecimals?: number;
  /**
   * Graded (default) vs Record-only for the fixed GLOVE LENGTH / PALM WIDTH
   * rows — same "only literal `false` means record-only, default never
   * materialized" convention as ProductDimensionDef.isGraded (see there for
   * the full rationale re: the locked-code deep diff). Deliberately no
   * `weightIsGraded` counterpart — Glove Weight has no record-only mode and
   * is always graded once evaluateWeight() is wired in.
   */
  lengthIsGraded?: boolean;
  palmWidthIsGraded?: boolean;
  /**
   * Wizard-visibility for the fixed GLOVE LENGTH / PALM WIDTH rows — same
   * semantics as ProductDimensionDef.wizardVisible above (independent of
   * lengthIsGraded/palmWidthIsGraded, default never materialized). No
   * `weightWizardVisible` counterpart — Glove Weight is out of scope for
   * this feature entirely.
   */
  lengthWizardVisible?: boolean;
  palmWidthWizardVisible?: boolean;
}

/**
 * The six SKU dictionary attribute VALUES (not labels) that composed this
 * product code's string at creation time — see ProductEngine.tsx's
 * derivedSKU. All six are null for every code migrated in Session A: prior
 * to this structure, skuMaterials/skuWeights/skuColors/skuTreatments/
 * skuLengths/skuTextures were used once to compose the code string and then
 * discarded, with no stored link back to which value built which component
 * (see Product Engine discovery report §2). A future pilot-import session
 * will populate these for newly-registered codes.
 */
export interface ProductAttributes {
  /** SkuOption.value from AppConfig.skuMaterials, e.g. 'N'. */
  material: string | null;
  /** SkuOption.value from AppConfig.skuWeights, e.g. '025'. */
  weight: string | null;
  /** SkuOption.value from AppConfig.skuColors, e.g. 'MNV'. */
  color: string | null;
  /** SkuOption.value from AppConfig.skuTreatments (UI label "Inner Surface"), e.g. 'OC'. */
  innerSurface: string | null;
  /** SkuOption.value from AppConfig.skuLengths, e.g. '24'. */
  length: string | null;
  /** SkuOption.value from AppConfig.skuTextures, e.g. 'FT'. */
  texture: string | null;
}

/**
 * One product code's full record — attributes + dimension/size matrix +
 * inspection profile link, together. Replaces having to separately look up
 * productMatrixConfig[code] and productProfileMap[code] and hope their keys
 * haven't drifted apart (see CHANGELOG.md's corrupted-key incident on the
 * old productProfileMap structure — this consolidation exists specifically
 * so that class of bug becomes structurally impossible for new code).
 */
export interface ProductEntry {
  attributes: ProductAttributes;
  /** Same shape and content as today's productMatrixConfig[code]. */
  matrix: ProductConfig;
  /** Same value as today's productProfileMap[code]; null if no profile is linked yet. */
  profileId: string | null;
}

/** AppConfig.products — JSON: Record<productCode, ProductEntry>. */
export type ProductsMap = Record<string, ProductEntry>;

/** A code registered with no matrix entry yet — never fabricated data. */
const EMPTY_MATRIX: ProductConfig = { dimensionDefs: [], sizes: {} };

/** The six attributes, unset. The legacy structures can never supply these. */
const NULL_ATTRIBUTES: ProductAttributes = {
  material: null,
  weight: null,
  color: null,
  innerSurface: null,
  length: null,
  texture: null,
};

const ATTRIBUTE_KEYS = ['material', 'weight', 'color', 'innerSurface', 'length', 'texture'] as const;

/**
 * Coerces an arbitrary payload value into a well-formed ProductAttributes
 * object — exactly the six known keys, each either a string or null. Any
 * other shape (wrong type, extra keys, non-string values) degrades to null
 * per field rather than being rejected outright: attributes are decorative/
 * traceability data, not grading-critical (see ProductAttributes' own docs),
 * so there is no correctness reason to fail the whole request over a
 * malformed one, unlike the numeric target fields dimensionEvaluator.ts
 * reads directly as grading thresholds.
 */
function sanitizeAttributes(raw: unknown): ProductAttributes {
  const src = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const out = {} as ProductAttributes;
  for (const key of ATTRIBUTE_KEYS) {
    const v = src[key];
    out[key] = typeof v === 'string' && v.length > 0 ? v : null;
  }
  return out;
}

/**
 * Rebuilds the consolidated `products` map from the three legacy structures.
 *
 * As of B6 this has exactly one caller: PATCH /api/config, which calls it at
 * the START of the request to fold the incoming payload (still in the legacy
 * field shapes — the API contract is unchanged) into the single authoritative
 * `products` object that every validation check then runs against and that is
 * then persisted. The manual migrate/verify scripts that used to share it were
 * deleted in B6, having become meaningless once the legacy columns stopped
 * being written.
 *
 * Note the inversion: before B6 this produced a MIRROR, derived from the legacy
 * structures after they had been validated and queued for writing. It now
 * produces the PRIMARY record, built before validation runs. The function
 * itself is unchanged — only when it is called, and what is done with the
 * result.
 *
 * Attributes are the one exception to "rebuild from source": the three
 * legacy structures never held them, so an existing entry's attributes are
 * PRESERVED verbatim by default. Rebuilding them from nothing would silently
 * wipe the six-attribute data the pilot/batch2 imports wrote for 16 of the
 * 17 live codes.
 *
 * `incomingAttributes` is the one deliberate override of that default —
 * added for the duplicate+edit feature, the first live UI path that ever
 * needs to WRITE attributes for a code (previously they could only be
 * populated by one-off backfill scripts). When present for a given code,
 * it wins over both the preserved and null defaults for that code only;
 * every other code's attributes are untouched. Sanitized through
 * sanitizeAttributes() rather than trusted verbatim, since — unlike matrix/
 * profileMap — this is genuinely new, previously-unvalidated request input.
 *
 * @param codes               Final productCodes[] — defines the keyset exactly.
 * @param matrix              Final productMatrixConfig.
 * @param profileMap          Final productProfileMap.
 * @param existing            Current products map, read for attribute preservation.
 * @param incomingAttributes  Optional per-code attribute overrides from the request.
 */
export function buildProductsMap(
  codes: string[],
  matrix: Record<string, ProductConfig>,
  profileMap: Record<string, string>,
  existing: ProductsMap,
  incomingAttributes?: Record<string, unknown>,
): ProductsMap {
  const products: ProductsMap = {};

  // Keyed strictly off productCodes[] — a code dropped from the registry
  // disappears from `products` too, and a stale matrix/profileMap entry for
  // an unregistered code is never resurrected into it.
  for (const code of codes) {
    products[code] = {
      attributes: incomingAttributes && code in incomingAttributes
        ? sanitizeAttributes(incomingAttributes[code])
        : existing[code]?.attributes ?? NULL_ATTRIBUTES,
      matrix: matrix[code] ?? EMPTY_MATRIX,
      profileId: profileMap[code] ?? null,
    };
  }

  return products;
}

/** The three legacy structures, as projected back out of `products`. */
export interface LegacyProductStructures {
  productCodes: string[];
  productMatrixConfig: Record<string, ProductConfig>;
  productProfileMap: Record<string, string>;
}

/**
 * Projects `products` back into the three legacy structures — the exact
 * inverse of buildProductsMap(), kept beside it so the round-trip stays
 * visible in one place.
 *
 * Session B3 makes `products` the READ source of truth for the admin/config
 * surface, while the legacy structures continue to be written unchanged
 * (B2's design; their write-path removal is B6). GET /api/config therefore
 * still returns all three fields with byte-identical VALUES — they are just
 * derived from `products` now rather than read straight off their own
 * columns, so there is exactly one place the admin UI's truth comes from.
 *
 * Two deliberate properties, both matching how buildProductsMap() built the
 * data in the first place, so the round-trip is lossless for any map that
 * function produced:
 *   - productCodes order === `products` key order (which B2 made track
 *     productCodes[], the user-controlled Product Engine ordering).
 *   - productProfileMap omits null profileIds entirely, rather than emitting
 *     `code: null` — matching the legacy structure's own convention of only
 *     holding codes that actually have a profile linked.
 */
/** The raw AppConfig JSON column this module needs. Structural, not Prisma-typed. */
export interface RawProductColumns {
  products?: string | null;
}

function parseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * THE single resolver for reading the product registry — shared by the
 * admin/config surface (config.routes.ts, cut over in B3) and the grading
 * engine (resolveVerdict.ts, cut over in B4).
 *
 * Promoted here from config.routes.ts in B4 precisely so both callers share
 * one implementation. If the admin UI and the grading engine could ever
 * disagree about which codes exist or what a code's matrix says, that
 * disagreement would be invisible in the UI and would surface only as a wrong
 * pass/fail — exactly the failure mode this consolidation exists to
 * eliminate.
 *
 * Until AUDIT_REPORT.md #37 Part 2, this also carried an unmigrated-database
 * fallback onto the three legacy columns (productCodes/productMatrixConfig/
 * productProfileMap) for a `products`-empty database — e.g. a dev.db restored
 * from before Session A, which added the column. That fallback's last real
 * use case never recurred once every live deployment had migrated onto
 * `products` (confirmed 2026-09-05), and the columns it read were dropped
 * from the schema in the same pass — so the fallback branch and the three
 * legacy columns went together. `products` is now unconditionally the only
 * source this resolver reads.
 */
export function resolveProductRegistry(config: RawProductColumns): LegacyProductStructures {
  const products = parseJSON<ProductsMap>(config.products, {});
  return deriveLegacyStructures(products);
}

export function deriveLegacyStructures(products: ProductsMap): LegacyProductStructures {
  const productCodes: string[] = [];
  const productMatrixConfig: Record<string, ProductConfig> = {};
  const productProfileMap: Record<string, string> = {};

  for (const [code, entry] of Object.entries(products)) {
    productCodes.push(code);
    productMatrixConfig[code] = entry.matrix;
    if (entry.profileId !== null && entry.profileId !== undefined) {
      productProfileMap[code] = entry.profileId;
    }
  }

  return { productCodes, productMatrixConfig, productProfileMap };
}
