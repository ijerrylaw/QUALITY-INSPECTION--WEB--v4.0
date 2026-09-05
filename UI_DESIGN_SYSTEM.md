# Global UI Design System & Strict Styling Rules

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Global Master Playbook. These rules MUST be strictly enforced across ALL pages and menus in the entire application — including Configuration Control, Quality Entry Wizard (Single/Batch), Inspection Records, Approval Queue, Quality Analytics, and System & Tenant Admin — to guarantee a 100% unified, enterprise-grade experience.  
*(Note: For data types, see `DATA_SCHEMAS_AND_TYPES.md`. For access rules, see `NAVIGATION_AND_RBAC.md`.)*

---

## CHAPTER 1: CORE TOKENS

### 1.1 Color Palette (White-Labeled Tokens)
Raw hex codes are strictly prohibited. Utilize the Tailwind CSS v4 variables defined below:
* **Chart Library Exemption:** Recharts (and similar SVG-based charting libraries) accept `fill`/`stroke` props as raw color values, not Tailwind classes. Raw hex codes are permitted there, but MUST be the exact hex values of the tokens below (e.g. `#08C8CD` for Brand Secondary, `#EF4444` for Danger) — never invented one-off colors outside this palette.
* **Canvas (Background):** `bg-canvas` (`#0B0F19`) — Primary background.
* **Surface (Cards/Modals):** `bg-surface` (`#111827`) — Elevated containers.
* **Brand Primary:** `bg-brand-primary` (`#3F48CC`) — Core brand blue.
* **Brand Secondary:** `bg-brand-secondary` (`#08C8CD`) — Cyan highlights.
* **Accent Gradient:** `bg-accent-gradient` — Linear gradient from Primary to Secondary.
* **Danger (Fail):** `bg-danger` (`#EF4444`) — Reserved for failure states. In practice, use `rose-500`/`rose-400` utility classes for component-level failure styling.
* **Text Primary:** `text-primary` (`#F3F4F6`) — High contrast off-white.
* **Text Muted:** `text-muted` (`#9CA3AF`) — Secondary text.

### 1.2 Structural Geometry & Container Hierarchy (Compact Spacing)
* **Global Page Wrapper:** Outer page containers MUST use `p-6` padding and `space-y-4` gap spacing.
* **Global Border Radius:** All interactive components MUST use **8px** radius (`rounded-lg`).
* **Concentric Radius Formula:** When nesting containers: `Inner Radius = Outer Radius − Padding`.
* **Global Component Height (Desktop First):** To maximize data density, interactive form elements (inputs, dropdowns) MUST maintain a compact `h-9` (36px) height. Action buttons and navigation tabs use `h-10` (40px).
* **Card Padding:** Standard card padding is strictly `p-4`.
* **Container Hierarchy (Tier System):** Define a strict 3-tier nesting model to prevent messy "borders within borders":
  - **Tier 1 (Outer Cards):** `bg-canvas border border-gray-800`
  - **Tier 2 (Inner Sections):** `bg-surface border border-gray-700/50`
  - **Tier 3 (Deeply Nested Items / Rows):** `bg-canvas border border-gray-700`

### 1.3 Typography & Strict Font Protocol
* **The Golden Rule:**
  - **UI Chrome** (labels, headers, buttons, helper text) MUST use `Inter` (sans-serif).
  - **User Data** (editable fields, key-in inputs, dropdown selections, database values, codes) MUST use `JetBrains Mono` (`font-mono`). This creates a strict visual boundary between the application structure and the underlying data.
