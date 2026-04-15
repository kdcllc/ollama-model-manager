const path = require("path");

const rootDir = path.resolve(__dirname, "..");

module.exports = {
  rootDir,
  port: Number(process.env.PORT || 3090),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  catalogPath:
    process.env.MODEL_CATALOG_PATH ||
    path.join(rootDir, "data", "model-catalog.json"),
  userMetadataPath:
    process.env.USER_METADATA_PATH ||
    path.join(rootDir, "data", "user-metadata.json"),
  allowOllamaUpdate: process.env.ALLOW_OLLAMA_UPDATE !== "false",
  ollamaUpdateCommand:
    process.env.OLLAMA_UPDATE_COMMAND ||
    "curl -fsSL https://ollama.com/install.sh | sh",
  updateTimeoutMs: Number(process.env.OLLAMA_UPDATE_TIMEOUT_MS || 10 * 60 * 1000),
  systemProbeTimeoutMs: Number(process.env.SYSTEM_PROBE_TIMEOUT_MS || 3000),
  systemProbeTtlMs: Number(process.env.SYSTEM_PROBE_TTL_MS || 30000),
  optimizationConfigPath:
    process.env.OPTIMIZATION_CONFIG_PATH ||
    path.join(rootDir, "data", "optimization-config.json")
};
