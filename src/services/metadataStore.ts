import fs from "fs/promises";
import path from "path";
import { ModelMetadata, ModelSummary } from "../types";

type MetadataFile = Record<string, ModelMetadata>;

export class MetadataStore {
  constructor(
    private readonly catalogPath: string,
    private readonly userMetadataPath: string
  ) {}

  async init() {
    await ensureFile(this.catalogPath, "{}\n");
    await ensureFile(this.userMetadataPath, "{}\n");
  }

  async getMergedMetadata(name: string): Promise<ModelMetadata> {
    const key = canonicalName(name);
    const [catalog, userMetadata] = await Promise.all([
      this.#readJson<MetadataFile>(this.catalogPath),
      this.#readJson<MetadataFile>(this.userMetadataPath)
    ]);

    return {
      ...(catalog[key] || {}),
      ...(userMetadata[key] || {})
    };
  }

  async mergeModels(models: ModelSummary[]): Promise<Array<ModelSummary & { metadata: ModelMetadata }>> {
    const [catalog, userMetadata] = await Promise.all([
      this.#readJson<MetadataFile>(this.catalogPath),
      this.#readJson<MetadataFile>(this.userMetadataPath)
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

  async updateUserMetadata(name: string, patch: Partial<ModelMetadata>): Promise<ModelMetadata> {
    const key = canonicalName(name);
    const content = await this.#readJson<MetadataFile>(this.userMetadataPath);

    const next = {
      ...(content[key] || {}),
      ...patch,
      updatedAt: new Date().toISOString()
    };

    content[key] = next;
    await this.#writeJson(this.userMetadataPath, content);
    return next;
  }

  async updateFetchedMetadata(name: string, patch: Partial<ModelMetadata>): Promise<ModelMetadata> {
    const key = canonicalName(name);
    const content = await this.#readJson<MetadataFile>(this.userMetadataPath);
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

  async #readJson<T extends object>(filePath: string): Promise<T> {
    const raw = await fs.readFile(filePath, "utf8");
    if (!raw.trim()) {
      return {} as T;
    }

    try {
      return JSON.parse(raw) as T;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON in ${filePath}: ${message}`);
    }
  }

  async #writeJson(filePath: string, data: object): Promise<void> {
    const json = `${JSON.stringify(data, null, 2)}\n`;
    await fs.writeFile(filePath, json, "utf8");
  }
}

async function ensureFile(filePath: string, defaultContent: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, defaultContent, "utf8");
  }
}

export function canonicalName(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function omitUndefined<T extends object>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data || {}).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
