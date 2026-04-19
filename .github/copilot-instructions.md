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

## Architecture Overview

The system follows a **request–service–store** pattern from browser to Ollama daemon. Understanding this flow is essential for adding features, debugging, or reasoning about state changes.

### 1. Server Startup and Initialization (`src/server.ts`)

When `startServer()` is called:

1. **Express app is created** with JSON body parser (1MB limit)
2. **Service instances are created:**
   - `OllamaClient` → wraps HTTP calls to Ollama daemon
   - `MetadataStore` → manages user notes and enriched model metadata (two JSON files)
   - `ModelLifecycleStore` → tracks per-model state and append-only history (two JSON files)
   - `OptimizationStore` → stores user preferences (one JSON file)
   - `SystemProbe` → detects GPU/CUDA, runs nvidia-smi, caches results
3. **All stores are initialized** (`await store.init()`), auto-creating JSON files if missing
4. **Route handlers are mounted:**
   - `/api/models` → `createModelsRouter()` receives all services
   - `/api/system` → `createSystemRouter()` receives all services
5. **Static file serving** is configured for `dist/public/` (compiled UI)
6. **Fallback route** catches all paths and serves `index.html` (SPA routing)
7. **Server listens** on configured port; startup logs show Ollama URL, WSL detection method

**Key insight:** Services are instantiated once at startup and passed as dependencies to route handlers. This ensures consistent state management and simplifies testing.

### 2. Data Persistence Layer (Five JSON Stores)

All stores are in `data/` (or custom `OLLAMA_MODEL_MANAGER_DATA_DIR`). Each has a backing store module:

| Store | File | Managed By | Access Pattern |
|-------|------|-----------|-----------------|
| **Baseline catalog** | `model-catalog.json` | MetadataStore | Read defaults, user-editable |
| **User metadata** | `user-metadata.json` | MetadataStore | Read/write user notes, enriched descriptions |
| **Lifecycle state** | `model-lifecycle.json` | ModelLifecycleStore | Read/write per-model state (ready, pulling, failed, etc.) |
| **Lifecycle history** | `model-history.json` | ModelLifecycleStore | Append-only audit log of state changes and metadata updates |
| **Optimization prefs** | `optimization-config.json` | OptimizationStore | Read/write GPU settings, cache modes, batch sizes |

**Store initialization flow:**
- Each store module exports an `init()` method that auto-creates JSON if missing
- Catalog is seeded with bundled defaults (so users see model descriptions immediately)
- Other stores are created empty on first run
- History is never mutated—only appended—to preserve audit trail

**Store access pattern:** Route handlers do not directly read/write JSON. Instead, they call typed methods on store instances (e.g., `metadataStore.getUserMetadata(modelName)`). This centralizes validation and file I/O.

### 3. Request Flow: Browser → Route → Service → Store → Ollama

Example: **User pulls a model** (`POST /api/models/pull`):

1. **Browser** (`public/app.ts`) sends `fetch('/api/models/pull', { body: { name: 'llama2' } })`
2. **Route handler** (`src/routes/models.ts`) receives request:
   - Validates model name (decodes URI component, trims)
   - Calls `ollamaClient.pullModel(name)` to initiate pull
   - Calls `lifecycleStore.setState(name, 'pulling')` to record state
   - Returns immediately with `{ ok: true, state: 'pulling' }` (async pull happens in background)
3. **Service** (`OllamaClient.pullModel()`) makes HTTP request to Ollama daemon (`/api/pull`)
4. **Daemon** pulls model; status updates are streamed back
5. **Browser UI polls** `/api/models/:name` and `/api/system/lifecycle-activity` to detect state changes
6. **Route handler** merges Ollama models with lifecycle state and metadata:
   ```
   models[] (from Ollama) + lifecycle state + user notes → enriched model detail
   ```

**Lifecycle states:** `unknown | queued | pulling | building | ready | failed | deleting`. State is explicit and tracked per model.

### 4. Route Handlers and API Contract

Routes are organized into two files and created by factory functions that receive service dependencies:

**Models routes** (`src/routes/models.ts`) — `createModelsRouter(deps)`:
- `GET /api/models` — List all models (merged Ollama + metadata + lifecycle + capabilities)
- `GET /api/models/:name` — Get single model detail
- `GET /api/models/:name/history` — Lifecycle history for one model
- `GET /api/models/history/all` — Global lifecycle activity
- `POST /api/models/pull` — Pull model from Ollama library
- `POST /api/models/create` — Create custom model from Modelfile
- `POST /api/models/batch-pull` — Pull multiple models
- `DELETE /api/models/:name` — Delete model
- `PATCH /api/models/:name/notes` — Save user notes and metadata
- `POST /api/models/:name/enrich` — Fetch metadata from Ollama library

