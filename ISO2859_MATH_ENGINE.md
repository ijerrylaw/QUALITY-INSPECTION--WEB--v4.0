# ISO 2859-1 Math Engine & Business Logic

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines the mathematical algorithms, AQL lookup matrix, formatting functions, and pass/fail evaluation logic.  
*(Note: Data structures referenced here are defined in `DATA_SCHEMAS_AND_TYPES.md`.)*

---

## 1. ISO 2859-1 MASTER AQL LOOKUP ENGINE (`getAQLThresholds`)

* **Bracket Snapping:** If an operator inputs an arbitrary sample size, the engine MUST snap to the nearest standard ISO 2859-1 bracket. On exact distance ties, the larger bracket wins (conservative industry standard).  
  Full bracket list: `[2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500]`

* **Threshold Matrix Lookup:** The engine matches the AQL Level string (e.g., `"1.5"`) and the bracketed sample size against an internal matrix to return `{ ac: AcceptanceNumber, re: RejectionNumber }`.

* **Zero Tolerance Overrides:** AQL levels designated as `AND` (or containing the word "AND") automatically lock to `{ ac: 0, re: 1 }`. Any defect count above zero immediately triggers a FAIL for that category.

---

## 2. VERDICT EVALUATION LOGIC (`evaluateAQLVerdict`)

The evaluation function determines the final PASS/FAIL verdict by mapping recorded defect counts against per-category AQL thresholds. A **single failing category fails the entire lot**.

* **CUMULATIVE Mode:** All defect counts within a category are summed. Fails if `Σ defects > ac`.  
  *Use this mode for zero-tolerance AND categories — any count > 0 will exceed `ac: 0` and immediately fail.*

* **GRANULAR Mode:** Each individual defect type is checked independently. Fails if any single `defect count > ac`.

* **N/A Mode:** Qualitative state-encoded check. The `defectCounts` value is interpreted as a state integer:
  - `0` = not recorded
  - `1` = pass (qualitative OK)
  - `2` = fail (qualitative NOK)
  
  Fails if any item has state `=== 2`.

* **Empty String `''` Mode:** The engine skips this category entirely — captured defect counts never affect the verdict. This is what a **RECORD ONLY** AQL Level category writes as its `evaluationMode` (Configuration Control > Quality Rules auto-locks it, mirroring the dimension-level Graded/Record-only pattern — see §5). Distinct from N/A mode above: a PASS/FAIL category is still evaluated (qualitative pass/fail per defect); only RECORD ONLY truly opts a category out of verdict computation.

---

## 2A. ACTUAL AQL ACHIEVED (`findActualAqlAchieved`)

A second, **independent** data point recorded alongside the assigned-AQL verdict: the **tightest (lowest) standard ISO 2859-1 AQL level whose Ac/Re threshold the observed defect count still satisfies**, at the same bracket-snapped sample size already used for that category's verdict.

It answers *"what quality level did this lot actually demonstrate?"* — not *"did it pass?"*. The two are deliberately decoupled: a category assigned `AND` (zero tolerance) that recorded 1 defect **fails** its own verdict yet can still report a tight Actual AQL. That is the intended behavior, not a contradiction.

* **The ladder:** `findActualAqlAchieved()` walks `ACHIEVABLE_AQL_LEVELS` (`'0.65'`, `'1.0'`, `'1.5'`, `'2.5'`, `'4.0'`, `'6.5'`) in ascending order, calling the **same `getAQLThresholds()`** used for the assigned-AQL lookup — the matrix is never read directly and never duplicated. `Ac` is monotonically non-decreasing along that list for any fixed bracket (verified across all 13 rows), so the first level satisfying `count ≤ Ac` is by construction the tightest.

  The ladder stops at `'6.5'` **deliberately**, mirroring Configuration Control's assignable whitelist (`QualityRules.tsx`'s `ISO_WHITELIST`) exactly, so it can never report a level a category could not have been *assigned*. `ACHIEVABLE_AQL_LEVELS` is a strict subset of `SUPPORTED_AQL_LEVELS`, which still carries all 7 levels — see the note below.

