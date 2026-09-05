/**
 * @file amendmentReason.ts
 * @description Hand-kept frontend MIRROR of backend/src/lib/amendmentReason.ts.
 *
 * The frontend cannot import from backend/ at build time (tsconfig.app.json is
 * `include: ["src"]`, no path aliases), so the closed reason vocabulary exists
 * twice. Drift is machine-enforced by `__tests__/amendmentReason.sync.test.ts`,
 * following the same pattern already established for `defaultProfileSeed.ts`
 * (AUDIT_REPORT.md #10) — a test can reach across the workspace boundary through
 * Vite even though application code cannot.
 *
 * Drift here is not cosmetic: the backend rejects an unrecognised `reasonCode`
 * with a 400, so a code added on this side alone would render in the dropdown
 * and then fail every submission that selected it.
 *
 * @see backend/src/lib/amendmentReason.ts — the canonical source.
 */

export const AMENDMENT_REASON_CODES = [
  'WRONG_INSPECTION_PROFILE',
  'RECOUNT_OR_MISCOUNTED_DEFECT',
  'DATA_ENTRY_CORRECTION',
  'OTHER',
] as const;

export type AmendmentReasonCode = (typeof AMENDMENT_REASON_CODES)[number];

export const AMENDMENT_REASON_LABELS: Record<AmendmentReasonCode, string> = {
  WRONG_INSPECTION_PROFILE: 'Wrong inspection profile',
  RECOUNT_OR_MISCOUNTED_DEFECT: 'Recount or miscounted defect',
  DATA_ENTRY_CORRECTION: 'Data entry correction',
  OTHER: 'Other',
};

export function isAmendmentReasonCode(value: unknown): value is AmendmentReasonCode {
  return typeof value === 'string' && (AMENDMENT_REASON_CODES as readonly string[]).includes(value);
}

/**
 * `OTHER` is the one code that carries no information on its own, so the free
 * note becomes the entire stated reason and is required alongside it. Every
 * other code stands by itself and the note stays optional.
 */
export function requiresSupervisorNote(code: AmendmentReasonCode | ''): boolean {
  return code === 'OTHER';
}