* **Text Data Exemption:** While numbers, codes, IDs, and timestamps strictly use `JetBrains Mono`, long readable text strings (like emails, user names, or descriptive notes) should remain in standard `Inter` (sans-serif) for natural reading legibility.
* **Action Buttons** (e.g., "SAVE CONFIGURATION"): Strictly UPPERCASE with `tracking-wider text-xs font-bold` (`Inter`). No exceptions for inline table buttons.
* **Helper/Description Text** (under headers): `text-xs text-muted mt-1 font-normal normal-case` (`Inter`).
* **Standard Body Text** (e.g., Kanban defect titles): `text-sm font-semibold text-primary` (`Inter`).
* **Hero Titles (H1):** `text-3xl font-bold uppercase tracking-tight text-primary`
* **Section Headers (H2):** `text-xl font-bold uppercase text-primary`
* **Card Headers (H3):** `text-lg font-semibold uppercase text-primary`
* **Form Labels / Table Headers (`<th>`):** `text-xs font-semibold uppercase tracking-wider text-muted`
* **Dimension Field Name Labels** (Product Engine's Registered Products table, `ProductConfigAccordion.tsx`; Quality Entry Wizard's Physical Dimensions cards, `StepDimensions.tsx`/`BatchEntry.tsx`): `Inter`, never `font-mono` — the field's *name* (e.g. "CUFF THICKNESS") is a UI Chrome label, not User Data, per the Golden Rule; only its numeric measurement values are `font-mono`. Permanence (whether the field is a permanent, non-deletable slot vs. an optional/deletable one) is signaled by weight and opacity only, never by a distinct hue, so it never competes with the per-row Dimension Mode control's own state colors (Ruler/cyan = Graded, Eye/amber = Record Only, EyeOff/grey = Off — §4.14):
  - **Permanent** (Glove Weight, Glove Length, Palm Width, Cuff/Palm/Finger Thickness): `text-sm font-semibold text-primary uppercase` — full-opacity white.
  - **Optional/deletable** (Beading Thickness, any future admin-added custom dimension): `text-sm font-medium text-primary/60 uppercase` — same white, reduced weight and 60% opacity.
  - Both files derive "permanent vs. optional" from the same `isCanonicalThicknessDim()` check already used to gate the Trash/rename controls — never a second, independently-maintained list.

### 1.4 Iconography
* **Library:** `lucide-react` exclusively.
* **Stroke Weight:** Fixed at **2px** (`strokeWidth={2}`).
* **Sizing:**
  - Standard inline icons (form labels, table headers, panel chips): `w-4 h-4` or `w-3.5 h-3.5`.
  - Larger standalone icons (section headers, sidebar): `w-5 h-5` or `w-6 h-6`.
* **Dynamic User Data Exemption:** Items that are dynamically added by the user (e.g., Custom Defect Categories, Kanban cards) MUST NOT use arbitrary decorative icons or semantic colors. They must rely purely on typography (`font-mono font-bold text-primary`) for identification to guarantee UI consistency and infinite scalability.

---

## CHAPTER 2: GLOBAL LAYOUTS

### 2.1 Top Navigation Tabs (Submenus)
* **Internal Geometry:** `h-10 px-6 gap-2 flex items-center justify-center rounded-t-lg` (flat bottom connects seamlessly to the Action Bar below).
* **Typography:** Strictly UPPERCASE, `text-xs font-bold tracking-wider` (`Inter`).
* **Iconography:** `w-4 h-4` Lucide icon placed to the left of the text.
* **State Colors:**
  - Active: `bg-brand-primary text-white`
  - Inactive: `bg-surface text-muted hover:text-primary hover:bg-surface-light transition-colors`

### 2.2 Action Bar (Dirty State)
* Must be docked at the top of the page (`sticky top-0`) immediately below the page tabs, not at the bottom.
* Base styling: `bg-surface border-b border-gray-800 px-6 h-14 flex items-center justify-between z-40`.
* Features a pulsing amber unsaved-changes indicator, a Rose discard button, and an Accent Gradient save button.

### 2.3 Scrollbars
* Implement custom slim, dark-themed scrollbars globally to replace thick native browser scrollbars.
* Styling: `scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent`.

---

## CHAPTER 3: FORMS & DATA ENTRY

