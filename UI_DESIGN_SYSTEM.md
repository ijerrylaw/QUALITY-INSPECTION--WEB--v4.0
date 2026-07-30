# Global UI Design System & Strict Styling Rules

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Global Master Playbook. These rules MUST be strictly enforced across ALL pages and menus in the entire application—including Configuration Control, Quality Entry Wizard (Single/Batch), Inspection Records, Approval Queue, Quality Analytics, and System & Tenant Admin—to guarantee a 100% unified, enterprise-grade experience.
*(Note: For data types, see DATA_SCHEMAS_AND_TYPES.md. For access rules, see NAVIGATION_AND_RBAC.md).*

---

## CHAPTER 1: CORE TOKENS

### 1.1 Color Palette (White-Labeled Tokens)
Raw hex codes are strictly prohibited. Utilize the Tailwind CSS v4 variables defined below:
* **Canvas (Background):** `bg-canvas` (`#0B0F19`) - Primary background.
* **Surface (Cards/Modals):** `bg-surface` (`#111827`) - Elevated containers.
* **Brand Primary:** `bg-brand-primary` (`#3F48CC`) - Core brand blue.
* **Brand Secondary:** `bg-brand-secondary` (`#08C8CD`) - Cyan highlights.
* **Accent Gradient:** `bg-accent-gradient` - Linear gradient from Primary to Secondary.
* **Danger (Fail):** `bg-danger` (`#EF4444`) - Reserved for failure states.
* **Text Primary:** `text-primary` (`#F3F4F6`) - High contrast off-white.
* **Text Muted:** `text-muted` (`#9CA3AF`) - Secondary text.

### 1.2 Structural Geometry & Container Hierarchy
* **Global Border Radius:** All interactive components MUST use **8px** radius (`rounded-lg`).
* **Concentric Radius Formula:** When nesting containers: `Inner Radius = Outer Radius - Padding`. (e.g., `rounded-xl` outer with `p-6` padding requires a `rounded-lg` inner child).
* **Factory Touch Target:** All clickable elements MUST maintain a minimum height of **48px** (`h-12`). Kiosk keypads require **64px** (`h-16`).
* **Card Padding:** Standard card padding is strictly `p-6` (`p-4` for compact grids).
* **Container Hierarchy (Tier System)**: Define a strict 3-tier nesting model to prevent messy "borders within borders":
  - **Tier 1 (Outer Cards)**: `bg-canvas border border-gray-800`
  - **Tier 2 (Inner Sections)**: `bg-surface border border-gray-700/50`
  - **Tier 3 (Deeply Nested Items / Rows)**: `bg-canvas border border-gray-700`

### 1.3 Typography & Strict Font Protocol
* **The Golden Rule**: 
  - **UI Chrome** (labels, headers, buttons, helper text) MUST use `Inter` (sans-serif).
  - **User Data** (editable fields, key-in inputs, dropdown selections, database values, codes) MUST use `JetBrains Mono` (`font-mono`). This creates a strict visual boundary between the application structure and the underlying data.
* **Text Data Exemption**: While numbers, codes, IDs, and timestamps strictly use `JetBrains Mono`, long readable text strings (like Emails, User Names, or descriptive Notes) should remain in standard `Inter` (sans-serif) for natural reading legibility.
* **Action Buttons** (e.g., "SAVE CONFIGURATION"): Strictly UPPERCASE with `tracking-wider text-xs font-bold` (`Inter`). No exceptions for inline table buttons (e.g., "Review Diff" must become "REVIEW DIFF").
* **Helper/Description Text** (under headers): `text-xs text-muted mt-1 font-normal normal-case` (`Inter`).
* **Standard Body Text** (e.g., Kanban defect titles): `text-sm font-semibold text-primary` (`Inter`).
* **Hero Titles (H1):** `text-3xl font-bold uppercase tracking-tight text-primary`
* **Section Headers (H2):** `text-xl font-bold uppercase text-primary`
* **Card Headers (H3):** `text-lg font-semibold uppercase text-primary`
* **Form Labels / Table Headers (`<th>`):** `text-xs font-semibold uppercase tracking-wider text-muted`

### 1.4 Iconography
* **Library:** `lucide-react` exclusively.
* **Stroke Weight:** Fixed at **2px** (`strokeWidth={2}`).
* **Sizing:** Standard inline icons: `w-5 h-5`. Header/Sidebar icons: `w-6 h-6`.

---

## CHAPTER 2: GLOBAL LAYOUTS

### 2.1 Top Navigation Tabs (Submenus)
* **Internal Geometry**: `h-10 px-6 gap-2 flex items-center justify-center rounded-t-lg` (flat bottom connects seamlessly to the Action Bar below).
* **Typography**: Strictly UPPERCASE, `text-xs font-bold tracking-wider` (`Inter`).
* **Iconography**: `w-4 h-4` Lucide icon placed to the left of the text.
* **State Colors**:
  - Active: `bg-brand-primary text-white`
  - Inactive: `bg-surface text-muted hover:text-primary hover:bg-surface-light transition-colors`

