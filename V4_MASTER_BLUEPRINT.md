# Next-Gen Quality Inspection Platform: Project Proposal & Architecture Blueprint
**Project:** QUALITY INSPECTION (WEB) v4.0
**Role:** Principal Software Architect & Lead QA Systems Engineer

---

## 1. PROJECT PROPOSAL & EXECUTIVE VISION

### The Vision
We are proposing the development of a state-of-the-art **Automated AQL Compliance Inspection Engine**, engineered from the ground up for high-volume, mission-critical manufacturing environments. Moving beyond the limitations of legacy systems, this new platform will serve as a digital-first, hardware-agnostic solution that completely eliminates paper-based QA tracking. By leveraging a highly decoupled, modern web architecture, we will drastically reduce operator fatigue, eliminate human mathematical errors in compliance, and provide real-time, global telemetry to enterprise data lakes.

### Core Value Propositions & Workflows
1. **Frictionless AQL Sampling:** A highly-optimized, tablet-first interface allows operators to rapidly record physical dimensions (thickness, length) with automated out-of-spec highlighting.
2. **Rapid-Tap Defect Categorization:** A reimagined, micro-animated touch interface for tallying defects across severe (Zero Tolerance), barrier, and visual classes, designed specifically for gloved hands.
3. **Infallible Math Engine:** A robust, automated backend that instantly calculates PASS/FAIL verdicts based on ISO 2859-1 sampling tables and hot-swappable client-specific inspection profiles.
4. **Immutable Audit Trails:** A secure amendment pipeline requiring Supervisor cryptographic/SSO sign-off for any post-submission modifications, ensuring 100% regulatory compliance.
5. **Maximized Microsoft 365 ROI (Enterprise Sync):** By deeply integrating with Azure AD SSO and Microsoft SharePoint for data storage, the platform requires zero new infrastructure. It capitalizes on the enterprise Microsoft 365 business licenses that modern companies already own, drastically reducing IT overhead and providing global management with real-time manufacturing visibility.

---

## 2. UI/UX & INTERFACE STRATEGY

To ensure maximum efficiency across the entire organization, the application must adhere to strict, responsive UI/UX paradigms. While heavily optimized for industrial factory-floor tablets, the interface must fluidly adapt to standard laptop and desktop environments used by Supervisors and QA Admins.

### Responsive Collapsible Sidebar Navigation
- **Universal Landscape Optimization:** Factory tablets, as well as laptops and desktop monitors, natively utilize landscape aspect ratios. A **Left Sidebar** is mandated over a Top Bar because it preserves precious vertical space for long data-entry forms and complex admin data tables.
- **Responsive Flex:** The layout must use modern CSS Grid/Flexbox to dynamically reflow. On smaller tablets, the sidebar should auto-collapse into an icon-only strip to maximize the workspace. On large desktop monitors, it can expand to reveal full navigation labels.
- **Scalability:** It scales infinitely for Admin routes (Config, Profiles, SKU Builder) without crowding the UI.

### High-Contrast Dark Mode Default
- **Environment Targeting:** The baseline UI (`--color-canvas`) should be a deep navy/black. This reduces eye strain over 12-hour shifts in varying factory lighting and saves battery on OLED devices.
- **Color Coding:** Neon accents (Emerald for PASS, Crimson for FAIL) must be used to provide instant situational awareness to passing supervisors from a distance.

### Industrial Touch-Target Sizing
- **Glove-Friendly Interaction:** Operators wear PPE; therefore, all interactive elements (buttons, inputs, defect counters) must maintain a minimum `48x48px` touch target.
- **Haptic/Visual Micro-animations:** Rapidly tapping defect counters must trigger immediate visual feedback (e.g., a scale-up 'pop' via Framer Motion) to confirm the tap registered without forcing the operator to scrutinize the screen.

### The "Wizard" Data Entry Pattern
- **Cognitive Load Reduction:** A full AQL inspection involves dozens of inputs. Instead of a single infinite-scrolling page, the primary flow must be a strict step-by-step Wizard (e.g., Metadata ➔ Dimensions ➔ Defects ➔ Verdict). This focuses the operator on one distinct task at a time and prevents incomplete submissions.

