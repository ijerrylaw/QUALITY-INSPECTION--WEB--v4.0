/**
 * @file fieldDiff.tsx
 * @description Shared "was this field changed from the original record"
 * comparator + inline display note for amendment mode, used by every wizard
 * step (StepMetadata, StepDimensions, StepDefects) instead of each
 * hand-copying its own presence/comparison logic.
 *
 * Sparse maps (per-defect counts, per-defect qualitative states) omit a key
 * entirely when the operator never touched it during the original entry —
 * that omission means "the original value was the map's implicit default"
 * (0 for counts, 'NIL' for qualitative), NOT "no original data available."
 * Conflating the two was the bug this module fixes: callers must resolve
 * their own map's implicit default into `originalValue` themselves (they're
 * the ones who know what "absent" means for their field), and pass whether
 * original data exists for the record at all separately as `hasOriginal` —
 * this module never infers "no data" from a value being falsy/undefined.
 */

export function hasFieldChanged(
  hasOriginal: boolean,
  originalValue: unknown,
  currentValue: unknown,
): boolean {
  if (!hasOriginal) return false;

  const origStr = String(originalValue ?? '');
  const currStr = String(currentValue ?? '');

  // Numeric fields (Glove Weight, Total Carton, Sample Size, Sequence No,
  // dimension measurements, defect counts, ...) are frequently stored as a
  // raw unformatted number on the original record but displayed with fixed
  // decimal places or zero-padding in the live form (e.g. 2.9 vs "2.90", or
  // 5 vs "05") — a plain string comparison flags that formatting difference
  // as a real edit even when nothing changed. Compare numerically whenever
  // BOTH sides parse as finite numbers; fall back to exact string comparison
  // otherwise (text/enum fields, or either side genuinely empty — Number('')
  // is 0, which would wrongly treat a cleared field as unchanged from a
  // stored 0 if this guard didn't require both sides non-empty first).
  if (origStr !== '' && currStr !== '') {
    const origNum = Number(origStr);
    const currNum = Number(currStr);
    if (Number.isFinite(origNum) && Number.isFinite(currNum)) {
      return origNum !== currNum;
    }
  }

  return origStr !== currStr;
}

export interface OriginalValueNoteProps {
  hasOriginal: boolean;
  originalValue: unknown;
  currentValue: unknown;
  label?: string;
  emptyDisplay?: string;
  className?: string;
}

/** Inline "Original: X" note — renders nothing when the field is unchanged or no original data is available. */
export function OriginalValueNote({
  hasOriginal,
  originalValue,
  currentValue,
  label = 'Original',
  emptyDisplay = '—',
  className = 'text-[10px] text-muted font-mono mt-1',
}: OriginalValueNoteProps) {
  if (!hasFieldChanged(hasOriginal, originalValue, currentValue)) return null;
  return (
    <div className={className}>
      {label}: {(originalValue as string | number | undefined | null) || emptyDisplay}
    </div>
  );
}