### 2.2 Action Bar (Dirty State)
* Must be docked at the top of the page (`sticky top-0`) immediately below the page tabs, not at the bottom.
* Base styling: `bg-surface border-b border-gray-800 px-6 h-16 flex items-center justify-between z-40`.
* Features a pulsing amber unsaved changes indicator, a Rose discard button, and an Accent Gradient save button.

### 2.3 Scrollbars
* Implement custom slim, dark-themed scrollbars globally to replace thick native browser scrollbars.
* Styling: `scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent`.

---

## CHAPTER 3: FORMS & DATA ENTRY

### 3.1 Form Controls (Inputs, Dropdowns, Labels)
* **Form Labels with Icons**: When an icon accompanies a form label, it must be `w-3 h-3` and placed immediately to the left of the `text-xs uppercase` label text.
* **Editable State**: `bg-canvas border border-gray-700`
  - Focus: `focus:border-brand-secondary focus:ring-1 focus:ring-brand-secondary outline-none`
  - Inner text: Must strictly use `font-mono text-sm text-primary` (per the Strict Font Protocol).
* **Read-Only / Auto-Generated State**:
  - Background & Border: `bg-surface-light/50 border-transparent`
  - Text & Interaction: `font-mono text-sm text-muted cursor-not-allowed opacity-80`

### 3.2 Vertical Form Layouts (Settings & Admin Pages)
* **Purpose**: Used for dense configuration forms (e.g., System & Tenant Admin) where fields need maximum width.
* **Layout**: Vertically stacked (`flex-col`). The label sits above the input with a tight gap (`gap-1.5`).
* **Group Spacing**: Distinct form fields or groups MUST be separated by generous spacing (`gap-6` or `mb-6`) to prevent vertical crowding.

### 3.3 Multi-Field Inline Layouts (Data Grids & Forms)
* When multiple input fields are placed inline within a card (e.g., 6 dictionary dropdowns, or AQL table rows), they MUST use strict CSS Grid (`grid grid-cols-[X] gap-4`).
* This ensures all columns align perfectly vertically down the page, avoiding the jagged edges caused by `flex-wrap`.

### 3.4 Mass Data Entry Inputs (Measurement Grids)
* **Purpose**: Rapid numeric data entry via numpad (e.g., 5 sample inputs for Glove Length).
* **Geometry**: Large hit-targets (`h-12 w-full`), placed in a tight grid (`gap-2`).
* **Typography**: `JetBrains Mono text-lg text-center text-primary`.
* **Interaction**: Focus states must aggressively highlight to track rapid cursor movement (e.g., `focus:ring-2 focus:ring-brand-secondary focus:border-transparent`).

### 3.5 Inline Add Actions (Dashed Buttons)
* Standardize all inline add actions to universally say `+ ADD`.
* Base state: `border border-dashed border-gray-700 bg-transparent text-muted text-[11px] font-semibold uppercase tracking-wider`
* Hover state: `hover:text-brand-secondary hover:border-brand-secondary/50 hover:bg-brand-primary/10 transition-all`

---

## CHAPTER 4: DATA DISPLAYS & LISTS

### 4.1 High-Density Data Grids (Spreadsheet Mode)
* **Purpose**: Used for Batch Entry tables where vertical space is at an absolute premium.
* **Structure**: MUST use `table-fixed w-full` with explicit column widths to prevent shifting.
* **Input Cells**: Must be dense (`h-8`, `rounded-sm` or `rounded-none`), using `JetBrains Mono text-sm`.

### 4.2 Standard Reading Data Tables
* **Purpose**: Lists of records (like Inspection Logs) prioritizing human readability over raw density (contrasting with Section 4.1 High-Density Grids).
* **Geometry & Spacing**: Generous row padding (`py-4 px-4`).
* **Separators**: Faint border between rows (`border-b border-gray-700/50`). No vertical borders.
* **Stacked Data Cells**: To save horizontal space (e.g., Date & Time), stack related data. The primary top value MUST be `text-sm font-mono text-primary`, and the secondary bottom value MUST be `text-xs font-mono text-muted`.

### 4.3 Data Table Toolbars
* **Purpose**: Global control bar placed immediately above Standard Reading Data Tables.
* **Layout**: Flex container (`flex justify-between items-center mb-4`).
* **Elements**: 
  - Left side: Wide Search input (`w-64` to `w-96`).
  - Right side: Secondary Action Buttons (e.g., FILTER, EXPORT CSV) in a `flex gap-2` row.

### 4.4 Summary Data Cards (Key-Value & KPIs)
* **Summary Key-Value Lists**: 
  - Keys MUST be `text-[10px] font-bold uppercase text-muted` and aligned LEFT.
  - Values MUST be `font-mono text-sm text-primary` and aligned RIGHT.
