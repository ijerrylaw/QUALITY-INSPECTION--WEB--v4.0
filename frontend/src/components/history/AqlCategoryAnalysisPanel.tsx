/**
 * @file AqlCategoryAnalysisPanel.tsx
 * @description The "AQL Category Analysis" box shown inside HistoryFeed.tsx's
 * expanded row (DefectBreakdownPanel) — per-category AQL chips, defect
 * pills, and the unclassified/empty states. Extracted out of HistoryFeed.tsx
 * as a structural rebuild after two targeted patches (padding, then a
 * whitespace-nowrap-cascade fix) both failed to resolve a real clipping bug:
 * content (status pills, the profile-name label, and even the sibling
 * AMEND RECORD button outside this panel) got cut off at some viewport
 * widths but not others, inconsistently across screen sizes.
 *
 * ROOT-CAUSE INVESTIGATION (full ancestor chain, table root down):
 *   App.tsx's <ProtectedRoute>:      <div className="flex h-screen w-screen overflow-hidden">
 *                                      <Sidebar />  (w-64, shrink-0)
 *                                      <main className="flex-1 overflow-y-scroll">
 *   HistoryPage.tsx:                     <div className="p-8 ... max-w-7xl mx-auto ...">
 *   HistoryFeed.tsx:                         <div className="... overflow-x-auto ...">
 *                                              <table className="w-full ... whitespace-nowrap">
 *                                                <td colSpan={10}>  <-- this panel renders here
 *
 * Two things stood out:
 *   1. `<main>` sets only `overflow-y-scroll` — but per the CSS overflow
 *      spec, when one axis is non-'visible' and the other isn't set, the
 *      unset axis's COMPUTED value becomes 'auto', not 'visible'. So
 *      `<main>` is ALSO a horizontal scroll container, nested directly
 *      inside the root's `overflow-hidden` and directly outside
 *      HistoryFeed's own *intentional* `overflow-x-auto` wrapper around
 *      the table. Three overlapping horizontal-overflow authorities
 *      (root overflow-hidden, main's incidental overflow-x:auto, and this
 *      table's real scroll container) for one piece of content, with a
 *      `position: sticky` column in the middle of it, is exactly the kind
 *      of setup where subpixel rounding differences (which vary by
 *      display DPI / OS scaling — NOT by logical CSS viewport width, which
 *      is why this reproduced on a 1920x1080 screen and not on a
 *      3840x2400 one with the identical record, browser, and page state)
 *      can flip which container "wins" a borderline layout decision.
 *   2. The panel's old `overflow-hidden` (used only to clip child
 *      backgrounds to its own rounded corners — a decorative use, not a
 *      scroll boundary) had near-zero width margin in realistic content
 *      (confirmed via a live static repro using real category/defect data
 *      pulled from GET /api/submissions), so it was positioned to clip
 *      real content the moment ANY of the above subpixel/rounding
 *      variance pushed it a fraction of a pixel too far, in whichever
 *      direction the ambiguous nested-scroll-container resolution landed.
 *
 * Neither prior patch touched the ROOT precondition — that this panel's
 * layout depended on precisely fitting inside a boundary it didn't fully
 * control. This rebuild removes that precondition instead of chasing the
 * exact pixel math:
 *   - No `overflow: hidden` anywhere in this file. The old panel wrapper
 *     used it purely to round off child backgrounds at the corners —
 *     replaced with `rounded-t-lg` directly on the (always-first) header
 *     and a `[&>*:last-child]:rounded-b-lg` arbitrary selector on the rows
 *     container, so whichever block renders last (a category row, the
 *     unclassified block, or the empty state — all three are legitimate
 *     "last child" cases depending on the data) gets its own bottom
 *     corners rounded directly. Same visual result, zero clip risk.
 *   - No `whitespace-nowrap` anywhere, and this component sets its own
 *     `whitespace-normal` on its root rather than relying on an ancestor
 *     (HistoryFeed.tsx) to have overridden the table's cascading nowrap —
 *     this file no longer assumes anything about what its caller does.
 *   - No fixed pixel widths on content-bearing elements — the category
 *     name label uses `min-w-` instead of `w-`, and `min-w-0` is set on
 *     every flex cluster that holds wrapping text, so a flex item's
 *     default `min-width: auto` can't refuse to shrink/wrap.
 *   - `flex-wrap` on every row that holds more than one badge/pill,
 *     including the header's right-hand cluster, which was the one place
 *     in the original that lacked it.
 *   - No horizontal scroll container of its own — the only intentional
 *     horizontal scroll region for this whole widget stays exactly where
 *     it already was, HistoryFeed.tsx's outer table wrapper.
 *
 * UI_DESIGN_SYSTEM.md compliance carried over unchanged from HistoryFeed.tsx:
 * §4.8A Value Chips (indigo AQL level, gray Ac/Re), §4.8B State Badges
 * (emerald PASS, rose FAIL, gray N/A), §4.9 Amber for unclassified defects.
 *
 * RESTRUCTURE (Inspection Results panel build): this component no longer owns
 * the outer bordered panel/header — that moved up to HistoryFeed.tsx, which
 * now wraps this component AND the new DimensionsPanel.tsx under one shared
 * "INSPECTION RESULTS" header, mirroring how this panel already carried one
 * header over multiple logical blocks (category rows + unclassified + empty
 * state). This component renders its own small "AQL Categories" sub-header
 * (same visual weight as DimensionsPanel.tsx's "Dimensions" sub-header) plus
 * its table body, so it can nest inside that shared wrapper without doubling
 * the border/background.
 *
 * Per-category rows are a genuine 4-column structure — Category / TARGET
 * (AQL level + eval mode + Ac/Re) / ACTUAL (defect count + Actual AQL badge,
 * collapsed, click-to-expand for the per-defect pills) / RESULT (Verdict
 * badge only) — implemented with flex + fixed `w-` widths, per this file's
 * own documented lesson from the original clipping saga above about literal
 * table layout (that lesson doesn't extend to a small flex item several DOM
 * levels inside an already-`table-fixed` `<td>` — see the POST-REVIEW
 * CLEANUP note below).
 *
 * VISUAL CONSISTENCY REWORK (2026-08-27): sub-header renamed "AQL Categories"
 * → "DEFECTS"; a new TARGET/ACTUAL/RESULT column header row added, sharing
 * its width scheme with DimensionsPanel.tsx (NAME 140px, TARGET 170px,
 * ACTUAL 110px, RESULT 90px) so both tables' headers and data rows align
 * with each other, not just within themselves. Full UI_DESIGN_SYSTEM.md
 * typography audit applied: category name conforms to §1.3's Dimension
 * Field Name Label token (`text-sm font-semibold text-primary uppercase`),
 * every Value Chip now carries the mandated `uppercase` class (§4.8A), the
 * collapsed defect count matches §4.2's stacked-cell primary size
 * (`text-sm`, was `text-[11px]`), chevrons meet §1.4's `w-3.5` icon floor
 * (were `w-3`), and the loading/error helper text drops `font-mono` (UI
 * Chrome text, not data, per §1.3's Golden Rule). No interaction or logic
 * changes in that pass — every conditional branch rendered exactly what it
 * rendered before, only className strings changed.
 *
 * POST-REVIEW CLEANUP (2026-08-27): NAME/TARGET/ACTUAL switched from
 * `min-w-` to a genuine `w-` (see the TARGET column's own comment below for
 * the full root-cause explanation — `min-w-` is a floor, not a fixed width,
 * and this column's variable chip-cluster content reliably grew past it,
 * unlike DimensionsPanel.tsx's always-short TARGET content, misaligning the
 * two tables). This supersedes this file's older documented "no fixed `w-`
 * widths" lesson from the original clipping saga above — that lesson is
 * still correct for the outer table/panel boundary (nothing here changes
 * that), but does not extend to a small flex item several DOM levels
 * inside an already-`table-fixed` `<td>`, whose content already wraps
 * on overflow rather than forcing growth. Also removed from this pass: the
 * sub-header's ShieldCheck icon (now lives once, on HistoryFeed.tsx's outer
 * "Inspection Results" header) and the sample-size/profile subtitle line
 * (moved to that same outer header — it's whole-submission context, not
 * defects-specific), the "none recorded" placeholder under a 0-found
 * category, and the "No defects recorded for this lot." footer (the
 * per-row "0 found" value already says this).
 *
 * LAYOUT & CONTENT REVISION (2026-08-27): two prior decisions reversed.
 * (1) Column widths rebalanced — NAME 140px→100px, TARGET 170px→220px,
 * ACTUAL 110px→150px (RESULT unchanged) — because the earlier 170px TARGET
 * still wrapped this file's own worst-case chip cluster (AQL level + eval
 * mode + Ac/Re) onto two lines; 220px was sized to fit that content on one
 * line, verified via a real-Chromium test rather than assumed. (2) Actual
 * AQL moved from RESULT into ACTUAL, beside the defect count — the previous
 * placement (see the VISUAL CONSISTENCY REWORK note above) is explicitly
 * superseded, not merely patched: RESULT now holds the Verdict badge only.
 * `ActualAqlBadge` itself is unchanged (same component, same indigo/rose
 * pill geometry) — only where it's rendered moved.
 *
 * LAYOUT ADJUSTMENT (2026-08-27, follow-up): ACTUAL widened 150px→260px.
 * RESULT converted from `min-w-[90px]` to a genuine `w-[110px]` — a real
 * bug caught by the alignment test: its `min-w-` let badge text length
 * ("PASS" here vs. e.g. "COMPLIANT" in DimensionsPanel.tsx) change how much
 * of the row RESULT consumed, shifting the rest of the layout by which
 * verdict happened to render. Same root cause as TARGET's own `min-w-`→`w-`
 * fix above.
 *
 * LAYOUT/CONTENT REVISION (2026-08-27, follow-up 2): ACTUAL widened again
 * 260px→400px and the `flex-1 justify-center` centering spacer that briefly
 * wrapped it was REMOVED (both here and in DimensionsPanel.tsx). ACTUAL now
 * sits directly after TARGET again; RESULT regained `ml-auto` to stay
 * pinned right (safe now it is a genuine fixed `w-`). The driver is
 * DimensionsPanel.tsx's ACTUAL content — a failed dimension's out-of-spec
 * list needs up to 5 readings at 3-decimal precision on one line, and 400px
 * fits that worst case; this file follows the same width purely to keep the
 * two tables' columns aligned under the shared INSPECTION RESULTS header
 * (its own ACTUAL content is short, so the extra width is mostly whitespace
 * here — an accepted trade for cross-table alignment).
 *
 * NAME COLUMN WIDTH (2026-08-27, layout revision): `w-[100px]` → `w-[160px]`,
 * mirrored from DimensionsPanel.tsx (whose "BEADING THICKNESS" label, ~148px,
 * was wrapping at 100px). This table's own labels (AND/BARRIER/VISUALS) fit
 * at 100px, but the two NAME columns must stay the same width to keep the
 * tables aligned under the shared header. `whitespace-nowrap` on the label
 * span matches DimensionsPanel.tsx.
 */

