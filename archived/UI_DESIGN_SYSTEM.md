# Global UI Design System & Strict Styling Rules

**Project:** QUALITY INSPECTION (WEB) v4.0
**Purpose:** This document enforces strict UI/UX constraints. To prevent "design drift," all components, pages, and UI elements MUST adhere strictly to the rules defined in this document. Do not invent new margin sizes, font sizes, or colors.

---

## 1. COLOR PALETTE (White-Labeled)
We utilize a highly curated, premium Dark Mode aesthetic. No raw hex codes are permitted in component files; you must use the Tailwind variables defined below.

*   **Canvas (Background):** `bg-canvas` (`#0B0F19`) - The deepest layer.
*   **Surface (Cards/Modals):** `bg-surface` (`#111827`) - Elevated elements.
*   **Brand Primary (Blue):** `bg-brand-primary` (`#3F48CC`) - Core brand identity.
*   **Brand Secondary (Cyan):** `bg-brand-secondary` (`#08C8CD`) - Highlights.
*   **Accent Gradient:** `bg-accent-gradient` (Linear gradient from Primary to Secondary) - Used for primary Call-to-Action buttons.
*   **Danger (Fail):** `bg-danger` (`#EF4444`) - Strictly reserved for FAILED states and destructive actions.
*   **Text Primary:** `text-primary` (`#F3F4F6`) - Off-white for readability.
*   **Text Muted:** `text-muted` (`#9CA3AF`) - For secondary descriptions.

---

## 2. TYPOGRAPHY & CASING RULES
Strict rules to maintain an industrial yet modern aesthetic.

### Font Families
*   **Primary Font:** `Inter` (Used for general UI navigation, titles, card headers, section labels, buttons).
*   **Data & Input Font:** `JetBrains Mono` (`font-mono`) (Used strictly for ALL form input fields `<input>`, select dropdowns `<select>`, table cells `<td>`, and numeric/code readouts across Inspection Setup and Entry Wizard to ensure precise monospaced character alignment).

### Text Hierarchy & Casing
*   **Main / Hero Titles (H1, Critical Metrics):** For massive page titles or primary KPIs.
    *   **Rule:** MUST be ALL CAPS, Extra large, Bold, tight tracking (`text-3xl font-bold uppercase tracking-tight text-primary`).
    *   *Example:* `PASS` or `SYSTEM STATUS`
*   **Primary Section Headers (H2):** The standard for main page sections.
    *   **Rule:** MUST be ALL CAPS, Large, Bold (`text-xl font-bold uppercase text-primary`).
    *   *Example:* `QUALITY ENTRY WIZARD`
*   **Secondary Sub-Headers (H3, Card Titles):** For titles of individual cards or sub-sections.
    *   **Rule:** MUST be ALL CAPS, Medium-large, Semi-bold (`text-lg font-semibold uppercase text-primary`).
    *   *Example:* `SENSOR READINGS`
*   **Primary Body Text:** Standard descriptions and main paragraph text.
    *   **Rule:** Sentence case, Standard size, Normal weight (`text-base font-normal text-primary` or `text-sm`).
*   **Secondary Body Text:** Supporting text or less critical information.
    *   **Rule:** Sentence case, Standard size, Normal weight, Muted (`text-sm font-normal text-muted`).
*   **Notes / Captions / Disclaimers:** Very small text for footnotes or minor caveats.
    *   **Rule:** Sentence case, Extra small, Medium weight, Muted (`text-xs font-medium text-muted`).
*   **Form Labels & Table Headers (`<th>`):**
    *   **Rule:** MUST be ALL CAPS, small font, tracked out, and muted (`text-xs font-semibold uppercase tracking-wider text-muted`).
    *   *Example:* `BATCH NUMBER`, `SAMPLE SIZE`
*   **Buttons:**
    *   **Rule:** Title Case, Semi-bold (`text-sm font-semibold`).

---

## 3. STRUCTURAL GEOMETRY (Spacing & Radius)
To prevent messy layouts, the geometry is locked.

*   **Global Border Radius:** All interactive elements (buttons, inputs, cards, modals, dropdowns) MUST have an exact border radius of **8px** (`rounded-lg` in Tailwind). Do not use `rounded-md` or `rounded-full`.
*   **Touch Targets:** Any clickable element MUST have a minimum height of **48px** (`h-12`) to accommodate operators wearing factory gloves.
*   **Padding (Cards):** Standard card padding is strictly `p-6`.

