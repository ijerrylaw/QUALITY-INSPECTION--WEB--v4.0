/**
 * @file lotNumber.ts
 * @description Shared "Full System Lot Number" composition logic, used by both
 * the Single Entry wizard (StepMetadata.tsx) and the Batch Entry grid
 * (BatchEntry.tsx) so the two can never drift into incompatible formats again.
 *
 * Formula (ISO2859_MATH_ENGINE.md §4): [Line] + [Side] + [YJJJ] + [Sequence]
 * — e.g. "A001Z6221007". The lot number is not invented by this app; it must
 * match what the company's ERP separately registers for the same physical
 * lot. This module lets the operator record the correct number (format +
 * uniqueness validated), not compute/guess it.
 */

import { API_BASE_URL } from '../context/ConfigContext';
import type { ShiftOption } from '../context/ConfigContext';

export interface ShiftResolution {
  effectiveDate: Date;
  activeShift: string;
  isNightRollover: boolean;
}

/**
 * Matches `timestamp` against `shifts` (AppConfig.shifts), handling midnight
 * rollover shifts (e.g. Night 20:00–08:00) and subtracting 1 day from the
 * effective production date when the timestamp falls in a rollover window —
 * ported verbatim from StepMetadata.tsx's original computedLot logic.
 */
export function resolveShiftAndEffectiveDate(
  timestamp: Date,
  shifts: ShiftOption[] | undefined,
): ShiftResolution {
  let currentShift = 'Off-Shift';
  let isNightRollover = false;

  if (shifts && shifts.length > 0) {
    const currentMinutes = timestamp.getHours() * 60 + timestamp.getMinutes();

    for (const shift of shifts) {
      const startMins = shift.startHour * 60 + shift.startMinute;
      const durationMins = Math.round((shift.durationHours || 8) * 60);
      const endMins = startMins + durationMins;

      let isMatch = false;
      if (endMins <= 1440) {
        isMatch = currentMinutes >= startMins && currentMinutes < endMins;
      } else {
        // Midnight rollover (e.g. Night shift 20:00–08:00)
        isMatch = currentMinutes >= startMins || currentMinutes < (endMins % 1440);
      }

      if (isMatch) {
        const startStr = `${String(shift.startHour).padStart(2, '0')}:${String(shift.startMinute).padStart(2, '0')}`;
        // Subtract 1 minute from end display per ISO2859_MATH_ENGINE.md §4
        const actualEndMins = (endMins - 1 + 1440) % 1440;
        const endHour = Math.floor(actualEndMins / 60);
        const endMinute = actualEndMins % 60;
        const endStr = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
        currentShift = `${shift.name} (${startStr} - ${endStr})`;

        if (endMins > 1440 && currentMinutes < (endMins % 1440)) {
          isNightRollover = true;
        }
        break;
      }
    }
  } else {
    // Fallback if no shifts configured
    const h = timestamp.getHours();
    isNightRollover = h >= 0 && h < 8;
    if (isNightRollover) currentShift = 'Night';
    else if (h >= 8 && h < 20) currentShift = 'Day';
    else currentShift = 'Night';
  }

  // Night rollover: subtract 1 day from effective production date
  const effectiveDate = new Date(timestamp);
  if (isNightRollover) effectiveDate.setDate(effectiveDate.getDate() - 1);

  return { effectiveDate, activeShift: currentShift, isNightRollover };
}

/** 4-char YJJJ: last digit of year + 3-digit Julian day of year, e.g. 2026 → 6 + 221 → "6221". */
export function composeYJJJ(effectiveDate: Date): string {
  const startOfYear = new Date(effectiveDate.getFullYear(), 0, 0);
  const diff = effectiveDate.getTime() - startOfYear.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const julian = dayOfYear.toString().padStart(3, '0');
  const yearDigit = effectiveDate.getFullYear().toString().slice(-1);
  return `${yearDigit}${julian}`;
}

/**
 * Full System Lot Number: [Line][Side][YJJJ][Sequence].
 *
 * A blank `sequenceNo` renders as a `---` placeholder segment, never a
 * fabricated number (AUDIT_REPORT.md #19) — `''.padStart(3, '0')` used to
 * evaluate to the truthy string `"000"`, so the previous `|| '001'` fallback
 * could never actually fire; blank sequence silently composed into a fake
 * `"000"`. This is purely a string/preview concern — callers remain
 * responsible for blocking submission on an actually-blank sequence (both
 * StepMetadata.tsx and BatchEntry.tsx already do).
 */
export function composeFullLotNumber(
  lineId: string,
  side: string,
  yjjj: string,
  sequenceNo: string,
): string {
  const safeLine = lineId || 'XXX';
  const safeSide = side || 'A';
  const safeSeq = sequenceNo ? sequenceNo.padStart(3, '0') : '---';
  return `${safeLine}${safeSide}${yjjj}${safeSeq}`;
}

interface SequenceHintResponse {
  suggestedNext: number | null;
  suggestedTotalCarton: number | null;
}

async function fetchSequenceHint(
  lineId: string,
  side: string,
  yjjj: string,
): Promise<SequenceHintResponse> {
  if (!lineId || !side || !yjjj) return { suggestedNext: null, suggestedTotalCarton: null };
  try {
    const params = new URLSearchParams({ lineId, side, yjjj });
    const response = await fetch(`${API_BASE_URL}/api/submissions/sequence-hint?${params.toString()}`);
    if (!response.ok) return { suggestedNext: null, suggestedTotalCarton: null };
    const data = (await response.json()) as SequenceHintResponse;
    return { suggestedNext: data.suggestedNext ?? null, suggestedTotalCarton: data.suggestedTotalCarton ?? null };
  } catch {
    return { suggestedNext: null, suggestedTotalCarton: null };
  }
}

/**
 * Non-binding advisory: the suggested next sequence number (max existing + 1)
 * already recorded for this Line+Side+YJJJ group. Returns null if the group
 * has no prior records, or if the request fails (advisory only — never blocks
 * the form).
 */
export async function fetchSuggestedNextSequence(
  lineId: string,
  side: string,
  yjjj: string,
): Promise<number | null> {
  const { suggestedNext } = await fetchSequenceHint(lineId, side, yjjj);
  return suggestedNext;
}

/**
 * Pre-fill default (not advisory-only, unlike fetchSuggestedNextSequence):
 * the Total Carton value from the most recent prior submission sharing this
 * Line+Side+YJJJ prefix — same group-matching query as the sequence hint,
 * reused here so both suggestions can never drift apart. Returns null if the
 * group has no prior records (first lot for this line/date/side), or if the
 * request fails — callers should leave the field blank in that case, same as
 * the sequence-number suggestion's "no hint available" behavior.
 */
export async function fetchSuggestedTotalCarton(
  lineId: string,
  side: string,
  yjjj: string,
): Promise<number | null> {
  const { suggestedTotalCarton } = await fetchSequenceHint(lineId, side, yjjj);
  return suggestedTotalCarton;
}
