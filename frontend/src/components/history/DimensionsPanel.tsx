/**
 * @file DimensionsPanel.tsx
 * @description "Dimensions" table section of the record detail panel
 * (HistoryFeed.tsx's "INSPECTION RESULTS" panel, alongside
 * AqlCategoryAnalysisPanel.tsx) — physical dimension + Glove Weight
 * compliance for a submission, one row per measured field.
 *
 * Pure presentational component, same convention as AqlCategoryAnalysisPanel.tsx:
 * fed already-resolved rows, no fetching or config lookup of its own. Row
 * assembly (name/unit resolution against the current product config, parsing
 * Submission.dimensionMins/gloveWeightSnapshot/dimensions) happens in
 * HistoryFeed.tsx's DefectBreakdownPanel, which already has both `sub` and
 * `config` in scope.
 *
 * DATA PROVENANCE (see buildDimensionRows() in HistoryFeed.tsx for the full
 * story):
 *   - measured/spec/compliance for every row EXCEPT Glove Weight come from
 *     `Submission.dimensionMins` — frozen once at submit time, same
 *     never-recompute guarantee as gradingSnapshot.
 *   - Glove Weight comes from `Submission.gloveWeightSnapshot` — also frozen,
 *     added specifically to close a gap dimensionMins never covered (Weight
 *     is a scalar, never part of the client's 5-slot stats object). Null on
 *     rows predating this field; that row then renders with NO compliance
 *     judgment rather than a false COMPLIANT.
 *   - The raw per-slot readings (`slots`) come from a THIRD field,
 *     `Submission.dimensions` (the operator's original numpad entries),
 *     joined here by dimension id. Also frozen at submit time — this is the
 *     original historical input, never recomputed. Weight is a 1-slot case
 *     of the same shape (its one reading, `Submission.gloveWeight`), not a
 *     special-cased scalar — every row's expand interaction is uniform
 *     regardless of how many slots it has.
 *   - Row NAME/UNIT resolution is the one part of this table that is NOT
 *     frozen — it reads the CURRENT product's dimension defs (AUDIT_REPORT.md
 *     #31), same class of drift risk gradingSnapshot eliminated for AQL,
 *     explicitly accepted here since a renamed dimension def post-submission
 *     is rare and out of this build's scope to fully freeze.
 *
 * UI_DESIGN_SYSTEM.md compliance (visual consistency rework, 2026-08-27):
 * §1.3 Table Header token (`text-xs font-semibold uppercase tracking-wider
 * text-muted`) for the section sub-header and the TARGET/ACTUAL/RESULT
 * column header row; §1.3's "Dimension Field Name Labels" token (`text-sm
 * font-semibold text-primary uppercase`) for each row's own name; §4.2
 * Standard Reading Data Tables (compact row padding, faint row separators,
 * stacked primary/secondary cell convention) for the ACTUAL/spec-range
 * cells; §4.8B State Badges for the Compliant / Out of Spec / Record Only /
 * Not Frozen states.
 *
 * Column scheme is shared with AqlCategoryAnalysisPanel.tsx so both tables'
 * header rows align with their own data rows and with EACH OTHER: NAME
 * `w-[100px]`, TARGET `w-[220px]`, ACTUAL `w-[260px]`, RESULT `w-[110px]`
 * (all `shrink-0`). Duplicated here as literal class strings (not a shared
 * JS constant) — Tailwind's JIT scanner needs literal strings in source,
 * and no existing pattern in this codebase builds classNames from a shared
 * constant.
 *
 * ACTUAL COLUMN POSITION (2026-08-27, layout adjustment): the fixed-width
 * ACTUAL box is wrapped in a `flex-1 justify-center` spacer, both in the
 * header row and every data row, so it sits genuinely centered in whatever
 * space remains between TARGET and RESULT rather than hugging TARGET's
 * right edge (text inside ACTUAL stays left-aligned — only the column's own
 * position shifted). RESULT dropped its `ml-auto`: the spacer already
 * consumes all leftover space, so RESULT reaches the row's true right edge
 * through ordinary flex flow.
 *
 * All four columns are fixed (`w-`), not floored (`min-w-`). `min-w-` only
 * sets a lower bound: content wider than the breakpoint grows the flex item
 * past it — this bit twice: first for TARGET (AqlCategoryAnalysisPanel.tsx's
 * variable 2–4-chip cluster reliably grew past a shared `min-w-170px`,
 * misaligning it against this file's own always-short TARGET content — see
 * that file's root-cause comment), then again for RESULT once it stopped
 * being pinned by `ml-auto` (layout adjustment, 2026-08-27): a `min-w-`
 * RESULT let badge text length ("COMPLIANT" vs "PASS") change how much
 * space the new ACTUAL-centering spacer got, shifting ACTUAL's position
 * row-to-row. Both are now genuinely fixed for the same reason. TARGET/NAME
 * were rebalanced (2026-08-27, layout/content revision) — TARGET widened,
 * NAME narrowed — so Defects' worst-case TARGET content (AQL level + eval
 * mode + Ac/Re) fits on one line; see that file for the exact reasoning.
 *
 * ACTUAL COLUMN REDESIGN (2026-08-27, layout/content revision): the
 * click-to-expand interaction from the immediately preceding session was
 * REMOVED, not merely hidden — this table has no chevron, no expand state,
 * no button. ACTUAL now always shows `MIN x / MAX y / AVG z` directly, plus
 * (only for a failed graded row) a second line listing the specific
 * out-of-spec raw readings — both already-frozen data
 * (`row.slots`/`row.slotFails`, wired in two sessions ago for the removed
 * expand feature) simply rendered differently, not new computation. The
 * legacy NOT-FROZEN Glove Weight row is the one exception: it still shows
 * only its single raw value, since min/max/avg would all be that same
 * placeholder number, not real per-slot data.
 */