* **Which count is compared** — mode-dependent, and frozen as `evaluatedCount` because for GRANULAR it deliberately differs from `totalCount`:
  - **CUMULATIVE** — the category **sum** (the same value its assigned verdict compares).
  - **GRANULAR** — the **MAX single defect count**. GRANULAR passes a level iff *every* individual count ≤ Ac, which is equivalent to its largest single count doing so. Using the sum here would report a looser level than the category genuinely achieved under its own grading rule.
  - **N/A** — no ladder is run. See below.

* **Three recorded states — never null, never blank, for any graded category:**
  - `ACHIEVED` — carries the level plus its Ac/Re. `'0.65'` is the tightest column the table has, so it reads as *"0.65 or better"*; the metric cannot resolve finer.
  - `EXCEEDS_ALL` — the count busts even the loosest **achievable** level (`'6.5'`). An **explicit hard-fail state** carrying that level's Ac/Re (the bar that was still missed), so a catastrophic category is visibly distinct from "not computed". A count that would only have fit under the matrix's `'10'` column lands here, since `'10'` is not an achievable level.
  - `QUALITATIVE` — an N/A-mode (PASS/FAIL) category. Its `defectCounts` values are state codes (§2), not defect counts, so there is no count to grade. Recorded as an explicit state rather than a fabricated AQL level derived from a state code.

* **Scope:** every category the engine grades. RECORD ONLY / OFF categories are excluded by the existing empty-string `evaluationMode` skip path (§2) — they never receive a `CategoryResult`, so their frozen value is `null`, meaning *not graded* (never *graded but unknown*).

* **Physical dimensions and Glove Weight are excluded** — structurally, not by a guard. Dimension measurements never enter `defectCounts`; the dimension and AQL systems meet only at the final combined verdict (§5). They keep their existing in-spec / out-of-spec display and never carry an AQL level.

* **Frozen once, never recomputed.** Computed at submission time (and refrozen at amendment-approval time, in the same transaction as `verdict`) into `Submission.gradingSnapshot` — the same rule as all other frozen grading data. It must never be recomputed live and never changes if Product Engine or Inspection Profile config changes later. Existing submissions were deliberately **not** backfilled; their snapshots simply lack the field and render without it.

**Source:** `findActualAqlAchieved()` / `ActualAqlAchieved` in `backend/src/engine/aqlEvaluator.ts`; frozen via `buildFrozenCategoryAnalysis()` in `backend/src/engine/resolveVerdict.ts`.

