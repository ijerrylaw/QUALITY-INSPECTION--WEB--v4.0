# ISO 2859-1 Math Engine & Business Logic

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines the mathematical algorithms, AQL lookup matrix, formatting functions, and pass/fail evaluation logic[cite: 6]. 
*(Note: Data structures referenced here are defined in DATA_SCHEMAS_AND_TYPES.md).*

---

## 1. ISO 2859-1 MASTER AQL LOOKUP ENGINE (`getAQLThresholds`)
* **Bracket Snapping:** If an operator inputs an arbitrary sample size (e.g., 200), the engine MUST snap to the nearest standard ISO bracket (13, 20, 32, 50, 80, 125, 200, 315, 500...)[cite: 6].
* **Threshold Matrix Lookup:** The engine matches the AQL Level (e.g., "1.5") and bracketed sample size against an internal matrix to return `{ ac: AcceptanceLimit, re: RejectionLimit }`[cite: 6].
* **Zero Tolerance Overrides:** AQLs designated as `AND` automatically lock to `{ ac: 0, re: 1 }`[cite: 6].

## 2. VERDICT EVALUATION LOGIC (`evaluateAQLVerdict`)
The evaluation function determines the final PASS/FAIL verdict by mapping recorded defect quantities against categorized thresholds[cite: 6]:
* **CUMULATIVE Mode:** All defect counts within a category are summed together[cite: 6]. Fails if $\sum \text{Defects} > ac$[cite: 6].
* **GRANULAR Mode:** Each individual defect type is checked independently[cite: 6]. Fails if *any* single $\text{Defect Count} > ac$[cite: 6].
* **PASS / FAIL / NIL Mode:** Fails if any qualitative item logs a fail state[cite: 6].

## 3. DATA AUTOMATIONS & LINKED PARAMETERS
* **SKU Weight Auto-Extraction:** The engine dynamically extracts standard glove weight from characters 1 to 3 of the Product Code string (e.g., `N035SKB-OC-24FT` converts to `3.50g`)[cite: 6].
* **Profile Mapping:** Selecting a SKU triggers a lookup in `productProfileMap` to load the correct `InspectionProfile` limits[cite: 6].
* **Timestamp Precision:** `submissionTimestamp` is generated with millisecond precision upon submission to prevent backdating[cite: 6].

## 4. DATE & SHIFT ALGORITHMS
* **Julian Date Compression:** Production dates are mathematically compressed into 3-digit Julian Days (e.g., Feb 1st = `032`) for standardization[cite: 6].
* **Night Shift Rollover Logic:** If an inspection occurs between Midnight (`00:00`) and the start of the Morning Shift, it is assigned to Shift 'Night', and exactly 1 day is subtracted from the effective Production Date[cite: 6].
* **Lot Number Assembly:** Fully constructs lot codes using the formula: `[Line] + [Machine] + [JulianDate] + [Sequence]` (e.g., `A004A6182001`)[cite: 6].
* **Time Auto-Formatting:** Time inputs format to 2-digit zero-padded numbers (e.g., `08:00`), and shift duration badges use 1-minute subtract formatting (e.g., `08:00 - 19:59`)[cite: 6].