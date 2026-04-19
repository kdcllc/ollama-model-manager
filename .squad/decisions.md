# Squad Decisions

## Active Decisions

### 7. UX Implementation Complete: Trinity Fixes + Switch Re-Approval (2026-04-19)

**Status:** Approved  
**Reviewers:** Trinity (Designer), Switch (Tester)  
**Timestamp:** 2026-04-19T19:41:22Z

**Summary:** Trinity implemented all five blocking accessibility and hierarchy fixes from Decision #6 in the live app. Switch re-reviewed and returned **APPROVE WITH FOLLOW-UP** verdict. All Decision #6 blockers resolved in production.

**Implementation:**
1. **Hierarchy Re-ranking** — Moved Installed Models + Model Details sections earlier in page flow (after hero/forms, before System Profile)
2. **Explicit Labeling** — Added `<label>` elements for Pull Name, Create Name, Create Modelfile, Model Search, KV Cache Mode, Flash Attention Mode
3. **Focus-Visible Styling** — Implemented `:focus-visible` CSS rules for all interactive elements using project accent color (#29b6f6)
4. **Focus Management** — Details panel open moves focus to `#detailsHeading`; keyboard activation (Enter/Space) on model card actions
5. **Return-Path Logic** — Focus restoration after close/delete; fallback to search if trigger element removed from DOM

**Validation:**
- npm run typecheck: Pass
- npm run build: Pass
- Playwright sanity checks: Pass
- Live app verification (http://127.0.0.1:3090): Pass
- Accessibility scan (WCAG 2.1 Level A): Zero violations

**Follow-Up (Minor, Non-Blocking):** After model deletion, focus falls back to search input when original trigger disappears. Acceptable for v1; future refinement could prefer next surviving model action for tighter workflow continuity.

**Artifacts:**
- Orchestration logs: `.squad/orchestration-log/2026-04-19T19:41:22Z-{trinity,switch}.md`
- Session log: `.squad/log/2026-04-19T19:41:22Z-ux-implementation.md`
- Changes: `public/{index.html, styles.css, app.ts}`

---

### 6. Live UX Review: Trinity + Switch Joint Findings (2026-04-19)

**Status:** DECISION GATE — Approval Blocked  
**Reviewers:** Trinity (Designer) + Switch (Tester)  
**Timestamp:** 2026-04-19T19:00:00Z

**Summary:** Live app review (http://127.0.0.1:3090 with actual Ollama data) confirmed single-page architecture is correct, but approval is blocked by accessibility and hierarchy issues, not missing tabs.

**Key Findings:**

1. **Hierarchy Problem:** Installed Models begins ~1851px down; Model Details begins ~4707px down. System tuning and GPU controls appear first, pushing the primary workflow too deep. 
2. **Focus Management:** Clicking Details button scrolls to panel but leaves focus on `BODY`, causing disorientation. No intentional focus movement or return path defined.
3. **Labeling Gaps:** Pull/create/search inputs and optimization selects lack associated labels; UI still depends on placeholders or implied context.
4. **Focus Styling:** Default browser outline used instead of intentional `:focus-visible` system.

**Consensus Decision:**
- **Keep single-page structure.** Tabs would hide broken semantics behind another navigation layer without fixing the root issues.
- **Do not approve in current state.** Fix hierarchy, labeling, and focus management first.

**Required Fixes Before Re-Review:**

| Fix | Owner | Effort |
|-----|-------|--------|
| Add explicit `<label>` elements to all top-level form controls | Designer | ~30 min |
| Add `:focus-visible` CSS to buttons, inputs, and card actions | Designer | ~20 min |
| Implement focus management: move focus into details panel on open; define return path on close | Developer | ~30 min |
| Re-rank page: move Installed Models + Model Details after hero area; collapsible sections below | Designer | ~20 min |
| Add `keydown` support (Enter/Space) for model card actions | Developer | ~10 min |

**Follow-On:** Switch verifies keyboard + screen-reader workflows after fixes. Full audit evidence in `.squad/agents/switch/audit-ux-2026-04-19.md` (25KB, includes WCAG 2.1 A violations detail).

---

### 5. Morpheus Decision: Keep Single-Page Structure, No Tabs (2026-04-19)

**Status:** Adopted  
**Owner:** Morpheus (Lead)  
**Timestamp:** 2026-04-19T19:00:00Z

**Decision:** Do not introduce top-level tabs for the UI. Keep the single-page structure and address usability by tightening section hierarchy and keyboard affordances inside the existing page.

**Rationale:** Primary workflows are tightly coupled (find model → inspect → update/delete → review activity). Tabs would split these steps across hidden surfaces and add focus-management complexity without solving the core issue. The real problem is hierarchy: system tuning and GPU monitoring are misplaced ahead of day-to-day model management.

**Required Follow-Up Actions:**
1. Re-rank sections so Installed Models and Model Details are more prominent in page flow
2. Add better in-page navigation and labeling for keyboard users
3. Consider a desktop two-pane treatment for list/details before reconsidering tabs

---

### 4. UX Accessibility Review: Approval Blocked by WCAG Violations (2026-04-19)

**Status:** REJECTED — Blocker  
**Reviewer:** Switch (Tester)  
**Timestamp:** 2026-04-19T19:00:00Z

**Summary:** UI has excellent visual polish but critical accessibility gaps block approval for public use:
- No keyboard focus indicators
- ~95% missing ARIA labels
- No focus management when details panel opens
- Incomplete form semantics (no `<label>` associations)
- Minimal keyboard shortcuts (only "/" for search)

**Severity:** WCAG 2.1 Level A violations. Keyboard-only and screen-reader users cannot complete primary workflows (pull model, delete model, view details).

**Quick Wins (5 fixes, ~90 minutes):**
1. Add `:focus-visible` CSS rules to all buttons and inputs
2. Add `aria-label` to buttons without visible text
3. Move focus into details panel when it opens
4. Add `<label>` elements to form fields
5. Add `keydown` handlers to model card actions (Enter/Space support)

**Evidence:** Full audit at `.squad/agents/switch/audit-ux-2026-04-19.md` (25KB with code evidence and test scenarios).

**Follow-On:** After fixes, Switch verifies keyboard + screen reader workflows. Playwright MCP (in `.copilot/mcp-config.json`) is available for regression testing.

---

### 3. MCP Config Review Follow-Up — Non-Interactive npx Flag (2026-04-19)

**Status:** Proposed  
**Owner:** Morpheus (Lead)  
**Timestamp:** 2026-04-19T00:00:00Z  

**Decision:** For repo-managed MCP servers launched through `npx`, include `-y` in the argument list.

**Rationale:** This repository records MCP config as a shared team artifact for future Copilot sessions. Those sessions are often non-interactive, so omitting `-y` can leave `npx` waiting for install confirmation and make the configured server unusable.

**Evidence:**
- `.copilot/mcp-config.json` keeps the example GitHub server on the `npx` + `-y` pattern
- The newly added `playwright` entry uses `npx` without `-y`, creating inconsistent behavior and a likely startup failure mode

**Follow-On Action:**
Tank to revise the MCP config entry so the Playwright server follows the same non-interactive launch pattern.

---

### 2. Add Playwright MCP Server to Repository Configuration (2026-04-19)

**Status:** Adopted  
**Owner:** Tank (Platform Dev)  
**Timestamp:** 2026-04-19T12:40:36Z  
**Reviewer:** Switch (Tester)

**Decision:** Added Playwright MCP server entry to `.copilot/mcp-config.json`.

**Rationale:** Enable Playwright UI automation tooling for future Copilot sessions conducting browser-based review and testing.

**Implementation:**
- Added repo-level `playwright` MCP server entry
- Used `npx @playwright/mcp@latest` for flexibility in future version updates
- Preserved existing config structure and GitHub server example entry

**Impact:**
- Future UI review sessions can enable Playwright MCP without additional setup
- Config is checked in and managed by the team
- Extensible for additional MCP servers

**Review:**
- Switch approved configuration structure and pattern compliance (2026-04-19T12:42:19Z)

---

### 1. Copilot Instructions for Future Sessions (2026-04-19)

**Status:** Adopted  
**Owner:** Morpheus (Lead)  
**Timestamp:** 2026-04-19T10:53:14Z

**Decision:** Create `.github/copilot-instructions.md` to guide future Copilot sessions.

**Rationale:** The project has specific patterns and constraints that are not obvious from code alone:
- Dual TypeScript compilation (src + public)
- Manual asset copy into dist/
- No lint or test framework (only typecheck)
- Four auto-created JSON data stores with immutable history
- WSL auto-detection requiring special handling
- Environment-variable-only configuration
- URL-encoded model names in routes

**What's Included:**
- Build/dev/server commands (with rationale for dual compile)
- Full environment variable reference
- Architecture overview: routing, data persistence, Ollama integration, system probing, browser UI
- Development patterns: adding routes, data stores, lifecycle changes
- Key conventions: type safety, async/await, vanilla DOM, URL encoding, error handling, WSL detection, data file auto-creation, immutable history
- Publishing checklist and semantic versioning guidance
- Troubleshooting section

**What's Not Included:**
- Generic software engineering advice (e.g., "write tests")
- Lint or test commands (they don't exist and should not be invented)
- IDE setup or personal preferences
- Administrative tasks unrelated to code

**Impact:**
- Future Copilot sessions will understand the repo structure without exploring multiple files
- Reduces risk of inconsistent patterns (e.g., not URL-encoding model names, forgetting WSL cases)
- Speeds up architectural questions and code reviews
- Makes onboarding of new team members easier

**Review Process:**
1. Morpheus authored initial draft (using Tank and Neo analysis)
2. Switch rejected Round 1 (persistence-layer inaccuracies)
3. Neo revised sections per feedback
4. Switch approved Round 2 (verified corrections)

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction.
