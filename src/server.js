const path = require("path");
const express = require("express");
const config = require("./config");
const { OllamaClient } = require("./services/ollamaClient");
const { MetadataStore } = require("./services/metadataStore");
const { OptimizationStore } = require("./services/optimizationStore");
const { SystemProbe } = require("./services/systemProbe");
const { createModelsRouter } = require("./routes/models");
const { createSystemRouter } = require("./routes/system");

async function start() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  const ollamaClient = new OllamaClient(config.ollamaBaseUrl);
  const metadataStore = new MetadataStore(config.catalogPath, config.userMetadataPath);
  const optimizationStore = new OptimizationStore(config.optimizationConfigPath);
  const systemProbe = new SystemProbe({
    timeoutMs: config.systemProbeTimeoutMs,
    ttlMs: config.systemProbeTtlMs
  });

  await metadataStore.init();
  await optimizationStore.init();

  app.use(
    "/api/models",
    createModelsRouter({
      ollamaClient,
      metadataStore,
      systemProbe
    })
  );

  app.use(
    "/api/system",
    createSystemRouter({
      ollamaClient,
      config,
      systemProbe,
      optimizationStore
    })
  );

  app.use(express.static(path.join(config.rootDir, "public")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(config.rootDir, "public", "index.html"));
  });

  app.listen(config.port, () => {
    console.log(`Ollama manager listening on http://localhost:${config.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server.", error);
  process.exit(1);
});
