# Squad Decisions

## Active Decisions

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