> **Vocabulary asymmetry — resolved 2026-09-01** (commit `347549f`; `AUDIT_REPORT.md` #29).
> The ladder previously scanned all 7 `SUPPORTED_AQL_LEVELS` including `'10'`, while
> `ISO_WHITELIST` stopped at `'6.5'` — so an *actual* level of `10` could be reported for a
> category whose *assigned* level could never be `10`. That asymmetry was **removed by
> narrowing the ladder**, not left in place: `ACHIEVABLE_AQL_LEVELS` (6 levels) now defines
> what the ladder scans and reports, and `ISO_WHITELIST` remains the source of truth for what
> is assignable.
>
> **The matrix data is untouched.** `SUPPORTED_AQL_LEVELS` still lists all 7 levels and
> `ISO_2859_MATRIX` still carries its full `'10'` column for every bracket. `getAQLThresholds()`
> resolves `'10'` normally, so a category whose assigned `aqlLevel` is `'10'` (reachable by
> direct API call, though not through the admin UI) still grades against the correct Ac/Re —
> including the exact-key-before-padded-key fix that made AQL 10 resolve at all. **Only what the
> achievement ladder scans and reports changed.**
>
> Forward-only: any frozen `gradingSnapshot` row predating the change may still carry an actual
> level of `'10'`. Those are accepted historical artifacts — grading is never recomputed after
> freeze (`AUDIT_REPORT.md` #18) and nothing was backfilled.

---

**Engine source files:**
- Matrix + bracket snap: `backend/src/engine/iso2859-matrix.ts`
- Verdict engine: `backend/src/engine/aqlEvaluator.ts`
- Physical dimension engine (server-side): `backend/src/engine/dimensionEvaluator.ts` — see §5.
- Shared resolution + combined verdict: `backend/src/engine/resolveVerdict.ts`
- Display-only inline copies (frontend, never used for persistence — kept in sync manually): `frontend/src/components/history/HistoryFeed.tsx`, `frontend/src/pages/wizard/StepReviewSubmit.tsx`

---

## 3. DATA AUTOMATIONS & LINKED PARAMETERS

* **SKU Weight Resolution:** Default glove weight is resolved from `weightTarget` in `ProductConfig` for the selected size (e.g., `sizes['M'].weightTarget`). Falls back to parsing characters 1–3 of the Product Code string (e.g., `N035SKB-OC-24FT` → `3.50g`).

* **Profile Selection:** Profiles are product-agnostic and user-selected via a dropdown in Step 1 of both wizards (Single and Batch) — selecting a SKU does **not** auto-load a profile. The dropdown pre-selects whichever profile is flagged `isDefault: true` in AppConfig; the operator can override it. `productProfileMap[productCode] → profileId` still exists as a **backend-only** fallback for callers that submit with no `profileId` at all (see `API_AND_INTEGRATION_SPEC.md` §1's `POST /api/submissions` resolution order) — falling back further to the first AppConfig profile with usable rules, then the hardcoded GLOBAL STANDARD (DEFAULT) — but neither wizard leaves `profileId` empty anymore, so this path is effectively dormant for normal submissions.

* **Timestamp Precision:** `submissionTimestamp` is generated with millisecond precision upon submission to prevent backdating and ensure uniqueness across parallel sessions.

---

## 4. DATE & SHIFT ALGORITHMS

* **Production Date is Operator-Editable:** The production date/time is a manual-override field in both wizards (not silently locked to "today"), so operators can record backdated or cross-shift-boundary lots. All the logic below (Julian compression, night-shift rollover, shift auto-display) recomputes live from whatever date/time is currently entered.

* **Julian Date Compression:** Production dates are mathematically compressed into 3-digit Julian Days (e.g., Feb 1st = `032`) for use in lot number assembly.

* **Night Shift Rollover Logic:** If an inspection occurs between Midnight (`00:00`) and the start of the Morning Shift, it is assigned to Shift 'Night', and exactly 1 day is subtracted from the effective Production Date.

* **Lot Number Assembly:** Fully constructs lot codes using the formula:
  `[Line] + [Side] + [YJJJ] + [Sequence]` → e.g., `A001A6218001` (Line `A001` + Side `A` + YJJJ `6218` + Sequence `001`). **Note:** this lot number is not invented by the app — it must match what the company's ERP separately registers for the same physical lot. The app's job is to let the operator record the correct number (format + uniqueness validated server-side, `Submission.batchNumber @unique`), not compute/guess it. Line and Side are operator-selected from Configuration Control; Sequence is a required, operator-entered 3-digit field with **no auto-default and no auto-increment** — auto-incrementing would capture submission order, not true production order, since operators routinely consolidate multi-lot test results out of production order. A non-binding "suggested next sequence" hint (max existing sequence + 1 for the same Line+Side+YJJJ group) is shown next to the field for reference only. Single Entry (`StepMetadata.tsx`) and Batch Entry (`BatchEntry.tsx`) share one composition implementation (`frontend/src/utils/lotNumber.ts`) so the two entry paths can never drift into incompatible formats again.

* **Time Auto-Formatting:** Time inputs format to 2-digit zero-padded numbers (e.g., `08:00`). Shift duration badges use 1-minute subtract formatting (e.g., `08:00 – 19:59`).

---

## 5. PHYSICAL DIMENSION EVALUATION LOGIC (`StepDimensions` & `BatchEntry`)

* **Server-Side Mirror:** `backend/src/engine/dimensionEvaluator.ts` mirrors this logic exactly (same threshold formulas, same quirks — e.g. `ProductDimensionDef.isMin` is intentionally never read; `isMin` is derived purely from whether a size's tolerance field is the literal string `'MIN'`). This is no longer a fully client-only, AQL-independent system: `resolveVerdict()` now combines both into the one persisted verdict — `(AQL verdict === 'FAILED') OR (failedDimensions > 0)` — so a dimension-only failure can no longer be silently dropped from what gets saved. See §2's engine source file list.

* **Graded vs Record-only (`ProductDimensionDef.isGraded`):** A CUSTOM dimension can be marked **Record-only**, in which case it is excluded from grading entirely — no threshold comparison is attempted, and it can never contribute to `failedDimensions` or flip a verdict to FAIL. Everything else about it is unchanged: the operator still captures the same 5 slots (still pre-populated from `minSpec`, still required by the "complete all N slots" gate), the values are still persisted in `Submission.dimensions` for reporting/trending, and the stored `minSpec`/`tolerance` are never cleared or mutated. The two FIXED dimensions (GLOVE LENGTH, PALM WIDTH) are always graded and cannot be marked Record-only.
  - **Default is implicit:** only the literal `false` means Record-only. See `ProductDimensionDef.isGraded` in `DATA_SCHEMAS_AND_TYPES.md` §3 for why the default must never be written to storage.
  - **Applied in four places, all reading the same `isDimensionGraded()` rule:** `dimensionEvaluator.ts` (authoritative, server-side), `StepDimensions.tsx` (GUIDED, client-side real-time), `StepReviewSubmit.tsx` (client-side verdict combination), and `BatchEntry.tsx` (SPREADSHEET, display-only — it posts no verdict). Each computes an all-false `fails` array for a Record-only dimension rather than computing a comparison and discarding it, so downstream `fails.some(...)` consumers stay correct without knowing the flag exists.
  - **Locked codes:** the flag is part of `ProductConfig`, so `PATCH /api/config`'s existing whole-subtree deep diff already refuses to change it on a product code referenced by any Submission. No separate rule.

* **Parameter Format Control:**
  - Each dimension row (fixed or dynamic) in Product Config features a format dropdown in the UOM cell (`0`, `0.0`, `0.00`, `0.000`).
  - Changing the format immediately reformats all target/spec values in that row to the specified decimal precision.
  - The format setting directly controls input step size (`1`, `0.1`, `0.01`, `0.001`) and `onBlur` precision snapping in both Single and Batch Inspection Wizards.

* **Threshold Formulas:**
  - Minimum Threshold: `minThreshold = minSpec − tolerance`
  - Maximum Threshold:
    - If `isMin === true` or `tolerance === 0`: `maxThreshold = ∞` (no upper cap)
    - Otherwise: `maxThreshold = minSpec + tolerance`

* **Slot Pass/Fail Condition:** A measurement value `x` fails if:  
  `x < minThreshold  OR  x > maxThreshold`

* **Slot Delta Labels:**
  - Under-spec failure (`x < minThreshold`): Delta = `x − minThreshold` (negative, e.g. `−2.0mm`)
  - Over-spec failure (`x > maxThreshold`): Delta = `+(x − maxThreshold)` (positive, e.g. `+2.0mm`)

* **Initial State & Pre-Population:**
  - Input slots auto-populate with `minSpec` formatted to the row's configured decimal precision.
  - Pre-filled untouched slots display as `text-muted` to signal auto-populated baseline.
  - Editing a slot converts it to `text-primary` (validated by the operator).
  - Out-of-spec values switch to `text-rose-400 bg-rose-500/5 border-rose-500/50`.