import { useState } from 'react';
import { Eye, ChevronRight, ChevronDown } from 'lucide-react';

// ── Display-only helpers ─────────────────────────────────────────────────
// Pass/fail DETERMINATION and threshold VALUES come from the server
// (POST /api/verdict/preview / a frozen gradingSnapshot) via the
// CategoryAnalysis[] this component is handed — these two just pick which
// threshold TEXT to render, mirroring backend/src/engine/iso2859-matrix.ts's
// bracket list purely for display.

const SAMPLE_SIZE_BRACKETS = [2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500] as const;

function isZeroTolerance(aqlLevel: string): boolean {
  return /and/i.test(aqlLevel) || /zero.?tolerance/i.test(aqlLevel) || /^0$/.test(aqlLevel.trim());
}

function isPassFail(aqlLevel: string): boolean {
  return /pass.?fail/i.test(aqlLevel);
}

/**
 * RECORD ONLY categories are excluded from verdict computation entirely
 * (evaluationMode: '', aqlEvaluator.ts's true-exclusion skip path) — they
 * render `passed: null`, same as any other informational/not-yet-available
 * category. Detected off `aqlLevel` text (same convention as
 * isZeroTolerance/isPassFail above) rather than `evaluationMode === ''`
 * alone, since an unconfigured category can also carry an empty
 * evaluationMode (AQLCategory doc comment, ConfigContext.tsx) — RECORD ONLY
 * needs its own distinct badge, not the generic "N/A" used for that case.
 */
