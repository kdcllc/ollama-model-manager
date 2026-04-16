import path from "path";
import express from "express";
import config from "./config";
import { OllamaClient } from "./services/ollamaClient";
import { MetadataStore } from "./services/metadataStore";
import { ModelLifecycleStore } from "./services/modelLifecycleStore";
import { OptimizationStore } from "./services/optimizationStore";
import { SystemProbe } from "./services/systemProbe";
const { createModelsRouter } = require("./routes/models");
const { createSystemRouter } = require("./routes/system");

export async function startServer(): Promise<void> {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  const ollamaClient = new OllamaClient(config.ollamaBaseUrl);
  const metadataStore = new MetadataStore(config.catalogPath, config.userMetadataPath);
  const lifecycleStore = new ModelLifecycleStore(
    config.lifecycleStatePath,
    config.lifecycleHistoryPath
  );
  const optimizationStore = new OptimizationStore(config.optimizationConfigPath);
  const systemProbe = new SystemProbe({
    timeoutMs: config.systemProbeTimeoutMs,
    ttlMs: config.systemProbeTtlMs
  });

  await metadataStore.init();
  await lifecycleStore.init();
  await optimizationStore.init();

  app.use(
    "/api/models",
    createModelsRouter({
      ollamaClient,
      metadataStore,
      lifecycleStore,
      systemProbe
    })
  );

  app.use(
    "/api/system",
    createSystemRouter({
      ollamaClient,
      config,
      systemProbe,
      optimizationStore,
      lifecycleStore
    })
  );

  app.use(express.static(path.join(config.rootDir, "public")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(config.rootDir, "public", "index.html"));
  });

  app.listen(config.port, () => {
    console.log(`Ollama manager listening on http://localhost:${config.port}`);
    console.log(`Connecting to Ollama at ${config.ollamaBaseUrl}`);
    if (config.ollamaWslDetected) {
      console.log(
        `WSL detected: Ollama URL method=${config.ollamaBaseUrlResolutionMethod}` +
          (config.ollamaBaseUrlResolutionReason
            ? ` (${config.ollamaBaseUrlResolutionReason})`
            : "")
      );
    }
    if (config.ollamaBaseUrlResolutionMethod === "wsl-localhost-default") {
      console.log(
        "Using WSL localhost mode by default. " +
          "Set OLLAMA_WSL_USE_WINDOWS_HOST=true to try Windows host IP resolution."
      );
    }
    if (config.ollamaBaseUrlIsWslOverride) {
      console.log(
        "WSL detected: using Windows host IP for Ollama. " +
          "Override with OLLAMA_BASE_URL=http://127.0.0.1:11434 if Ollama runs inside WSL."
      );
    }
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start server.", error);
    process.exit(1);
  });
}
