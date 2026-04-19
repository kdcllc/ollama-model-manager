# Project Context

- **Owner:** kdcllc
- **Project:** UI and local HTTP service for managing Ollama models, custom Modelfiles, metadata, and hardware-aware optimization guidance.
- **Stack:** Node.js 18+, TypeScript, Express, browser UI in `public/`, compiled artifacts in `dist/`, npm package with `npx` entrypoint
- **Created:** 2026-04-19T10:37:30.160Z

## Learnings

- Team initialized with Morpheus as Lead.
- Build pipeline: dual TypeScript compiles (src/ and public/) + manual asset copy into dist/public/.
- CLI entrypoint (`bin/ollama-model-manager`) requires compiled `dist/src/server.js`; fails gracefully if not found.
- No lint or test framework configured; reliance on `npm run typecheck` for type safety.
- Four JSON data stores (model-catalog, user-metadata, model-lifecycle, model-history, optimization-config) auto-created on first run.
- WSL detection is critical: auto-resolves Windows host IP from `/etc/resolv.conf` unless overridden via env vars.
- Browser UI is vanilla DOM (no framework); compiled from `public/app.ts` to `dist/public/app.js`.
- Lifecycle history is append-only audit log; never mutate history entries.
- Model names in URLs must be URL-encoded (colons become `%3A`).
- All configuration is environment-variable driven; no config files.
- Repo-level MCP config should treat `npx`-launched servers as non-interactive: include `-y` in args so future sessions do not block on package install prompts. Relevant file: `.copilot/mcp-config.json`.
- UX review pattern: judge tabs vs. single-page stacks by user task coupling and keyboard flow, not by panel count alone.
- Current UI structure in `public/index.html` keeps a seven-panel single-page stack; primary repeated workflow starts in Installed Models, but the stack currently leads with system tuning and GPU monitoring.
- Keyboard flow in `public/app.ts` is linear with one useful shortcut (`/` focuses model search), but model selection relies on per-card buttons and detail loading auto-scrolls to `#detailsPanel`.
- Best follow-up for this UI is hierarchy cleanup within the existing page (reorder or condense top sections, keep connected tasks together) rather than introducing tabs.

## 2026-04-19: Squad Orchestration Complete

**Scribe Checkpoint**: Morpheus-authored `.github/copilot-instructions.md` approved by Switch (post-revision).

Work completed:
1. Authored initial draft from Tank and Neo analysis
2. Received rejection feedback from Switch (Round 1)
3. Coordinated with Neo for persistence-layer corrections
4. Received approval from Switch (Round 2)

Status: ✅ Delivery complete. File approved and ready for future Copilot sessions.

## 2026-04-19: MCP Config Review and Feedback

**Scribe Checkpoint**: Morpheus reviewed Tank's Playwright MCP configuration entry and identified a non-interactive pattern violation.

Review outcome:
1. **Issue Found**: Playwright entry uses `npx @playwright/mcp@latest` without `-y` flag
2. **Pattern Violation**: GitHub MCP example includes `-y` for non-interactive operation in future Copilot sessions
3. **Decision**: Tank to revise config entry to include `-y` flag for consistency and reliability
4. **Impact**: Ensures all repo-managed MCP servers follow non-interactive launch pattern (decision #3 merged to decisions.md)

Status: Pending Tank's revision.

## 2026-04-19: UX Approval Decision — No Tabs, Focus on Hierarchy + Accessibility Fixes

**Scribe Checkpoint**: UX review cycle complete. Three reviewers submitted decisions.

Outcomes:
1. **Trinity (Frontend Dev):** ✅ Approved with minor polish recommendations
2. **Morpheus (Lead):** ✅ Approved with follow-up. Identified hierarchy issue: system tuning placed ahead of model management. **Decision #5 (Adopted):** Keep single-page structure, no tabs. Rationale: primary workflows are coupled. Hierarchy + keyboard affordances should be tightened inside existing page.
3. **Switch (Tester):** ⛔ **REJECTED** — Accessibility blockers identified. **Decision #4 (Blocker):** WCAG 2.1 Level A violations. Five quick wins identified (~90 min). Keyboard focus indicators, ARIA labels, focus management, form semantics, keyboard shortcuts for model actions. Full audit in `audit-ux-2026-04-19.md` (25KB with code evidence and test scenarios).

**Approval Status:** Blocked by Switch's accessibility requirements. No tabs decision is Adopted; accessibility fixes are prerequisite for release approval.

Related decisions merged to `decisions.md` (#4 and #5).