---

## 3. SYSTEM ARCHITECTURE & TECH STACK

### Frontend Architecture
- **Framework:** React 19 (Functional components, Hooks).
- **Build & Dev Server:** Vite (High-performance HMR).
- **Language:** TypeScript (`~5.8.2`).
- **Styling & Design System:** Tailwind CSS v4 (Utility-first styling, integrated via `@tailwindcss/vite`).
- **UI & Interaction:** 
  - `lucide-react` (Consistent iconography).
  - `motion` (Framer Motion for fluid state transitions and micro-animations in the Wizard).
  - `recharts` (Analytics and dashboard visualization).
- **State Management:** React local state (`useState`, `useMemo`, `useEffect`) combined with prop-drilling or Context for the specific wizard views.

### Backend Architecture
- **Server Framework:** Express.js (`4.21.2`) running on Node.js (or upgrade to NestJS for strict enterprise DI patterns).
- **Runtime Tooling:** Standard `tsc` compiler for production. The API should be strictly decoupled from the Vite frontend, operating in its own repository or monorepo workspace.
- **Routing:** A structured REST/GraphQL API layer handling configurations, submissions, and Azure integrations.
- **Data Persistence Strategy:** 
  - **Local/Edge:** A robust relational database (e.g., PostgreSQL or SQLite) paired with a modern ORM (Prisma or Drizzle) to ensure transactional integrity and concurrency control.
  - **Cloud/Enterprise:** Direct integration with Microsoft Graph API. The backend caches Azure AD tokens and POSTs/PATCHes records to a SharePoint List (`IPQA_Master_Data`).

---

## 4. CORE DATA STRUCTURES & TYPES

The following TypeScript definitions form the data spine of the application.

```typescript
// Core Data Submissions
export interface Submission {
  id: string; // e.g., 'sub_123456789'
  productCode: string;
  productionDate: string;
  samplingTime: string;
  submissionTimestamp: string;
  machineId: string;
  shift: string;
  batchNumber: string;
  size: string; // Glove Size (e.g., 'M', 'L')
  sampleSize: number;
  dimensions: DimensionMeasurements;
  dimensionMins: DimensionMinimums;
  defects: DefectCounts; // Record<DefectId, Count>
  verdict: 'PASSED' | 'FAILED';
  aadObjectId: string; // Pulled securely from MS365 Token
  userPrincipalName: string; // Pulled securely from MS365 Token
  amendmentStatus: AmendmentStatus;
  totalCarton?: number;
  gloveWeight?: number;
  amendmentLogs: AmendmentLog[];
  profileId?: string;
}

export type AmendmentStatus = 'UNMODIFIED' | 'AMENDMENT_DRAFTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

// Rules Engine & Configurations
export type EvaluationMode = 'CUMULATIVE' | 'GRANULAR' | 'N/A' | '';

export interface AQLCategory {
  id: string;
  name: string;
  aqlLevel: string; // e.g., '1.0', '2.5', 'AND (Zero Tolerance)'
  evaluationMode: EvaluationMode;
}

export interface DefectDefinition {
  id: string;
  name: string; // e.g., 'Pinhole At Crotch'
  defaultClass: string; // e.g., 'BARRIER'
  currentClass: string;
}

export interface InspectionProfile {
  id: string;               
  name: string;             
  isDefault: boolean;
  aqlCategories: AQLCategory[]; 
  defectDefinitions: DefectDefinition[]; 
}

export interface SkuOption {
  value: string;
  label: string;
}

// Global App Configuration Storage
export interface AppConfig {
  productCodes: string[];
  defectDefinitions: DefectDefinition[];
  lines: { id: string; name: string }[];
  shifts: { id: string; name: string }[];
  sizes: string[];
  sampleSizes: number[];
  aqlCategories?: AQLCategory[];
  inspectionProfiles?: InspectionProfile[];
  productProfileMap?: Record<string, string>; // Maps productCode -> profileId
  
  // Custom SKU Builder dictionaries
  skuMaterials?: SkuOption[];
  skuWeights?: SkuOption[];
  skuColors?: SkuOption[];
  skuTreatments?: SkuOption[];
  skuLengths?: SkuOption[];
  skuTextures?: SkuOption[];
}
```