export interface DimensionRow {
  id: string;
  name: string;
  unit: string;
  /** null only for a legacy (pre-freeze) Glove Weight row with no snapshot. */
  measured: { min: number; max: number; avg: number } | null;
  /** false = every slot passed (or n/a); true = at least one slot failed. */
  failed: boolean;
  /** false = record-only — measured but never compared against a threshold. */
  isGraded: boolean;
  threshold: number;
  /** Infinity = no upper cap (isMin dimension, or zero tolerance configured). */
  maxThreshold: number;
  isMin: boolean;
  /** true for every row except a legacy-null Glove Weight row. */
  hasSnapshot: boolean;
  /** Raw operator-entered readings, in slot order — 5 for a normal dimension, 1 for Glove Weight. */
  slots: string[];
  /**
   * Per-slot pass/fail, same length as `slots`. Empty array (not merely
   * absent) is the signal that no per-slot judgment exists at all — the
   * legacy NOT FROZEN Glove Weight case — and is what disables the expand
   * toggle for that one row.
   */
  slotFails: boolean[];
}

export interface DimensionsPanelProps {
  rows: DimensionRow[];
}

/** Trims to at most 2 decimals without padding integers with trailing zeros. */
function formatNum(n: number): string {
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2);
}

function SpecRangeCell({ row }: { row: DimensionRow }) {
  if (!row.isGraded) {
    return <span className="text-xs font-mono text-muted">—</span>;
  }
  const { threshold, maxThreshold, isMin, unit } = row;
  if (isMin) {
    return <span className="text-xs font-mono text-primary">≥{formatNum(threshold)}{unit}</span>;
  }
  if (!Number.isFinite(maxThreshold)) {
    return <span className="text-xs font-mono text-primary">≥{formatNum(threshold)}{unit}</span>;
  }
  return (
    <span className="text-xs font-mono text-primary">
      {formatNum(threshold)}{unit} – {formatNum(maxThreshold)}{unit}
    </span>
  );
}

function ComplianceBadge({ row }: { row: DimensionRow }) {
  if (!row.hasSnapshot) {
    return (
      <span
        className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-gray-500/10 border-gray-500/30 text-gray-400"
        title="Recorded before Glove Weight compliance was frozen — no historical verdict available."
      >
        NOT FROZEN
      </span>
    );
  }
  if (!row.isGraded) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-gray-500/10 border-gray-500/30 text-gray-400">
        RECORD ONLY
      </span>
    );
  }
  if (row.failed) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-rose-500/10 border-rose-500/30 text-rose-400">
        OUT OF SPEC
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
      COMPLIANT
    </span>
  );
}

/**
 * The ACTUAL column's content — always visible, no interaction. Hierarchy
 * (2026-08-27, layout adjustment): the out-of-spec list is now the PRIMARY
 * line (normal size, red) when present, with MIN/MAX/AVG demoted to a
 * secondary line beneath it (smaller, grey) — the reverse of this cell's
 * original ordering/weight, since the failing values are what an inspector
 * actually needs to see first; the aggregate MIN/MAX/AVG is supporting
 * context, not the headline. A compliant row has no out-of-spec line at
 * all, so it renders as just the one (secondary-styled) MIN/MAX/AVG line —
 * MIN/MAX/AVG is styled the same de-emphasized way regardless of pass/fail,
 * since the failure signal now lives in the out-of-spec line and the
 * RESULT badge, not here. Both lines reuse `row.slots`/`row.slotFails` —
 * already-frozen data, just a different presentation of it. The legacy
 * NOT-FROZEN Glove Weight row is the one exception: no real per-slot data
 * exists for it, so it shows only its single recorded value.
 */
