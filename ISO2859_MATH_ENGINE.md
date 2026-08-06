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

* **Empty String `''` Mode:** The engine skips this category entirely. Used for informational-only rows (e.g., PACKAGING in pass/fail/nil mode where no numeric AQL applies).

**Engine source files:**
- Matrix + bracket snap: `backend/src/engine/iso2859-matrix.ts`
- Verdict engine: `backend/src/engine/aqlEvaluator.ts`
- Display-only inline copy (frontend): `frontend/src/components/history/HistoryFeed.tsx`

---

## 3. DATA AUTOMATIONS & LINKED PARAMETERS

* **SKU Weight Resolution:** Default glove weight is resolved from `weightTarget` in `ProductConfig` for the selected size (e.g., `sizes['M'].weightTarget`). Falls back to parsing characters 1–3 of the Product Code string (e.g., `N035SKB-OC-24FT` → `3.50g`).

* **Profile Mapping:** Selecting a SKU triggers a lookup in `productProfileMap` (from `AppConfig`) to auto-load the correct `InspectionProfile` limits. If no mapping exists, the backend falls back to the first AppConfig profile with usable rules, then the hardcoded GLOBAL STANDARD (DEFAULT).

* **Timestamp Precision:** `submissionTimestamp` is generated with millisecond precision upon submission to prevent backdating and ensure uniqueness across parallel sessions.

---

## 4. DATE & SHIFT ALGORITHMS

* **Julian Date Compression:** Production dates are mathematically compressed into 3-digit Julian Days (e.g., Feb 1st = `032`) for use in lot number assembly.

* **Night Shift Rollover Logic:** If an inspection occurs between Midnight (`00:00`) and the start of the Morning Shift, it is assigned to Shift 'Night', and exactly 1 day is subtracted from the effective Production Date.

* **Lot Number Assembly:** Fully constructs lot codes using the formula:  
  `[Line] + [Machine] + [JulianDate] + [Sequence]` → e.g., `A001A6218001`

* **Time Auto-Formatting:** Time inputs format to 2-digit zero-padded numbers (e.g., `08:00`). Shift duration badges use 1-minute subtract formatting (e.g., `08:00 – 19:59`).

---

## 5. PHYSICAL DIMENSION EVALUATION LOGIC (`StepDimensions` & `BatchEntry`)

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
