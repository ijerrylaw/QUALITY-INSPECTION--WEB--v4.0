# Information & Navigation Architecture

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines the Routing Map, Role-Based Access Control (RBAC), Multi-Tenancy Hierarchy, and Session Mechanics.

---

## 1. MULTI-TENANT & ORGANIZATIONAL HIERARCHY
All data models and user sessions are scoped strictly by enterprise tenant and physical facility:
`Tenant (Company / Group) ➔ Facility (Plant) ➔ Production Line ➔ Machine / Shift / Batch`

---

## 2. ROLE-BASED ACCESS CONTROL (RBAC) MATRIX
User roles dictate menu visibility, authentication requirements, and functional route access:

| Role Level | Role | Target Users | Auth Method | Permitted Routes |
| :---: | :--- | :--- | :--- | :--- |
| **Level 1** | **OPERATOR** | General Workers | 6-Digit PIN | `/wizard`, `/history` |
| **Level 2** | **LEADER** | Line / Team Leads | 6-Digit PIN or M365 SSO | `/wizard`, `/history` |
| **Level 3** | **SUPERVISOR** | Shift Supervisors | M365 SSO (PIN Fallback) | `/wizard`, `/history`, `/analytics` |
| **Level 4** | **EXECUTIVE** | QA Executives | M365 SSO Only | `/wizard`, `/history`, `/analytics`, `/approvals`, `/config` |
| **Level 5** | **MANAGER** | QA Managers | M365 SSO Only | `/wizard`, `/history`, `/analytics`, `/approvals`, `/config` |
| **Level 6** | **ADMIN** | System IT Admins | M365 SSO Only | All Routes (including `/system`) |

---

## 3. ROUTING MAP & FEATURES
| Route | Label | Target Roles | Functional Description |
| :--- | :--- | :--- | :--- |
| `/wizard` | **QUALITY ENTRY WIZARD** | All Roles | Dual-Mode Data Entry: Guided 4-Step Wizard & Multi-Lot Spreadsheet Grid. |
| `/history` | **INSPECTION RECORDS** | All Roles | Searchable inspection log. Supports bulk CSV/Excel import for Supervisors. |
| `/approvals`| **APPROVALS QUEUE** | Exec, Manager, Admin | Side-by-side diff viewer for approving post-submission amendment drafts. |
| `/analytics`| **QUALITY ANALYTICS** | Supervisor+, Admin | Dynamic Pareto charts, defect trends, and machine comparisons. |
| `/config` | **CONFIGURATION CONTROL**| Exec, Manager, Admin | Submenus for Factory Setup, Product Engine, and Quality Rules. |
| `/system` | **SYSTEM & TENANT ADMIN** | Admin Only | Azure AD, SharePoint sync settings, and enterprise user management. |

---

## 4. CONCURRENT MULTI-FACTORY SESSIONS
* **Stateless HTTP/REST Architecture:** Authenticated sessions use JWT bearer tokens scoped by `tenantId`, `facilityId`, `lineId`, and `userId`.
* **Parallel Execution:** Supports hundreds of concurrent tablet sessions across multiple plants without cross-factory data collision.
* **Default Landing Route:** Upon successful login, all user roles land directly on `/wizard`.

---

## 5. SIDEBAR NAVIGATION MECHANICS
* *(Refer to `UI_DESIGN_SYSTEM.md` for exact height, color, and padding tokens).*
* **Responsive Collapsible Behavior:** Auto-collapses to an icon-only strip (`w-20`) on tablet breakpoints and expands (`w-64`) on desktop monitors.