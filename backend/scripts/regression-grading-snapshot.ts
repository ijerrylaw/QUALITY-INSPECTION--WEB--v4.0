/**
 * @file regression-grading-snapshot.ts
 * @description Captures the COMPLETE graded output of resolveVerdict() for every
 * stored submission and amendment, so an engine change can be proven
 * byte-for-byte non-behavioural.
 *
 * Built for the Stage 2 Master Defect List cutover (rewiring the engine from
 * AppConfig.inspectionProfiles JSON onto the Category/Defect/ProfileCategory/
 * ProfileCategoryDefect tables), where the whole safety requirement is "grading
 * output must not change". Kept in the repo afterwards because the same
 * before/after proof is worth having for any future engine work.
 *
 * ── What it captures ────────────────────────────────────────────────────────
 * Everything resolveVerdict() returns, for three families of case:
 *
 *   submission:<id>       every Submission, replayed with its own stored inputs
 *   medline:<id>          every Submission's defect counts replayed against the
 *                         MEDLINE profile — synthetic coverage for a profile
 *                         that has zero real submissions, exercising its 3-tier
 *                         VISUAL ladder, its different AQL levels, and its
 *                         BARRIER-vs-RECORD-ONLY placement of def_sagging
 *   amendment:<id>        every AmendmentLog carrying a defects payload,
 *                         replayed EXACTLY as POST /api/amendments/:id/approve
 *                         builds its resolveVerdict() call — the site where a
 *                         defect-key miss would silently flip a stored verdict
 *
 * Thrown errors are recorded as values (name + message) rather than aborting,
 * so "this case threw before and throws identically after" is itself a
 * comparable result.
 *
 * ── Determinism ─────────────────────────────────────────────────────────────
 * resolveVerdict()'s output contains no timestamps, ids-by-insertion, or
 * iteration-order-dependent values, so two runs over the same database produce
 * identical JSON. Point both runs at the SAME frozen database copy (see below)
 * so a concurrent dev-server write cannot pollute the comparison.
 *
 * Usage (from backend/):
 *   # freeze a copy, then capture BEFORE the engine change
 *   DATABASE_URL="file:/abs/path/frozen.db" npx tsx scripts/regression-grading-snapshot.ts --out before.json
 *
 *   # ...make the engine change, then capture AFTER against the SAME copy
 *   DATABASE_URL="file:/abs/path/frozen.db" npx tsx scripts/regression-grading-snapshot.ts --out after.json
 *
 *   # diff them — exit code 1 and a per-field report on any mismatch
 *   npx tsx scripts/regression-grading-snapshot.ts --compare before.json after.json
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import prisma from '../src/lib/prismaClient';
import { resolveVerdict } from '../src/engine/resolveVerdict';

const LOG = '[regression-grading-snapshot]';

/** MEDLINE's profile id — synthetic-coverage target, has no real submissions. */
const MEDLINE_PROFILE_ID = 'prof_1787197871523';

type CaseResult = Record<string, unknown>;

function parseJSONObjectField<T>(value: unknown): Record<string, T> {
  if (value == null) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, T>; } catch { return {}; }
  }
  return value as Record<string, T>;
}

/**
 * Runs one case and normalises the outcome into a comparable plain object.
 * An error becomes a value, not a crash — see the file header.
 */
