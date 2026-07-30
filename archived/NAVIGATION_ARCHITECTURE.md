# Information & Navigation Architecture

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines the Routing map, Role-Based Access Control (RBAC), Multi-Tenancy Hierarchy, and Sidebar Navigation layout.

---

## 1. MULTI-TENANT & ORGANIZATIONAL HIERARCHY

To support future SaaS expansion while serving One Glove Group today, all data models are scoped by tenant and facility:

```
Tenant (Company / Group)
 └── Facility (Plant / Location)
      └── Production Line
           └── Machine / Shift / Batch
```

*   **Tenant Level:** Isolates customer data (e.g., One Glove Group vs. Future Client B).
*   **Facility Level:** Allows multi-plant filtering (e.g., Klang Plant vs. Ipoh Plant).

---

## 2. ROLE-BASED ACCESS CONTROL (RBAC) MATRIX

User roles dictate menu visibility, authentication methods, and functional permissions.

| Role | Target Users | Auth Method | Functional Access |
| :--- | :--- | :--- | :--- |
| **Operator** | General Workers | 6-Digit PIN (No M365) | • Submit AQL Inspections<br>• Request Amendments<br>• View Read-Only Shift Scorecard |
| **Leader** | Line / Team Leads | 6-Digit PIN or M365 SSO | • Submit AQL Inspections<br>• Request Amendments<br>• View Read-Only Shift Scorecard |
| **Supervisor** | Shift Supervisors | M365 SSO (Fast 6-Digit PIN fallback) | • Submit & Request Amendments<br>• View Real-Time Plant Analytics<br>• View Inspection Records |
| **Executive** | QA Executives / Engineers | M365 SSO | • **Approve / Reject Amendments (Diff Viewer)**<br>• **Edit Configuration Control** (Defects, SKUs, Profiles)<br>• **View Real-Time Plant Analytics & Records** |
| **Manager** | QA Managers | M365 SSO | • Everything in Executive<br>• **Register Users, Issue Temp PINs & Reset PINs** |
| **Admin** | System IT Admin | M365 SSO | • Everything in Executive & Manager<br>• **Manage System & Tenant Settings** (Azure/SharePoint Sync, User Roles) |

---

## 2.1 CONCURRENT MULTI-FACTORY SESSIONS

Because the system is built on a stateless HTTP/REST architecture with JWT session tokens:
*   **Unlimited Parallel Logins:** Hundreds of workers across multiple facilities (e.g., Klang Plant, Ipoh Plant, Penang Plant) can log in simultaneously on separate tablets.
*   **Session Isolation:** Each session is scoped to its specific `facilityId`, `lineId`, and `userId`, ensuring zero cross-factory data collision.
*   **Default Landing Page:** Upon successful authentication, regardless of role (Operator, Supervisor, or Manager), the system immediately routes the user to `/wizard` to prioritize rapid data entry over analytical review.

---

## 3. ROUTING & NAVIGATION MAP

The Left Sidebar dynamically adapts based on the authenticated user's role:

| Route | Icon (Lucide 2px) | Label | Target Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/wizard` | `ClipboardCheck` | **QUALITY ENTRY WIZARD** | All Roles | Dual-Mode Entry: Single Entry (4-Step Wizard: Metadata ➔ Physical Dimensions ➔ Defect Tabulation ➔ Review & Submit) & Batch Entry (Spreadsheet Grid). |
| `/history` | `History` | **INSPECTION RECORDS** | All Roles | Searchable data table of past tests. Includes **Bulk CSV/Excel Import** for supervisors. |
| `/approvals` | `ShieldAlert` | **APPROVALS QUEUE** | Manager, Exec, Admin | Side-by-side diff viewer for pending amendment requests. |
| `/analytics` | `BarChart3` | **QUALITY ANALYTICS** | Supervisor, Executive, Manager, Admin | Dynamic Pareto charts, pass/fail trends, machine comparisons. |
| `/config` | `Sliders` | **CONFIGURATION CONTROL** | Manager, Exec, Admin | See `V4_MASTER_BLUEPRINT.md` Section 9.4 for deep-dive breakdown. |
| `/system` | `Settings` | **SYSTEM & TENANT ADMIN** | System Admin Only | Azure AD, SharePoint List sync settings, User Role assignments. |

---

## 4. SIDEBAR NAVIGATION DESIGN CONSTRAINTS

Adhering strictly to `UI_DESIGN_SYSTEM.md`:
*   **Aspect Ratio:** Optimized for Landscape factory tablets and desktop monitors.
*   **Responsive Collapsible State:** Left sidebar auto-collapses to an icon-only strip (`w-20`) on tablet breakpoints, and expands (`w-64`) on desktop monitors.
*   **Touch Target Height:** All sidebar navigation links MUST have a minimum height of **48px** (`h-12`).
*   **Active Link State:** Highlighted with `bg-brand-primary` and text `text-white` with a left indicator bar (`bg-brand-secondary`).
*   **Icons:** Exclusively `lucide-react` with `strokeWidth={2}` and standard `24x24px` (`w-6 h-6`) sizing.
