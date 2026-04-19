# Project Context

- **Owner:** kdcllc
- **Project:** UI and local HTTP service for managing Ollama models, custom Modelfiles, metadata, and hardware-aware optimization guidance.
- **Stack:** Node.js 18+, TypeScript, Express, browser UI in `public/`, compiled artifacts in `dist/`, npm package with `npx` entrypoint
- **Created:** 2026-04-19T10:37:30.160Z

## Learnings

- Team initialized with Switch as Tester.
- **UX Accessibility Audit (2026-04-19):** Vanilla DOM UI (no framework) is inherently accessible if patterns are followed. Current implementation skips critical patterns: focus indicators, ARIA labels, focus management. Keyboard-only and screen reader users cannot use UI effectively. Visual polish masks accessibility debt. **Fixable in ~90 min with high ROI.** Tabbed layout recommended as Phase 2 for cognitive load reduction.
- **UX Review Verdict (2026-04-19):** Accessibility blockers identified and documented as Decision #4 (REJECTED — Blocker). Five quick wins identified (~90 min implementation). Full audit with code evidence in `audit-ux-2026-04-19.md` (25KB). Tabbed layout is not a blocking issue for basic accessibility compliance.
- **Live UX Evidence (2026-04-19):** Running app confirms the blocker is not "missing tabs" but broken interaction guarantees in the current page. Installed Models starts ~1851px down and Model Details ~4707px down; clicking a Details button scrolls there but leaves focus on `BODY`, so context changes without focus management. Top-level pull/create/search controls still rely on placeholders or unlabeled selects, while focus styling remains browser-default only.
- **UX Re-review Outcome (2026-04-19):** Reordered sections, explicit labels, `:focus-visible`, details focus placement, and keyboard activation now hold up in the live app. New layout puts Installed Models at ~411px and Model Details at ~618px on a 1600px viewport; opening details focuses `#detailsHeading`, and delete fallback currently lands on search when the original trigger disappears. This clears the prior blockers, but deletion return focus is still a minor polish risk rather than a gate.
- **UX Implementation Complete (2026-04-19):** Trinity implemented all five fixes from Decision #6. Switch re-review returned APPROVE WITH FOLLOW-UP verdict. All WCAG 2.1 Level A violations resolved. Code merged; typecheck and build pass. Minor follow-up: focus restoration after deletion could prefer next surviving model action (v2 refinement, non-blocking).

## 2026-04-19: Custom Model Examples — Decision #8 Approved

**Scribe Checkpoint**: Switch reviewed Trinity's custom model examples PR and returned APPROVE WITH OBSERVATION.

Work completed:
1. **Code Review**: Verified Trinity's three Modelfile examples (coding helper, support triage, strict JSON) are diverse and actionable
2. **UX Validation**: Confirmed examples are accessible via form labels, no focus-management regressions
3. **Quality Gate**: Confirmed npm run typecheck ✓, npm run build ✓
4. **Observation**: Manual copy/paste is acceptable for v1; future "copy-to-input" affordance would enhance usability but is non-blocking

Status: ✅ Approved. Decision #8 captured in decisions.md. Ready for release.

---

## 2026-04-19: Playwright MCP Configuration

**Scribe Orchestration**: Tank added Playwright MCP server to `.copilot/mcp-config.json` (approved by Switch).

Work completed:
1. **MCP Integration**: Added `playwright` MCP entry using `npx @playwright/mcp@latest`
2. **Config Preservation**: Maintained existing structure and GitHub server example
3. **Quality Review**: Switch validated configuration structure and pattern compliance

Status: ✅ Configuration complete. Playwright tooling now available for future UI review sessions.

---

## 2026-04-19: Squad Orchestration Complete

**Scribe Checkpoint**: Switch's quality gate successfully validated `.github/copilot-instructions.md`.

Work completed:
1. **Round 1 Review**: Identified persistence-layer inaccuracies in Morpheus draft; rejected with specific feedback
2. **Round 2 Review**: Verified Neo's corrections; approved for delivery

Status: ✅ Quality gate passed. File approved and ready for future Copilot sessions.

## 2026-04-19: Live UX Gate — Switch's WCAG Audit Confirmed

**Scribe Checkpoint**: Live app review conducted on http://127.0.0.1:3090 with Tank confirming live Ollama data and 24 visible models.

Evidence collected:
1. **Keyboard path**: Initial Tab sequence reaches System Profile, GPU Monitor, and authoring controls before Install, Create, Search, or model management—pushing primary workflow too deep.
2. **Details panel focus**: Clicking Details button scrolls page to panel (~4707px down), but focus remains on `BODY`. Browser's default Tab recovery lands in first details input, but user has lost explicit focus context mid-page.
3. **Labeling**: Pull/create/search inputs and optimization selects lack associated labels; UI still depends on placeholders and implied context.
4. **Focus styling**: Browser-default outline only; no intentional `:focus-visible` system.

**Consensus**: Trinity + Switch agreed: single-page structure is correct; tabs would not solve the real issue. Approval blocked by accessibility and hierarchy fixes, not architecture.

**Merged Decision**: Decision #6 consolidates Trinity's hierarchy findings with Switch's WCAG violations into one gated decision with clear fix list and effort estimates.

**Next**: Implement 5 fixes (~110 min total); Switch re-verifies keyboard + screen-reader workflows.

---

## 2026-04-19: CI/Release Workflow Review — APPROVED

**Scribe Checkpoint**: Switch reviewed Tank's two GitHub Actions workflows (PR CI + Publish) and returned **APPROVE**.

### Edge Cases Verified:
1. **No test script** — Both workflows correctly omit `npm test`. Only `typecheck` + `build` run, matching project reality.
2. **Branch trigger** — `[master, main]` covers the repo's default branch (`master`). Verified via `git branch -a`.
3. **Recursive loop protection** — Two-layer guard: (a) `GITHUB_TOKEN` pushes don't trigger new workflows (GitHub documented behavior), (b) `[skip ci]` in auto-bump commit message.
4. **Permissions** — `contents: write` in publish job allows commit push-back. Correct.
5. **package-lock.json persistence** — `npm version patch --no-git-tag-version` updates both files (npm 7+). Both are `git add`ed and committed.
6. **README alignment** — Automated publishing section accurately describes workflow, `NPM_TOKEN` secret, and manual version override.
7. **paths-ignore** — `.squad/**`, `**.md`, squad workflows correctly excluded.
8. **prepublishOnly redundancy** — `npm publish` re-runs typecheck+build via hook. Harmless.

### Observations (Non-Blocking):
- No concurrency control on publish workflow — simultaneous pushes could race. Low risk at project scale.
- Future improvement: git tags for published versions (Tank already noted).

### Validation:
- `npm run typecheck`: ✅ Pass
- `npm run build`: ✅ Pass
- `dist/src/server.js` exists: ✅ Verified
- Workflow YAML syntax: ✅ Valid
- README CI documentation: ✅ Accurate

Status: ✅ Approved.

---
