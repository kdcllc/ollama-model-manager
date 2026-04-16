import path from "path";
import { resolveDefaultOllamaBaseUrl } from "./services/wslDetect";

export interface AppConfig {
  rootDir: string;
  port: number;
  ollamaBaseUrl: string;
  ollamaBaseUrlIsWslOverride: boolean;
  catalogPath: string;
  userMetadataPath: string;
  lifecycleStatePath: string;
  lifecycleHistoryPath: string;
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

const { url: detectedOllamaBaseUrl, wslOverride } = process.env.OLLAMA_BASE_URL
  ? { url: process.env.OLLAMA_BASE_URL, wslOverride: false }
  : resolveDefaultOllamaBaseUrl();

const config: AppConfig = {
  rootDir,
  port: Number(process.env.PORT || 3090),
  ollamaBaseUrl: detectedOllamaBaseUrl,
  ollamaBaseUrlIsWslOverride: wslOverride,
  catalogPath: process.env.MODEL_CATALOG_PATH || path.join(dataDir, "model-catalog.json"),
  userMetadataPath: process.env.USER_METADATA_PATH || path.join(dataDir, "user-metadata.json"),
  lifecycleStatePath:
    process.env.MODEL_LIFECYCLE_PATH || path.join(dataDir, "model-lifecycle.json"),
  lifecycleHistoryPath:
    process.env.MODEL_HISTORY_PATH || path.join(dataDir, "model-history.json"),
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
