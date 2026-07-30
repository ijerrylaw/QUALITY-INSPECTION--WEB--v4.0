# Antigravity AI Project Rules & Workspace Operating Protocol

**Project:** QUALITY INSPECTION (WEB) v4.0  
**Purpose:** Defines the strict behavioral constraints, model selection rules, and execution protocols for AI agents operating within this workspace.

---

## 1. THE MASTER SOURCES OF TRUTH (CROSS-REFERENCE DIRECTORY)
To prevent context bleed, the AI MUST consult the following specialized files for domain-specific rules:
* **Visuals & Styling:** Refer strictly to `UI_DESIGN_SYSTEM.md`.
* **Routing & Security:** Refer strictly to `NAVIGATION_AND_RBAC.md`.
* **Data Shapes & Types:** Refer strictly to `DATA_SCHEMAS_AND_TYPES.md`.
* **Calculation Logic:** Refer strictly to `ISO2859_MATH_ENGINE.md`.
* **Backend Endpoints:** Refer strictly to `API_AND_INTEGRATION_SPEC.md`.

---

## 2. MANDATORY MODEL SELECTION & FALLBACK MATRIX
Evaluate task complexity and select the appropriate model tier from the IDE dropdown selector before executing:

| Tier | Category | Primary Model | Fallback Model | Target Task Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Fast Execution** | Gemini 3.6 Flash (High) | Gemini 3.5 Flash (High) | Single-file styling tweaks, CSS layout fixes, simple prop updates. |
| **Tier 2** | **Heavy Logic & State** | Claude Sonnet 4.6 (Thinking) | Gemini 3.1 Pro (High) | Complex React hooks, state reducers, form validation, schema refactoring. |
| **Tier 3** | **Architectural Overhaul**| Claude Opus 4.6 (Thinking) | Gemini 3.1 Pro (High) | Multi-file integration breakages, cross-module context bugs, system refactors. |

*Quota Exceeded Protocol:* If the Primary model reaches rate limits, seamlessly drop down to the designated Fallback Model without interrupting the prompt sequence.

---

## 3. WORKSPACE EXECUTION MODES
* **Architect / Plan Mode:** Used strictly for system analysis, schema drafting, and breaking down plans into micro-steps. No files may be modified in this mode.
* **Agent / Code Mode:** Used for active file editing. The agent must have direct workspace write permissions enabled.

---

## 4. INCREMENTAL EXECUTION PROTOCOL (Micro-Step Rule)
* **One Complete File per Turn:** Edit or write strictly **one complete file per execution turn**, then stop and await user verification.
* **No Incomplete Code Snippets:** Deliver fully functional, standalone file modules. Do not output truncated code blocks or placeholders (e.g., `// ... rest of code`).

---

## 5. GIT SAFETY & WORKSPACE SECURITY
* **Pre-Refactor Commit Reminders:** Proactively remind the user to execute a Git commit (`git commit`) prior to performing cross-file deletions or major architectural refactoring.
* **Zero Silent Breaking Changes:** Do not rename, remove, or modify existing exported types, interfaces, or API signatures unless explicitly instructed.
* **Core Tech Stack Guardrail:** Rely strictly on `React 19`, `Vite`, `Tailwind v4`, `Lucide Icons`, and `Framer Motion`. Do not install unapproved third-party NPM packages.