### 3.1 Form Controls (Inputs, Dropdowns, Labels)
* **Form Labels with Icons:** When an icon accompanies a form label, it must be `w-3 h-3` and placed immediately to the left of the `text-xs uppercase` label text.
* **Editable State:** `h-9 px-2 bg-canvas border border-gray-700`
  - Focus: `focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none`
  - Inner text: Must strictly use `font-mono text-sm text-primary` (per the Strict Font Protocol).
* **Read-Only / Auto-Generated State:**
  - Background & Border: `bg-surface-light/50 border-transparent`
  - Text & Interaction: `font-mono text-sm text-muted cursor-not-allowed opacity-80`

### 3.2 Vertical Form Layouts (Settings & Admin Pages)
* **Purpose:** Used for dense configuration forms (e.g., System & Tenant Admin) where fields need maximum width.
* **Layout:** Vertically stacked (`flex-col`). The label sits above the input with a tight gap (`gap-1`).
* **Group Spacing:** Distinct form fields or groups MUST be separated by spacing (`gap-4` or `mb-4`) to prevent vertical crowding.

### 3.3 Multi-Field Inline Layouts (Data Grids & Forms)
* When multiple input fields are placed inline within a card (e.g., 6 dictionary dropdowns, or AQL table rows), they MUST use strict CSS Grid (`grid grid-cols-[X] gap-3`).
* This ensures all columns align perfectly vertically down the page, avoiding the jagged edges caused by `flex-wrap`.

### 3.4 Mass Data Entry Inputs (Measurement Grids)
* **Purpose:** Rapid numeric data entry via numpad (e.g., 5 sample inputs for Glove Length).
* **Geometry:** Dense hit-targets (`h-9 w-full`), placed in a tight grid (`gap-1`).
* **Typography:** `JetBrains Mono text-lg text-center`.
* **Pre-Fill Untouched vs. Touched State:**
  - Untouched pre-filled target values MUST be `text-muted opacity-80` to visually signal auto-populated baseline data.
  - Touched/edited values MUST switch to `text-primary` (bright white) to confirm user validation.
  - Out-of-spec failing values MUST switch to `text-rose-400 bg-rose-500/5 border-rose-500/50`.
  - **Scope note:** this untouched/touched color pair is not exclusive to measurement grids — it applies to any single auto-prefilled editable field where the operator needs to see, at a glance, whether a value is still the system's suggestion or something they've confirmed/typed themselves. Reused as-is (same two states, same colors) for the Quality Entry Wizard's Sequence No. field, which auto-fills with the suggested next sequence number but is a single standalone input, not a grid slot (`StepMetadata.tsx`, commit `b3d133e`). Do not invent a parallel token for this pattern elsewhere in the app — reuse this one.
* **Interaction:** Focus states must aggressively highlight to track rapid cursor movement (e.g., `focus:ring-1 focus:ring-brand-secondary focus:border-brand-secondary`).

### 3.5 Primary Add Actions (Header Buttons)
* **Purpose:** Used for creating top-level entities (e.g., `+ ADD PRODUCT CODE`, `+ ADD PROFILE`, `+ ADD CATEGORY`) that sit outside of inline forms, typically in card headers or action bars.
* **Naming Standard:** MUST strictly use the verb `ADD [ENTITY]`. Do not mix with `NEW`, `CREATE`, or `INSERT`.
* **Aesthetic (Ghost Outline):** Emerald Green text on a dark background, lights up Emerald on hover.
* **Tailwind Matrix:** `bg-canvas border border-emerald-500/50 text-emerald-400 hover:text-white hover:bg-emerald-500/20 hover:border-emerald-500 font-bold text-xs uppercase tracking-wider transition-all`
* **Geometry:** Usually `h-9 px-4 rounded-md` (or scaled to `h-12` if aligned with massive input blocks).

### 3.6 Inline Add Actions (Dashed Buttons)
* Standardize all inline add actions to universally say `+ ADD`.
* Base state: `border border-dashed border-gray-700 bg-transparent text-muted text-[11px] font-semibold uppercase tracking-wider`
* Hover state: `hover:text-brand-secondary hover:border-brand-secondary/50 hover:bg-brand-primary/10 transition-all`

