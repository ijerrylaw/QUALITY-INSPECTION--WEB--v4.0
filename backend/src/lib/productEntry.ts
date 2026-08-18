/**
 * @file productEntry.ts
 * @description Consolidated per-product-code record type — Session A of the
 * fix for the productCodes / productMatrixConfig / productProfileMap
 * three-way drift risk (see CHANGELOG.md's documented productProfileMap
 * corrupted-key incident, and the Product Engine discovery report §2/§5).
 *
 * Additive only: nothing reads AppConfig.products yet. The three structures
 * above remain the live source of truth for every current call site until a
 * later session rewires reads onto this one and removes them.
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

/**
 * Rebuilds the consolidated `products` map from the three legacy structures.
 *
 * THE single canonical implementation, deliberately shared by both callers:
 *   - PATCH /api/config's write-hook (config.routes.ts), which keeps
 *     `products` in sync automatically on every real config write.
 *   - scripts/migrate-products-field.ts, the manual catch-up/backfill tool.
 *
 * Keeping one implementation is the whole point: two copies of this logic
 * drifting apart would reintroduce exactly the class of three-way-drift bug
 * this consolidation exists to make structurally impossible.
 *
 * `products` is a pure MIRROR — it derives entirely from whatever the legacy
 * structures contain after all existing validation and lock-checks have
 * passed. It never gates, relaxes, or second-guesses those checks.
 *
 * Attributes are the one exception to "rebuild from source": they cannot be
 * derived from the legacy structures at all (nothing there holds them), so an
 * existing entry's attributes are PRESERVED verbatim. Rebuilding them would
 * silently wipe the six-attribute data the pilot/batch2 imports wrote for 16
 * of the 17 live codes.
 *
 * @param codes         Final productCodes[] — defines the keyset exactly.
 * @param matrix        Final productMatrixConfig.
 * @param profileMap    Final productProfileMap.
 * @param existing      Current products map, read only for attribute preservation.
 */
export function buildProductsMap(
  codes: string[],
  matrix: Record<string, ProductConfig>,
  profileMap: Record<string, string>,
  existing: ProductsMap,
): ProductsMap {
  const products: ProductsMap = {};

  // Keyed strictly off productCodes[] — a code dropped from the registry
  // disappears from `products` too, and a stale matrix/profileMap entry for
  // an unregistered code is never resurrected into it.
  for (const code of codes) {
    products[code] = {
      attributes: existing[code]?.attributes ?? NULL_ATTRIBUTES,
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
