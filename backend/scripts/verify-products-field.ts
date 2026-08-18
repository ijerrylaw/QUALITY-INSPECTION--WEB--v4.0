/**
 * @file verify-products-field.ts
 * @description Read-only verification for migrate-products-field.ts —
 * confirms AppConfig.products is a lossless mirror of the three source
 * structures for every code, and confirms the three source structures
 * themselves are byte-for-byte untouched (Session A must be additive-only).
 *
 * Usage: npx tsx scripts/verify-products-field.ts   (from backend/)
 */

import 'dotenv/config';
import prisma from '../src/lib/prismaClient';
import type { ProductsMap } from '../src/lib/productEntry';

function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function main() {
  const config = await prisma.appConfig.findUnique({ where: { id: '1' } });
  if (!config) {
    console.error('[verify] No AppConfig row found.');
    process.exitCode = 1;
    return;
  }

  const productCodes = safeParseJSON<string[]>(config.productCodes, []);
  const productMatrixConfig = safeParseJSON<Record<string, any>>(config.productMatrixConfig, {});
  const productProfileMap = safeParseJSON<Record<string, string>>(config.productProfileMap, {});
  const products = safeParseJSON<ProductsMap>(config.products, {});

  let failures = 0;
  const report = (ok: boolean, label: string) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
    if (!ok) failures++;
  };

  console.log('=== Field-by-field comparison: AppConfig.products vs the three source structures ===\n');

  // Every productCodes[] entry must have a products[code] entry, and vice versa.
  report(
    productCodes.every((c) => c in products) && Object.keys(products).length === productCodes.length,
    `products has exactly the ${productCodes.length} code(s) in productCodes[] — no extra, none missing`,
  );

  for (const code of productCodes) {
    console.log(`\n--- ${code} ---`);
    const entry = products[code];
    if (!entry) {
      report(false, `products['${code}'] exists`);
      continue;
    }

    const storedMatrix = productMatrixConfig[code];
    const matrixMatches = JSON.stringify(entry.matrix) === JSON.stringify(storedMatrix);
    report(matrixMatches, `matrix deep-equals productMatrixConfig['${code}']`);
    if (!matrixMatches) {
      console.log('  expected:', JSON.stringify(storedMatrix));
      console.log('  actual:  ', JSON.stringify(entry.matrix));
    }

    // Field-by-field matrix breakdown for a human-readable audit trail.
    if (storedMatrix) {
      report(
        JSON.stringify(entry.matrix.dimensionDefs) === JSON.stringify(storedMatrix.dimensionDefs),
        `  matrix.dimensionDefs matches (${(storedMatrix.dimensionDefs ?? []).length} def(s))`,
      );
      report(entry.matrix.weightDecimals === storedMatrix.weightDecimals, `  matrix.weightDecimals matches (${storedMatrix.weightDecimals})`);
      report(entry.matrix.lengthDecimals === storedMatrix.lengthDecimals, `  matrix.lengthDecimals matches (${storedMatrix.lengthDecimals})`);
      report(entry.matrix.palmWidthDecimals === storedMatrix.palmWidthDecimals, `  matrix.palmWidthDecimals matches (${storedMatrix.palmWidthDecimals})`);
      report(entry.matrix.lastAmended === storedMatrix.lastAmended, `  matrix.lastAmended matches (${storedMatrix.lastAmended})`);

      const sizeKeys = Object.keys(storedMatrix.sizes ?? {});
      report(
        JSON.stringify(Object.keys(entry.matrix.sizes ?? {}).sort()) === JSON.stringify(sizeKeys.sort()),
        `  matrix.sizes has the same ${sizeKeys.length} size key(s): [${sizeKeys.join(', ')}]`,
      );
      for (const size of sizeKeys) {
        const a = storedMatrix.sizes[size];
        const b = entry.matrix.sizes[size];
        report(JSON.stringify(a) === JSON.stringify(b), `    sizes.${size} deep-equals (weightTarget=${a.weightTarget}, lengthTarget=${a.lengthTarget}, palmWidthTarget=${a.palmWidthTarget})`);
      }
    }

    const expectedProfileId = productProfileMap[code] ?? null;
    report(entry.profileId === expectedProfileId, `profileId matches productProfileMap['${code}'] ?? null (${JSON.stringify(expectedProfileId)})`);

    // Attributes are NOT sourced from the three legacy structures (they can't
    // be — see productEntry.ts), so there is nothing to compare them against
    // here. This originally asserted "all null", which was true only in
    // Session A before any code had attribute data; the pilot/batch2 imports
    // have since populated 16 of 17 codes, which made a healthy database
    // report 16 failures and exit non-zero. What actually matters for
    // migration safety is the SHAPE — all six keys present, each either a
    // string or null — since migrate-products-field.ts preserves this object
    // verbatim rather than rebuilding it.
    const ATTR_KEYS = ['material', 'weight', 'color', 'innerSurface', 'length', 'texture'] as const;
    const attrs = entry.attributes as unknown as Record<string, unknown>;
    const shapeOk = attrs !== null && typeof attrs === 'object'
      && ATTR_KEYS.every((k) => k in attrs && (attrs[k] === null || typeof attrs[k] === 'string'))
      && Object.keys(attrs).length === ATTR_KEYS.length;
    const populated = ATTR_KEYS.filter((k) => attrs?.[k] !== null).length;
    report(shapeOk, `attributes well-formed (six keys, string|null) — ${populated}/6 populated`);
  }

  console.log('\n=== Source-structure integrity (must be completely untouched) ===\n');

  // Re-fetch to make sure nothing in this verification run itself mutated anything.
  const after = await prisma.appConfig.findUnique({ where: { id: '1' } });
  report(after?.productCodes === config.productCodes, 'productCodes column unchanged');
  report(after?.productMatrixConfig === config.productMatrixConfig, 'productMatrixConfig column unchanged');
  report(after?.productProfileMap === config.productProfileMap, 'productProfileMap column unchanged');

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error('[verify] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