function ActualCell({ row }: { row: DimensionRow }) {
  if (!row.measured) {
    return <span className="text-sm font-mono text-muted">—</span>;
  }

  if (!row.hasSnapshot) {
    // Legacy row: min === max === avg (the same placeholder value three
    // times over) is not real per-slot data — show the single value only.
    return (
      <span className="text-sm font-mono text-primary">
        {formatNum(row.measured.avg)}{row.unit}
      </span>
    );
  }

  const outOfRange = row.isGraded && row.failed;
  const { min, max, avg } = row.measured;
  const failingSlots = row.slots.filter((_, i) => row.slotFails[i] === true);
  const showOutOfSpec = outOfRange && failingSlots.length > 0;

  return (
    <div className="flex flex-col gap-0.5">
      {showOutOfSpec && (
        <span className="text-sm font-mono text-rose-400">
          {failingSlots.map((v) => `${v}${row.unit}`).join(', ')}
        </span>
      )}
      <div className="flex items-center gap-x-3">
        <span className="text-xs font-mono text-muted">MIN : {formatNum(min)}{row.unit}</span>
        <span className="text-xs font-mono text-muted">MAX : {formatNum(max)}{row.unit}</span>
        <span className="text-xs font-mono text-muted">AVG : {formatNum(avg)}{row.unit}</span>
      </div>
    </div>
  );
}

/**
 * One dimension's row — NAME / TARGET / ACTUAL / RESULT. No interaction
 * (the click-to-expand feature from the immediately preceding session was
 * removed, not hidden — see the file header).
 */
function DimensionRowView({ row }: { row: DimensionRow }) {
  const outOfRange = row.isGraded && row.failed;

  return (
    <div className={`px-4 py-3 transition-colors ${outOfRange ? 'bg-rose-500/[0.04]' : ''}`}>
      <div className="flex items-center flex-wrap gap-y-1.5 gap-x-3">

        {/* Column: NAME */}
        <span className="text-sm font-semibold uppercase text-primary w-[100px] shrink-0">
          {row.name}
        </span>

        {/* Column: TARGET — spec range, unchanged logic. Fixed `w-` (not
            `min-w-`) matching AqlCategoryAnalysisPanel.tsx's identically-sized
            TARGET column — see that file's root-cause comment on why `min-w-`
            alone let the two tables' columns drift out of alignment. This
            column's own content is always short, so the fix is a no-op here
            visually; it exists purely so both tables share one real
            edge-to-edge boundary instead of two independently-floored ones. */}
        <div className="w-[220px] shrink-0">
          <SpecRangeCell row={row} />
        </div>

        {/* Column: ACTUAL — always-visible MIN/MAX/AVG (+ out-of-spec list when
            applicable). Wrapped in a `flex-1 justify-center` spacer (layout
            adjustment, 2026-08-27) so the fixed-width ACTUAL box sits
            genuinely centered in whatever space remains between TARGET and
            RESULT, rather than hugging TARGET's right edge — text inside
            ACTUAL itself stays left-aligned; only the column's own position
            shifts. `min-w-0` is the standard flex fix allowing a flex-grow
            item to actually shrink below its content's natural width when
            needed. RESULT no longer needs `ml-auto` — this spacer already
            consumes 100% of the leftover space, so RESULT lands at the row's
            true right edge through ordinary flex flow. */}
        <div className="flex-1 flex justify-center min-w-0">
          <div className="w-[260px] shrink-0">
            <ActualCell row={row} />
          </div>
        </div>

        {/* Column: RESULT */}
        <div className="w-[110px] shrink-0 flex justify-end">
          <ComplianceBadge row={row} />
        </div>
      </div>
    </div>
  );
}

export function DimensionsPanel({ rows }: DimensionsPanelProps) {
  if (rows.length === 0) return null;

  return (
    <div>
      <div className="px-4 py-2 bg-gray-800/30 border-b border-gray-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Dimensions</span>
      </div>

      {/* Column header row — TARGET / ACTUAL / RESULT, shared scheme with
          AqlCategoryAnalysisPanel.tsx. Fixed `w-` on NAME/TARGET/ACTUAL,
          matching the data rows below — see that file's root-cause comment
          on the TARGET column for why `min-w-` alone wasn't sufficient. */}
      <div className="px-4 py-2 flex items-center gap-x-3 border-b border-gray-800/50">
        <span className="w-[100px] shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted w-[220px] shrink-0">Target</span>
        <div className="flex-1 flex justify-center min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted w-[260px] shrink-0">Actual</span>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted w-[110px] shrink-0 text-right">Result</span>
      </div>

      <div className="divide-y divide-gray-800/50">
        {rows.map((row) => (
          <DimensionRowView key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}