---

## 4. ICONOGRAPHY
We exclusively use `lucide-react` for iconography.
*   **Stroke Weight:** To maintain visual consistency, all Lucide icons MUST have a stroke weight of exactly **2px**.
*   **Standard Sizing:** Inline icons should be `w-5 h-5`. Header/Sidebar icons should be `w-6 h-6`.

---

## 5. INTERACTIVE STATES
*   **Hover:** Buttons should slightly lighten in color (`hover:brightness-110`).
*   **Active (Tap):** All primary interactive elements MUST utilize Framer Motion for a micro-animation tap effect (`whileTap={{ scale: 0.95 }}`).

---

## 6. BADGES, CHIPS & TAGS
We distinguish between read-only **Badges** (status indicators) and interactive **Tags/Chips** (filters, metadata, selection option cards).

### Badges (Read-Only Status Indicators)
*   **Typography:** MUST be ALL CAPS, small font, semi-bold, tracked out (`text-xs font-semibold uppercase tracking-wider`).
*   **Geometry:** Border radius fixed at **8px** (`rounded-lg`).
*   **Visual Style:** Low-opacity background with a matching low-opacity border (`bg-opacity-10 border border-opacity-30`).
*   **Semantic Variants:**
    *   **Pass / Success (`PASS`, `APPROVED`):** `bg-emerald-500/10 text-emerald-400 border border-emerald-500/30`
    *   **Fail / Danger (`FAIL`, `REJECTED`, `ZERO TOLERANCE`):** `bg-rose-500/10 text-rose-400 border border-rose-500/30`
    *   **Warning / Pending (`PENDING`, `AMENDED`):** `bg-amber-500/10 text-amber-400 border border-amber-500/30`
    *   **Info / Class (`BARRIER`, `VISUAL`, `SHIFT A`):** `bg-cyan-500/10 text-cyan-400 border border-cyan-500/30`

### Tags & Chips (Interactive & Metadata)
*   **Metadata Tags:** Used to display non-status specs (`Material: Nitrile`).
    *   `bg-surface text-primary border border-gray-700/80 text-xs font-medium rounded-lg px-2.5 py-1`
*   **Filter / Removable Tags:** Used in search/filter bars, includes an inline Lucide `X` icon.
    *   `bg-brand-primary/10 text-brand-secondary border border-brand-secondary/30 text-xs font-semibold rounded-lg px-2.5 py-1 flex items-center gap-1.5`
*   **Selection Chips (Form Toggles):** Used for fast factory-floor taps (e.g. Size selection).
    *   **Unselected:** `bg-surface text-muted border border-gray-700 hover:border-gray-500 cursor-pointer h-12 px-4 rounded-lg`
    *   **Selected:** `bg-brand-primary text-white border border-brand-secondary font-bold shadow-sm h-12 px-4 rounded-lg`
    *   **Touch Target:** Minimum height of **48px** (`h-12`) to comply with Section 3.

---

## 7. COMPLEX UI COMPONENTS

### Modals & Dialog Overlays
*   **Backdrop:** `bg-black/70 backdrop-blur-sm` (Dimmed with subtle glassmorphism effect to focus context).
*   **Modal Container:** `bg-surface border border-gray-800 rounded-lg p-6 shadow-2xl max-w-lg w-full`
*   **Header:** Features a Secondary Sub-Header (`H3`) and a top-right Lucide `X` close icon (`w-5 h-5 text-muted hover:text-primary cursor-pointer`).
*   **Animation:** Framer Motion scale-up (`initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}`).

### Data Tables (History & Admin Grids)
*   **Header Row (`<th>`):** `bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left`
*   **Data Cell (`<td>`):** `py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary`
*   **Numeric Data Alignment:** All numerical values, dates, and IDs in cells MUST use `font-mono` (JetBrains Mono) for vertical alignment.
*   **Row Hover:** `hover:bg-surface-light/40 transition-colors`