function isRecordOnly(aqlLevel: string): boolean {
  return /record.?only/i.test(aqlLevel);
}

export function snapBracket(n: number): number {
  const clamped = Math.max(2, Math.round(n));
  return [...SAMPLE_SIZE_BRACKETS].reduce((best, candidate) => {
    const dC = Math.abs(candidate - clamped);
    const dB = Math.abs(best - clamped);
    return dC < dB || (dC === dB && candidate > best) ? candidate : best;
  }, SAMPLE_SIZE_BRACKETS[0] as number);
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface DefectItem {
  id: string;
  name: string;
  count: number;
  failing: boolean;
}

/**
 * Display-only mirror of backend/src/engine/aqlEvaluator.ts's ActualAqlAchieved —
 * the tightest standard ISO 2859-1 AQL level the observed count still satisfied,
 * computed server-side and frozen into Submission.gradingSnapshot. Same
 * "display-only inline copy, kept in sync manually" pattern this file's header
 * documents for the bracket list.
 */
export interface ActualAqlAchieved {
  status: 'ACHIEVED' | 'EXCEEDS_ALL' | 'QUALITATIVE';
  aqlLevel: string | null;
  threshold: { ac: number; re: number } | null;
  evaluatedCount: number | null;
}

export interface CategoryAnalysis {
  id: string;
  name: string;
  aqlLevel: string;
  evaluationMode: string;
  threshold: { ac: number; re: number } | null;
  totalCount: number;
  /** true=PASS, false=FAIL, null=qualitative/informational/not-yet-available (no verdict shown) */
  passed: boolean | null;
  /**
   * OPTIONAL on purpose: snapshots frozen before this field existed simply don't
   * carry it (deliberately not backfilled — AUDIT_REPORT.md #18), and those rows
   * must render cleanly with the chip absent rather than showing a false state.
   * Null means the category was never graded (RECORD ONLY / OFF).
   */
  actualAqlAchieved?: ActualAqlAchieved | null;
  defectItems: DefectItem[];
}

/**
 * The "Actual AQL Achieved" badge — full §4.8B State Badge geometry
 * (`rounded-full`, bold) rather than a minor §4.8A supporting chip, so it
 * still reads clearly as its own distinct pill now that it sits beside the
 * plain-text defect count in ACTUAL (moved there from RESULT — layout &
 * content revision, 2026-08-27; see the file header). Colors stay within
 * the existing semantic set rather than inventing a new one: indigo
 * (matches the Target AQL chip's own "system parameter" color) for a normal
 * achieved level, rose for EXCEEDS_ALL (a real hard-fail).
 *
 * Renders nothing for QUALITATIVE (an N/A-mode category has no count to
 * grade — the row's own "qualitative" chip already covers this) or a
 * missing/null value (legacy snapshot, or an ungraded RECORD ONLY category).
 */
function ActualAqlBadge({ actual }: { actual?: ActualAqlAchieved | null }) {
  if (!actual || actual.status === 'QUALITATIVE') return null;

  const hardFail = actual.status === 'EXCEEDS_ALL';

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
        hardFail
          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
      }`}
      title={
        hardFail
          ? `Observed ${actual.evaluatedCount} — exceeds Ac ${actual.threshold?.ac} at the loosest standard AQL level (10).`
          : `Observed ${actual.evaluatedCount} — still within Ac ${actual.threshold?.ac} at AQL ${actual.aqlLevel}, the tightest level met.`
      }
    >
      {hardFail ? 'ACTUAL > 10' : `ACTUAL ${actual.aqlLevel}`}
    </span>
  );
}

export interface AqlCategoryAnalysisPanelProps {
  categoryAnalysis: CategoryAnalysis[];
  unclassified: [string, number][];
  anyFail: boolean;
  noProfileLinked: boolean;
  /** 'snapshot' = a frozen gradingSnapshot is being shown, no live fetch involved. */
  previewStatus: 'snapshot' | 'loading' | 'error' | 'success';
  previewErrorMessage?: string;
}

/**
 * One category's row — NAME / TARGET (AQL level + eval mode + Ac/Re) /
 * ACTUAL (defect count + Actual AQL badge, click-to-expand for the
 * per-defect pills) / RESULT (Verdict badge). Flex + fixed `w-` columns, not
 * a literal `<table>` — see the file header for why.
 */
function CategoryRow({ cat }: { cat: CategoryAnalysis }) {
  const [expanded, setExpanded] = useState(false);
  const isFail = cat.passed === false;
  const isNA = cat.passed === null;
  const zeroTol = isZeroTolerance(cat.aqlLevel);
  const pf = isPassFail(cat.aqlLevel);
  const recordOnly = isRecordOnly(cat.aqlLevel);
  const hasDefects = cat.defectItems.length > 0;

  return (
    <div className={`px-4 py-3 transition-colors ${isFail ? 'bg-rose-500/[0.04]' : ''}`}>
      <div className="flex items-center flex-wrap gap-y-1.5 gap-x-3">

        {/* Column: NAME — §1.3 Dimension Field Name Label token, shared with
            DimensionsPanel.tsx. `w-[160px]` + `whitespace-nowrap` mirrored
            from there (see the file header). */}
        <span className="text-sm font-semibold uppercase text-primary w-[160px] shrink-0 whitespace-nowrap">
          {cat.name}
        </span>

        {/* Column: TARGET — level chip + eval mode + Ac/Re. Logic unchanged; every
            chip now carries the §4.8A-mandated `uppercase` class.
            Fixed `w-` (not `min-w-`) — see file header. This cluster is the
            worst-case content in the whole panel (AQL level chip + eval mode
            word like "CUMULATIVE" + Ac/Re chip); 220px was sized specifically
            so it fits on one line without wrapping (verified in
            aqlCategoryAnalysisPanel.test.tsx via real-Chromium measurement,
            not assumed) — `min-w` alone previously let this content grow past
            170px, misaligning this column against DimensionsPanel.tsx's
            identically-classed but always-shorter TARGET. A fixed width
            forces any overflow to wrap *inside* this box (via the
            `flex-wrap` already on this div) instead of growing it. */}
        <div className="flex items-center gap-1.5 flex-wrap w-[220px] shrink-0">
          <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            {cat.aqlLevel || '—'}
          </span>
          {cat.evaluationMode && (
            <span className={`text-[9px] font-bold uppercase tracking-wider ${
              cat.evaluationMode === 'CUMULATIVE' || cat.evaluationMode === 'GRANULAR' ? 'text-emerald-400' : 'text-gray-400'
            }`}>
              {cat.evaluationMode}
            </span>
          )}
          {zeroTol && (
            <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase bg-gray-800/50 border border-gray-700/50 text-muted">
              Ac 0
            </span>
          )}
          {!zeroTol && !pf && cat.evaluationMode && cat.threshold && (
            <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase bg-gray-800/50 border border-gray-700/50 text-muted">
              Ac {cat.threshold.ac} / Re {cat.threshold.re}
            </span>
          )}
          {pf && (
            <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase bg-gray-800/50 border border-gray-700/50 text-muted">
              qualitative
            </span>
          )}
          {recordOnly && (
            <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase bg-gray-800/50 border border-gray-700/50 text-muted inline-flex items-center gap-1">
              <Eye className="w-3 h-3" strokeWidth={2} />
              record only
            </span>
          )}
        </div>

        {/* Column: ACTUAL — Defect Count + Actual AQL badge (moved here from
            RESULT, layout & content revision 2026-08-27), collapsed by
            default, click-to-expand reveals the defect pills below.
            Click-to-expand interaction itself is unchanged. Sits directly
            after TARGET (no centering spacer — see the file header): a
            genuine fixed `w-[400px]` column slot matching DimensionsPanel.tsx
            so the two tables stay aligned. The button itself stays sized to
            its content (left-aligned) inside that slot, rather than being a
            400px-wide click target. */}
        <div className="w-[400px] shrink-0">
          <button
            type="button"
            onClick={() => hasDefects && setExpanded((e) => !e)}
            disabled={!hasDefects}
            className={`flex items-center gap-1.5 outline-none ${
              hasDefects ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
            }`}
            title={hasDefects ? (expanded ? 'Collapse defect breakdown' : 'Expand defect breakdown') : undefined}
          >
            {hasDefects ? (
              expanded
                ? <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={2} />
                : <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={2} />
            ) : (
              <span className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className={`text-sm font-mono ${
              cat.totalCount === 0 ? 'text-muted' : isFail ? 'text-rose-400 font-bold' : 'text-primary'
            }`}>
              {cat.totalCount} found
            </span>
            <ActualAqlBadge actual={cat.actualAqlAchieved} />
          </button>
        </div>

        {/* Column: RESULT — Verdict badge only (Actual AQL moved into ACTUAL
            above). `ml-auto` pins it to the row's right edge — safe now
            RESULT is a genuine fixed `w-`, not a `min-w-`. */}
        <div className="flex items-center gap-2 w-[110px] shrink-0 justify-end ml-auto">
          {!isNA && cat.evaluationMode && cat.evaluationMode !== '' && (
            isFail ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-400">
                FAIL
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                PASS
              </span>
            )
          )}
          {(isNA || !cat.evaluationMode) && recordOnly && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-500/10 border border-gray-500/30 text-gray-400 inline-flex items-center gap-1">
              <Eye className="w-3 h-3" strokeWidth={2} />
              RECORD ONLY
            </span>
          )}
          {(isNA || !cat.evaluationMode) && !recordOnly && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-500/10 border border-gray-500/30 text-gray-400">
              N/A
            </span>
          )}
        </div>
      </div>

      {/* Defect pills — only reachable when expanded (and only exist to expand into when hasDefects) */}
      {expanded && hasDefects && (
        <div className="flex flex-wrap gap-2 mt-2 pl-5">
          {cat.defectItems.map((item) => (
            <div
              key={item.id}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 border shadow-sm ${
                item.failing
                  ? 'bg-rose-500/10 border-rose-500/30'
                  : 'bg-canvas border-gray-700/50'
              }`}
            >
              <span className="font-mono text-[10px] text-primary">{item.name}</span>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border min-w-[1.5rem] text-center ${
                item.failing
                  ? 'text-rose-400 bg-rose-500/15 border-rose-500/30'
                  : 'text-muted bg-gray-800/50 border-gray-700/50'
              }`}>
                {item.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AqlCategoryAnalysisPanel({
  categoryAnalysis,
  unclassified,
  anyFail,
  noProfileLinked,
  previewStatus,
  previewErrorMessage,
}: AqlCategoryAnalysisPanelProps) {
  return (
    <div className="whitespace-normal">

      {/* "DEFECTS" sub-header (renamed from "AQL Categories") — same visual
          weight as DimensionsPanel.tsx's own sub-header. No icon here — the
          shared outer panel header ("INSPECTION RESULTS") owns the single
          ShieldCheck icon for the whole panel, one level up in
          HistoryFeed.tsx; repeating it on every sub-header made the panel
          read as three independent headers instead of one with two
          children. The sample-size/ISO-bracket/profile-name subtitle also
          moved up to that same shared header — it's context for the whole
          submission (dimensions included), not defects-specific. */}
      <div className="bg-gray-800/30 px-4 py-2 flex items-center gap-2 border-b border-gray-800 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Defects
        </span>
        {/* "WOULD FAIL" indicator when reference analysis reveals failures on unlinked submissions */}
        {anyFail && noProfileLinked && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400">
            WOULD FAIL
          </span>
        )}
        {anyFail && !noProfileLinked && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-400">
            CATEGORY FAILED
          </span>
        )}
        {/* Helper/status text — UI Chrome, not data, so plain Inter per §1.3's Golden Rule (no font-mono). */}
        {previewStatus === 'loading' && (
          <span className="text-[10px] text-muted animate-pulse">Loading AQL analysis…</span>
        )}
        {previewStatus === 'error' && (
          <span className="text-[10px] text-amber-400">
            AQL analysis unavailable ({previewErrorMessage}) — showing raw defect counts only.
          </span>
        )}
      </div>

      {/* Column header row — TARGET / ACTUAL / RESULT, shared scheme with
          DimensionsPanel.tsx. Fixed `w-` on NAME/TARGET/ACTUAL, matching the
          data rows below — see the root-cause comment on the TARGET column
          above for why `min-w-` alone let this drift out of alignment. */}
      <div className="px-4 py-2 flex items-center gap-x-3 border-b border-gray-800/50">
        <span className="w-[160px] shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted w-[220px] shrink-0">Target</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted w-[400px] shrink-0">Actual</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted w-[110px] shrink-0 text-right ml-auto">Result</span>
      </div>

      {/* ── Per-category rows, unclassified block, empty state ──────────── */}
      <div className="divide-y divide-gray-800/50">
        {categoryAnalysis.map((cat) => (
          <CategoryRow key={cat.id} cat={cat} />
        ))}

        {/* ── Unclassified defects — §4.9 amber ────────────────────────── */}
        {unclassified.length > 0 && (
          <div className="px-4 py-3 bg-amber-500/[0.04]">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Unclassified
                </span>
                {/* §4.8B amber warning badge */}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  NOT IN PROFILE
                </span>
              </div>
              <span className="text-[10px] font-mono text-amber-400/70">
                {unclassified.reduce((a, [, c]) => a + c, 0)} found
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pl-1">
              {unclassified.map(([id, count]) => (
                <div
                  key={id}
                  className="inline-flex items-center gap-2 bg-canvas border border-amber-500/20 rounded-md px-3 py-1.5 shadow-sm"
                >
                  {/* §4.8A mandates text-[10px] uppercase on Value Chip text, but a raw
                      defect id (e.g. "def_hole") is left un-uppercased here — same
                      established exception this codebase already applies to defect
                      NAMES elsewhere ("Hole", not "HOLE"). Logged in AUDIT_REPORT.md. */}
                  <span className="font-mono text-[10px] text-amber-400/70">{id}</span>
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 min-w-[1.5rem] text-center">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
