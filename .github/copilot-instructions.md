# Copilot Instructions for @kdcllc/ollama-model-manager

## Project Overview

A Node.js CLI and web UI for managing local Ollama models with hardware-aware recommendations and optimization guidance. The system includes an Express server (port 3090 by default), a browser UI served from `public/`, a REST API for model lifecycle management, and local JSON data stores for state persistence.

**Stack:** Node.js 18+, TypeScript, Express 4.x, browser DOM API (no framework).

**Artifacts:** Source in `src/` and `public/`, compiled to `dist/`, packaged as scoped npm module (`@kdcllc/ollama-model-manager`) with CLI entrypoint in `bin/ollama-model-manager`.

---

## Build, Development, and Server Commands

### Build and Compilation

```bash
npm run typecheck    # Type-check without emitting
npm run build        # Clean, compile src/ + public/, copy assets to dist/
npm run clean        # Remove dist/ directory
```

The build process runs **dual TypeScript compiles**:
1. `tsc -p tsconfig.json` compiles `src/` (server code)
2. `tsc -p tsconfig.public.json` compiles `public/` (browser code)
3. Manual copy of `public/index.html` and `public/styles.css` into `dist/public/`

### Running the Server

```bash
npm start            # Start compiled server from dist/src/server.js
npm start:build      # Build then start
npm run dev          # Watch mode: rebuilds on changes to src/, public/, and config files
```

**Important:** The CLI entrypoint (`bin/ollama-model-manager`) requires the compiled `dist/src/server.js` to exist. If it doesn't, `npm run build` first.

### Environment Configuration