---

## 5. BUSINESS LOGIC & MATHEMATICAL ENGINES

### ISO 2859-1 Master AQL Lookup Engine
The backend engine (`getAQLThresholds`) dynamically calculates Acceptance (ac) and Rejection (re) limits based on standard ISO 2859-1 (Normal single sampling, Table II-A).
1. **Bracket Smoothing:** If an operator inputs an arbitrary sample size (e.g., 200), it snaps to the nearest standard ISO bracket (13, 20, 32, 50, 80, 125, 200, 315, 500...).
2. **Matrix Lookup:** Matches the AQL string (e.g., "1.5") and bracketed sample size against an internal hardcoded matrix.
3. **Special Overrides:** AQLs marked as "AND" or "Zero Tolerance" instantly return `{ ac: 0, re: 1 }`.

### Verdict Generation Logic
The evaluation function (`evaluateAQLVerdict`) determines PASS/FAIL based on mapping recorded defect quantities against their categorized thresholds.
- **CUMULATIVE Mode:** All defect counts within a category (e.g., Major Visual) are summed together. If `Total Category Defects > ac`, the lot fails.
- **GRANULAR Mode:** Each individual defect type within the category is checked independently against the threshold. If *any* single defect type exceeds `ac`, the lot fails.
- **Pass / Fail / N/A Mode:** Used for qualitative items. If any item logs a fail state (internal value 2), the entire inspection fails.

### SKU Parsing & Mapping
SKUs are highly structured combinations of traits (Material + Weight + Color + Treatment + Length + Texture). E.g., `N035SKB-OC-24FT`.
- The system maps specific SKUs to specific `InspectionProfiles` (`productProfileMap`). This allows a strict customer (e.g., Ansell) to require tighter AQL levels (e.g., 0.65 for Barrier) for specific product codes, overriding the standard factory defaults (1.0).

---

## 6. CONFIGURATION CONTROL ENGINE

Dynamic parameters are designed to be "hot-swappable" without code deployments. 
- **Storage Strategy:** All dynamic configurations are nested within the `config` object in the central JSON database. 
- **Propagation:** When a change is made in `ConfigDashboard` (e.g., altering the AQL level of "Major Visual" from 2.5 to 1.5 in the Default Profile), the React app sends a PATCH to the backend. The backend overwrites `db.json`. 
- **Inspection Integrity:** Future runs of `evaluateAQLVerdict` pull directly from the active configuration context at the moment the operator presses "Evaluate". However, past submissions store a hard snapshot of their verdict, protecting historical integrity from future rules engine changes.

---

## 7. DATA AUTOMATIONS & LINKED PARAMETERS

The system reduces operator cognitive load by linking complex parameters and automating repetitive data entry tasks:

### Linked Parameters
- **SKU Specification Linking:** The Product Code (SKU) is not manually typed; it is dynamically linked to and constructed from discrete product specifications (Material, Weight, Color, Treatment, Length, Texture) defined in the config.
- **SKU to Profile Mapping:** When an operator selects an SKU, the system dynamically queries the `productProfileMap`. This links the SKU to a specific `InspectionProfile`, automatically loading the correct AQL categories, limits, and defect definitions for that product run.
- **Sample Size Bracketing:** The Sample Size input is mathematically linked to the AQL acceptance/rejection thresholds. Changing the sample size dynamically traverses the ISO 2859-1 matrix to recalculate passing parameters in real-time.
- **State Persistence:** Form fields (Machine ID, Shift, Glove Size, Side) are linked to local storage. Upon completing an inspection, these values automatically pre-populate the next wizard session, assuming contiguous batch testing.

