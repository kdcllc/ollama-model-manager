# Squad Decisions

## Active Decisions

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
