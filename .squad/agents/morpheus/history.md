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
