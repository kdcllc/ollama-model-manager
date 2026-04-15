# @kdcllc/ollama-model-manager

[![npm version](https://img.shields.io/npm/v/%40kdcllc%2Follama-model-manager)](https://www.npmjs.com/package/@kdcllc/ollama-model-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![GitHub stars](https://img.shields.io/github/stars/kdcllc/ollama-model-manager?style=social)](https://github.com/kdcllc/ollama-model-manager/stargazers)

[![Stand With Israel](https://raw.githubusercontent.com/kdcllc/ollama-model-manager/master/img/IStandWithIsrael.png)](https://github.com/kdcllc/ollama-model-manager)

CLI and web UI for managing local Ollama models with hardware-aware recommendations and optimization guidance.

## Overview

`@kdcllc/ollama-model-manager` gives you a local dashboard for installed Ollama models, plus a small HTTP API for model lifecycle tasks, system health, GPU status, optimization preferences, and metadata enrichment.

The application runs as a Node.js server, serves a browser UI on port `3090` by default, talks to the local Ollama daemon at `http://127.0.0.1:11434` by default, and can also be launched directly with `npx`.

## Features

- List installed Ollama models with merged catalog and user metadata.
- Pull, inspect, enrich, annotate, and delete models from one interface.
- Detect CUDA availability and switch recommendation profiles between GPU and CPU-only systems.
- Surface adaptive KV cache and Flash Attention guidance based on installed model sizes.
- Persist optimization preferences and user notes in local JSON data files.
- Show live GPU status when `nvidia-smi` is available.
- Optionally trigger an Ollama update command from the UI or API.

## Requirements

- Linux host.
- Node.js `>=18.0.0`.
- Ollama installed and reachable, typically at `http://127.0.0.1:11434`.

## Installation

Install globally:

```bash
npm install -g @kdcllc/ollama-model-manager
```

Run without installing globally:

```bash
npx @kdcllc/ollama-model-manager
```

The CLI expects the compiled server in `dist/`. If you are running from source, build first.

## Quick Start

Run from source:

```bash
npm install
npm run build
npm start
```

Then open:

```text
http://localhost:3090
```

The CLI entry point in [bin/ollama-model-manager](./bin/ollama-model-manager) starts the compiled server from `dist/src/server.js`.

## TypeScript Workflow

The project source lives in `src/` and `public/`, and production artifacts are emitted to `dist/`.

Useful commands:

```bash
npm run typecheck
npm run build
npm start
```

## Publish to npm

The package is published as `@kdcllc/ollama-model-manager`.

For this package, a real publish typically means:

1. Make sure you are logged into the correct npm account.
2. Run a dry run and inspect the package contents.
3. Increment the version.
4. Publish the new version.

Recommended release flow:

```bash
npm run typecheck
npm run build
npm publish --dry-run
```

If the dry run looks correct, bump the version and publish.

### Authenticate to npm

If you publish interactively from your machine:

```bash
npm login
```

If you publish with an npm access token instead, configure it in your user-level npm config instead of committing it to this repository:

```bash
npm config set //registry.npmjs.org/:_authToken YOUR_NPM_TOKEN
```

You can verify the active account with:

```bash
npm whoami
```

Because this package is already scoped and [package.json](./package.json) sets `publishConfig.access` to `public`, you do not need to pass `--access public` every time.

### How to increment the version

This project currently uses version `1.0.1` in [package.json](./package.json).

Use semantic versioning:

- `npm version patch` for bug fixes, documentation-only releases, and small non-breaking improvements. Example: `1.0.1` -> `1.0.2`.
- `npm version minor` for new backward-compatible features. Example: `1.0.1` -> `1.1.0`.
- `npm version major` for breaking changes. Example: `1.0.1` -> `2.0.0`.

Typical command sequence:

```bash
npm version patch
npm publish
```

If `npm version patch` fails with `Git working directory not clean`, use the non-tagging version bump instead:

```bash
npm version patch --no-git-tag-version
npm publish
```

That is the safe option when you have local uncommitted changes and still need to bump the package version.

If you are shipping a new feature release instead of a fix:

```bash
npm version minor
npm publish
```

If you changed the package in a way that breaks existing users:

```bash
npm version major
npm publish
```

Notes:

- `npm version ...` updates [package.json](./package.json) and [package-lock.json](./package-lock.json).
- By default, `npm version` also creates a git commit and tag, which requires a clean git working tree.
- If your working tree is not clean, use `npm version patch --no-git-tag-version` or commit your changes first and then run plain `npm version patch`.
- `npm publish` will run the `prepublishOnly` script in [package.json](./package.json), which already runs typecheck and build.
- Because this is a scoped public package, `publishConfig.access` is already set correctly to `public`.

### Inspect the publish output

Before publishing, use the dry run output to confirm:

- the package name is `@kdcllc/ollama-model-manager`
- the version is the one you expect
- `dist/`, `bin/`, `README.md`, and `LICENSE` are included
- no local secrets or unwanted files are included

You can also inspect the packed tarball list with:

```bash
npm pack --dry-run
```

### Recommended commands

Patch release:

```bash
npm whoami
npm publish --dry-run
npm version patch
npm publish
```

Patch release with local uncommitted changes:

```bash
npm whoami
npm publish --dry-run
npm version patch --no-git-tag-version
npm publish
```

Minor release:

```bash
npm whoami
npm publish --dry-run
npm version minor
npm publish
```

Major release:

```bash
npm whoami
npm publish --dry-run
npm version major
npm publish
```

Example full release flow:

```bash
npm run typecheck
npm run build
npm whoami
npm publish --dry-run
npm version patch
npm publish
```

## Configuration

The server reads the following environment variables from [src/config.ts](./src/config.ts).

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3090` | HTTP port for the UI and API server. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Base URL for the Ollama daemon. |
| `MODEL_CATALOG_PATH` | `./data/model-catalog.json` | Curated baseline catalog metadata file. |
| `USER_METADATA_PATH` | `./data/user-metadata.json` | User-edited model notes and overrides. |
| `ALLOW_OLLAMA_UPDATE` | `true` | Enables the update endpoint and UI action unless set to `false`. |
| `OLLAMA_UPDATE_COMMAND` | `curl -fsSL https://ollama.com/install.sh \| sh` | Command executed by the update endpoint. |
| `OLLAMA_UPDATE_TIMEOUT_MS` | `600000` | Timeout for the update command in milliseconds. |
| `SYSTEM_PROBE_TIMEOUT_MS` | `3000` | Timeout for system capability probes. |
| `SYSTEM_PROBE_TTL_MS` | `30000` | Capability cache TTL in milliseconds. |
| `OPTIMIZATION_CONFIG_PATH` | `./data/optimization-config.json` | Persisted optimization preferences and system profile. |

Example:

```bash
PORT=3090 OLLAMA_BASE_URL=http://127.0.0.1:11434 npm start
```

## API

Base URL:

```text
http://localhost:3090
```

Model names used in route parameters should be URL-encoded. For example, `qwen2.5-coder:14b` becomes `qwen2.5-coder%3A14b`.

### Models Endpoints

- `GET /api/models`
- `GET /api/models/:name`
- `POST /api/models/pull`
- `DELETE /api/models/:name`
- `PATCH /api/models/:name/notes`
- `POST /api/models/:name/enrich`

List models:

```bash
curl -sS http://localhost:3090/api/models
```

Get model details:

```bash
curl -sS http://localhost:3090/api/models/qwen2.5-coder%3A14b
```

Pull a model:

```bash
curl -sS -X POST http://localhost:3090/api/models/pull \
   -H "Content-Type: application/json" \
   -d '{"name":"qwen2.5-coder:14b"}'
```

Save notes for a model:

```bash
curl -sS -X PATCH http://localhost:3090/api/models/qwen2.5-coder%3A14b/notes \
   -H "Content-Type: application/json" \
   -d '{
      "description":"Strong coding assistant for local development.",
      "notes":"Runs best when GPU memory is available.",
      "bestFor":["code generation","repo Q and A"],
      "notIdealFor":["tiny CPU-only machines"],
      "extraTips":"Use a reduced context size on smaller GPUs."
   }'
```

Enrich a model from a library page:

```bash
curl -sS -X POST http://localhost:3090/api/models/qwen2.5-coder%3A14b/enrich \
   -H "Content-Type: application/json" \
   -d '{"url":"https://ollama.com/library/qwen2.5-coder"}'
```

Delete a model:

```bash
curl -sS -X DELETE http://localhost:3090/api/models/qwen2.5-coder%3A14b
```

### System Endpoints

- `GET /api/system/health`
- `GET /api/system/recommendations`
- `GET /api/system/gpu-status`
- `GET /api/system/optimization-config`
- `PATCH /api/system/optimization-config`
- `POST /api/system/update-ollama`
- `POST /api/system/fetch-library`

Check health:

```bash
curl -sS http://localhost:3090/api/system/health
```

Get recommendations:

```bash
curl -sS http://localhost:3090/api/system/recommendations
```

Update optimization preferences:

```bash
curl -sS -X PATCH http://localhost:3090/api/system/optimization-config \
   -H "Content-Type: application/json" \
   -d '{
      "kvCacheMode":"adaptive",
      "flashAttentionMode":"auto",
      "gpuPanelLiveDefault":true,
      "gpuPanelIntervalMs":4000,
      "cpuSuggestionMode":"dual"
   }'
```

Run the Ollama update command:

```bash
curl -sS -X POST http://localhost:3090/api/system/update-ollama \
   -H "Content-Type: application/json" \
   -d '{"confirm":true}'
```

Fetch library metadata directly:

```bash
curl -sS -X POST http://localhost:3090/api/system/fetch-library \
   -H "Content-Type: application/json" \
   -d '{"url":"https://ollama.com/library/qwen2.5-coder"}'
```

## Ollama Optimization Setup

The recommendations endpoint returns environment suggestions based on CUDA availability and installed model sizes.

Temporary shell session:

```bash
export OLLAMA_FLASH_ATTENTION=true
export OLLAMA_KV_CACHE_TYPE=f16
ollama run phi4-reasoning:latest
```

Persistent systemd override:

```bash
sudo systemctl edit ollama.service
```

Add:

```ini
[Service]
Environment="OLLAMA_FLASH_ATTENTION=true"
Environment="OLLAMA_KV_CACHE_TYPE=f16"
```

Then reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

Current behavior:

- On CUDA systems, the app recommends `q8_0` when larger installed models are detected and `f16` when they are not.
- On CPU-only systems, the app splits installed models into recommended and advanced sets.

## Data Files

- `data/model-catalog.json` stores curated baseline model descriptions and use cases.
- `data/user-metadata.json` stores user notes, overrides, and fetched library metadata.
- `data/optimization-config.json` stores user optimization preferences and the latest observed system profile.

## Project Structure

```text
bin/
   ollama-model-manager
data/
   model-catalog.json
   optimization-config.json
   user-metadata.json
public/
   app.ts
   index.html
   styles.css
src/
   config.ts
   server.ts
   routes/
   services/
   types.ts
```

## Troubleshooting

If the UI says Ollama is offline:

1. Make sure Ollama is running.

    ```bash
    ollama serve
    ```

2. Verify the Ollama daemon directly.

    ```bash
    curl -sS http://127.0.0.1:11434/api/tags
    ```

3. If Ollama is bound to a different host or port, set `OLLAMA_BASE_URL` before starting the server.

If `npm start` exits immediately, rebuild first so `dist/src/server.js` exists:

```bash
npm run build
npm start
```

## Support

Hire Me:

- GitHub profile: <https://github.com/kdcllc>

Buy Me a Coffee:

- <https://www.buymeacoffee.com/vyve0og>

Give a Star:

- <https://github.com/kdcllc/ollama-model-manager/stargazers>

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).

## Resources

- npm package: <https://www.npmjs.com/package/@kdcllc/ollama-model-manager>
- Repository: <https://github.com/kdcllc/ollama-model-manager>
- Issues: <https://github.com/kdcllc/ollama-model-manager/issues>
- Ollama: <https://ollama.com/>