* **KPI Display Blocks**: Large, centered aggregate numbers (e.g., Total Slots Measured). The number MUST be `font-mono text-4xl text-primary font-bold`, with the label stacked underneath as `text-[10px] uppercase text-muted`.

### 4.5 Metric Readouts / Aggregates
* **Purpose**: Small calculated values that sit below data entry grids (e.g., MINIMUM, AVERAGE).
* **Layout**: Stacked.
* **Label Typography**: `text-[10px] font-bold uppercase text-muted`.
* **Value Typography**: `font-mono text-sm text-primary` (colors may shift to Danger/Warning if spec is violated).

### 4.6 Critical Output Displays (Digital Readouts)
* **Purpose**: Used for high-visibility generated identifiers (e.g., "FULL SYSTEM LOT NUMBER", "4-DIGIT LOT NO").
* **Typography**: MUST use `JetBrains Mono` (`font-mono`) per the Strict Font Protocol, but sized up (`text-xl` or `text-2xl` tracking-widest) for maximum legibility.
* **Geometry & Styling**: Must look distinctly separate from form inputs. Use a "terminal readout" style: `bg-gray-900 border border-brand-secondary/50 text-white shadow-inner`.

### 4.7 Badges, Chips & Dynamic Trackers
* **State Badges** (e.g., Warning, Setup Required): `bg-{color}-500/10 border border-{color}-500/30 text-{color}-400 text-[10px] font-bold uppercase tracking-wider`
* **Value Chips** (e.g., Timestamps, Shift times): `bg-gray-800/50 border border-gray-700/50 text-muted font-mono text-[10px] uppercase`
* **Dynamic Composite Badges (e.g., Compliance Tracker)**
  - **Purpose**: Large, multi-line status trackers that change semantic color state entirely based on underlying data.
  - **Layout**: Icon on the left, stacked text on the right.
  - **Typography**: Title is `text-[10px] uppercase font-bold text-current`, Main Value is `text-sm font-mono font-bold text-current`, optional Subtext is `text-[10px] uppercase font-bold text-current`.

### 4.8 Drag-and-Drop Items (e.g., Kanban Cards)
* Base state: `bg-canvas border border-gray-700` universally (no category color borders).
* Interaction state: `cursor-grab hover:bg-surface-light hover:border-gray-500`.
* Active drag state: `active:cursor-grabbing`.

### 4.9 List Management & Inline CRUD Protocol
* **Icons:** Delete (`Trash`), Edit (`Edit2`), Save (`Check`), Cancel (`X`), Reorder (`ArrowUp` / `ArrowDown`).
* **Inline Edit & Keyboard Shortcuts:** Pressing `Enter` commits changes. Pressing `Escape` cancels edits. Input fields render a subtle `Enter ↵` indicator.
* **Text Truncation (Absolute Overlay Trick):** In narrow grid columns, text containers use `w-full truncate`. Action buttons are absolutely positioned (`absolute right-1 top-1/2 -translate-y-1/2`) with hover opacity toggles to prevent text clipping.

---

## CHAPTER 5: FEEDBACK & ALERTS

### 5.1 Hero Verdict Banners
* **Purpose**: Massive, full-width alert cards that summarize the ultimate Pass/Fail state of a workflow (e.g., ISO 2859-1 VERDICT).
* **Geometry**: `p-6 flex items-center justify-between rounded-xl`.
* **State Styling**: Semantic background/borders (e.g., `bg-rose-500/10 border-rose-500/30 text-rose-500` for Fail).
* **Typography**: Title is `text-2xl font-bold uppercase`. Subtitle is `text-xs font-bold uppercase`.
* **Nesting**: Any readout displays inside the banner (like Final System Lot) MUST use Tier 3 (`bg-canvas`) dark backgrounds for contrast.

### 5.2 Out-of-Spec Validation State (Failures)
* **Mass Data Entry Grid Failures**:
  - Input Box: `border-rose-500/50 text-rose-500 bg-rose-500/5`.
  - Deviation Label (Beneath Input): MUST be strictly `text-[9px] font-mono text-rose-500 font-bold tracking-tighter`. Use absolute positioning or tight negative margins to ensure it doesn't break the vertical grid rhythm.
* **High-Density Spreadsheet Failures**: 
  - Turn the cell red (`bg-rose-500/20 text-rose-500 border-rose-500/50`), but specifically **omit** the deviation label beneath it to preserve strict row height. Users will hover or rely on aggregate trackers for deviation data.

### 5.3 Inline Informational Alerts
* **Purpose**: Contextual instructions or warnings placed directly inside form flows.
* **Geometry**: `p-4 rounded-lg border border-l-4 flex gap-3 text-sm`.
* **State Styling**: Semantic colors based on intent. (e.g., Info: `bg-brand-secondary/5 border-brand-secondary/20 border-l-brand-secondary text-brand-secondary`).