### 3.7 Parameter Format Selectors (Setup Grids)
* **Location:** Vertically embedded inside the UOM table cell (`align-top` layout) directly beneath the unit label (e.g., `gram`, `mm`).
* **Geometry & Styling:** Compact `<select>` control (`text-[10px] font-mono font-bold text-center border-gray-700 text-brand-secondary bg-canvas`).
* **Options:** `0`, `0.0`, `0.00`, `0.000` representing integer through 3 decimal places.
* **Behavior:** Selecting a format immediately reformats all target & tolerance numbers in that row to match, and propagates step increment (`1`, `0.1`, `0.01`, `0.001`) and `onBlur` precision snapping to entry wizards.

---

## CHAPTER 4: DATA DISPLAYS & LISTS

### 4.1 High-Density Data Grids (Spreadsheet Mode)
* **Purpose:** Used for Batch Entry tables where vertical space is at an absolute premium.
* **Structure:** MUST use `table-fixed w-full` with explicit column widths to prevent shifting.
* **Input Cells:** Must be dense (`h-8`, `rounded-sm` or `rounded-none`), using `JetBrains Mono text-sm`.

### 4.2 Standard Reading Data Tables
* **Purpose:** Lists of records (like Inspection Logs) prioritizing human readability over raw density.
* **Geometry & Spacing:** Compact row padding (`py-3 px-3`).
* **Separators:** Faint border between rows (`border-b border-gray-700/50`). No vertical borders.
* **Stacked Data Cells:** To save horizontal space (e.g., Date & Time), stack related data. The primary top value MUST be `text-sm font-mono text-primary`, and the secondary bottom value MUST be `text-xs font-mono text-muted`.

### 4.3 Data Table Toolbars
* **Purpose:** Global control bar placed immediately above Standard Reading Data Tables.
* **Layout:** Flex container (`flex justify-between items-center mb-4`).
* **Elements:**
  - Left side: Wide Search input (`w-64` to `w-96`).
  - Right side: Secondary Action Buttons (e.g., FILTER, EXPORT CSV) in a `flex gap-2` row.

### 4.4 Summary Data Cards (Key-Value & KPIs)
* **Summary Key-Value Lists:**
  - Keys MUST be `text-[10px] font-bold uppercase text-muted` and aligned LEFT.
  - Values MUST be `font-mono text-sm text-primary` and aligned RIGHT.
* **KPI Display Blocks:** Large, centered aggregate numbers. The number MUST be `font-mono text-4xl text-primary font-bold`, with the label stacked underneath as `text-[10px] uppercase text-muted`.

### 4.5 The Wizard-Facing Identity Protocol
* **Purpose:** To provide System Administrators with an immediate visual bridge between Configuration Control and the factory floor. Any data entity that acts as a primary, selectable identity in the Quality Entry Wizard (e.g., Line IDs, Shift Names, Defect Categories, SKUs) MUST be visually highlighted in the Configuration screens.
* **Selectable Wizard Identities (Configuration Only):** MUST use `font-mono text-brand-secondary font-bold` (Cyan + Bold).
* **Selectable Wizard Identities (Entry Wizard):** MUST remain standard White text (`text-primary font-mono font-bold`). Do not carry the Cyan highlight into the wizard itself — it creates distractions for operators.
* **Secondary Context & Descriptive Names:** `font-mono text-primary font-normal` (White + Normal).
* **Wizard Pop-up Modal Headers (Exemption):** Do NOT use chips or badges for product codes and lot numbers in modal headers. Use plain text matching the header font size. Auto-generated identifiers (e.g., Full System Lot Number) use Cyan + Bold (`text-brand-secondary font-bold`).
* **Exemption for Data Matrices:** Numeric targets, tolerances, and data matrices MUST remain plain `font-mono text-primary`. Do NOT apply Cyan to dense numeric grids.

