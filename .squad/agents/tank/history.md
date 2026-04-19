# Project Context

- **Owner:** kdcllc
- **Project:** UI and local HTTP service for managing Ollama models, custom Modelfiles, metadata, and hardware-aware optimization guidance.
- **Stack:** Node.js 18+, TypeScript, Express, browser UI in `public/`, compiled artifacts in `dist/`, npm package with `npx` entrypoint
- **Created:** 2026-04-19T10:37:30.160Z

## Learnings

- Team initialized with Tank as Platform Dev.

## 2026-04-19: Playwright MCP Configuration

**Scribe Orchestration**: Tank added Playwright MCP server to `.copilot/mcp-config.json` (approved by Switch).

Work completed:
1. **MCP Integration**: Added `playwright` MCP entry using `npx @playwright/mcp@latest`
2. **Config Preservation**: Maintained existing structure and GitHub server example
3. **Quality Review**: Switch validated configuration structure and pattern compliance

Status: ✅ Configuration complete. Playwright tooling now available for future UI review sessions.

---

## 2026-04-19: MCP Config Revision Required

**Scribe Checkpoint**: Morpheus completed review of Playwright MCP configuration.

Feedback received:
1. **Pattern Issue**: Missing `-y` flag in `npx @playwright/mcp@latest` command
2. **Existing Pattern**: GitHub MCP entry includes `-y`: `npx -y @github/copilot-cli --stdio-manager=true`
3. **Requirement**: Revise Playwright entry to include `-y` flag for non-interactive operation
4. **Target**: `npx -y @playwright/mcp@latest` for consistency with established pattern

Decision recorded in decisions.md (#3). Awaiting revision.

---

## 2026-04-19: Copilot Instructions Analysis

Analyzed repository for build, test, lint, typecheck, dev, start, and packaging commands to inform `.github/copilot-instructions.md`.

### Findings
- **Build**: 2x TypeScript compiles (server + browser UI) + manual asset copy; always cleans first
- **Typecheck**: Server only; public UI not checked separately
- **Dev**: nodemon watches src/ and public/, hot rebuild
- **Start**: Requires pre-built `dist/src/server.js`
- **Publish**: Scoped public npm package; prepublishOnly hook auto-runs typecheck + build
- **npx entry**: `bin/ollama-model-manager` → requires dist/ to exist (explicit error if missing)
- **Test/Lint**: Not configured; typecheck + manual testing only
- **TypeScript**: Dual-project architecture (tsconfig.json + tsconfig.public.json); independent outputs

### Platform Considerations
- Dual TypeScript configs require maintainers to update both for compiler changes
- Asset copying is manual (HTML, CSS); must exist in `public/` to be included
- No prebuild hook; users must run `npm run build` before first `npm start`
- Package files list is explicit (dist, bin, README, LICENSE); no auto-discovery
- WSL auto-detects Windows host for Ollama; documented in README
- Error messages from bin script are clear when dist/ is missing

### Learnings for Future Work
- Build is repeatable and deterministic (no hidden setup surprises)
- README.md already comprehensive on quick start, config, API, publish flow, troubleshooting
- Consider adding test framework (Jest/Vitest) and linter (ESLint) for CI gates if team adopts
- Runtime path contract (bin → dist/src/server.js) is explicit and testable

## 2026-04-19: Squad Orchestration Complete

**Scribe Checkpoint**: Tank's platform analysis successfully integrated into `.github/copilot-instructions.md` (approved by Switch).

Key contributions incorporated:
- Build command documentation (clean → compile server → compile UI → copy assets)
- Dual TypeScript architecture explanation
- npx runtime path validation
- No test/lint framework acknowledgment
- Publishing workflow safety checks

Status: ✅ Delivery complete. Ready for future Copilot sessions.

## 2026-04-19: Live UX Gate — MCP Remains On Track

**Scribe Checkpoint**: Live app review conducted on http://127.0.0.1:3090 with Tank confirming live Ollama data and 24 visible models. Review confirmed app was running with actual Ollama connection.

Findings: Trinity + Switch converged on no-tabs decision and merged Decision #4 + #5 into Decision #6 (Live UX Gate). Playwright MCP configuration remains active for future regression testing.

**Next**: Tank awaits decision on Morpheus MCP config revision (adding `-y` flag for non-interactive npx). Revision is low-priority; Playwright remains available and functional.

---

## 2026-04-19: CI and Release Workflows

**User Request**: Add PR validation workflow and automated npm publishing workflow.

### Work Completed

1. **PR CI Workflow** (`.github/workflows/pr-ci.yml`)
   - Runs on pull requests to master/main
   - Validates typecheck + build + CLI entrypoint existence
   - Ignores Squad automation files and markdown-only changes
   - Uses `npm ci` for dependency reproducibility

2. **Publish Workflow** (`.github/workflows/publish.yml`)
   - Runs on push/merge to master/main
   - Auto-detects version changes in package.json
   - If no version change: auto-bumps patch, commits with `[skip ci]`, pushes back to master
   - Publishes to npm using `NPM_TOKEN` repository secret
   - Uses `[skip ci]` commit marker to prevent workflow recursion

3. **README Updates**
   - Documented automated publishing as recommended path
   - Explained auto-bump behavior (patch default, manual control for minor/major)
   - Added NPM_TOKEN setup instructions with GitHub secret URL
   - Preserved manual publishing workflow for local dev

4. **Decision Documentation**
   - Created `.squad/decisions/inbox/tank-ci-release-workflows.md`
   - Documented workflow design, anti-loop strategy, setup requirements
   - Noted future considerations (git tags, branch protection, GitHub releases)

### Key Architectural Decisions

- **Auto-bump strategy**: Workflow compares current vs previous package.json version; if unchanged, runs `npm version patch --no-git-tag-version` and commits back to master
- **Loop prevention**: Uses `[skip ci]` in auto-bump commit message; GitHub Actions ignores these commits
- **Split workflows**: PR validation (fast feedback) separate from publish (only on merge)
- **Path ignoring**: Both workflows skip Squad automation files (`.squad/**`, `squad-*.yml`) and markdown-only changes to reduce noise

### Validation

- Ran `npm run typecheck`: ✅ Pass
- Ran `npm run build`: ✅ Pass
- Verified `dist/src/server.js` exists: ✅ Present (3.5K)

### Platform Impact

- Publishing no longer requires manual intervention after master merge
- Developers control version bump type by running `npm version minor|major` before push
- Routine changes auto-bump patch without manual version management
- NPM_TOKEN must be configured in repository secrets for workflow to succeed

### Files Changed

- `.github/workflows/pr-ci.yml` (new)
- `.github/workflows/publish.yml` (new)
- `README.md` (updated "Publish to npm" section)
- `.squad/decisions/inbox/tank-ci-release-workflows.md` (new)
- `.squad/agents/tank/history.md` (this file, updated)

---
