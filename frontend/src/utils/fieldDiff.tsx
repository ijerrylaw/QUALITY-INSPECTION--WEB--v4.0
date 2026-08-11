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
  return String(originalValue) !== String(currentValue);
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
