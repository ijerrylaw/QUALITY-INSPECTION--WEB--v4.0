/**
 * @file migrate-products-field.ts
 * @description One-off (but safely re-runnable) migration: populates
 * AppConfig.products from the three existing structures — productCodes[],
 * productMatrixConfig, productProfileMap — for every product code currently
 * present. Session A of the productCodes/productMatrixConfig/
 * productProfileMap three-way-drift fix (see backend/src/lib/productEntry.ts).
 *
 * ADDITIVE ONLY: reads the three existing structures, writes only the new
 * `products` field. Never touches productCodes/productMatrixConfig/
 * productProfileMap. Nothing in the running app reads `products` yet.
 *
 * Re-runnable safely: rebuilds `matrix` and `profileId` from the current
 * source-of-truth structures every run (so it stays a faithful mirror if a
 * code is edited via the old UI in between runs), but PRESERVES any
 * `attributes` already recorded on an existing entry rather than resetting
 * them to null — the old three structures can never supply attribute data
 * (see productEntry.ts), so blindly rebuilding attributes from them would
 * silently wipe out whatever a future pilot-import session writes there
 * directly. Run again any time productCodes[] gains new codes.
 *
 * Usage: npx tsx scripts/migrate-products-field.ts   (from backend/)
 */

import 'dotenv/config';
import prisma from '../src/lib/prismaClient';
import type { ProductEntry, ProductAttributes, ProductConfig, ProductsMap } from '../src/lib/productEntry';

function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const EMPTY_MATRIX: ProductConfig = { dimensionDefs: [], sizes: {} };
const NULL_ATTRIBUTES: ProductAttributes = {
  material: null,
  weight: null,
  color: null,
  innerSurface: null,
  length: null,
  texture: null,
};

async function main() {
  const config = await prisma.appConfig.findUnique({ where: { id: '1' } });
  if (!config) {
    console.error('[migrate-products-field] No AppConfig row found — nothing to migrate.');
    return;
  }

  const productCodes = safeParseJSON<string[]>(config.productCodes, []);
  const productMatrixConfig = safeParseJSON<Record<string, ProductConfig>>(config.productMatrixConfig, {});
  const productProfileMap = safeParseJSON<Record<string, string>>(config.productProfileMap, {});
  const existingProducts = safeParseJSON<ProductsMap>(config.products, {});

  console.log(`[migrate-products-field] Found ${productCodes.length} product code(s) in productCodes[]:`, productCodes);

  const products: ProductsMap = {};
  let missingMatrixCount = 0;

  for (const code of productCodes) {
    const matrix = productMatrixConfig[code];
    if (!matrix) {
      missingMatrixCount++;
      console.warn(`[migrate-products-field] '${code}' has no productMatrixConfig entry — using empty default, not fabricated data.`);
    }

    const profileId = productProfileMap[code] ?? null;

    // Preserve any attributes a later (pilot-import) write already set for
    // this code — this script only ever supplies null attributes itself,
    // since the old three structures have no attribute data to migrate.
    const preservedAttributes = existingProducts[code]?.attributes ?? NULL_ATTRIBUTES;

    const entry: ProductEntry = {
      attributes: preservedAttributes,
      matrix: matrix ?? EMPTY_MATRIX,
      profileId,
    };

    products[code] = entry;
  }

  await prisma.appConfig.update({
    where: { id: '1' },
    data: { products: JSON.stringify(products) },
  });

  console.log(`[migrate-products-field] Migrated ${productCodes.length} code(s) into AppConfig.products.`);
  if (missingMatrixCount > 0) {
    console.warn(`[migrate-products-field] ${missingMatrixCount} code(s) had no productMatrixConfig entry — check output above.`);
  }
}

main()
  .catch((err) => {
    console.error('[migrate-products-field] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