### Data Automations
- **Batch & Lot Number Automation:** To eliminate manual data-entry typos on critical identifiers, the system automatically derives and constructs the formal Batch Number, Lot Number, and Sequence Number directly from the system Date, Time, Shift, and Machine ID.
  - **Julian Date Conversion:** Dates are automatically mathematically compressed into 3-digit Julian Days (e.g., Feb 1st = `032`) for precise, standardized barcode generation.
  - **Night Shift Rollover Logic:** If an inspection occurs between Midnight and 8:00 AM, the system automatically assigns it to Shift 'B' (Night Shift) and mathematically subtracts 1 day from the effective Production Date to maintain strict continuous-batch integrity.
- **Real-Time Verdict Automation:** The engine continuously evaluates inputted defect counts against the active AQL thresholds. The final PASS / FAIL verdict is entirely automated; operators cannot manually override the math.
- **Timestamp & Telemetry Automation:** `submissionTimestamp` is automatically generated with millisecond precision upon submission, preventing backdating.
- **Enterprise Synchronization:** Background automation services silently push completed records (and their pending amendments) to the Microsoft 365 / SharePoint enterprise list without interrupting the operator workflow on the factory floor.

---

## 8. DESIGN SYSTEM & CENTRALIZED STYLING

The application tightly centralizes all styling, typography, and graphics to maintain a highly premium, unified aesthetic that can be easily customized or white-labeled:

### Tailwind v4 Design Tokens
The foundation of the UI is governed entirely by `src/index.css` leveraging Tailwind CSS v4's modern `@theme` directive. 
- **Color Palette:** A strict, centralized color taxonomy is enforced (e.g., `--color-canvas`, `--color-card`, `--color-accent`) rather than raw hex codes scattered throughout components. 
- **Typography Enforcement:** The system globally enforces `@layer base` rules to apply specific fonts to specific HTML elements. For example, all headings (`h1`-`h6`), labels, and buttons are forced to use the `Inter` sans-serif font for readability, while all data inputs, table cells (`td`), and numerical readouts are strictly enforced to use `JetBrains Mono` for tabular alignment and precision.

### Dynamic White-Label Branding
Graphics and localized nomenclature are not hardcoded in the UI. Instead, the `AppConfig.branding` object in the central JSON database acts as the source of truth for:
- `companyName` & `portalTitle` (e.g., 'GLOVE CORP' vs 'YOUR FACTORY NAME')
- `logoImage` (Base64 or URL linking to a custom corporate logo)
- `accentColor` (Swapping the primary interface highlights between Emerald, Cobalt, Violet, etc.)
This means an Admin can completely overhaul the corporate look and feel of the portal across all operators instantly without touching a single line of React code or deploying a new build.

---

## 9. COMPLETE FEATURE & VIEW MODULE SPECIFICATION

### 1. DataEntryWizard (`DataEntryWizard.tsx`)
- **Target Role:** Operator / QA Inspector.
- **State/Workflow:** A heavily guarded multi-step process.
  1. **Metadata:** SKU, Batch, Date, Machine, Sample Size.
  2. **Dimensions:** Entry of physical measurements (thickness arrays, minimums).
  3. **Defects Tabulation:** Rapid tap UI to increment defect counts across severity tabs.
  4. **Review & Sign-off:** Automated verdict presentation, capturing PIC name/email, and submission.
- **Side-Effects:** POSTs JSON to backend, resets state upon success.

### 2. ApprovalsQueue (`ApprovalsQueue.tsx`)
- **Target Role:** Supervisor / Admin.
- **State/Workflow:** Displays a list of inspections where `amendmentStatus === 'PENDING_APPROVAL'`.
- **Interactions:** Supervisor reviews side-by-side diffs of `originalValues` vs `newValues`. They can "Approve" (commits the change to DB/SharePoint) or "Reject" (discards the pending amendment).

### 3. History Feed (`HistoryFeed.tsx`)
- **Target Role:** All Roles (Read-Only for Operators).
- **State/Workflow:** A paginated, searchable datatable of all past `Submissions`.
- **Interactions:** View detailed read-only receipts of past inspections.

