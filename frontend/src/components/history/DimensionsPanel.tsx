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
 * `w-[200px]`, TARGET `w-[220px]`, ACTUAL `w-[400px]`, RESULT `w-[110px]`
 * (all `shrink-0`). Duplicated here as literal class strings (not a shared
 * JS constant) — Tailwind's JIT scanner needs literal strings in source,
 * and no existing pattern in this codebase builds classNames from a shared
 * constant.
 *
 * NAME COLUMN WIDTH (2026-08-28, layout revision): `w-[100px]` → `w-[160px]`
 * → `w-[200px]`. The 160px round still wrapped in the real browser: the
 * widest label "BEADING THICKNESS" measures **149.6px in real Chromium with
 * Inter actually loaded** (the earlier ~148px measurement was taken in the
 * headless test, where the Google-Fonts `@import` in index.css never
 * resolves so a fallback face is measured — a false pass), leaving 160px
 * with only ~10px of slack that any zoom above 100% ate. 200px = 149.6px +
 * a deliberately generous ~50px buffer (covers ~130% browser zoom / future
 * font-metric drift). Every label in BOTH tables — dimension names here,
 * category names (AND/BARRIER/VISUALS) in the Defects table — fits on one
 * line. `whitespace-nowrap` on the label span makes any still-wider future
 * label overflow visibly rather than silently wrapping. Genuine fixed `w-`
 * (not `min-w-`), same reasoning as ACTUAL below.
 *
 * ACTUAL COLUMN POSITION (2026-08-27, layout/content revision): the
 * `flex-1 justify-center` centering spacer that briefly wrapped the ACTUAL
 * box was REMOVED, both here and in AqlCategoryAnalysisPanel.tsx. ACTUAL now
 * sits directly after TARGET (hugging its right edge) rather than drifting
 * toward the row's centre — with a wide ACTUAL column the leftover space
 * between TARGET and RESULT was large, so centring pushed ACTUAL a long way
 * off TARGET and the gap read as a layout gap. RESULT regained `ml-auto`
 * (safe now that it is a genuine fixed `w-`, not the `min-w-` that made
 * `ml-auto` unstable before) so it stays pinned to the row's right edge.
 *
 * ACTUAL was also widened `w-[260px]` → `w-[400px]` (both files): a failed
 * dimension's out-of-spec list can carry up to 5 raw readings at 3-decimal
 * precision (`0.049mm, 0.049mm, …`), which must render on ONE line, no wrap
 * — 400px fits that worst case. Both ACTUAL lines (the out-of-spec list and
 * the MIN/MAX/AVG line) carry `whitespace-nowrap` so neither can wrap
 * inside the box; the fixed width, not wrapping, is what keeps every row's
 * ACTUAL cell one line tall regardless of content length.
 *
 * All four columns are fixed (`w-`), not floored (`min-w-`). `min-w-` only
 * sets a lower bound: content wider than the breakpoint grows the flex item
 * past it — this bit twice: first for TARGET (AqlCategoryAnalysisPanel.tsx's
 * variable 2–4-chip cluster reliably grew past a shared `min-w-170px`,
 * misaligning it against this file's own always-short TARGET content — see
 * that file's root-cause comment), then again for RESULT (a `min-w-` RESULT
 * let badge text length, "COMPLIANT" vs "PASS", change how much space was
 * left over, shifting ACTUAL's position row-to-row). Both are now genuinely
 * fixed for the same reason. TARGET/NAME were rebalanced (2026-08-27,
 * layout/content revision) — TARGET widened, NAME narrowed — so Defects'
 * worst-case TARGET content (AQL level + eval mode + Ac/Re) fits on one
 * line; see that file for the exact reasoning.
 *
 * ACTUAL COLUMN REDESIGN (2026-08-27, layout/content revision): the
 * click-to-expand interaction from the immediately preceding session was
 * REMOVED, not merely hidden — this table has no chevron, no expand state,
 * no button. ACTUAL now shows `MIN x / MAX y / AVG z` directly for a 5-slot
 * dimension, plus (only for a failed graded row) a second line listing the
 * specific out-of-spec raw readings — both already-frozen data
 * (`row.slots`/`row.slotFails`, wired in two sessions ago for the removed
 * expand feature) simply rendered differently, not new computation.
 * Glove Weight is the exception: it is a single recorded reading, not a
 * 5-slot grid, so any single-slot row (`slots.length === 1` — the frozen
 * gloveWeightSnapshot row and the legacy NOT-FROZEN one) shows just that
 * one value, no MIN/MAX/AVG. See ActualCell's own doc comment.
 */

import { FIXED_DIM_WEIGHT } from '../../lib/fixedDimensions';

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

/** Decimal places in a raw reading string: "0.049" → 3, "240" → 0, "1.0" → 1. */
function decimalsIn(s: string): number {
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
}

/**
 * How many decimal places to render this row's derived numbers — MIN/MAX/AVG
 * AND the spec range — at. Taken from the widest precision the operator
 * actually recorded in `row.slots`, so a dimension keyed in to 3 decimals
 * (Finger Thickness, `0.049mm`) is never silently shown rounded to 2
 * (`0.05mm`). A fixed `toFixed(2)` rule was the bug this replaces. Falls
 * back to 2dp only when a row carries no usable raw slots (legacy shape).
 * Purely a display choice — the frozen numeric values are untouched.
 */
function rowDecimals(row: DimensionRow): number {
  const seen = row.slots
    .filter((s) => s.trim() !== '' && Number.isFinite(Number(s)))
    .map(decimalsIn);
  return seen.length > 0 ? Math.max(...seen) : 2;
}

/** Format a derived number at the row's data-derived precision. */
function formatNum(n: number, decimals: number): string {
  return Number.isFinite(n) ? n.toFixed(decimals) : String(n);
}

function SpecRangeCell({ row }: { row: DimensionRow }) {
  if (!row.isGraded) {
    return <span className="text-xs font-mono text-muted">—</span>;
  }
  const { threshold, maxThreshold, isMin, unit } = row;
  const dp = rowDecimals(row);
  if (isMin) {
    return <span className="text-xs font-mono text-primary">≥{formatNum(threshold, dp)}{unit}</span>;
  }
  if (!Number.isFinite(maxThreshold)) {
    return <span className="text-xs font-mono text-primary">≥{formatNum(threshold, dp)}{unit}</span>;
  }
  return (
    <span className="text-xs font-mono text-primary">
      {formatNum(threshold, dp)}{unit} – {formatNum(maxThreshold, dp)}{unit}
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
 * (2026-08-28, revised): when a row is out of spec, MIN/MAX/AVG is the
 * PRIMARY line — larger (`text-sm`) and white (`text-primary`), since those
 * are the actual calculated figures — and the specific out-of-spec
 * reading(s) sit on a SECONDARY line beneath it: smaller (`text-xs`) but
 * still red (`text-rose-400`), so the failure is still unmistakable, just
 * no longer the headline. (This reverses the 2026-08-27 arrangement, which
 * led with the red values.) A compliant row has no out-of-spec line at all,
 * so its lone MIN/MAX/AVG line stays de-emphasized (`text-xs text-muted`) —
 * the promotion to `text-sm text-primary` only happens when there's an
 * out-of-spec line to outrank. Both lines reuse `row.slots`/`row.slotFails`
 * — already-frozen data, just a different presentation of it.
 *
 * SINGLE-ENTRY EXCEPTION: Glove Weight is one recorded reading, not a
 * 5-slot measurement grid — MIN/MAX/AVG would each just be that same value.
 * It renders as its single value only (rose if out of spec, primary
 * otherwise), no MIN/MAX/AVG line and no separate out-of-spec list. The
 * collapse fires on `row.id === FIXED_DIM_WEIGHT` (the definitive signal —
 * Weight always carries that sentinel id), with `!hasSnapshot` and
 * `slots.length === 1` as extra guards for the legacy shape and any other
 * single-reading row.
 */
function ActualCell({ row }: { row: DimensionRow }) {
  if (!row.measured) {
    return <span className="text-sm font-mono text-muted">—</span>;
  }

  const dp = rowDecimals(row);
  const outOfRange = row.isGraded && row.failed;

  // Single-entry field (Glove Weight — one recorded reading, not a 5-slot
  // stats object): MIN/MAX/AVG would all be that same value, so show the
  // single value only. Rose when it's the out-of-spec value, primary
  // otherwise. Three independent guards, ANY of which collapses the row —
  // deliberately redundant because a prior `slots.length === 1`-only version
  // still rendered MIN/MAX/AVG for a real frozen Weight row in the live app:
  //   - `row.id === FIXED_DIM_WEIGHT`: the definitive signal. Weight is the
  //     only single-reading dimension and always carries this sentinel id
  //     (buildDimensionRows, both the frozen and legacy branches) — this
  //     holds no matter what shape `slots` arrives in.
  //   - `!row.hasSnapshot`: the legacy pre-gloveWeightSnapshot shape.
  //   - `row.slots.length === 1`: any other genuine single-reading row.
  //     Kept at `=== 1` (not `<= 1`) so a 5-slot dimension that happens to
  //     arrive with no raw slots still shows its frozen MIN/MAX/AVG stats
  //     rather than collapsing to a bare average.
  if (row.id === FIXED_DIM_WEIGHT || !row.hasSnapshot || row.slots.length === 1) {
    return (
      <span className={`text-sm font-mono ${outOfRange ? 'text-rose-400' : 'text-primary'}`}>
        {formatNum(row.measured.avg, dp)}{row.unit}
      </span>
    );
  }

  const { min, max, avg } = row.measured;
  const failingSlots = row.slots.filter((_, i) => row.slotFails[i] === true);
  const showOutOfSpec = outOfRange && failingSlots.length > 0;

  // When there's an out-of-spec line, MIN/MAX/AVG is the PRIMARY line
  // (larger, white — the actual calculated figures lead) and the out-of-spec
  // value list sits beneath it (smaller, still red). A compliant row has no
  // out-of-spec line, so its lone MIN/MAX/AVG line stays de-emphasized
  // (smaller, grey) — unchanged.
  const mmaClass = showOutOfSpec ? 'text-sm text-primary' : 'text-xs text-muted';

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-x-3 whitespace-nowrap">
        <span className={`${mmaClass} font-mono`}>MIN : {formatNum(min, dp)}{row.unit}</span>
        <span className={`${mmaClass} font-mono`}>MAX : {formatNum(max, dp)}{row.unit}</span>
        <span className={`${mmaClass} font-mono`}>AVG : {formatNum(avg, dp)}{row.unit}</span>
      </div>
      {showOutOfSpec && (
        <span className="text-xs font-mono text-rose-400 whitespace-nowrap">
          {failingSlots.map((v) => `${v}${row.unit}`).join(', ')}
        </span>
      )}
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

        {/* Column: NAME — `w-[200px]`: widest label "BEADING THICKNESS"
            (~149.6px in real Chromium with Inter loaded) plus a generous
            buffer for zoom/font drift; `whitespace-nowrap` keeps every label
            on one line (see the file header). */}
        <span className="text-sm font-semibold uppercase text-primary w-[200px] shrink-0 whitespace-nowrap">
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
            applicable). Sits directly after TARGET (no centering spacer — see
            the file header): a genuine fixed `w-[400px]`, sized for the
            worst-case out-of-spec list (5 readings at 3-decimal precision on
            one line). The fixed width is what holds every row's ACTUAL cell
            to one line tall — the MIN/MAX/AVG line and the out-of-spec list
            both carry `whitespace-nowrap` inside ActualCell. */}
        <div className="w-[400px] shrink-0">
          <ActualCell row={row} />
        </div>

        {/* Column: RESULT — `ml-auto` pins it to the row's right edge (safe:
            RESULT is a genuine fixed `w-`, not the `min-w-` that made
            `ml-auto` unstable in an earlier revision). */}
        <div className="w-[110px] shrink-0 flex justify-end ml-auto">
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
        <span className="w-[200px] shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted w-[220px] shrink-0">Target</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted w-[400px] shrink-0">Actual</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted w-[110px] shrink-0 text-right ml-auto">Result</span>
      </div>

      <div className="divide-y divide-gray-800/50">
        {rows.map((row) => (
          <DimensionRowView key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}
