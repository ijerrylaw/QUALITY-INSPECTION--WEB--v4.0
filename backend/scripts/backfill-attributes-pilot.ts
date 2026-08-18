/**
 * @file backfill-attributes-pilot.ts
 * @description One-off: populates AppConfig.products[code].attributes for
 * the two codes in the PRODUCT_REGISTRATION_rev01.xlsx pilot import
 * (N035MBK-OC-24FT, N035WHT-OC-24FT), derived from the Excel's six SKU
 * attribute columns. Separate from migrate-products-field.ts on purpose —
 * that script only ever knows how to mirror the three old structures
 * (which have no attribute data at all); this script is the "future pilot-
 * import session" its own comments anticipated, supplying attributes it
 * could never derive on its own. Only touches `attributes` on the two
 * named entries — matrix/profileId (already refreshed by
 * migrate-products-field.ts) and every other product code are untouched.
 *
 * Usage: npx tsx scripts/backfill-attributes-pilot.ts   (from backend/)
 */

import 'dotenv/config';
import prisma from '../src/lib/prismaClient';
import type { ProductAttributes, ProductsMap } from '../src/lib/productEntry';

function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Derived from PRODUCT_REGISTRATION_rev01.xlsx sheets 'N035MBK' and
// 'N035WHT', row 4 (B4=Material, C4=Weight, D4=Color, E4=Inner Surface,
// F4=Length, G4=Texture). Both share every attribute except Color.
const PILOT_ATTRIBUTES: Record<string, ProductAttributes> = {
  'N035MBK-OC-24FT': { material: 'N', weight: '035', color: 'MBK', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N035WHT-OC-24FT': { material: 'N', weight: '035', color: 'WHT', innerSurface: 'OC', length: '24', texture: 'FT' },
};

async function main() {
  const config = await prisma.appConfig.findUnique({ where: { id: '1' } });
  if (!config) {
    console.error('[backfill-attributes-pilot] No AppConfig row found.');
    return;
  }

  const products = safeParseJSON<ProductsMap>(config.products, {});

  for (const [code, attributes] of Object.entries(PILOT_ATTRIBUTES)) {
    const entry = products[code];
    if (!entry) {
      console.error(`[backfill-attributes-pilot] '${code}' not found in AppConfig.products — run migrate-products-field.ts first.`);
      process.exitCode = 1;
      continue;
    }
    products[code] = { ...entry, attributes };
    console.log(`[backfill-attributes-pilot] Set attributes for '${code}':`, attributes);
  }

  if (process.exitCode === 1) return;

  await prisma.appConfig.update({
    where: { id: '1' },
    data: { products: JSON.stringify(products) },
  });
  console.log('[backfill-attributes-pilot] Done.');
}

main()
  .catch((err) => {
    console.error('[backfill-attributes-pilot] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
