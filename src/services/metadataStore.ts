import fs from "fs/promises";
import path from "path";
import { ModelMetadata, ModelSummary } from "../types";

type MetadataFile = Record<string, ModelMetadata>;

const DEFAULT_CATALOG: MetadataFile = {
  "llama3.2": {
    description:
      "Balanced general-purpose chat model with strong instruction following for everyday assistant tasks.",
    bestFor: [
      "General Q and A",
      "Summaries and rewrite tasks",
      "Simple coding help"
    ],
    notIdealFor: [
      "High-precision long code generation",
      "Complex math proofs"
    ],
    resourceProfile: "Low to moderate resource usage depending on quantization",
    extraTips:
      "Use for fast local responses where broad capability matters more than depth."
  },
  mistral: {
    description:
      "Fast compact instruct model with strong short-form reasoning and low-latency responses.",
    bestFor: ["Quick drafting", "Prompt iteration", "Classification and extraction"],
    notIdealFor: ["Very long context planning", "Advanced domain synthesis"],
    resourceProfile: "Low footprint",
    extraTips: "Great default for CPU-first local workflows."
  },
  "qwen2.5": {
    description:
      "Capable multilingual and coding-friendly family suitable for mixed language tasks.",
    bestFor: [
      "Multilingual chat",
      "Code explanation",
      "Structured content generation"
    ],
    notIdealFor: ["Latency-sensitive devices with limited RAM"],
    resourceProfile: "Moderate to high depending on size",
    extraTips:
      "Choose smaller variants for responsiveness, larger variants for quality."
  },
  "qwen2.5-coder": {
    description:
      "Code-specific Qwen family with strong code generation, code reasoning, and code fixing performance.",
    bestFor: ["Code generation", "Code reasoning", "Refactoring support"],
    notIdealFor: ["General non-technical conversation quality tuning"],
    resourceProfile: "Moderate to high depending on model size",
    extraTips:
      "Use smaller tags for speed and larger tags when code quality matters most."
  },
  "deepseek-r1": {
    description:
      "Reasoning-focused model tuned for stepwise analysis and harder logical tasks.",
    bestFor: ["Complex problem solving", "Technical reasoning", "Detailed analysis"],
    notIdealFor: ["Ultra-fast short chat responses"],
    resourceProfile: "Moderate to high",
    extraTips: "Use when quality of reasoning is more important than speed."
  },
  phi3: {
    description: "Small efficient model family optimized for lightweight local inference.",
    bestFor: ["Edge devices", "Low-latency local assistant", "Simple transformations"],
    notIdealFor: ["Large-context deep reasoning"],
    resourceProfile: "Very low to low",
    extraTips: "Best option when memory or CPU budget is tight."
  },
  codellama: {
    description:
      "Code-oriented model family designed for generation, explanation, and refactoring support.",
    bestFor: ["Code generation", "Refactoring suggestions", "API usage scaffolding"],
    notIdealFor: ["General non-technical conversational tasks"],
    resourceProfile: "Moderate",
    extraTips: "Strong choice when your primary workflow is software development."
  },
  "nomic-embed-text": {
    description:
      "Embedding model for semantic search and retrieval pipelines rather than chat generation.",
    bestFor: ["Vector embeddings", "RAG indexing", "Similarity matching"],
    notIdealFor: ["Direct chat responses", "Long-form text generation"],
    resourceProfile: "Low to moderate",
    extraTips: "Use this model for indexing and retrieval quality improvements."
  }
};

const DEFAULT_CATALOG_JSON = `${JSON.stringify(DEFAULT_CATALOG, null, 2)}\n`;

export class MetadataStore {
  constructor(
    private readonly catalogPath: string,
    private readonly userMetadataPath: string
  ) {}

  async init() {
    await ensureFile(this.catalogPath, DEFAULT_CATALOG_JSON);
    await hydrateIfEmpty(this.catalogPath, DEFAULT_CATALOG_JSON);
    await ensureFile(this.userMetadataPath, "{}\n");
  }

  async getMergedMetadata(name: string): Promise<ModelMetadata> {
    const [catalog, userMetadata] = await Promise.all([
      this.#readJson<MetadataFile>(this.catalogPath),
      this.#readJson<MetadataFile>(this.userMetadataPath)
    ]);

    const catalogMetadata = resolveMetadata(catalog, name);
    const userMetadataForModel = resolveMetadata(userMetadata, name);

    return {
      ...catalogMetadata,
      ...userMetadataForModel
    };
  }

  async mergeModels(models: ModelSummary[]): Promise<Array<ModelSummary & { metadata: ModelMetadata }>> {
    const [catalog, userMetadata] = await Promise.all([
      this.#readJson<MetadataFile>(this.catalogPath),
      this.#readJson<MetadataFile>(this.userMetadataPath)
    ]);

    return models.map((model) => {
      return {
        ...model,
        metadata: {
          ...resolveMetadata(catalog, model.name),
          ...resolveMetadata(userMetadata, model.name)
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

async function hydrateIfEmpty(filePath: string, defaultContent: string): Promise<void> {
  const raw = await fs.readFile(filePath, "utf8");
  if (!raw.trim()) {
    await fs.writeFile(filePath, defaultContent, "utf8");
    return;
  }

  try {
    const parsed = JSON.parse(raw) as object;
    if (Object.keys(parsed || {}).length === 0) {
      await fs.writeFile(filePath, defaultContent, "utf8");
    }
  } catch {
    // Keep existing content untouched here; invalid JSON is handled by read path errors.
  }
}

function resolveMetadata(content: MetadataFile, modelName: string): ModelMetadata {
  const key = canonicalName(modelName);
  const baseKey = canonicalName(modelName.split(":")[0]);
  const exact = content[key];
  if (exact) {
    return exact;
  }

  const base = content[baseKey];
  if (base) {
    return base;
  }

  const matchKey = Object.keys(content)
    .filter((catalogKey) => baseKey.startsWith(catalogKey) || key.startsWith(catalogKey))
    .sort((a, b) => b.length - a.length)[0];

  return matchKey ? content[matchKey] || {} : {};
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
