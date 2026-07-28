# Quality Inspection Wizard & Configuration Control Plan

This plan details the Dual-Mode Data Entry Architecture, Configuration Control engine, and Dimension Evaluation System.

> [!IMPORTANT]
> **Strict System Governance & Compliance Directive:**
> All code, components, styling, and implementation steps **MUST strictly comply with `UI_DESIGN_SYSTEM.md` and `AI_RULES.md`**:
> 1. **Micro-Step Execution (`AI_RULES.md`):** Create/edit one file at a time, verify, and await user review.
> 2. **Design Tokens (`UI_DESIGN_SYSTEM.md`):** Rely strictly on Tailwind tokens (`bg-canvas`, `bg-surface`, `bg-brand-primary`, `text-primary`, `text-muted`). Zero raw hex codes or magic inline numbers.
> 3. **Typography Standards (`UI_DESIGN_SYSTEM.md`):** All headings, buttons, and form labels use `Inter`. All numerical inputs, table cells, and lot readouts strictly use `JetBrains Mono` (`font-mono`).
> 4. **Touch Target Standard (`UI_DESIGN_SYSTEM.md`):** All interactive buttons, inputs, and selection tags MUST maintain a minimum height of `48px` (`h-12`) with `8px` (`rounded-lg`) border radius.

---

## 1. Dual-Mode Data Entry Architecture (`/wizard`)

A top header toggle allows operators to switch between **Guided 4-Step Wizard Mode** (lot-by-lot) and **Excel-Style Spreadsheet Grid Mode** (multi-lot batch entry).

```
Header Switcher: [ 🪄 Guided 4-Step Wizard ]  [ 📊 Excel-Style Spreadsheet Grid ]
```

---

### MODE A: Guided 4-Step Wizard Mode (Single Lot Focus)

Optimized for gloved tablet operation with focused, single-lot card views.

#### Page 1: Inspection Metadata & Setup
- **Title:** `Inspection Metadata & Setup`
- **Fields & Automations:** Inspection Profile, Product Code, Glove Size, Production Date & Time, Shift (Auto 24/7 rollover), Production Line (`A001`), Side (`A`/`Z`), Lot Number (`6182`), Sequence Number (`001`), Total Carton (`18`), Sample Size (`125`), Glove Weight (`xx.xx`), Full System Lot Number (`A004A6182001`).

#### Page 2: Physical Dimensions (Single-Lot Card Layout)
- **Graphical Layout:** Large card grid (1 card per dimension with 5 large 48px touch inputs).
- **Slot Statistics & Delta Reporting:** Evaluates all 30 slots against `[Min Spec - Tolerance]`. Top summary badge (`28/30 Slots Passed | 2 Out-of-Spec`). Red delta text (`-0.005mm`) directly below out-of-spec slot boxes.

#### Page 3: Defect Tabulation
- **Quantitative (`0.65`-`6.5`):** Rapid-tap counter grid (`-` / count / `+`).
- **Qualitative (`PASS / FAIL / NIL`):** 3-way toggle button chips `[PASS (Green) | FAIL (Red) | NIL (Gray)]`.

#### Page 4: Review & Final Submission
- Summary readout, ISO 2859-1 verdict presentation, Retain Context toggle, and **"Submit & Next Lot"** rapid-loop button.

---

### MODE B: Excel-Style Spreadsheet Grid Mode (Multi-Lot Batch Focus)

Optimized for high-density desktop & tablet keyboard entry (`Tab` key cell-by-cell navigation).

1. **Shared Header Metadata Bar (Set Once):**
   - Profile, Product Code, Glove Size, Production Line, Side (A/Z), Production Date & Time, Shift (Auto), Sample Size.
2. **Multi-Lot Data Table (Rows = Lots, Columns = Measurements):**
   - **Graphical Contrast:** Presents a multi-lot high-density table (compact `h-9` cells) rather than single-lot cards. Both modes share the exact same design tokens (`bg-canvas`, `bg-surface`, `font-mono`) and color logic (Emerald for spec pass, Rose for out-of-spec).
   - **Keyboard Navigable Input Cells (`font-mono`):** Glove Weight (`xx.xx`), 5 Palm Widths, 5 Glove Lengths, 5 Thicknesses (Beading, Cuff, Palm, Finger). Workers press `Tab` / `Enter` to jump cell-by-cell across rows.
   - **Quick Defect Popover Modal (UI Spec in `UI_DESIGN_SYSTEM.md` § 9):** Each row displays a `Defects (0)` badge chip. Pressing `Spacebar` or clicking opens a rapid popover overlay (`bg-surface`, severity tabs, 48px touch counters or `[PASS|FAIL|NIL]` toggles) to tap defect counts for that lot row.
   - **Real-Time Status Readout:** 30-slot compliance badge + AQL Pass/Fail verdict calculated per row instantly.
3. **Batch Actions:**
   - **`+ Add Lot Row`** (appends next sequence `004`, `005`).
   - **`Submit Batch (N Lots)`** (submits all filled rows to backend in a single bulk API transaction).

---

## 2. Configuration Control Engine

Organized into 3 clean submenus in the Left Sidebar (without numeric prefixes), each equipped with a **dedicated Submenu-Level Save Action Bar**:

### Save Changes Architecture
- **Submenu-Level Save Bar:** Dedicated "Save Changes" button in a fixed action bar with an **`Unsaved Changes` dirty indicator**.
- **Unsaved Changes Guard:** Navigating away to another submenu with pending edits triggers a confirmation modal ("Save Changes or Discard?").

### Factory & Line Setup
- Production Lines (`A001`), Shift Registration (`08:00 - 19:59`), Sides (`A`/`Z`).

### Product Engine
- Product Code Builder, SKU Dimension Target Matrix (Min Spec + Tolerance), Target Glove Weight (`xx.xx`), Glove Sizes, ISO Sample Sizes.

### Quality Rules
- **Strict Immutable ISO 2859 Whitelist:** AQL Level locked to 8 options (`AND`, `0.65`, `1.0`, `1.5`, `2.5`, `4.0`, `6.5`, `PASS / FAIL / NIL`).
- **Evaluation Mode Auto-Locking:** Locked to `N/A` for `AND` & `PASS / FAIL / NIL`.
- **Defect Management Kanban Board:** `+ Add Defect` button, inline Edit/Delete icons, drag-and-drop category remapping.

---

## Verification Plan

1. **Quick Defect Popover Test:** In Grid mode, click `Defects (0)` or press Spacebar on a row $\rightarrow$ verify popover modal opens matching `UI_DESIGN_SYSTEM.md` § 9 specs.
2. **Graphical Layout Test:** Verify Guided Wizard Mode presents single-lot large touch cards, while Spreadsheet Grid Mode presents a multi-lot high-density table.
3. **Design Token Consistency Test:** Verify both modes share identical Emerald/Rose background tokens and JetBrains Mono numerical styling.

---

Please review this plan. Whenever you are ready to start implementation, reply with **"proceed to execute"**.