### Toast Notifications (System Feedback)
*   **Placement:** Fixed at Top-Right (`fixed top-4 right-4 z-50 flex flex-col gap-2`).
*   **Base Container:** `bg-surface border rounded-lg p-4 shadow-xl flex items-center gap-3 max-w-md w-full text-sm`
*   **Success Toast:** `border-emerald-500/50 text-emerald-400` with Lucide `CheckCircle2` (`w-5 h-5 text-emerald-400`)
*   **Error Toast:** `border-rose-500/50 text-rose-400` with Lucide `AlertTriangle` (`w-5 h-5 text-rose-400`)
*   **Info Toast:** `border-cyan-500/50 text-cyan-400` with Lucide `Info` (`w-5 h-5 text-cyan-400`)

### Step Indicator / Progress Stepper (Inspection Wizard)
*   **Progress Track:** `w-full bg-canvas rounded-full h-2 overflow-hidden border border-gray-800`
*   **Progress Fill:** `bg-accent-gradient h-full transition-all duration-300 ease-out`
*   **Step Node Circles (`32x32px`):**
    *   **Active Step:** `bg-brand-primary text-white border-2 border-brand-secondary font-bold font-mono`
    *   **Completed Step:** `bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 font-bold font-mono` with Lucide `Check` icon.
    *   **Pending Step:** `bg-surface text-muted border border-gray-700 font-mono`

---

## 8. FORM CONTROLS & DRAG-AND-DROP ZONES

### Form Inputs & Clickable Select Dropdowns
*   **Touch Target:** Minimum height of **48px** (`h-12`) for factory floor tablet use.
*   **Base Text Input (`<input type="text">`):**
    *   `h-12 bg-canvas border border-gray-800 focus:border-brand-secondary rounded-lg px-4 text-sm text-primary placeholder-muted outline-none transition-all shadow-inner`
*   **Numeric Input (`<input type="number">`):**
    *   Same as Base Input, but strictly uses `font-mono` (JetBrains Mono) for vertical digit alignment.
*   **Clickable Select Dropdown (`<select>`):**
    *   `h-12 bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-lg px-4 pr-10 text-sm text-primary font-medium outline-none cursor-pointer transition-all`
    *   **Chevron Icon:** Styled with a custom right-aligned Lucide `ChevronDown` (`w-4 h-4 text-muted pointer-events-none`).
    *   **Option Menu Items (`<option>`):** Styled with dark background (`bg-surface text-primary py-2 px-3 hover:bg-brand-primary`).

### Drag-and-Drop Textboxes & Upload Dropzones
Used for batch data import, image uploads (e.g. defect photos), or dragging CSV inspection lists.
*   **Geometry & Radius:** Border radius fixed at **8px** (`rounded-lg`). Minimum height of **160px** (`min-h-[160px]`).
*   **Idle State:**
    *   `border-2 border-dashed border-gray-700/80 bg-canvas/60 hover:border-brand-secondary/60 hover:bg-surface/50 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all group`
    *   **Icon:** Lucide `UploadCloud` or `FileText` (`w-8 h-8 text-muted group-hover:text-brand-secondary transition-colors`).
    *   **Label:** `text-sm font-semibold text-primary mb-1` ("Drag & drop inspection list or click to browse").
    *   **Subtext:** `text-xs font-mono text-muted` ("Supports .CSV, .JSON, .PNG, .JPG up to 25MB").
*   **Active Drag-Over State:**
    *   `border-2 border-dashed border-brand-secondary bg-brand-primary/10 rounded-lg p-6 ring-4 ring-brand-secondary/20 transition-all scale-[1.01]`
    *   **Icon:** Lucide `UploadCloud` (`w-10 h-10 text-brand-secondary animate-bounce`).
*   **File Attached / Dropzone Complete State:**
    *   `border border-emerald-500/40 bg-emerald-500/5 rounded-lg p-4 flex items-center justify-between` with file name preview and Lucide `CheckCircle2` icon.

### Kanban / Horizontal Drag-and-Drop Matrix (Defect Engine)
Used specifically for mapping defect labels into category columns.
*   **Matrix Layout:** A horizontally scrolling grid of vertical columns (`flex flex-row overflow-x-auto gap-6 pb-4`).
*   **Category Column:**
    *   `w-80 shrink-0 bg-surface border border-gray-800 rounded-xl flex flex-col h-full max-h-[700px]`
    *   **Header:** Features category icon and name with a badge showing item count.
    *   **Drop Zone Area:** `flex-1 overflow-y-auto p-4 space-y-3`