async function runCase(fn: () => Promise<unknown>): Promise<CaseResult> {
  try {
    const r = (await fn()) as Record<string, unknown>;
    return {
      ok: true,
      verdict: r['verdict'],
      evaluationProfileId: r['evaluationProfileId'],
      evaluationProfileName: r['evaluationProfileName'],
      requestedProfileId: r['requestedProfileId'],
      failedDimensions: r['failedDimensions'],
      categoryResults: r['categoryResults'],
      categoryAnalysis: r['categoryAnalysis'],
      dimensionResults: r['dimensionResults'],
    };
  } catch (err) {
    return {
      ok: false,
      errorName: err instanceof Error ? err.name : 'Unknown',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

async function capture(outPath: string) {
  const results: Record<string, CaseResult> = {};

  const submissions = await prisma.submission.findMany({ orderBy: { id: 'asc' } });
  console.log(`${LOG} Replaying ${submissions.length} submission(s)...`);

  for (const s of submissions) {
    // Mirrors POST /api/submissions' own resolveVerdict() call shape.
    const base = {
      productCode: s.productCode,
      sampleSize: s.sampleSize,
      defectCounts: parseJSONObjectField<number>(s.defects),
      size: s.size,
      dimensionMeasurements: parseJSONObjectField<string[]>(s.dimensions),
      gloveWeight: s.gloveWeight ?? undefined,
      onUnresolvedProfile: 'fallback' as const,
    };

    results[`submission:${s.id}`] = await runCase(() =>
      resolveVerdict({ ...base, profileId: s.profileId }));

    // Synthetic MEDLINE coverage — same counts, other profile's rules.
    results[`medline:${s.id}`] = await runCase(() =>
      resolveVerdict({ ...base, profileId: MEDLINE_PROFILE_ID }));
  }

  // Amendment approve path — built exactly as the route builds it, including
  // the `newValues[x] ?? existingSubmission.x` fallback for every field.
  const amendments = await prisma.amendmentLog.findMany({ orderBy: { id: 'asc' } });
  const byId = new Map(submissions.map((s) => [s.id, s]));
  let replayed = 0;

  for (const a of amendments) {
    const existing = byId.get(a.submissionId);
    if (!existing) continue;
    let newValues: Record<string, unknown>;
    try { newValues = JSON.parse(a.newValues) as Record<string, unknown>; } catch { continue; }
    replayed++;

    results[`amendment:${a.id}`] = await runCase(() => resolveVerdict({
      profileId: (newValues['profileId'] as string | undefined) ?? existing.profileId,
      productCode: String(newValues['productCode'] ?? existing.productCode),
      sampleSize: Number(newValues['sampleSize'] ?? existing.sampleSize),
      defectCounts: parseJSONObjectField<number>(newValues['defects'] ?? existing.defects),
      size: String(newValues['size'] ?? existing.size),
      dimensionMeasurements: parseJSONObjectField<string[]>(newValues['dimensions'] ?? existing.dimensions),
      gloveWeight: (() => {
        const v = newValues['gloveWeight'] ?? existing.gloveWeight;
        return v != null ? Number(v) : undefined;
      })(),
    }));
  }
  console.log(`${LOG} Replayed ${replayed} amendment approve-path case(s).`);

  writeFileSync(outPath, JSON.stringify(results, null, 1), 'utf8');
  const cases = Object.keys(results);
  console.log(`${LOG} Wrote ${cases.length} case(s) to ${outPath}`);
  console.log(`${LOG}   submissions: ${cases.filter((k) => k.startsWith('submission:')).length}`);
  console.log(`${LOG}   medline    : ${cases.filter((k) => k.startsWith('medline:')).length}`);
  console.log(`${LOG}   amendments : ${cases.filter((k) => k.startsWith('amendment:')).length}`);
  const failed = cases.filter((k) => results[k]!['ok'] === false);
  if (failed.length) {
    console.log(`${LOG}   (${failed.length} case(s) recorded a thrown error — that is a comparable value, not a failure)`);
  }
}

/**
 * Deep structural diff producing dotted paths, so a mismatch names the exact
 * field (e.g. `categoryAnalysis[2].defectItems[4].failing`) rather than
 * dumping two large objects.
 */
function diff(a: unknown, b: unknown, path: string, out: string[]) {
  if (a === b) return;
  if (a === null || b === null || a === undefined || b === undefined || typeof a !== typeof b) {
    out.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}.length: ${a.length} -> ${b.length}`);
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff(a[i], b[i], `${path}[${i}]`, out);
    return;
  }
  if (typeof a === 'object') {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of keys) {
      diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
    }
    return;
  }
  out.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
}

function compare(beforePath: string, afterPath: string) {
  const before = JSON.parse(readFileSync(beforePath, 'utf8')) as Record<string, CaseResult>;
  const after = JSON.parse(readFileSync(afterPath, 'utf8')) as Record<string, CaseResult>;

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const mismatched: { key: string; diffs: string[] }[] = [];

  for (const k of keys) {
    if (!(k in before)) { mismatched.push({ key: k, diffs: ['<missing in BEFORE>'] }); continue; }
    if (!(k in after)) { mismatched.push({ key: k, diffs: ['<missing in AFTER>'] }); continue; }
    const diffs: string[] = [];
    diff(before[k], after[k], '', diffs);
    if (diffs.length) mismatched.push({ key: k, diffs });
  }

  console.log(`\n${LOG} REGRESSION COMPARISON`);
  console.log(`${LOG}   before: ${beforePath} (${Object.keys(before).length} cases)`);
  console.log(`${LOG}   after : ${afterPath} (${Object.keys(after).length} cases)`);
  console.log(`${LOG}   compared: ${keys.length} case(s)`);

  // Per-family breakdown, so "27 submissions matched" is visible rather than implied.
  for (const family of ['submission', 'medline', 'amendment']) {
    const fam = keys.filter((k) => k.startsWith(`${family}:`));
    const bad = mismatched.filter((m) => m.key.startsWith(`${family}:`)).length;
    console.log(`${LOG}     ${family.padEnd(11)} ${fam.length - bad}/${fam.length} identical`);
  }

  if (mismatched.length === 0) {
    console.log(`\n${LOG} ✓ ALL ${keys.length} CASES BYTE-IDENTICAL — engine change is non-behavioural.`);
    return;
  }

  console.error(`\n${LOG} ✗ ${mismatched.length} CASE(S) DIFFER:\n`);
  for (const m of mismatched) {
    console.error(`  ${m.key}`);
    for (const d of m.diffs.slice(0, 25)) console.error(`      ${d}`);
    if (m.diffs.length > 25) console.error(`      ...and ${m.diffs.length - 25} more`);
  }
  process.exitCode = 1;
}

async function main() {
  const args = process.argv.slice(2);
  const compareIdx = args.indexOf('--compare');
  if (compareIdx >= 0) {
    const [b, a] = [args[compareIdx + 1], args[compareIdx + 2]];
    if (!b || !a) throw new Error('--compare requires two file paths: <before.json> <after.json>');
    compare(b, a);
    return;
  }
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : undefined;
  if (!out) throw new Error('Specify --out <file.json> to capture, or --compare <before> <after> to diff.');
  await capture(out);
}

main()
  .catch((err) => {
    console.error(`${LOG} Failed:`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
