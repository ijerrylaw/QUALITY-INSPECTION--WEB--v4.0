# Antigravity AI Project Rules

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** This document dictates the strict behavioral rules the AI must follow when operating in this workspace to prevent token limit exhaustion, avoid design drift, and maintain absolute architectural integrity.

---

## 1. INCREMENTAL EXECUTION (The "Micro-Step" Rule)
- **One File per Turn:** Work strictly in micro-steps. Write or edit only one file at a time, then stop and wait for user approval before proceeding to the next step.

## 2. ARCHITECTURAL INTEGRITY
- **Master Blueprint is Law:** Read `V4_MASTER_BLUEPRINT.md` for authoritative data schemas, business logic, and tech stack guidelines before implementing features.
- **No Unapproved Dependencies:** Rely strictly on the established core stack (React 19, Vite, Tailwind v4, Lucide, Framer Motion). Do not install third-party NPM packages without explicit user approval.

## 3. DESIGN SYSTEM STRICTNESS (Preventing Design Drift)
- **Single Source of Truth:** `UI_DESIGN_SYSTEM.md` is the authoritative reference for all UI design tokens, color variables, typography casing/fonts, and component geometry (8px radius, 48px touch targets). Strictly consult and adhere to it for all visual work.
- **No Magic Numbers:** You are forbidden from using raw CSS values (e.g. `color: #FF5733` or `font-size: 14px`) in inline styles or Tailwind arbitrary values.

## 4. SAFETY & GIT
- **Pre-Refactor Git Reminder:** Proactively remind the user to commit their code in Git before executing major file deletions or cross-file refactoring.
- **Modular Architecture:** Ensure code changes are isolated and modular so they can easily be reverted without cascading failures.

## 5. MANDATORY PRE-STEP MODEL RECOMMENDATION
- **Pre-Step Check:** Before executing any task or proceeding with work steps, you MUST evaluate the task complexity and explicitly recommend the best-suited AI model tier to the user:
  - **Flash / Lightweight Models:** Best for fast, routine UI tweaks, minor CSS updates, straightforward documentation edits, or single-file bug fixes.
  - **Pro / Reasoning-Heavy Models:** Best for complex multi-file refactoring, deep architectural changes, database/schema redesigns, complex state orchestration, or multi-agent planning.
