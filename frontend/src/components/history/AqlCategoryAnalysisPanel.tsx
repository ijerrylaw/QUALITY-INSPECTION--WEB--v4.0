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
 */

import { ShieldCheck } from 'lucide-react';

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

function isPassFailNil(aqlLevel: string): boolean {
  return /pass.?fail/i.test(aqlLevel) || /nil/i.test(aqlLevel);
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

export interface CategoryAnalysis {
  id: string;
  name: string;
  aqlLevel: string;
  evaluationMode: string;
  threshold: { ac: number; re: number } | null;
  totalCount: number;
  /** true=PASS, false=FAIL, null=qualitative/informational/not-yet-available (no verdict shown) */
  passed: boolean | null;
  defectItems: DefectItem[];
}

export interface AqlCategoryAnalysisPanelProps {
  categoryAnalysis: CategoryAnalysis[];
  unclassified: [string, number][];
  totalClean: number;
  sampleSize: number;
  displayProfileName?: string | null;
  anyFail: boolean;
  noProfileLinked: boolean;
  /** 'snapshot' = a frozen gradingSnapshot is being shown, no live fetch involved. */
  previewStatus: 'snapshot' | 'loading' | 'error' | 'success';
  previewErrorMessage?: string;
}

export function AqlCategoryAnalysisPanel({
  categoryAnalysis,
  unclassified,
  totalClean,
  sampleSize,
  displayProfileName,
  anyFail,
  noProfileLinked,
  previewStatus,
  previewErrorMessage,
}: AqlCategoryAnalysisPanelProps) {
  const snappedBracket = snapBracket(sampleSize);

  return (
    <div className="rounded-lg border border-gray-800 bg-surface whitespace-normal">

      {/* Panel header — always the first child, so it owns the top corners directly. */}
      <div className="rounded-t-lg bg-gray-800/50 px-4 py-2 flex items-center justify-between border-b border-gray-800 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <ShieldCheck className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={2} />
          <span className="text-xs font-bold uppercase tracking-wider text-muted">
            AQL Category Analysis
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
          {previewStatus === 'loading' && (
            <span className="text-[10px] text-muted font-mono animate-pulse">Loading AQL analysis…</span>
          )}
          {previewStatus === 'error' && (
            <span className="text-[10px] text-amber-400 font-mono">
              AQL analysis unavailable ({previewErrorMessage}) — showing raw defect counts only.
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          {/* ISO bracket note */}
          <span className="text-[10px] font-mono text-muted">
            n={sampleSize} → ISO n={snappedBracket}
          </span>
          {/* Clean total */}
          <span className="text-[10px] font-mono text-muted">
            {totalClean} defect{totalClean !== 1 ? 's' : ''} total
          </span>
          {/* Active profile name — §4.5 cyan for system identity */}
          {displayProfileName && (
            <span className="text-[10px] font-bold font-mono text-brand-secondary uppercase tracking-wider">
              {displayProfileName}
            </span>
          )}
        </div>
      </div>

      {/* ── Per-category rows, unclassified block, empty state ──────────────
          Whichever of these three ends up last in the DOM (data-dependent —
          see file header) gets its bottom corners rounded via the arbitrary
          :last-child selector below, so no overflow-hidden is needed to
          keep the panel's corners visually clean. */}
      <div className="divide-y divide-gray-800/50 [&>*:last-child]:rounded-b-lg">
        {categoryAnalysis.map((cat) => {
          const isFail = cat.passed === false;
          const isNA = cat.passed === null;
          const zeroTol = isZeroTolerance(cat.aqlLevel);
          const pfNil = isPassFailNil(cat.aqlLevel);

          return (
            <div
              key={cat.id}
              className={`px-4 py-3 transition-colors ${isFail ? 'bg-rose-500/[0.04]' : ''}`}
            >
              {/* Row: meta chips left · count + verdict right */}
              <div className="flex items-center justify-between flex-wrap gap-y-1.5 gap-x-3">

                {/* LEFT: category identity + AQL chips */}
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  {/* Category name — min-w (not a fixed w-) so a longer name grows instead of truncating */}
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted min-w-[90px] shrink-0">
                    {cat.name}
                  </span>

                  {/* AQL Level — §4.8A indigo for system parameter */}
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] uppercase bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                    {cat.aqlLevel || '—'}
                  </span>

                  {/* Evaluation mode — §4.8B emerald active, gray N/A */}
                  {cat.evaluationMode ? (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      cat.evaluationMode === 'CUMULATIVE' || cat.evaluationMode === 'GRANULAR'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-gray-500/10 border-gray-500/30 text-gray-400'
                    }`}>
                      {cat.evaluationMode}
                    </span>
                  ) : null}

                  {/* Acceptance threshold chip — §4.8A standard value chip */}
                  {zeroTol && (
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-gray-800/50 border border-gray-700/50 text-muted">
                      Ac: 0  ·  zero tolerance
                    </span>
                  )}
                  {!zeroTol && !pfNil && cat.evaluationMode && cat.evaluationMode !== '' && cat.threshold && (
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-gray-800/50 border border-gray-700/50 text-muted">
                      Ac ≤ {cat.threshold.ac}  ·  Re ≥ {cat.threshold.re}
                    </span>
                  )}
                  {pfNil && (
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-gray-800/50 border border-gray-700/50 text-muted">
                      qualitative
                    </span>
                  )}
                </div>

                {/* RIGHT: count + verdict */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Defect count */}
                  <span className={`text-[11px] font-mono font-bold ${
                    cat.totalCount === 0
                      ? 'text-muted'
                      : isFail
                        ? 'text-rose-400'
                        : 'text-primary'
                  }`}>
                    {cat.totalCount} found
                  </span>

                  {/* Category verdict badge — §4.8B */}
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
                  {(isNA || !cat.evaluationMode) && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-500/10 border border-gray-500/30 text-gray-400">
                      N/A
                    </span>
                  )}
                </div>
              </div>

              {/* Defect pills — only shown for non-zero counts */}
              {cat.defectItems.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 pl-1">
                  {cat.defectItems.map((item) => (
                    <div
                      key={item.id}
                      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 border shadow-sm ${
                        item.failing
                          ? 'bg-rose-500/10 border-rose-500/30'
                          : 'bg-canvas border-gray-700/50'
                      }`}
                    >
                      <span className="font-mono text-[11px] text-primary">{item.name}</span>
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

              {/* Zero-defect placeholder */}
              {cat.defectItems.length === 0 && (
                <div className="mt-1 pl-1">
                  <span className="text-[10px] font-mono text-muted/40">none recorded</span>
                </div>
              )}
            </div>
          );
        })}

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
              <span className="text-[11px] font-mono text-amber-400/70">
                {unclassified.reduce((a, [, c]) => a + c, 0)} found
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pl-1">
              {unclassified.map(([id, count]) => (
                <div
                  key={id}
                  className="inline-flex items-center gap-2 bg-canvas border border-amber-500/20 rounded-md px-3 py-1.5 shadow-sm"
                >
                  <span className="font-mono text-[11px] text-amber-400/70">{id}</span>
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 min-w-[1.5rem] text-center">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {totalClean === 0 && unclassified.length === 0 && (
          <div className="px-4 py-5 text-sm text-muted font-sans text-center">
            No defects recorded for this lot.
          </div>
        )}
      </div>
    </div>
  );
}
