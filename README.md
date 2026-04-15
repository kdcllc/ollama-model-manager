# Ollama Model Manager (Local)

A local web interface for managing your installed Ollama models.

## What it does

- Lists installed Ollama models
- Pulls or updates models by name
- Deletes models
- Shows per-model details directly from Ollama
- Stores curated model descriptions and recommended use-cases
- Lets you add and persist your own notes and usage guidance
- Can trigger an Ollama runtime update command from the web UI
- Detects CUDA and switches model guidance between GPU and CPU profiles
- Provides adaptive Ollama optimization recommendations (Flash Attention and KV cache)
- Includes an optional live NVIDIA monitor panel backed by nvidia-smi

## Requirements

- Linux host with Ollama installed and running
- Node.js 18+

## Quick start

1. Install dependencies:

   npm install

2. Start the app:

   npm start

3. Open:

   <http://localhost:3090>

## Configuration

Set environment variables if needed:

- PORT (default: 3090)
- OLLAMA_BASE_URL (default: <http://127.0.0.1:11434>)
- MODEL_CATALOG_PATH (default: ./data/model-catalog.json)
- USER_METADATA_PATH (default: ./data/user-metadata.json)
- ALLOW_OLLAMA_UPDATE (default: true)
- OLLAMA_UPDATE_COMMAND (default: curl -fsSL <https://ollama.com/install.sh> | sh)
- OLLAMA_UPDATE_TIMEOUT_MS (default: 600000)
- SYSTEM_PROBE_TIMEOUT_MS (default: 3000)
- SYSTEM_PROBE_TTL_MS (default: 30000)
- OPTIMIZATION_CONFIG_PATH (default: ./data/optimization-config.json)

Example:

PORT=3090 OLLAMA_BASE_URL=<http://127.0.0.1:11434> npm start

## Notes on Ollama update action

The update endpoint runs a server-side command defined by OLLAMA_UPDATE_COMMAND.

- The UI always asks for confirmation before running the update.
- The API requires a confirm: true payload.
- You can disable this capability by setting ALLOW_OLLAMA_UPDATE=false.

## API summary

- GET /api/system/health
- GET /api/system/recommendations
- GET /api/system/gpu-status
- GET /api/system/optimization-config
- PATCH /api/system/optimization-config
- POST /api/system/update-ollama
- GET /api/models
- POST /api/models/pull
- GET /api/models/:name
- DELETE /api/models/:name
- PATCH /api/models/:name/notes

## Ollama optimization setup

### Temporary shell session

export OLLAMA_FLASH_ATTENTION=true
export OLLAMA_KV_CACHE_TYPE=f16
ollama run phi4-reasoning:latest

### Linux systemd (persistent)

1. Open Ollama service override:

   sudo systemctl edit ollama.service

2. Add under [Service]:

   [Service]
   Environment="OLLAMA_FLASH_ATTENTION=true"
   Environment="OLLAMA_KV_CACHE_TYPE=f16"

3. Reload and restart Ollama:

   sudo systemctl daemon-reload
   sudo systemctl restart ollama

The app now recommends adaptive KV behavior for CUDA systems:

- q8_0 is suggested when larger models are installed.
- f16 is suggested when installed models are smaller.

In CPU-only mode, model guidance is shown as two lists:

- Recommended CPU-safe models
- Advanced larger models (with performance caveats)

## Data files

- data/model-catalog.json: Curated baseline descriptions and use-cases.
- data/user-metadata.json: Your editable notes and overrides.
- data/optimization-config.json: Persisted optimization preferences and latest system profile snapshot.

## Troubleshooting

If the UI says Ollama is offline:

1. Ensure Ollama is running:

   ollama serve

2. Test API manually:

   curl <http://127.0.0.1:11434/api/tags>

3. If Ollama is not on localhost or a different port, set OLLAMA_BASE_URL accordingly.
