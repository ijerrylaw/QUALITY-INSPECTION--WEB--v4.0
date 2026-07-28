# Dual Panel Role-Based Login Page

Plan for upgrading `LoginPage.tsx` and `AuthContext.tsx` to support role-based authentication across all 6 organizational roles (`OPERATOR`, `LEADER`, `SUPERVISOR`, `EXECUTIVE`, `MANAGER`, `ADMIN`) as defined in `V4_MASTER_BLUEPRINT.md`, `UI_DESIGN_SYSTEM.md`, and `NAVIGATION_ARCHITECTURE.md`.

---

## Organizational Hierarchy & Role Structure

```
Level 1: OPERATOR    ── General Workers         (Factory Kiosk PIN Pad)
Level 2: LEADER      ── Line / Team Leads       (Factory Kiosk PIN Pad)
Level 3: SUPERVISOR  ── Shift Supervisors       (Left Panel: M365 SSO only)
Level 4: EXECUTIVE   ── QA Executives/Engineers (Left Panel: M365 SSO only)
Level 5: MANAGER     ── QA Managers             (Left Panel: M365 SSO only)
Level 6: ADMIN       ── System IT Administrators(Left Panel: M365 SSO only)
```

> **Note:** Supervisor PIN fallback is deferred to a future release. All office/management roles (Supervisor and above) log in exclusively via Microsoft 365 SSO on the Left Panel.

---

## Architectural Overview

```
┌──────────────────────────────────────────┬──────────────────────────────────────────┐
│  LEFT PANEL: MANAGEMENT & OFFICE (SSO)   │  RIGHT PANEL: FACTORY FLOOR KIOSK (PIN)  │
│                                          │                                          │
│  • Target Roles:                         │  • Target Roles:                         │
│    - ADMIN (System IT Admin)             │    - OPERATOR (General Worker)           │
│    - MANAGER (QA Manager)                │    - LEADER (Line / Team Lead)           │
│    - EXECUTIVE (QA Executive/Engineer)   │                                          │
│    - SUPERVISOR (Shift Supervisor)       │  • Features:                             │
│                                          │    - Active Shift Worker Selector        │
│  • Features:                             │      with [OPERATOR] / [LEADER] badges   │
│    - M365 SSO Role Selector Pill         │    - 6-Digit Industrial PIN Pad           │
│      (ADMIN / MANAGER / EXECUTIVE /      │      (Min 48px touch targets)            │
│       SUPERVISOR)                        │    - Physical keyboard support           │
│    - One-Click Microsoft 365 Auth        │    - Auto-submit on 6th digit            │
│    - Azure AD Tenant Branding            │    - Shake animation on invalid PIN      │
└──────────────────────────────────────────┴──────────────────────────────────────────┘
```

---

## Route Access Matrix (Finalized)

| Route | Label | Operator | Leader | Supervisor | Executive | Manager | Admin |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `/wizard` | QUALITY INSPECTION | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/history` | INSPECTION RECORDS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/approvals` | APPROVALS QUEUE | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `/analytics` | QUALITY ANALYTICS | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `/config` | CONFIGURATION CONTROL | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `/system` | SYSTEM & TENANT ADMIN | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## UI Design Rules (per `UI_DESIGN_SYSTEM.md`)

### Left Panel — M365 SSO Role Selector
- Role selector pills use the **Selection Chip** pattern (Section 6):
  - **Unselected:** `bg-surface text-muted border border-gray-700 h-12 px-4 rounded-lg`
  - **Selected:** `bg-brand-primary text-white border border-brand-secondary font-bold h-12 px-4 rounded-lg`
- Role pill labels: `ADMIN`, `MANAGER`, `EXECUTIVE`, `SUPERVISOR` — ALL CAPS, `text-xs font-semibold uppercase tracking-wider`.
- Sign in button: accent-gradient CTA button, `h-12 rounded-lg bg-accent-gradient text-white font-semibold`.

### Right Panel — Factory Floor PIN Pad
- Worker selector dropdown: `font-mono` (`JetBrains Mono`) per Section 2 & 8 of `UI_DESIGN_SYSTEM.md`.
- Role badges in dropdown: Cyan info badge style per Section 6:
  - `bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-xs font-semibold uppercase tracking-wider rounded-lg px-2.5 py-1`
- PIN indicator dots: `font-mono`, `w-4 h-4` filled/empty circles.
- Keypad number buttons: `font-mono`, minimum `h-16` (64px) touch targets, `rounded-lg`, `bg-surface hover:brightness-110` with `whileTap={{ scale: 0.95 }}` Framer Motion micro-animation.
- Invalid PIN: Framer Motion horizontal shake animation + Error Toast (`border-rose-500/50 text-rose-400`).
- Auto-submit on 6th digit input.
- Physical keyboard support: `0–9` keys append digit, `Backspace` deletes, `Escape` clears.

---

## Component Changes

### [MODIFY] `AuthContext.tsx`
- Expand `UserRole` type:
  ```typescript
  export type UserRole = 'OPERATOR' | 'LEADER' | 'SUPERVISOR' | 'EXECUTIVE' | 'MANAGER' | 'ADMIN';
  ```
- Update `loginWithM365(role: UserRole)` to accept a `role` parameter and mock the correct user profile for each management role.
- Update `loginWithPIN(userId: string, pin: string)` to resolve `OPERATOR` or `LEADER` role from the selected worker account.
- Mock users for the right panel worker selector:
  - `{ id: 'usr_floor_104', name: 'Ahmad Razak', role: 'OPERATOR', line: 'Line 01' }`
  - `{ id: 'usr_floor_105', name: 'Siti Nurhaliza', role: 'OPERATOR', line: 'Line 01' }`
  - `{ id: 'usr_leader_01', name: 'Wong Wei Ming', role: 'LEADER', line: 'Line 01 Lead' }`

### [MODIFY] `LoginPage.tsx`
- **Left Panel:**
  - Role selector pill group: `ADMIN`, `MANAGER`, `EXECUTIVE`, `SUPERVISOR` (default: `MANAGER`).
  - Clicking the pill sets `selectedRole` state, then `loginWithM365(selectedRole)` is called on SSO button click.
- **Right Panel:**
  - Worker dropdown with `[OPERATOR]` and `[LEADER]` role badges next to each worker name.
  - 6-digit PIN pad grid (3×4 layout: `1–9`, `0`, `⌫`), `font-mono`, `h-16` buttons.
  - PIN state as a string, auto-submit at length 6.
  - Error feedback: shake animation + toast.

---

## Verification Plan

1. **M365 Login as ADMIN** ➔ Verify access to `/system`, `/config`, `/approvals`, `/analytics`, `/wizard`, `/history`.
2. **M365 Login as MANAGER** ➔ Verify access to `/config`, `/approvals`, `/analytics`, `/wizard`, `/history`. No `/system`.
3. **M365 Login as EXECUTIVE** ➔ Verify access to `/approvals`, `/config`, `/analytics`, `/wizard`, `/history`. No `/system`.
4. **M365 Login as SUPERVISOR** ➔ Verify access to `/analytics`, `/wizard`, `/history`. No `/approvals`, `/config`, `/system`.
5. **PIN Login as OPERATOR (W-104)** ➔ Verify access to `/wizard`, `/history` only.
6. **PIN Login as LEADER (L-01)** ➔ Verify access to `/wizard`, `/history` only.
7. **Invalid PIN** ➔ Verify shake animation and error toast appear.
8. **Build check** ➔ Run `cmd /c npm run build` in `frontend` — expect 0 TypeScript compilation errors.
