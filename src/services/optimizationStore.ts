import fs from "fs/promises";
import path from "path";
import { OptimizationConfig } from "../types";

type OptimizationPatch = Partial<OptimizationConfig["userPreferences"]>;

export class OptimizationStore {
  constructor(private readonly filePath: string) {}

  async init() {
    await ensureFile(this.filePath, `${JSON.stringify(defaultConfig(), null, 2)}\n`);
  }

  async getConfig(): Promise<OptimizationConfig> {
    const data = await readJson(this.filePath);
    const defaults = defaultConfig();

    return {
      ...defaults,
      ...data,
      userPreferences: {
        ...defaults.userPreferences,
        ...(data.userPreferences || {})
      },
      modelOverrides: {
        ...(data.modelOverrides || {})
      }
    };
  }

  async updateUserPreferences(patch: OptimizationPatch): Promise<OptimizationConfig> {
    const data = await this.getConfig();
    const next = {
      ...data,
      userPreferences: {
        ...data.userPreferences,
        ...omitUndefined(patch)
      },
      updatedAt: new Date().toISOString()
    };

    await writeJson(this.filePath, next);
    return next;
  }

  async updateSystemProfile(systemProfile: Record<string, unknown>): Promise<OptimizationConfig> {
    const data = await this.getConfig();
    const next = {
      ...data,
      systemProfile: {
        ...(data.systemProfile || {}),
        ...omitUndefined(systemProfile),
        updatedAt: new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    };

    await writeJson(this.filePath, next);
    return next;
  }
}

export function defaultConfig(): OptimizationConfig {
  return {
    schemaVersion: 1,
    userPreferences: {
      kvCacheMode: "adaptive",
      flashAttentionMode: "auto",
      gpuPanelLiveDefault: false,
      gpuPanelIntervalMs: 5000,
      cpuSuggestionMode: "dual"
    },
    systemProfile: {},
    modelOverrides: {},
    updatedAt: ""
  };
}

async function ensureFile(filePath: string, defaultContent: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, defaultContent, "utf8");
  }
}

async function readJson(filePath: string): Promise<Partial<OptimizationConfig>> {
  const raw = await fs.readFile(filePath, "utf8");
  if (!raw.trim()) {
    return {};
  }

  try {
      return JSON.parse(raw) as Partial<OptimizationConfig>;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON in ${filePath}: ${message}`);
  }
}

async function writeJson(filePath: string, data: OptimizationConfig): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function omitUndefined<T extends object>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data || {}).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
