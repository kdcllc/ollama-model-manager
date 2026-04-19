import fs from "fs/promises";
import path from "path";
import { canonicalName } from "./metadataStore";
import type {
  ModelHistoryAction,
  ModelHistoryEntry,
  ModelHistorySnapshot,
  ModelLifecycleRecord,
  ModelLifecycleSnapshot,
  ModelLifecycleState,
  ModelPullProgress,
  ModelSummary,
  ModelVariantSummary
} from "../types";

const MAX_HISTORY_EVENTS = 2000;

export class ModelLifecycleStore {
  constructor(
    private readonly lifecyclePath: string,
    private readonly historyPath: string
  ) {}

  async init(): Promise<void> {
    await ensureFile(this.lifecyclePath, `${JSON.stringify(defaultLifecycleSnapshot(), null, 2)}\n`);
    await ensureFile(this.historyPath, `${JSON.stringify(defaultHistorySnapshot(), null, 2)}\n`);
  }

  async getLifecycleSnapshot(): Promise<ModelLifecycleSnapshot> {
    const data = await readJson<ModelLifecycleSnapshot>(this.lifecyclePath);
    const defaults = defaultLifecycleSnapshot();

    return {
      ...defaults,
      ...data,
      modelStates: {
        ...(data.modelStates || {})
      }
    };
  }

  async getHistorySnapshot(): Promise<ModelHistorySnapshot> {
    const data = await readJson<ModelHistorySnapshot>(this.historyPath);
    const defaults = defaultHistorySnapshot();

    return {
      ...defaults,
      ...data,
      events: Array.isArray(data.events) ? data.events : []
    };
  }

  async getState(name: string): Promise<ModelLifecycleRecord | null> {
    const snapshot = await this.getLifecycleSnapshot();
    return snapshot.modelStates[canonicalName(name)] || null;
  }

  async setState(
    name: string,
    state: ModelLifecycleState,
    options?: {
      error?: string;
      progress?: ModelPullProgress | null;
      markPulled?: boolean;
      markDeleted?: boolean;
    }
  ): Promise<ModelLifecycleRecord> {
    const key = canonicalName(name);
    const now = new Date().toISOString();
    const snapshot = await this.getLifecycleSnapshot();
    const existing = snapshot.modelStates[key] || emptyRecord(name);

    const next: ModelLifecycleRecord = {
      ...existing,
      name,
      key,
      state,
      lastError: options?.error ?? (state === "failed" ? existing.lastError : ""),
      progress: options?.progress === undefined ? existing.progress : options.progress,
      updatedAt: now,
      lastPulledAt: options?.markPulled ? now : existing.lastPulledAt,
      lastDeletedAt: options?.markDeleted ? now : existing.lastDeletedAt
    };

    snapshot.modelStates[key] = next;
    snapshot.updatedAt = now;
    await writeJson(this.lifecyclePath, snapshot);
    return next;
  }

  async recordEvent(input: {
    name: string;
    action: ModelHistoryAction;
    message: string;
    ok: boolean;
    details?: Record<string, unknown>;
  }): Promise<ModelHistoryEntry> {
    const now = new Date().toISOString();
    const snapshot = await this.getHistorySnapshot();

    const event: ModelHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: input.name,
      key: canonicalName(input.name),
      action: input.action,
      message: input.message,
      ok: input.ok,
      at: now,
      details: input.details
    };

    const events = [event, ...(snapshot.events || [])].slice(0, MAX_HISTORY_EVENTS);
    const next: ModelHistorySnapshot = {
      ...snapshot,
      events,
      updatedAt: now
    };

    await writeJson(this.historyPath, next);
    return event;
  }

  async listHistory(options?: { name?: string; limit?: number }): Promise<ModelHistoryEntry[]> {
    const snapshot = await this.getHistorySnapshot();
    const key = options?.name ? canonicalName(options.name) : "";
    const limit = clampLimit(options?.limit);

    const filtered = key
      ? snapshot.events.filter((event) => event.key === key)
      : snapshot.events;

    return filtered.slice(0, limit);
  }

  async attachLifecycle(models: ModelSummary[]): Promise<ModelSummary[]> {
    const snapshot = await this.getLifecycleSnapshot();

    return models.map((model) => {
      const key = canonicalName(model.name);
      return {
        ...model,
        lifecycle: snapshot.modelStates[key] || emptyRecord(model.name),
        variantSummary: summarizeVariants(model.name, model.metadata?.availableTags)
      };
    });
  }
}

function summarizeVariants(name: string, availableTags: unknown): ModelVariantSummary {
  const [base, tag = "latest"] = String(name || "").split(":");
  const tags = Array.isArray(availableTags)
    ? availableTags.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (!tags.includes(tag)) {
    tags.unshift(tag);
  }

  return {
    base,
    tag,
    availableTags: dedupe(tags).slice(0, 40)
  };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    values.push(item);
  }

  return values;
}

function emptyRecord(name: string): ModelLifecycleRecord {
  return {
    name,
    key: canonicalName(name),
    state: "unknown",
    lastError: "",
    progress: null,
    lastPulledAt: "",
    lastDeletedAt: "",
    updatedAt: ""
  };
}

function defaultLifecycleSnapshot(): ModelLifecycleSnapshot {
  return {
    schemaVersion: 1,
    modelStates: {},
    updatedAt: ""
  };
}

function defaultHistorySnapshot(): ModelHistorySnapshot {
  return {
    schemaVersion: 1,
    events: [],
    updatedAt: ""
  };
}

function clampLimit(limit: unknown): number {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.max(1, Math.min(500, Math.round(parsed)));
}

async function ensureFile(filePath: string, defaultContent: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, defaultContent, "utf8");
  }
}

async function readJson<T extends object>(filePath: string): Promise<Partial<T>> {
  const raw = await fs.readFile(filePath, "utf8");
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw) as Partial<T>;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${filePath}: ${message}`);
  }
}

async function writeJson(filePath: string, data: object): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
