import path from "path";

export interface AppConfig {
  rootDir: string;
  port: number;
  ollamaBaseUrl: string;
  catalogPath: string;
  userMetadataPath: string;
  allowOllamaUpdate: boolean;
  ollamaUpdateCommand: string;
  updateTimeoutMs: number;
  systemProbeTimeoutMs: number;
  systemProbeTtlMs: number;
  optimizationConfigPath: string;
}

const rootDir = path.resolve(__dirname, "..");
const dataDir =
  process.env.OLLAMA_MODEL_MANAGER_DATA_DIR ||
  path.join(process.cwd(), "data");

const config: AppConfig = {
  rootDir,
  port: Number(process.env.PORT || 3090),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  catalogPath: process.env.MODEL_CATALOG_PATH || path.join(dataDir, "model-catalog.json"),
  userMetadataPath: process.env.USER_METADATA_PATH || path.join(dataDir, "user-metadata.json"),
  allowOllamaUpdate: process.env.ALLOW_OLLAMA_UPDATE !== "false",
  ollamaUpdateCommand:
    process.env.OLLAMA_UPDATE_COMMAND ||
    "curl -fsSL https://ollama.com/install.sh | sh",
  updateTimeoutMs: Number(process.env.OLLAMA_UPDATE_TIMEOUT_MS || 10 * 60 * 1000),
  systemProbeTimeoutMs: Number(process.env.SYSTEM_PROBE_TIMEOUT_MS || 3000),
  systemProbeTtlMs: Number(process.env.SYSTEM_PROBE_TTL_MS || 30000),
  optimizationConfigPath:
    process.env.OPTIMIZATION_CONFIG_PATH ||
    path.join(dataDir, "optimization-config.json")
};

export default config;
