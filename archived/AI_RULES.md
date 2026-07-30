# Antigravity AI Project Rules

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** This document dictates the strict behavioral rules the AI must follow when operating in this workspace to prevent token limit exhaustion, avoid design drift, eliminate code fragmentation, and maintain absolute architectural integrity.

---

## 1. MANDATORY PRE-STEP MODEL SELECTION & FALLBACKS
Before proposing or executing any coding step, the AI must evaluate task complexity and explicitly recommend a model tier from the IDE selector:

- **Tier 1: Fast Execution (Routine Tasks)**
  - **Use For:** Single-file CRUD routes, standard React shell layouts, schema migrations, typography fixes.
  - **Primary:** Gemini 3.6 Flash (High / Medium)
  - **Fallback:** Gemini 3.5 Flash (High)

- **Tier 2: Complex Logic & State Management (Heavy Reasoning)**
  - **Use For:** AQL mathematical engine (`aqlEvaluator`), global React Contexts (`ConfigContext`), complex multi-step forms, state-heavy UI components.
  - **Primary:** Claude Sonnet 4.6 (Thinking) OR Gemini 3.1 Pro (High)
  - **Fallback:** GPT-OSS 120B (Medium)

- **Tier 3: Architectural Repair & Full Refactor (Heavyweight)**
  - **Use For:** Diagnosing cross-file integration breakages, multi-module state bugs, major architectural overhauls.
  - **Primary:** Claude Opus 4.6 (Thinking)
  - **Fallback:** Gemini 3.1 Pro (High)

*Rule on Quota Exceeded:* If the Primary model for a tier reaches rate limits, seamlessly drop down to the designated Fallback Model without interrupting the prompt chain.

## 2. ARCHITECTURAL INTEGRITY & INTEGRATION CONTRACTS
- **Master Blueprint is Law:** Read `V4_MASTER_BLUEPRINT.md` for authoritative data schemas, business logic, and tech stack guidelines before implementing features.
- **Explicit Context Anchoring:** Before writing or editing a file, the AI must explicitly verify and respect the existing export signatures, Prisma schemas, and API contracts established in surrounding files.
- **Zero Silent Breaking Changes:** Do not rename, remove, or modify existing exported types, interfaces, or function signatures unless specifically instructed.
- **No Unapproved Dependencies:** Rely strictly on the established core stack (React 19, Vite, Tailwind v4, Lucide, Framer Motion). Do not install third-party NPM packages without explicit user approval.

## 3. INCREMENTAL EXECUTION (The "Module-Level Micro-Step" Rule)
- **One Complete File per Turn:** Work strictly in micro-steps. Write or edit only **one complete file** per turn, then stop and wait for user approval.
- **No Incomplete Snippets:** A micro-step must deliver a fully functional single-file module (e.g., Types + Logic together in `aqlEvaluator.ts`). Do not split single files into fragmented micro-prompts.

## 4. DESIGN SYSTEM STRICTNESS (Preventing Design Drift)
- **Single Source of Truth:** `UI_DESIGN_SYSTEM.md` is the authoritative reference for all UI design tokens, color variables, typography casing/fonts, and component geometry (8px radius, 48px touch targets). Strictly consult and adhere to it for all visual work.
- **Responsive Fluidity & Scrollbar Prevention:** Never use rigid CSS grids (e.g., `grid-cols-6`) without responsive prefixes if it forces horizontal scrollbars on smaller screens. Use flexible bounds (e.g., `md:grid-cols-6`). To handle text truncation in these fluid grids, you MUST employ the "Absolute Overlay Trick" (defined in `UI_DESIGN_SYSTEM.md`) instead of flex-shrinking.
- **No Magic Numbers:** You are forbidden from using raw CSS values (e.g., `color: #FF5733` or `font-size: 14px`) in inline styles or Tailwind arbitrary values. Use exact design tokens.

## 5. SAFETY & GIT
- **Pre-Refactor Git Reminder:** Proactively remind the user to commit their code in Git before executing major file deletions or cross-file refactoring.
- **Modular Architecture:** Ensure code changes are isolated and modular so they can easily be reverted without cascading failures.