*   **Draggable Card (Defect Label):**
    *   `bg-canvas border border-gray-700 hover:border-brand-secondary rounded-lg p-4 flex flex-col gap-2 cursor-grab active:cursor-grabbing shadow-sm transition-all`
    *   **Drag State:** While dragging, apply `ring-2 ring-brand-secondary opacity-90 shadow-xl scale-105 z-50`.

---

## 9. SPECIALIZED INDUSTRIAL COMPONENTS

### 3-State Qualitative Segmented Toggle
Used for qualitative defect categories (`PASS / FAIL / NIL`).
*   **Container:** `inline-flex bg-canvas p-1 rounded-lg border border-gray-800 h-12 items-center gap-1`
*   **Item Base:** `h-10 px-3 flex items-center justify-center rounded-md text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer select-none`
*   **State Styling:**
    *   **PASS Active:** `bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 font-bold shadow-sm`
    *   **FAIL Active:** `bg-rose-500/20 text-rose-400 border border-rose-500/50 font-bold shadow-sm`
    *   **NIL Active:** `bg-gray-700/40 text-gray-300 border border-gray-600 font-medium shadow-sm`
    *   **Unselected:** `text-muted hover:text-primary hover:bg-surface/50`

### Sticky Submenu Save Action Bar & Dirty Indicator
Used in Configuration Control submenus to save edits cleanly.
*   **Bar Container:** `sticky bottom-0 left-0 right-0 h-16 bg-surface/95 backdrop-blur-md border-t border-gray-800 px-6 flex items-center justify-between z-40 shadow-2xl`
*   **Dirty State Indicator:** `flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider animate-pulse`
*   **Save Button:** `h-10 px-6 rounded-lg bg-accent-gradient text-white text-xs font-semibold uppercase tracking-wider shadow-lg shadow-brand-primary/20 hover:brightness-110 transition-all`
*   **Dirty State Logic:** The dirty state (unsaved changes indicator and save button enablement) MUST be calculated using a deep equality comparison between the original state and the current draft state. Do not naively flag the state as dirty on any keystroke or onChange event. If a user reverts their changes to exactly match the original state, the dirty indicator MUST automatically clear.

### Slot-Level Delta Indicator Badge (Dimension Grid)
Used below input boxes on Page 2 for out-of-spec slot measurements.
*   **Text Style:** `mt-1 text-[11px] font-mono font-bold tracking-tight text-rose-400 flex items-center gap-1`
*   **Formatting Rule:** Display signed delta (`-0.005mm` for thickness, `-2mm` for length/width).

### Dual-Mode Header Switcher Component
Used at top of `/wizard` to switch between Guided Wizard & Spreadsheet Grid.
*   **Container:** `inline-flex bg-canvas p-1 rounded-lg border border-gray-800 h-12 items-center gap-1 shadow-inner`
*   **Active Mode Chip:** `bg-brand-primary text-white font-bold text-xs uppercase tracking-wider px-4 h-10 rounded-md shadow-md flex items-center gap-2`
*   **Inactive Mode Chip:** `text-muted hover:text-primary font-semibold text-xs uppercase tracking-wider px-4 h-10 rounded-md flex items-center gap-2 transition-colors cursor-pointer`

### Spreadsheet Grid Table (Batch Data Entry Mode)
High-density multi-lot tabular entry layout optimized for desktop & tablet keyboard entry.
*   **Graphical Distinction:** Unlike Guided Wizard Mode (which presents a focused single-lot card layout with large 48px touch inputs), Batch Mode presents a multi-lot high-density spreadsheet grid where rows represent lots and columns represent physical measurements. Both modes share the exact same design tokens (`bg-canvas`, `bg-surface`, `font-mono`) and color logic (Emerald for spec pass, Rose for out-of-spec).
*   **Table Container:** `w-full overflow-x-auto bg-surface border border-gray-800 rounded-xl shadow-xl`
*   **Grid Header (`<th>`):** `bg-canvas text-[11px] font-bold uppercase tracking-wider text-muted py-2.5 px-3 border-b border-gray-800 font-mono text-center whitespace-nowrap`
*   **Grid Cell Input (`<input>`):** `w-full h-9 bg-canvas border border-gray-800 focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary/30 rounded-md px-2 text-xs font-mono text-primary text-center outline-none transition-all`
*   **Defect Badge Chip:** `h-8 px-3 bg-brand-primary/10 text-brand-secondary border border-brand-secondary/30 hover:bg-brand-primary/20 rounded-md text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer`
*   **Status Badges and Chips:**
    *   **Success (Pass):** `bg-emerald-500/10 text-emerald-400 border border-emerald-500/30`
    *   **Warning (Setup Required):** `bg-amber-500/10 text-amber-400 border border-amber-500/30`
    *   **Fail / Danger (`FAIL`, `REJECTED`, `ZERO TOLERANCE`):** `bg-rose-500/10 text-rose-400 border border-rose-500/30`