All configuration is environment-variable driven (see `src/config.ts`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3090` | HTTP server port for UI and API |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama daemon URL (auto-detected in WSL if not set) |
| `OLLAMA_MODEL_MANAGER_DATA_DIR` | `./data` | Base directory for runtime JSON data files |
| `OLLAMA_WSL_USE_WINDOWS_HOST` | `false` | In WSL, use Windows host IP instead of localhost |
| `ALLOW_OLLAMA_UPDATE` | `true` | Enable update endpoint and UI action |
| `OLLAMA_UPDATE_COMMAND` | `curl -fsSL https://ollama.com/install.sh \| sh` | Command for update endpoint |
| `OLLAMA_UPDATE_TIMEOUT_MS` | `600000` | Timeout for update command (ms) |
| `SYSTEM_PROBE_TIMEOUT_MS` | `3000` | Timeout for system capability probes (ms) |
| `SYSTEM_PROBE_TTL_MS` | `30000` | Capability cache TTL (ms) |

Example: `PORT=3091 OLLAMA_BASE_URL=http://10.0.0.5:11434 npm start`

### No Lint or Test Framework

This project does **not** have lint, test, or single-test commands. Focus on:
- Type safety via `npm run typecheck` before committing
- Manual verification of API and UI behavior
- WSL edge cases (Windows host IP auto-detection in `src/services/wslDetect.ts`)

---

## Architecture and Code Patterns

### Server and Routing (`src/server.ts`)

Express server exports `startServer()` (called by `bin/ollama-model-manager`). The server:
- Serves `dist/public/index.html` and `dist/public/styles.css` as static assets
- Mounts route handlers from `src/routes/models.ts` and `src/routes/system.ts`
- Auto-creates data files on first run via `src/services/*Store.ts` modules

### Data Persistence Layer

Four JSON data stores, all in `data/` (or custom `OLLAMA_MODEL_MANAGER_DATA_DIR`):

1. **model-catalog.json** — Baseline model metadata (bundled defaults, user-editable)
2. **user-metadata.json** — User notes, overrides, enriched library data
3. **model-lifecycle.json** — Per-model state (unknown, pulling, building, ready, failed, deleting)
4. **model-history.json** — Append-only audit log of lifecycle and metadata operations
5. **optimization-config.json** — User optimization preferences and system profile

All are created automatically if missing. Access via store modules:
- `src/services/metadataStore.ts` — User notes + enriched metadata
- `src/services/modelLifecycleStore.ts` — Lifecycle state + auto-creation
- Lifecycle history is embedded within lifecycle state; global history via `src/routes/system.ts`
- `src/services/optimizationStore.ts` — Optimization preferences

### Routes and API Contract

**Models routes** (`src/routes/models.ts`):
- `GET /api/models` — List all models
- `GET /api/models/:name` — Get model details
- `GET /api/models/:name/history` — Lifecycle history for one model
- `GET /api/models/history/all` — Global lifecycle activity
- `POST /api/models/pull` — Pull a model from Ollama library
- `POST /api/models/create` — Create a custom model from Modelfile content
- `POST /api/models/batch-pull` — Pull multiple models
- `DELETE /api/models/:name` — Delete a model
- `PATCH /api/models/:name/notes` — Save user notes and metadata
- `POST /api/models/:name/enrich` — Fetch metadata from Ollama library page

**System routes** (`src/routes/system.ts`):
- `GET /api/system/health` — Ollama daemon health check
- `GET /api/system/recommendations` — Hardware recommendations (GPU/CPU detection)
- `GET /api/system/gpu-status` — nvidia-smi output if available
- `GET /api/system/running-models` — Models currently loaded in Ollama
- `GET /api/system/lifecycle-activity` — Paginated global activity history
- `GET /api/system/optimization-config` — Current optimization preferences
- `PATCH /api/system/optimization-config` — Update optimization preferences
- `POST /api/system/update-ollama` — Execute Ollama update command
- `POST /api/system/fetch-library` — Fetch metadata from library URL

Model names in URLs should be URL-encoded (e.g., `qwen2.5-coder:14b` → `qwen2.5-coder%3A14b`).

### Ollama Integration (`src/services/ollamaClient.ts`)

Wraps HTTP calls to Ollama daemon. Key methods:
- `listModels()` — Fetch installed models
- `pullModel(name)` — Stream-pull a model
- `createModel(name, modelfile)` — Build custom model
- `deleteModel(name)` — Delete model
- `getModelInfo(name)` — Get model details
- Base URL resolution respects `OLLAMA_BASE_URL` env var or WSL auto-detection

### System Probing (`src/services/systemProbe.ts`)

Detects CUDA, runs `nvidia-smi`, probes model counts. Results cached for `SYSTEM_PROBE_TTL_MS`. Used by recommendations engine to guide users toward GPU or CPU optimization patterns.

### WSL Detection (`src/services/wslDetect.ts`)

In WSL environments, auto-resolves Windows host IP from `/etc/resolv.conf` unless overridden via `OLLAMA_BASE_URL` or `OLLAMA_WSL_USE_WINDOWS_HOST=true`. Logs resolution method at startup so users can debug connectivity issues.

### Browser UI (`public/app.ts`)

Vanilla DOM manipulation (no framework). Fetches from API, updates UI state, handles form submissions. Compiled as `dist/public/app.js` and loaded by `index.html`. Polls `/api/system/health` and model endpoints to refresh UI.

### Types (`src/types.ts`)

Central TypeScript interface definitions for models, lifecycle state, recommendations, and API payloads. All route handlers and services reference these types.

---

## Development Patterns

### Adding a New Route

1. Define request/response types in `src/types.ts`
2. Create handler in `src/routes/models.ts` or `src/routes/system.ts`
3. Register route in `src/server.ts` (e.g., `app.get('/api/models/new-endpoint', handler)`)
4. Test via curl or browser fetch
5. Update browser UI in `public/app.ts` if user-facing

### Adding a New Data Store

1. Create `src/services/newStore.ts` with read/write functions
2. Auto-create JSON file in `src/server.ts` or on first access
3. Export typed read/write functions
4. Call from routes or other services
5. Ensure file is in `.gitignore` if it's runtime state (most stores are)

### Modifying Model Lifecycle

Model lifecycle state tracks: `unknown | pulling | building | ready | failed | deleting`.

1. Update via `src/services/modelLifecycleStore.ts`
2. Append entry to history (same file)
3. Return state + history in API responses
4. UI polls lifecycle history to show activity

### Configuration and Defaults

All configuration is **environment-variable only**. No config files. Defaults are hardcoded in `src/config.ts`. To pass config to production deployments, set env vars in systemd/Docker/etc.

---

## Key Conventions

**Type Safety:** All route handlers, services, and data flows are TypeScript. Run `npm run typecheck` before commits to catch type errors early.

**Async/Await:** Use async/await for all async operations. No callback hell or promise chains. Error handling via try/catch in route handlers.

**No Frameworks in UI:** Browser UI uses vanilla DOM API. No React, Vue, or Svelte. Keep logic in `public/app.ts`; HTML in `public/index.html`; styles in `public/styles.css`.

**Model Names in URLs:** Always URL-encode model names in routes. For example, `qwen2.5-coder:14b` becomes `qwen2.5-coder%3A14b`. The Ollama API itself accepts model names with colons, but HTTP URLs require encoding.

**Error Responses:** All error responses use HTTP status codes (400, 404, 500) with JSON body `{ error: string }`. No raw text errors.

**Graceful Ollama Offline:** If Ollama is unreachable, routes return 503 Service Unavailable with a clear error message. UI handles this and prompts user to start Ollama.

**WSL Auto-Detection:** WSL is detected via `/proc/version`. If detected and no `OLLAMA_BASE_URL` is set, the app tries to resolve Windows host IP from `/etc/resolv.conf`. This behavior is logged at startup; users can override with `OLLAMA_BASE_URL=http://127.0.0.1:11434` to use WSL-local Ollama.

**Data File Auto-Creation:** All four JSON stores (catalog, metadata, lifecycle, history, optimization) are created automatically on first run if missing. The catalog is seeded with bundled defaults so users see model descriptions immediately.

**Immutable History:** The lifecycle history is append-only. Never mutate or delete history entries. This ensures audit trail integrity.

---

## Publishing to npm

The package is scoped (`@kdcllc/ollama-model-manager`) and published with `npm publish`. Before publishing:

```bash
npm run typecheck   # Verify types
npm run build       # Compile and copy assets
npm publish --dry-run  # Inspect output
```

Inspect packed contents:
```bash
npm pack --dry-run
```

Verify that `dist/`, `bin/`, `README.md`, and `LICENSE` are included (specified in `package.json` `files` field). No `node_modules` or data files are shipped.

To increment version, use semantic versioning:
```bash
npm version patch     # Bug fixes / small improvements (1.0.1 → 1.0.2)
npm version minor     # New features (1.0.1 → 1.1.0)
npm version major     # Breaking changes (1.0.1 → 2.0.0)
npm publish
```

If working tree is dirty, use `npm version patch --no-git-tag-version` to bump version without git tags, then commit separately.

---

## Troubleshooting

**"Failed to load compiled server":** Run `npm run build` first. The CLI entrypoint requires `dist/src/server.js`.

**"Ollama is offline":** Verify Ollama is running (`ollama serve`) and reachable at the configured URL. In WSL, ensure `OLLAMA_BASE_URL` points to the correct host (Windows host IP or `127.0.0.1` for WSL-local Ollama).

**"Model names show as undefined in UI":** Check that `/api/models` returns valid JSON. Verify Ollama daemon is running and the base URL is correct.

**"GPU status is empty":** `nvidia-smi` must be installed. On WSL, this requires NVIDIA driver on Windows host. CPU-only systems will have empty GPU status; recommendations still work.

**"Data files not created":** Ensure write permissions on the data directory (`./data` by default or `OLLAMA_MODEL_MANAGER_DATA_DIR`). The app logs errors on startup if it cannot create files.

---

## External References

- **Ollama API:** <https://github.com/ollama/ollama/blob/main/docs/api.md>
- **Ollama Library:** <https://ollama.com/library>
- **Repository:** <https://github.com/kdcllc/ollama-model-manager>
- **npm Package:** <https://www.npmjs.com/package/@kdcllc/ollama-model-manager>