### 4. Config Dashboard (`ConfigDashboard.tsx`)
- **Target Role:** Admin.
- **State/Workflow:** Complex form UI for editing `AppConfig`. 
- **Interactions:** 
  - Manage Defect Definitions (re-mapping defects to different classes).
  - Construct/Edit AQL Profiles.
  - Map SKUs to specific Profiles.
  - Modify dropdown lists (Glove Sizes, Shifts, Lines).

### 5. Login Portal (`LoginPortal.tsx`)
- **Target Role:** All Roles (Operator, Supervisor, Admin).
- **State/Workflow:** Acts as the gateway to the application. Dynamically pulls branding (logo, title, colors) from the central configuration.
- **Interactions:** 
  - **Azure AD SSO:** Integrates a popup window flow to authenticate against Microsoft 365, enforcing strict corporate identity security before access is granted.

### 6. Admin Panel (`AdminPanel.tsx`)
- **Target Role:** Admin / System Integrator.
- **State/Workflow:** Configures enterprise integrations and advanced settings.
- **Interactions:** Inputting Azure AD credentials (Tenant ID, Client ID, Secret, SharePoint URL) for Microsoft 365 syncing.

---

## 10. RE-BUILD ROADMAP & STEP-BY-STEP IMPLEMENTATION PLAN

Follow this phased approach to perfectly rebuild the application from a blank repository:

### Phase 1: Repository & Foundation
1. Setup a monorepo workspace (e.g., Turborepo) to strictly separate the `frontend` and `api` projects.
2. **Frontend:** `npm create vite@latest quality-inspection-portal -- --template react-ts`. Install Tailwind v4, Lucide, Motion, Recharts.
3. **Backend:** Initialize an Express or NestJS project with Prisma/Drizzle and a PostgreSQL/SQLite database instance.
4. Create a shared schema package for strict cross-boundary TypeScript definitions.

### Phase 2: Backend Core (Data & Engine)
1. Define the SQL Schema via ORM (Prisma/Drizzle) for Configurations and Submissions.
2. Implement the `getAQLThresholds` engine using a strictly typed, immutable constant file (`iso2859-matrix.ts`) to ensure maximum performance without unnecessary database queries.
3. Write the `evaluateAQLVerdict` processing logic.
4. Setup robust REST/GraphQL API routes for configurations and submissions.

### Phase 3: SharePoint Integration Service
1. Implement MSAL / Azure AD token fetching logic (`getSharePointAccessToken`).
2. Implement Site ID lookup and standard Graph API POST/PATCH routines targeting the `IPQA_Master_Data` list.
3. Bind this service to the `/api/submissions` POST and PATCH endpoints.

### Phase 4: UI Shell & Design System
1. Setup Tailwind V4 in `index.css`.
2. Create the main `App.tsx` shell with a Sidebar navigation layout.
3. Implement a global Context provider or hook to fetch and hold the `AppConfig` and `Submissions` state on mount.

### Phase 5: Complex View Modules
1. **Build the Wizard (`DataEntryWizard.tsx`):** Start with the step-tracking state. Build the SKU selection form, then the dimensions matrix, and finally the defect tapping UI (this is the most complex UI component).
2. **Build the History Feed (`HistoryFeed.tsx`):** A standard mapping over the `submissions` array with filtering capability.
3. **Build the Approvals Queue (`ApprovalsQueue.tsx`):** Filter submissions by `approvalStatus === 'Pending'` and build a diff-viewer component.

### Phase 6: Rules Engine Admin Dashboard
1. **Build `ConfigDashboard.tsx`:** Create robust array-editing UIs to mutate Defect Classes, SKU segments, and Profile rules. 
2. Wire up save buttons to `POST /api/config`.

### Phase 7: Verification & Build
1. Run End-to-End simulation of a failed AQL batch to ensure mathematical precision.
2. Build via `npm run build` and test the bundled `node dist/server.cjs` environment.