*   **Metadata Badges (e.g. Last Updated):** `bg-gray-800/50 text-muted border border-gray-700/50`. Used for subtle timeline records (e.g. `UPDATED: 2026-07-30 14:30`) adjacent to high-contrast primary elements. Keeps focus on the primary element while providing structural context. Includes Lucide `Clock` icon (`w-3 h-3`). Text is `text-[10px] font-bold uppercase tracking-wider font-mono`.

### Quick Defect Popover Modal (Batch Grid Defect Logger)
Used in Spreadsheet Batch Mode when a worker clicks or presses Spacebar on a row's `Defects (N)` badge chip.
*   **Backdrop:** `fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4`
*   **Modal Container:** `w-full max-w-2xl bg-surface border border-gray-800 rounded-xl shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150`
*   **Header:** Features Lot Number context (e.g. `Defect Tally — Lot A004A6182001`), Lucide `ShieldAlert` icon (`w-5 h-5 text-brand-secondary`), and a top-right Close `X` button (`h-10 w-10`).
*   **Defect Category Tabs:** Horizontal pill tabs (`bg-canvas p-1 rounded-lg border border-gray-800 h-12 flex gap-1`) to switch severity tiers (AND, BARRIER, CRITICAL VISUAL, MAJOR VISUAL, MINOR VISUAL).
*   **Defect Tally Grid:** 2-column or 3-column rapid tap counter grid (`bg-canvas border border-gray-800 rounded-lg p-3 flex items-center justify-between`) featuring 48px touch buttons (`-` / count / `+`) or 3-way qualitative toggles (`[PASS|FAIL|NIL]`).
*   **Footer Action Bar:** Displays total row defect count badge and a `Done (Save Row Defects)` button (`h-12 px-6 rounded-lg bg-accent-gradient text-white font-bold uppercase tracking-wider`).

---

## 10. LIST MANAGEMENT & CONFIGURATION INTERACTIONS
For configuration control pages (Factory Setup, Dictionary Managers, Quality Rules), we enforce a standardized interaction pattern for CRUD operations to minimize UI clutter and ensure consistency.

### Consistent Iconography
*   **Delete/Remove:** Lucide `Trash`
*   **Edit/Settings:** Lucide `Edit2`
*   **Reorder:** Lucide `ArrowUp` and `ArrowDown`

### Inline Add Workflow
*   **Button Placement:** The `+ ADD [ITEM]` button MUST be placed at the bottom of the list.
*   **Mechanism:** Clicking the add button inserts a new, blank inline-editable row at the bottom of the list.
*   **Auto-Focus:** The first input field in the newly created row MUST automatically receive focus for immediate typing.

### Inline Edit Workflow
*   **Trigger:** Clicking the `Edit2` icon switches a display row into an editable input row.
*   **Save & Cancel Actions:** All inline edit and inline add rows MUST render explicit action buttons on the right side of the input row:
    *   **Save (`Check` / `✓` icon):** Emerald green button (`text-emerald-400 hover:bg-emerald-500/20`) to save/commit draft changes. Hitting `Enter` key also saves.
    *   **Cancel (`X` / `✕` icon):** Rose red button (`text-rose-400 hover:bg-rose-500/20`) to exit edit mode and revert changes without saving. Hitting `Escape` (`Esc`) key also cancels.
*   **Visual Hint:** Inline edit and inline add text input fields include a subtle `Enter ↵` hint inside the right side of the input for discoverability.

### Submenu-Level Save & Discard Actions
*   **Dirty State Action Bar:** When unsaved changes exist (`isDirty = true`), the top action bar displays:
    *   **Unsaved Changes Indicator:** Pulsing amber badge (`text-amber-400`).
    *   **Discard Action (`RotateCcw` / `DISCARD CHANGES`):** Styled in subtle Rose/Danger outline (`bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20`). Clicking this button opens a modal prompt confirming whether the user wants to revert all pending modifications.
    *   **Save Action (`Save` / `SAVE CONFIGURATION`):** Primary gradient button (`bg-accent-gradient text-white`) that persists changes via `PATCH /api/config`.
