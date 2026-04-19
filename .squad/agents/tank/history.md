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
