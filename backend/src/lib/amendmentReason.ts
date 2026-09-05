/**
 * @file amendmentReason.ts
 * @description Closed vocabulary for an amendment's accountability reason.
 *
 * Replaces the free-text `reason` string that `POST /api/submissions/:id/amendments`
 * accepted, which had no structural relationship to what the amendment actually
 * changed — an operator could state "wrong inspection profile" while the same
 * amendment silently altered defect counts (observed on lot A001A6247003).
 *
 * ── This is an AUDIT field, NOT a verification input ────────────────────────
 * Nothing in this codebase compares the reason code against the computed diff,
 * and nothing should. Verification is `amendmentDiff.ts`'s acknowledged-changes
 * gate, which is a deliberately separate concern: the gate proves the requester
 * SAW every change; the reason code records WHY they made it. Conflating the two
 * would mean inventing a mapping from reason → expected-field-set, which is both
 * unmaintainable and wrong (a "Data entry correction" can legitimately touch any
 * field).
 *
 * ── Field split ─────────────────────────────────────────────────────────────
 * `AmendmentLog.reasonCode`     — one of the codes below (the dropdown value).
 * `AmendmentLog.supervisorNote` — the optional free note that accompanies it.
 *
 * `supervisorNote` keeps its original name and its original meaning: prose. It
 * was carrying double duty as both the category and the note; this module takes
 * over the category half only.
 */

/**
 * The four selectable reason codes. Stored verbatim as
 * `AmendmentLog.reasonCode`.
 *
 * `OTHER` exists so the vocabulary can stay closed without blocking a genuine
 * edge case — it is the one code for which the accompanying free note carries
 * the real information.
 */
export const AMENDMENT_REASON_CODES = [
  'WRONG_INSPECTION_PROFILE',
  'RECOUNT_OR_MISCOUNTED_DEFECT',
  'DATA_ENTRY_CORRECTION',
  'OTHER',
] as const;

export type AmendmentReasonCode = (typeof AMENDMENT_REASON_CODES)[number];

/**
 * Human-readable labels — the exact dropdown text. Declared here rather than in
 * the (not-yet-built) frontend so the wire value and its label can never drift:
 * `GET`-side consumers and the admin UI both read this one table.
 */
export const AMENDMENT_REASON_LABELS: Record<AmendmentReasonCode, string> = {
  WRONG_INSPECTION_PROFILE: 'Wrong inspection profile',
  RECOUNT_OR_MISCOUNTED_DEFECT: 'Recount or miscounted defect',
  DATA_ENTRY_CORRECTION: 'Data entry correction',
  OTHER: 'Other',
};

export function isAmendmentReasonCode(value: unknown): value is AmendmentReasonCode {
  return typeof value === 'string' && (AMENDMENT_REASON_CODES as readonly string[]).includes(value);
}
