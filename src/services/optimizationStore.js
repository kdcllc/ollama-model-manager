const fs = require("fs/promises");
const path = require("path");

class OptimizationStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async init() {
    await ensureFile(this.filePath, `${JSON.stringify(defaultConfig(), null, 2)}\n`);
  }

  async getConfig() {
    const data = await readJson(this.filePath);
    return {
      ...defaultConfig(),
      ...data,
      userPreferences: {
        ...defaultConfig().userPreferences,
        ...(data.userPreferences || {})
      },
      modelOverrides: {
        ...(data.modelOverrides || {})
      }
    };
  }

  async updateUserPreferences(patch) {
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

  async updateSystemProfile(systemProfile) {
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

function defaultConfig() {
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

async function ensureFile(filePath, defaultContent) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, defaultContent, "utf8");
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function omitUndefined(data) {
  return Object.fromEntries(
    Object.entries(data || {}).filter(([, value]) => value !== undefined)
  );
}

module.exports = {
  OptimizationStore,
  defaultConfig
};