*   **Confirmation Guard Modal:** To prevent accidental data loss, clicking `DISCARD CHANGES` triggers an explicit confirmation dialog (`DISCARD CONFIGURATION?`). Confirming clears `draftConfig` and re-hydrates the latest persisted state from the server.

### Sequence Re-Arrangement
*   **Controls:** Use `ArrowUp` and `ArrowDown` to shift list items up and down array indexes.
*   **Constraints:** Disable the `ArrowUp` button for the first item (index 0) and disable the `ArrowDown` button for the last item.

### Factory Setup Layout
*   **2-Column Desktop Grid:** To avoid wasting horizontal real estate on widescreen displays, `PRODUCTION LINES` and `SIDES CONFIGURATION` cards MUST be placed side-by-side using `grid-cols-1 xl:grid-cols-2 gap-6`. `SHIFT REGISTRATION` remains full-width underneath.

### Dictionary List Double-Line Stack & Hover Actions
*   **Double-Line Stack Layout:** To avoid cramped horizontal single-line text in narrow grid columns (e.g. `md:grid-cols-6`), dictionary options MUST render in a 2-line vertical stack:
    *   **Line 1 (Code/ID):** `font-mono text-xs font-bold text-brand-secondary` (Uppercase).
    *   **Line 2 (Description):** `text-xs text-primary truncate` (Full width with ellipsis).
    *   **Inline Edit / Add Inputs:** Inputs stack vertically using `h-7 text-xs` to match the two-line layout.
*   **Absolute Overlay Trick:** Inline action buttons (Up/Down/Edit/Delete) MUST NOT shrink the available flex width of the text container.
*   **Implementation:** The text container spans `w-full` with `truncate`. The action buttons container is absolutely positioned (`absolute right-1 top-1/2 -translate-y-1/2`) with an opacity toggle (`opacity-0 group-hover:opacity-100`) and gradient background fade (`bg-surface bg-gradient-to-r from-transparent via-surface to-surface`) floating over the right edge of the text on hover.

### Product Code Matrix & Accordion Rules
*   **Fixed Standard Sizes Matrix:** All registered product codes default to a fixed 6-size column array (`XS`, `S`, `M`, `L`, `XL`, `XXL`).
*   **Locked Baseline Specs:** `GLOVE WEIGHT`, `GLOVE LENGTH`, and `PALM WIDTH` are fixed, immutable rows at the top of every matrix. To adhere to the strict color palette and visually signify they are locked, their row headers MUST use `text-brand-secondary` (no arbitrary hex colors).
*   **Per-Size Enablement Toggles:** Above each size column header is an interactive toggle switch (`ToggleRight` / `ToggleLeft`). Toggling off a size disables its inputs, mutes text colors, and grays out column backgrounds.
*   **Tolerance Auto-Formatting Rules:**
    *   Typing **`m`** or **`M`** into a tolerance field (`± TOL`) automatically converts and locks the input to **`MIN`**.
    *   Numeric tolerance entries automatically filter out non-numeric characters (e.g. typing `5` sets numeric `5`, with `±` implied by the header).
    *   **Keyword Styling:** If a tolerance field holds the keyword `MIN`, it MUST be styled with `text-rose-400 font-bold` to visually highlight it as a strict limit boundary.
    *   **Anti-Cropping:** Tolerance input fields must use `px-1` padding (instead of `px-2`) to prevent wider monospace words like `MIN` from being horizontally cropped inside the narrow `w-[5%]` column width.
*   **Accordion View Mode vs Draft Edit Mode:**
    *   **Read-Only View Mode:** Clicking anywhere on a Registered Product code row expands the matrix in read-only mode. All inputs and toggles are locked/hidden, and dimension hover action buttons are hidden.
    *   **Draft Edit Mode:** Clicking the `Edit2` (Pen) icon on hover expands/activates the matrix in Draft Edit Mode. Header action buttons morph into Emerald **`SAVE`** (`Check`) and Rose **`CANCEL`** (`X`). Changes made in Edit Mode only commit upon clicking `Save` and discard upon clicking `Cancel`.

