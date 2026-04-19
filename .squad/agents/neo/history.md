# Project Context

- **Owner:** kdcllc
- **Project:** UI and local HTTP service for managing Ollama models, custom Modelfiles, metadata, and hardware-aware optimization guidance.
- **Stack:** Node.js 18+, TypeScript, Express, browser UI in `public/`, compiled artifacts in `dist/`, npm package with `npx` entrypoint
- **Created:** 2026-04-19T10:37:30.160Z

## Learnings

### Architecture Decisions
- **Route → Service → Storage**: Every API request follows explicit dependency-injected path from route handler to service to JSON file
- **JSON-only persistence**: All state (model lifecycle, history, user metadata, optimization config) lives in `data/*.json` files; no database
- **Service-per-concern**: OllamaClient, MetadataStore, ModelLifecycleStore, OptimizationStore, SystemProbe are separate, stateless factories
- **Dependency Injection at startup**: All services instantiated once in `server.ts`, passed to route factories
- **Audit trail mandatory**: Every model operation (pull, create, delete, enrich) records a history event for complete audit log
- **Three-step state transitions**: Pull/create/delete follow strict pattern: (1) set state, (2) perform op, (3) update state and record event

### Key Backend Patterns
- **OllamaClient**: HTTP wrapper around Ollama daemon; throws `OllamaError` on failure
- **MetadataStore**: Merges Ollama model list with user metadata from two JSON files (catalog + user overrides)
- **ModelLifecycleStore**: Two-file system (lifecycle.json for state, history.json for audit trail); max 2000 history events
- **SystemProbe**: GPU detection via `nvidia-smi` with configurable caching (TTL 30s by default); graceful CPU-only fallback
- **OptimizationStore**: Persists user preferences (kvCache, flashAttention modes) + system profile snapshot
- **Error handling**: Routes catch errors, record failed state + event, respond with appropriate HTTP status

### Configuration & Environment
- All config from environment variables (PORT, OLLAMA_BASE_URL, data paths, timeouts)
- WSL2-aware: auto-detects Windows host IP unless OLLAMA_BASE_URL explicitly set
- Service timeouts: system probe 3s, update command 10m, GPU cache 4s, capabilities cache 30s
- Data directory auto-creates missing JSON files with defaults on startup

### File Organization
- `src/routes/`: models.ts and system.ts route factories
- `src/services/`: OllamaClient, MetadataStore, ModelLifecycleStore, OptimizationStore, SystemProbe, commandRunner, libraryFetcher, wslDetect
- `src/config.ts`: AppConfig interface and environment variable binding
- `src/types.ts`: Shared TypeScript interfaces (ModelSummary, ModelLifecycleRecord, ModelHistoryEntry, etc.)
- `data/`: Five JSON files (model-catalog, user-metadata, model-lifecycle, model-history, optimization-config)
- `public/`: Vanilla TS client (no framework), index.html, styles.css

### Client-Side Notes
- Single-page app with vanilla TypeScript (~1200 lines)
- No framework; direct DOM manipulation and fetch API
- Model state read from API (server is source of truth)
- GPU status polling every 5 seconds if live mode enabled
- Debounced search, sort/filter UI, model card templates

### Common Issues & Workarounds
- Model names in URLs must be URL-encoded (e.g., `qwen2.5-coder:14b` → `qwen2.5-coder%3A14b`)
- Lifecycle state stuck: may need manual reset in model-lifecycle.json
- GPU not detected: verify `nvidia-smi` works locally and check `SYSTEM_PROBE_TIMEOUT_MS`
- Ollama unreachable: inspect `OLLAMA_BASE_URL` and test with curl

---

## Next Session Checklist
- [ ] Verify route → service → storage flow for any new endpoint
- [ ] Check that failed operations record history events
- [ ] Confirm JSON file format against types.ts interfaces
- [ ] Test error paths with Ollama unavailable
