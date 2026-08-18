/**
 * @file backfill-attributes-batch2.ts
 * @description One-off: populates AppConfig.products[code].attributes for
 * the 14 remaining codes imported from PRODUCT_REGISTRATION_rev01.xlsx
 * (the pilot session already handled N035MBK-OC-24FT and N035WHT-OC-24FT
 * via backfill-attributes-pilot.ts). Same pattern as that script — see its
 * header comment for why this is separate from migrate-products-field.ts.
 *
 * Usage: npx tsx scripts/backfill-attributes-batch2.ts   (from backend/)
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

// Derived from PRODUCT_REGISTRATION_rev01.xlsx, row 4 of each sheet
// (B4=Material, C4=Weight, D4=Color, E4=Inner Surface, F4=Length,
// G4=Texture). All 14 share Material=N, Inner Surface=OC, Length=24,
// Texture=FT — only Weight and Color vary per sheet.
const BATCH2_ATTRIBUTES: Record<string, ProductAttributes> = {
  'N025SKB-OC-24FT': { material: 'N', weight: '025', color: 'SKB', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N030MBK-OC-24FT': { material: 'N', weight: '030', color: 'MBK', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N030MNV-OC-24FT': { material: 'N', weight: '030', color: 'MNV', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N030SKB-OC-24FT': { material: 'N', weight: '030', color: 'SKB', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N030WHT-OC-24FT': { material: 'N', weight: '030', color: 'WHT', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N035BLK-OC-24FT': { material: 'N', weight: '035', color: 'BLK', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N035SKB-OC-24FT': { material: 'N', weight: '035', color: 'SKB', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N035SLK-OC-24FT': { material: 'N', weight: '035', color: 'SLK', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N037SKB-OC-24FT': { material: 'N', weight: '037', color: 'SKB', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N050BLK-OC-24FT': { material: 'N', weight: '050', color: 'BLK', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N050MNV-OC-24FT': { material: 'N', weight: '050', color: 'MNV', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N050RYB-OC-24FT': { material: 'N', weight: '050', color: 'RYB', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N055SKB-OC-24FT': { material: 'N', weight: '055', color: 'SKB', innerSurface: 'OC', length: '24', texture: 'FT' },
  'N055VLT-OC-24FT': { material: 'N', weight: '055', color: 'VLT', innerSurface: 'OC', length: '24', texture: 'FT' },
};

async function main() {
  const config = await prisma.appConfig.findUnique({ where: { id: '1' } });
  if (!config) {
    console.error('[backfill-attributes-batch2] No AppConfig row found.');
    return;
  }

  const products = safeParseJSON<ProductsMap>(config.products, {});

  let hadError = false;
  for (const [code, attributes] of Object.entries(BATCH2_ATTRIBUTES)) {
    const entry = products[code];
    if (!entry) {
      console.error(`[backfill-attributes-batch2] '${code}' not found in AppConfig.products — run migrate-products-field.ts first.`);
      hadError = true;
      continue;
    }
    products[code] = { ...entry, attributes };
    console.log(`[backfill-attributes-batch2] Set attributes for '${code}':`, attributes);
  }

  if (hadError) {
    process.exitCode = 1;
    return;
  }

  await prisma.appConfig.update({
    where: { id: '1' },
    data: { products: JSON.stringify(products) },
  });
  console.log(`[backfill-attributes-batch2] Done — ${Object.keys(BATCH2_ATTRIBUTES).length} code(s) updated.`);
}

main()
  .catch((err) => {
    console.error('[backfill-attributes-batch2] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
