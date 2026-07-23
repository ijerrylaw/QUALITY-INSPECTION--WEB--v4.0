# Antigravity AI Project Rules

**Project:** QUALITY INSPECTION (WEB) v4.0
**Purpose:** This document dictates the strict behavioral rules the AI must follow when operating in this workspace. These rules are designed to prevent token limit exhaustion, prevent design drift, and maintain absolute architectural integrity.

---

## 1. INCREMENTAL EXECUTION (The "Micro-Step" Rule)
*To prevent the AI from burning through the user's 5-hour and weekly usage limits and leaving the app in a broken state:*
- **The Golden Rule:** Whenever we are working on the v4.0 project, you must always work in micro-steps. Only write one file at a time, stop, and wait for my approval before proceeding.
- **NEVER** attempt to build an entire feature, module, or phase in a single response.

## 2. ARCHITECTURAL INTEGRITY
- **The Blueprint is Law:** The `V4_MASTER_BLUEPRINT.md` file contains the absolute truth regarding data schemas, business logic, and tech stack. If you are ever unsure of how to build a feature, you must read the blueprint first.
- **No Unapproved Dependencies:** Do not install random NPM packages to solve a problem unless it is strictly necessary or explicitly approved by the user. Rely on the core stack (React 19, Vite, Tailwind v4, Lucide, Framer Motion).

## 3. DESIGN SYSTEM STRICTNESS (Preventing Design Drift)
- **No Magic Numbers:** You are forbidden from using raw CSS values (e.g., `color: #FF5733` or `font-size: 14px`) in inline styles or Tailwind arbitrary values.
- **Enforce Design Tokens:** You must rely entirely on the Tailwind v4 `@theme` configuration (e.g., `bg-canvas`, `text-accent`, `text-sm`). 
- **Typography Alignment:** Ensure `Inter` is used for readability (headers, labels) and `JetBrains Mono` is used strictly for data tables and numerical inputs.

## 4. SAFETY & GIT
- Before executing any massive file deletions or complex cross-file refactoring, you must proactively remind the user: *"Please ensure you have committed your current code in Git before I proceed with this major refactor."*
- Ensure your code changes are always modular and can easily be reverted without cascading failures across the app.