### 4.6 Metric Readouts / Aggregates
* **Purpose:** Small calculated values below data entry grids (e.g., MINIMUM, AVERAGE).
* **Layout:** Stacked.
* **Label Typography:** `text-[10px] font-bold uppercase text-muted`.
* **Value Typography:** `font-mono text-sm text-primary` (colors may shift to Danger/Warning if spec is violated).

### 4.7 Critical Output Displays (Digital Readouts)
* **Purpose:** High-visibility generated identifiers (e.g., "FULL SYSTEM LOT NUMBER") in standalone data blocks.
* **Typography:** `font-mono text-xl` or `text-2xl tracking-widest` for maximum legibility.
* **Geometry & Styling:** `bg-gray-900 border border-brand-secondary/50 text-white shadow-inner`.  
  *(Do NOT use this bulky style inside inline pop-up modal headers — use the plain-text exemption from §4.5.)*

### 4.8 Badges, Chips, and Pills (Global Standard)
To maintain absolute consistency, all small contextual overlays MUST adhere to the following semantic matrix. **Never invent new badge styles.**

#### A. Value Chips (Data & Thresholds)
* **Purpose:** Displaying read-only data points, thresholds, boundaries, or metadata parameters.
* **Geometry:** Slightly squared edges (`rounded` or `rounded-md`). Padding `px-2 py-0.5`.
* **Typography:** MUST use `font-mono text-[10px] uppercase` (Strict Data Protocol).
* **Standard Styling:** `bg-gray-800/50 border border-gray-700/50 text-muted`.
* **Use Cases:** Shift times, timestamps, spec target labels, ISO Ac/Re threshold chips.
* **Color Overrides:**
  - **AQL Level:** Strictly **Indigo** (`bg-indigo-500/10 border-indigo-500/30 text-indigo-400`) — highlights it as a global configuration standard.
  - **MIN/MAX Thresholds:** Standard styling unless the value violates the threshold → transition to Danger styling (`bg-rose-500/10 border-rose-500/30 text-rose-400`).

