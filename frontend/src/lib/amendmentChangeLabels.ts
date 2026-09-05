/**
 * @file amendmentChangeLabels.ts
 * @description Turns a backend `AmendmentChange` into the text the wizard's
 * acknowledgment checklist shows the operator.
 *
 * The backend's `path` values are a wire contract, deliberately terse and
 * id-based (`defects.def_thin_weak_spot`, `dimensions.cuffThickness`) because
 * they have to round-trip unchanged. Nobody can meaningfully confirm
 * "defects.def_thin_weak_spot: 0 -> 1", so this module resolves each path
 * against the same config-scoped label sources the approver's diff viewer
 * already uses (`amendmentDiffLabels.ts`) — one vocabulary across both screens,
 * so a change reads the same to the person making it and the person approving it.
 *
 * Deliberately NOT a second diff: it never decides WHAT changed, only how to
 * name a change the server already found.
 */

import type { AppConfig } from '../context/ConfigContext';
import {
  SUBMISSION_FIELD_LABELS,
  buildDimensionLabelMap,
  resolveCrossProfileDefectContext,
  resolveProfileDisplayValue,
} from './amendmentDiffLabels';

/** Mirrors `AmendmentChange` in backend/src/lib/amendmentDiff.ts. */
export interface AmendmentChange {
  path: string;
  changeType: 'modified' | 'added' | 'removed';
  from: unknown;
  to: unknown;
}

export interface AmendmentChangeDisplay {
  /** Stable acknowledgment key — echoed back verbatim as `acknowledgedChanges`. */
  path: string;
  /** Which group this belongs to, for the checklist's section headers. */
  kind: 'profile' | 'defect' | 'dimension' | 'verdict' | 'field';
  /** e.g. "Inspection Profile", "Defect Count — Thin/Weak Spot". */
  label: string;
  /** Rendered old value, already humanized. */
  from: string;
  /** Rendered new value, already humanized. */
  to: string;
}

const EMPTY = '—';

/** Renders a diff-side value as a short single line — arrays inline, objects compact. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export interface BuildChangeDisplaysParams {
  changes: readonly AmendmentChange[];
  config: AppConfig | null;
  /** The submission's product code — scopes dimension labels. */
  productCode: string | null | undefined;
  /** Profile the record carried BEFORE this amendment. */
  beforeProfileId: string | null | undefined;
  /** Profile the amendment proposes. */
  afterProfileId: string | null | undefined;
}

/**
 * Resolves every change to display text.
 *
 * Defect labels come from the CROSS-profile context, not one side's: a
 * profile-switch amendment can move a defect into a category the other profile
 * doesn't define, and resolving against a single profile would fall back to the
 * raw `def_*` id for exactly the defects most worth reading (the same gap
 * AUDIT_REPORT.md #42 found in the approver's viewer).
 */
export function buildAmendmentChangeDisplays({
  changes,
  config,
  productCode,
  beforeProfileId,
  afterProfileId,
}: BuildChangeDisplaysParams): AmendmentChangeDisplay[] {
  const defectContext = resolveCrossProfileDefectContext(config, beforeProfileId, afterProfileId);
  const dimensionLabels = buildDimensionLabelMap(config, productCode);

  return changes.map((change): AmendmentChangeDisplay => {
    const { path } = change;

    if (path.startsWith('defects.')) {
      const defectId = path.slice('defects.'.length);
      return {
        path,
        kind: 'defect',
        label: `Defect Count — ${defectContext.labels[defectId] ?? defectId}`,
        from: formatValue(change.from),
        to: formatValue(change.to),
      };
    }

    if (path.startsWith('dimensions.')) {
      const dimId = path.slice('dimensions.'.length);
      return {
        path,
        kind: 'dimension',
        label: `Dimension — ${dimensionLabels[dimId] ?? dimId}`,
        from: formatValue(change.from),
        to: formatValue(change.to),
      };
    }

    if (path === 'profileId') {
      return {
        path,
        kind: 'profile',
        label: SUBMISSION_FIELD_LABELS['profileId'] ?? 'Inspection Profile',
        from: resolveProfileDisplayValue(config, change.from).label,
        to: resolveProfileDisplayValue(config, change.to).label,
      };
    }

    if (path === 'verdict') {
      return {
        path,
        kind: 'verdict',
        label: SUBMISSION_FIELD_LABELS['verdict'] ?? 'Verdict',
        from: formatValue(change.from),
        to: formatValue(change.to),
      };
    }

    return {
      path,
      kind: 'field',
      label: SUBMISSION_FIELD_LABELS[path] ?? path,
      from: formatValue(change.from),
      to: formatValue(change.to),
    };
  });
}

/**
 * Ordering for the checklist: the changes most likely to be unintended first.
 *
 * `verdict` leads because it is the consequence, then the profile switch that
 * usually causes it, then the per-item defect and dimension edits. Within a
 * group, alphabetical by label so the list is stable between renders.
 */
const KIND_ORDER: Record<AmendmentChangeDisplay['kind'], number> = {
  verdict: 0,
  profile: 1,
  field: 2,
  defect: 3,
  dimension: 4,
};

export function sortChangeDisplays(
  displays: readonly AmendmentChangeDisplay[],
): AmendmentChangeDisplay[] {
  return [...displays].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.label.localeCompare(b.label),
  );
}
