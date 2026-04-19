---
name: "mcp-config-review"
description: "Review repo-managed MCP server entries for non-interactive startup, consistency, and fit with recorded team decisions."
domain: "tooling"
confidence: "high"
source: "earned"
---

## Context
Use this when reviewing `.copilot/mcp-config.json` or similar checked-in MCP config files that the team expects future Copilot sessions to consume automatically.

## Patterns
- Check new MCP entries against prior squad decisions before treating a choice as a defect.
- For servers launched with `npx`, prefer explicit non-interactive args such as `-y` so startup does not block on install confirmation.
- Keep config patterns consistent across entries unless there is a documented reason to diverge.

## Examples
- `.copilot/mcp-config.json` uses `npx` with `-y` for the example GitHub MCP server.
- A Playwright MCP entry added without `-y` is risky in non-interactive sessions even if the package choice itself matches the adopted decision.

## Anti-Patterns
- Rejecting `@latest` usage when the team has already adopted that choice.
- Treating stylistic JSON differences as review blockers when they do not affect startup behavior or maintainability.