**System routes** (`src/routes/system.ts`) — `createSystemRouter(deps)`:
- `GET /api/system/health` — Ollama daemon health check
- `GET /api/system/recommendations` — Hardware recommendations (GPU/CPU detected)
- `GET /api/system/gpu-status` — nvidia-smi output (if available)
- `GET /api/system/running-models` — Models currently loaded in Ollama
- `GET /api/system/lifecycle-activity` — Paginated global activity history
- `GET /api/system/optimization-config` — Current optimization preferences
- `PATCH /api/system/optimization-config` — Update optimization preferences
- `POST /api/system/update-ollama` — Execute Ollama update command
- `POST /api/system/fetch-library` — Fetch metadata from library URL

**Model names in URLs:** Always URL-encode (e.g., `qwen2.5-coder:14b` → `qwen2.5-coder%3A14b`). Routes decode on entry: `decodeURIComponent(req.params.name)`.

**Error handling:** All errors return HTTP status (400, 404, 500, 503) with JSON body `{ error: string }`. 503 is returned if Ollama is unreachable.

### 5. Core Services

**OllamaClient** (`src/services/ollamaClient.ts`)
- Wraps HTTP calls to Ollama daemon
- Resolves base URL from env var or WSL auto-detection
- Methods: `listModels()`, `pullModel(name)`, `createModel(name, modelfile)`, `deleteModel(name)`, `getModelInfo(name)`
- All methods are async

**MetadataStore** (`src/services/metadataStore.ts`)
- Manages two files: catalog (defaults) + user metadata (notes, enriched data)
- Methods: `getUserMetadata(modelName)`, `setUserMetadata(modelName, data)`, `mergeModels(ollamaModels)` (combines Ollama data with stored metadata)
- Provides normalized model names via `canonicalName(name)`

**ModelLifecycleStore** (`src/services/modelLifecycleStore.ts`)
- Manages two files: lifecycle state + history (append-only)
- Methods: `setState(modelName, state)`, `recordEvent(modelName, event)`, `attachLifecycle(models)`, `getHistory(modelName, limit)`
- History entries include timestamp, state, and error details

**SystemProbe** (`src/services/systemProbe.ts`)
- Detects GPU (CUDA), runs `nvidia-smi`, probes model count
- Results cached for `SYSTEM_PROBE_TTL_MS` (default: 30s)
- Methods: `getCapabilities()` → returns `{ hasGPU, maxModels, gpuInfo, ... }`
- Used by recommendations to guide users toward GPU or CPU optimization

**OptimizationStore** (`src/services/optimizationStore.ts`)
- Stores user preferences (KV-cache mode, flash attention, batch size)
- Methods: `getConfig()`, `setConfig(updates)`

**Additional services:**
- **WSL Detection** (`src/services/wslDetect.ts`) → Auto-resolves Windows host IP from `/etc/resolv.conf`
- **Library Fetcher** (`src/services/libraryFetcher.ts`) → Fetches model metadata from Ollama library
- **Command Runner** (`src/services/commandRunner.ts`) → Executes Ollama update command with timeout

### 6. Browser UI (`public/app.ts`)

Vanilla DOM API (no framework). Entry point is `init()`:

1. **Wire event listeners** on buttons, forms, filters
2. **Load optimization config** from `/api/system/optimization-config`
3. **Call `refreshAll()`** which:
   - Fetches `/api/models` (merged list with metadata, lifecycle, capabilities)
   - Fetches `/api/system/health` (connection status)
   - Fetches `/api/system/recommendations` (GPU suggestions)
   - Fetches `/api/system/gpu-status` (nvidia-smi, if available)
   - Renders models in grid or list view
   - Updates health badge and setup guidance

**State management:** Global `state` object holds models, UI preferences (sort, filter, view mode), and live GPU polling flag. Functions update this object and re-render affected UI sections.

**Polling:** UI polls `/api/system/health` every 5s to detect Ollama availability. When a model is pulling or building, polls `/api/models/:name` every 2s to detect state changes.

**Form submission flow:** Pull/Create forms call API, then immediately poll for lifecycle updates so progress is visible.

### 7. Type Definitions (`src/types.ts`)

Central TypeScript interfaces:

- **ModelSummary** — Model name, size, digest, details, metadata, lifecycle state, suggestion tier
- **ModelMetadata** — Description, notes, bestFor, notIdealFor, extraTips, library URL, fetched metadata
- **ModelLifecycleState** — `unknown | queued | pulling | building | ready | failed | deleting`
- **ModelLifecycleRecord** — State, error, progress (for pull/build), timestamps
- **SystemCapabilities** — GPU info, max models, CUDA version, recommendations

All route handlers and services type their inputs/outputs using these interfaces.

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

1. Update state via `src/services/modelLifecycleStore.ts` → `setState()`
2. Record events via `src/services/modelLifecycleStore.ts` → `recordEvent()` (stored in model-history.json)
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

**Data File Auto-Creation:** All five JSON stores (catalog, user-metadata, lifecycle-state, lifecycle-history, optimization) are created automatically on first run if missing. The catalog is seeded with bundled defaults so users see model descriptions immediately.

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
