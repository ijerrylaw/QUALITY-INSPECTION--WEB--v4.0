/**
 * @file backfill-must-change-pin.ts
 * @description One-off: PinUser.mustChangePin was added with `@default(true)`
 * (schema.prisma), which `prisma db push` applies to every EXISTING row, not
 * just new ones — SQLite's `ADD COLUMN ... DEFAULT true` backfills the
 * default into every already-present row. Left alone, every current staff
 * member would be forced through SetPinPage.tsx on their next login for a
 * PIN they already own and picked (or that's simply been their working PIN
 * for a while) — exactly what the identity-first login redesign's
 * mustChangePin gate is NOT meant to do to existing accounts (it's meant to
 * force a change only for ADMIN/MANAGER-issued temp PINs, at creation or
 * reset). This script flips every row that predates the reset/create-with-
 * mustChangePin logic back to `false`, run once, immediately after
 * `prisma db push` + `prisma generate` and BEFORE any login logic reads the
 * column in production use.
 *
 * Safe to re-run (idempotent — a no-op once every row is already false); NOT
 * safe to run again after ANY new account creation or PIN reset has
 * happened, since it would wipe out a legitimate pending mustChangePin=true
 * for a real temp PIN. This is a one-time migration step, not a maintenance
 * script — kept in the repo after running (like backfill-attributes-
 * batch2.ts/backfill-attributes-pilot.ts above it in this folder) as a
 * historical record of the migration, and in case a fresh install's `db
 * push` ever needs the same one-time correction run again for its own
 * existing rows before the mustChangePin gate goes live for them.
 *
 * Usage: npx tsx scripts/backfill-must-change-pin.ts   (from backend/)
 */

import 'dotenv/config';
import prisma from '../src/lib/prismaClient';

async function main() {
  const result = await prisma.pinUser.updateMany({
    data: { mustChangePin: false },
  });
  console.log(`[backfill-must-change-pin] Set mustChangePin: false on ${result.count} existing PinUser row(s).`);
}

main()
  .catch((err) => {
    console.error('[backfill-must-change-pin] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
