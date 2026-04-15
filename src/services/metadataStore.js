const fs = require("fs/promises");
const path = require("path");

class MetadataStore {
  constructor(catalogPath, userMetadataPath) {
    this.catalogPath = catalogPath;
    this.userMetadataPath = userMetadataPath;
  }

  async init() {
    await ensureFile(this.catalogPath, "{}\n");
    await ensureFile(this.userMetadataPath, "{}\n");
  }

  async getMergedMetadata(name) {
    const key = canonicalName(name);
    const [catalog, userMetadata] = await Promise.all([
      this.#readJson(this.catalogPath),
      this.#readJson(this.userMetadataPath)
    ]);

    return {
      ...(catalog[key] || {}),
      ...(userMetadata[key] || {})
    };
  }

  async mergeModels(models) {
    const [catalog, userMetadata] = await Promise.all([
      this.#readJson(this.catalogPath),
      this.#readJson(this.userMetadataPath)
    ]);

    return models.map((model) => {
      const key = canonicalName(model.name);
      return {
        ...model,
        metadata: {
          ...(catalog[key] || {}),
          ...(userMetadata[key] || {})
        }
      };
    });
  }

  async updateUserMetadata(name, patch) {
    const key = canonicalName(name);
    const content = await this.#readJson(this.userMetadataPath);

    const next = {
      ...(content[key] || {}),
      ...patch,
      updatedAt: new Date().toISOString()
    };

    content[key] = next;
    await this.#writeJson(this.userMetadataPath, content);
    return next;
  }

  async updateFetchedMetadata(name, patch) {
    const key = canonicalName(name);
    const content = await this.#readJson(this.userMetadataPath);
    const existing = content[key] || {};

    const next = {
      ...existing,
      ...omitUndefined(patch),
      updatedAt: new Date().toISOString()
    };

    content[key] = next;
    await this.#writeJson(this.userMetadataPath, content);
    return next;
  }

  async #readJson(filePath) {
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

  async #writeJson(filePath, data) {
    const json = `${JSON.stringify(data, null, 2)}\n`;
    await fs.writeFile(filePath, json, "utf8");
  }
}

async function ensureFile(filePath, defaultContent) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, defaultContent, "utf8");
  }
}

function canonicalName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function omitUndefined(data) {
  return Object.fromEntries(
    Object.entries(data || {}).filter(([, value]) => value !== undefined)
  );
}

module.exports = {
  MetadataStore,
  canonicalName
};