#### B. State Badges (Status & Verdicts)
* **Purpose:** Communicating system states, outcomes, evaluation rules, or alerts.
* **Geometry:** Fully pill-shaped (`rounded-full`). Padding `px-2 py-0.5`.
* **Typography:** MUST use UI Chrome fonts: `font-bold uppercase tracking-wider text-[10px]` (Inter).
* **Styling Matrix:** `bg-{color}-500/10 border border-{color}-500/30 text-{color}-400`.
* **Use Cases & Semantic Colors:**
  - **PASS verdict / Evaluation Mode Active** (e.g., CUMULATIVE, GRANULAR, PASS): **Emerald** (`emerald-500`)
  - **FAIL verdict / Rejections:** **Rose** (`rose-500`)
  - **Evaluation Mode Inactive** (e.g., N/A, SKIP): **Gray** (`gray-500`)
  - **Warnings / Setup Required / Pending Approval:** **Amber** (`amber-500`)
  - **Amendment defect category-change badges** (`AmendmentDiffView.tsx`'s `CATEGORY_CHANGE_BADGE`): "Orphaned — Not Graded" is **Amber** (a defect silently dropping out of grading entirely — §4.9 Action Required); "Moved Category" and "Eval Mode Changed" are **Cyan** (a genuine change the reviewer must see, but not inherently a problem — Info/provenance per §5.3).

#### C. Dynamic Composite Badges (e.g., Compliance Tracker)
* **Purpose:** Large, multi-line status trackers that change semantic color state based on underlying data.
* **Layout:** Icon on the left, stacked text on the right.
* **Typography:** Title is `text-[10px] uppercase font-bold text-current`, Main Value is `text-sm font-mono font-bold text-current`, optional Subtext is `text-[10px] uppercase font-bold text-current`.

#### D. Presence/Notification Dots
* **Purpose:** A minimal, wordless "there's something new here" signal on a nav item, distinct from Badges/Chips/Pills — no text, no count, just presence.
* **Geometry:** `w-1.5 h-1.5 rounded-full`, absolutely positioned at the top-right corner of the icon it's attached to (`absolute -top-0.5 -right-0.5`).
* **Styling:** `bg-brand-secondary animate-pulse` — Cyan, pulsing, matching the Info/provenance semantic (§5.3), not a warning.
* **Use Case:** Sidebar's Inspection Records nav item, shown when any Submission was created since the last time any user viewed that screen (`Sidebar.tsx`).

### 4.9 Action Required / Warning State
* **Purpose:** Guides the user's eye to tasks that are incomplete, misconfigured, or require immediate attention, without using the "Fatal Error" semantics of Red/Rose.
* **Semantic Color:** MUST exclusively use **Amber** (`amber-500` / `amber-400`).
* **Implementation Examples:**
  - Empty or incomplete setups in Config Control (e.g., "SETUP REQUIRED" badge).
  - Call-to-action entry buttons for empty data rows (e.g., "ENTRY" buttons in Batch Entry).
  - Validation warnings that do not halt the system (e.g., overlapping shift hours).
  - Partial completion trackers (e.g., 5/13 dimensions entered).
  - Pending supervisor approval states.
  - Informational alerts when no inspection profile was linked at submission time.
* **Strict Restriction:** Amber MUST NEVER be used for Primary Add Actions (Emerald) or Primary Identities (Cyan). It is strictly reserved for "Action Required / Warning".

### 4.10 Drag-and-Drop Items (e.g., Kanban Cards)
* **Styling:** `bg-canvas border border-gray-700`. (Must follow §1.4 Dynamic User Data Exemption: no semantic color borders or arbitrary icons.)
* **Interaction state:** `cursor-grab hover:bg-surface-light hover:border-gray-500`.
* **Active drag state:** `active:cursor-grabbing`.

### 4.11 List Management & Inline CRUD Protocol
* **Icons:** Delete (`Trash`), Edit (`Edit2`), Save (`Check`), Cancel (`X`), Reorder (`ArrowUp` / `ArrowDown`).
* **Inline Edit & Keyboard Shortcuts:** Pressing `Enter` commits changes. Pressing `Escape` cancels edits. Input fields render a subtle `Enter ↵` indicator.
* **Text Truncation (Absolute Overlay Trick):** In narrow grid columns, text containers use `w-full truncate`. Action buttons are absolutely positioned (`absolute right-1 top-1/2 -translate-y-1/2`) with hover opacity toggles to prevent text clipping.

### 4.12 Expandable Unchanged-Content Summary (Diff & Comparison Displays)
* **Purpose:** In amendment-diff and pre-submit-comparison contexts, hide genuinely-unchanged fields by default (not just unhighlight them) so the reviewer's eye goes straight to what actually changed, while keeping the full picture one click away for an audit double-check.
* **Toggle control:** A full-width button, `text-[10px]` or `text-xs` `font-bold text-muted uppercase tracking-wider`, with a leading `ChevronRight`/`ChevronDown` (`w-3 h-3` or `w-3.5 h-3.5`, `strokeWidth={2.5}`) that flips on expand. Label: `"{N} unchanged field{s} not shown"`. Renders nothing when the count is 0.
* **Container:** `border border-gray-800 rounded-lg overflow-hidden`, with the expanded content in a `border-t border-gray-800` panel beneath the toggle.
* **Multiple independent toggles per modal:** a single diff view can stack several of these collapses at once rather than just one — `AmendmentDiffView.tsx` groups the diff into sections (Batch Setup / Dimensions / Defects / Verdict), and within each section further splits rows into a raw (operator-entered) sub-group and a "Calculated from the above" derived sub-group, each with its own independent unchanged-collapse toggle. This is the pattern, not an exhaustive inventory of every section's current sub-grouping.
* **Diff coloring convention** (`AmendmentDiffView.tsx`'s `DiffRowView`/`DefectRowView`): when showing two sides of a changed value, the **Original** side uses **Rose** (`text-rose-400` / `bg-rose-500/10 border-rose-500/30`) and the **Proposed** side uses **Emerald** (`text-emerald-400` / `bg-emerald-500/10 border-emerald-500/30`) — consistent with the global Rose=Fail/Emerald=Pass semantic (§4.8). A purely **added** field is Emerald-only (invisible on the Original side); a purely **removed** field is Rose-only (invisible on the Proposed side).
* **Use cases:** Approvals Queue amendment diff modal (`ApprovalsQueue.tsx`, rendered by `AmendmentDiffView.tsx`); Quality Entry Wizard Step 4 Pre-Submit Summary in amend mode (`SubmissionSummary.tsx`).
* **Single-field "original value" annotation (`text-rose-400`, Rose side only — no Emerald counterpart):** the same Rose token, standalone, for a live-editable field's inline "Original: X" note in amendment mode — shown beneath a field once its current value differs from the original, distinct from this section's two-column read-only diff viewer above (`OriginalValueNote` in `fieldDiff.tsx`, used by `StepMetadata.tsx`/`StepDimensions.tsx`/`StepDefects.tsx`, commit `16af0f2`). No Emerald "proposed" counterpart here — the field's own live value already IS the proposed value, shown directly in the input itself (with its own separate changed-state highlight, not part of this token). Related to, not identical to, the diff-viewer convention above: both mark "this is what it used to be" with Rose, but one is a read-only comparison row and the other is a one-sided annotation next to a still-editable input.

### 4.13 Lifetime-Limit Counters (e.g., Amendment Cap)
* **Purpose:** Communicate a record's position against a hard lifetime limit — how many uses remain, and what happens once none do — inline with the action that consumes the limit, not in a separate status panel.
* **Three states, right-aligned next to the gated action:**
  - **Never used:** No counter shown at all — the action button renders alone, unlabeled, since a 0-of-N state carries no information worth surfacing.
  - **Used, below the cap:** A muted `text-[10px] font-mono text-muted` counter (`"{N} of {MAX} amendments used"`) sits beside the still-active action button.
  - **Cap reached:** The action button is replaced entirely by an Amber label (`text-[10px] font-bold uppercase tracking-wider text-amber-400/70`, `"Maximum amendments reached ({N}/{MAX})"`) — Amber per §4.9's Action Required semantic, not Rose, since this is an expected lifecycle end-state, not a failure.
* **Use case:** `HistoryFeed.tsx`'s AMEND RECORD button/counter, gated by the 3-approved-amendment lifetime cap (`DATA_SCHEMAS_AND_TYPES.md` §1's Business Rule).

### 4.14 Dimension Mode Control (Cycling Icon)
* **Purpose:** A single, compact control per dimension row in Product Engine's Registered Products table (`ProductConfigAccordion.tsx`) that sets a 3-state mode — whether the field is graded, captured-but-not-graded, or hidden from the operator entirely. No dropdown/menu and no visible text in the row itself; the state name is a hover-only `title` tooltip.
* **Interaction:** A single icon button. Click advances the state forward only, in a fixed cycle with no reverse shortcut: **Graded → Record Only → Off → Graded**.
* **Icons & Colors (`lucide-react`, `w-3.5 h-3.5`, `strokeWidth={2}` per §1.4):**
  - **Graded:** `Ruler`, `text-brand-secondary` (cyan).
  - **Record Only:** `Eye`, `text-amber-400`.
  - **Off:** `EyeOff`, `text-gray-500` — hidden from the operator's wizard view entirely (not merely greyed out); the stored spec is preserved and restored unchanged if the field is switched back.
* **Applies to:** Glove Length, Palm Width, and every dynamic dimension (Cuff/Palm/Finger Thickness, Beading Thickness, any future admin-added custom dimension). Glove Weight is exempt — no control, always graded, no record-only or off mode exists for it.
* **Distinct from the field-name label itself** (§1.3's Dimension Field Name Labels): the label's white/weight/opacity treatment signals *permanence* (can this field be deleted), while this control's cyan/amber/grey signals *mode* (is this field currently graded) — two independent signals on the same row, deliberately never sharing a color so neither is mistaken for the other.

---

## CHAPTER 5: FEEDBACK & ALERTS

### 5.1 Hero Verdict Banners
* **Purpose:** Massive, full-width alert cards summarizing the ultimate Pass/Fail state of a workflow (e.g., ISO 2859-1 VERDICT).
* **Geometry:** `p-6 flex items-center justify-between rounded-xl`.
* **State Styling:** Semantic background/borders (e.g., `bg-rose-500/10 border-rose-500/30 text-rose-500` for Fail; `bg-emerald-500/10 border-emerald-500/30 text-emerald-400` for Pass).
* **Typography:** Title is `text-2xl font-bold uppercase`. Subtitle is `text-xs font-bold uppercase`.
* **Nesting:** Readout displays inside the banner MUST use Tier 3 (`bg-canvas`) dark backgrounds for contrast.

### 5.2 Out-of-Spec Validation State (Failures)
* **Mass Data Entry Grid Failures:**
  - Input Box: `border-rose-500/50 text-rose-500 bg-rose-500/5`.
  - Deviation Label (Beneath Input): MUST be strictly `text-[9px] font-mono text-rose-500 font-bold tracking-tighter`. Use absolute positioning or tight negative margins to ensure it doesn't break the vertical grid rhythm.
* **High-Density Spreadsheet Failures:**
  - Turn the cell red (`bg-rose-500/20 text-rose-500 border-rose-500/50`), but **omit** the deviation label beneath it to preserve strict row height. Users rely on hover or aggregate trackers for deviation data.

### 5.3 Inline Informational Alerts
* **Purpose:** Contextual instructions or warnings placed directly inside form flows or record panels.
* **Geometry:** `p-3 rounded-lg border border-l-4 flex gap-3`.
* **State Styling by intent:**
  - **Info (Cyan):** `bg-brand-secondary/5 border-brand-secondary/20 border-l-brand-secondary text-brand-secondary`  
    *(Primary real-world use: "Live Re-Grade — Not the Original Result" banner on legacy History records with no frozen grading snapshot — a data-provenance notice, not a warning, so Cyan not Amber per §4.9.)*
  - **Amendment-mode changed-field highlight (`bg-brand-secondary/5 border-brand-secondary/50`, no left-accent bar — not this section's `p-3 rounded-lg border-l-4` banner geometry):** the same Cyan/Info semantic reused for a structurally different pattern — a per-field state indicator (the field's own input/card border) marking that a field's current value differs from its amendment-original value, not a standalone alert banner. Used via `StepMetadata.tsx`'s `changedFieldClasses()` helper, `StepDimensions.tsx`, and `StepDefects.tsx` (each field's own `hasFieldChanged()` comparison), 2026-08-14. Chosen over inventing a new token since Cyan/Info was already the closest existing semantic for "this is informational, not a warning or error" and nothing else fit: §4.12's Rose/Emerald diff pair is scoped to the read-only two-column diff viewer, not a live-editable field; §3.4's untouched/touched pair is prefill-trust state, a different semantic. No left-accent-bar banner variant needed here — the highlight lives on the field itself, not a separate alert box.
  - **Warning / Action Required (Amber):** `bg-amber-500/5 border-amber-500/30 border-l-amber-500 text-amber-400`  
    *(Primary real-world use: no inspection profile linked, overlapping shift hours, setup incomplete. Also covers the Quality Entry Wizard's amendment-mode "THIS AMENDMENT CHANGES THE LOT NUMBER" banner — fires non-blocking when Line/Side/Date/Sequence differ from the original record, since those fields compose the Full System Lot Number (`StepMetadata.tsx`, commit `e4c05e6`) — an intentional, established use of this pattern, not a one-off.)*
  - **Success (Emerald):** `bg-emerald-500/5 border-emerald-500/30 border-l-emerald-500 text-emerald-400`
  - **Error (Rose):** `bg-rose-500/5 border-rose-500/30 border-l-rose-500 text-rose-400`
