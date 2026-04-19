import type { Request, Response, Router } from "express";
import type { MetadataStore } from "../services/metadataStore";
import type { ModelLifecycleStore } from "../services/modelLifecycleStore";
import type { OllamaClient } from "../services/ollamaClient";
import type { SystemProbe } from "../services/systemProbe";
import type { ModelMetadata } from "../types";

const express = require("express");
const { canonicalName } = require("../services/metadataStore");
const { fetchLibraryData } = require("../services/libraryFetcher");

interface ModelsRouterDeps {
  ollamaClient: OllamaClient;
  metadataStore: MetadataStore;
  lifecycleStore: ModelLifecycleStore;
  systemProbe: SystemProbe;
}

interface HttpError {
  status?: number;
  details?: unknown;
  message?: string;
}

function createModelsRouter({
  ollamaClient,
  metadataStore,
  lifecycleStore,
  systemProbe
}: ModelsRouterDeps): Router {
  const router: Router = express.Router();

  router.get("/", async (_req: Request, res: Response) => {
    try {
      const models = await ollamaClient.listModels();
      const [merged, capabilities] = await Promise.all([
        metadataStore.mergeModels(models),
        systemProbe.getCapabilities()
      ]);

      const withLifecycle = await lifecycleStore.attachLifecycle(merged);
      const enriched = withLifecycle.map((model) => ({
        ...model,
        suggestionTier: classifySuggestionTier(model.name, capabilities)
      }));
      res.json({ models: enriched, capabilities });
    } catch (error: unknown) {
      handleError(res, error);
    }
  });

  router.get("/:name", async (req: Request, res: Response) => {
    const name = decodeURIComponent(req.params.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "Model name is required." });
      return;
    }

    try {
      let payload = await loadModelPayload({
        name,
        ollamaClient,
        metadataStore,
        lifecycleStore
      });

      if (shouldAutoEnrich(payload.metadata)) {
        payload = await enrichModelMetadata({
          name,
          ollamaClient,
          metadataStore,
          lifecycleStore
        });
      }

      res.json(payload);
    } catch (error: unknown) {
      handleError(res, error);
    }
  });

  router.get("/:name/history", async (req: Request, res: Response) => {
    const name = decodeURIComponent(req.params.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "Model name is required." });
      return;
    }

    const limit = Number(req.query.limit || 100);
    try {
      const events = await lifecycleStore.listHistory({ name, limit });
      res.json({ ok: true, events });
    } catch (error: unknown) {
      handleError(res, error);
    }
  });

  router.get("/history/all", async (req: Request, res: Response) => {
    const limit = Number(req.query.limit || 100);
    try {
      const events = await lifecycleStore.listHistory({ limit });
      res.json({ ok: true, events });
    } catch (error: unknown) {
      handleError(res, error);
    }
  });

  router.post("/pull", async (req: Request, res: Response) => {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "Field name is required." });
      return;
    }

    try {
      await lifecycleStore.setState(name, "pulling", {
        error: "",
        progress: null
      });
      await lifecycleStore.recordEvent({
        name,
        action: "pull-started",
        message: "Model pull started.",
        ok: true
      });

      const result = await ollamaClient.pullModel(name);
      await lifecycleStore.setState(name, "ready", {
        markPulled: true,
        error: "",
        progress: null
      });
      await lifecycleStore.recordEvent({
        name,
        action: "pull-succeeded",
        message: "Model pull completed.",
        ok: true,
        details: summarizeResult(result)
      });

      const payload = await enrichModelMetadata({
        name,
        ollamaClient,
        metadataStore,
        lifecycleStore
      });
      res.json({ ok: true, result, model: payload });
    } catch (error: unknown) {
      await lifecycleStore.setState(name, "failed", {
        error: getErrorMessage(error)
      });
      await lifecycleStore.recordEvent({
        name,
        action: "pull-failed",
        message: "Model pull failed.",
        ok: false,
        details: {
          error: getErrorMessage(error)
        }
      });
      handleError(res, error);
    }
  });

  router.post("/create", async (req: Request, res: Response) => {
    const name = String(req.body?.name || "").trim();
    const modelfile = String(req.body?.modelfile || "").trim();

    if (!name) {
      res.status(400).json({ error: "Field name is required." });
      return;
    }

    if (!modelfile) {
      res.status(400).json({ error: "Field modelfile is required." });
      return;
    }

    try {
      await lifecycleStore.setState(name, "building", {
        error: "",
        progress: null
      });
      await lifecycleStore.recordEvent({
        name,
        action: "create-started",
        message: "Custom model build started.",
        ok: true,
        details: {
          modelfileLength: modelfile.length
        }
      });

      const result = await ollamaClient.createModel(name, modelfile);

      await lifecycleStore.setState(name, "ready", {
        markPulled: true,
        error: "",
        progress: null
      });
      await lifecycleStore.recordEvent({
        name,
        action: "create-succeeded",
        message: "Custom model build completed.",
        ok: true,
        details: summarizeResult(result)
      });

      const payload = await loadModelPayload({
        name,
        ollamaClient,
        metadataStore,
        lifecycleStore
      });

      res.json({ ok: true, result, model: payload });
    } catch (error: unknown) {
      await lifecycleStore.setState(name, "failed", {
        error: getErrorMessage(error)
      });
      await lifecycleStore.recordEvent({
        name,
        action: "create-failed",
        message: "Custom model build failed.",
        ok: false,
        details: {
          error: getErrorMessage(error)
        }
      });
      handleError(res, error);
    }
  });

  router.post("/batch-pull", async (req: Request, res: Response) => {
    const names = normalizeStringArray(req.body?.names);
    if (!names.length) {
      res.status(400).json({ error: "Field names must be a non-empty array." });
      return;
    }

    const startedAt = new Date().toISOString();
    await lifecycleStore.recordEvent({
      name: "*",
      action: "batch-pull-started",
      message: `Batch pull started for ${names.length} model(s).`,
      ok: true,
      details: { names }
    });

    const results: Array<{ name: string; ok: boolean; error?: string }> = [];

    for (const name of names) {
      try {
        await lifecycleStore.setState(name, "pulling", {
          error: "",
          progress: null
        });
        await lifecycleStore.recordEvent({
          name,
          action: "pull-started",
          message: "Model pull started from batch.",
          ok: true
        });

        await ollamaClient.pullModel(name);
        await lifecycleStore.setState(name, "ready", {
          markPulled: true,
          error: "",
          progress: null
        });
        await lifecycleStore.recordEvent({
          name,
          action: "pull-succeeded",
          message: "Model pull completed from batch.",
          ok: true
        });

        results.push({ name, ok: true });
      } catch (error: unknown) {
        await lifecycleStore.setState(name, "failed", {
          error: getErrorMessage(error)
        });
        await lifecycleStore.recordEvent({
          name,
          action: "pull-failed",
          message: "Model pull failed from batch.",
          ok: false,
          details: {
            error: getErrorMessage(error)
          }
        });

        results.push({
          name,
          ok: false,
          error: getErrorMessage(error)
        });
      }
    }

    const failed = results.filter((result) => !result.ok).length;
    await lifecycleStore.recordEvent({
      name: "*",
      action: "batch-pull-completed",
      message: `Batch pull completed (${names.length - failed}/${names.length} successful).`,
      ok: failed === 0,
      details: {
        startedAt,
        completedAt: new Date().toISOString(),
        failed,
        names
      }
    });

    res.status(failed > 0 ? 207 : 200).json({
      ok: failed === 0,
      results,
      summary: {
        total: names.length,
        failed
      }
    });
  });

  router.delete("/:name", async (req: Request, res: Response) => {
    const name = decodeURIComponent(req.params.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "Model name is required." });
      return;
    }

    try {
      await lifecycleStore.setState(name, "deleting", {
        error: "",
        progress: null
      });
      await lifecycleStore.recordEvent({
        name,
        action: "delete-started",
        message: "Model delete started.",
        ok: true
      });

      const result = await ollamaClient.deleteModel(name);
      await lifecycleStore.setState(name, "unknown", {
        markDeleted: true,
        error: "",
        progress: null
      });
      await lifecycleStore.recordEvent({
        name,
        action: "delete-succeeded",
        message: "Model deleted.",
        ok: true,
        details: summarizeResult(result)
      });
      res.json({ ok: true, result });
    } catch (error: unknown) {
      await lifecycleStore.setState(name, "failed", {
        error: getErrorMessage(error),
        progress: null
      });
      await lifecycleStore.recordEvent({
        name,
        action: "delete-failed",
        message: "Model delete failed.",
        ok: false,
        details: {
          error: getErrorMessage(error)
        }
      });
      handleError(res, error);
    }
  });

  router.patch("/:name/notes", async (req: Request, res: Response) => {
    const name = decodeURIComponent(req.params.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "Model name is required." });
      return;
    }

    const description = normalizeString(req.body?.description);
    const notes = normalizeString(req.body?.notes);
    const bestFor = normalizeStringArray(req.body?.bestFor);
    const notIdealFor = normalizeStringArray(req.body?.notIdealFor);
    const extraTips = normalizeString(req.body?.extraTips);

    try {
      const metadata = await metadataStore.updateUserMetadata(name, {
        description,
        notes,
        bestFor,
        notIdealFor,
        extraTips
      });

      await lifecycleStore.recordEvent({
        name,
        action: "metadata-updated",
        message: "Metadata notes updated.",
        ok: true
      });

      res.json({ ok: true, metadata });
    } catch (error: unknown) {
      handleError(res, error);
    }
  });

  router.post("/:name/enrich", async (req: Request, res: Response) => {
    const name = decodeURIComponent(req.params.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "Model name is required." });
      return;
    }

    const url = normalizeString(req.body?.url);

    try {
      const payload = await enrichModelMetadata({
        name,
        ollamaClient,
        metadataStore,
        lifecycleStore,
        libraryUrl: url || undefined
      });

      await lifecycleStore.recordEvent({
        name,
        action: "metadata-enriched",
        message: "Model metadata enriched from Ollama library.",
        ok: true,
        details: {
          libraryUrl: payload?.metadata?.libraryUrl || url || ""
        }
      });

      res.json({ ok: true, model: payload });
    } catch (error: unknown) {
      handleError(res, error);
    }
  });

  return router;
}

function classifySuggestionTier(
  modelName: string,
  capabilities: { cudaAvailable?: boolean } | null
): string {
  const size = parseParameterSize(modelName);
  if (capabilities?.cudaAvailable) {
    return size >= 14 ? "advanced-gpu" : "recommended-gpu";
  }

  if (size > 0 && size <= 8) {
    return "recommended-cpu";
  }

  return "advanced-cpu";
}

async function loadModelPayload({
  name,
  ollamaClient,
  metadataStore,
  lifecycleStore
}: {
  name: string;
  ollamaClient: OllamaClient;
  metadataStore: MetadataStore;
  lifecycleStore: ModelLifecycleStore;
}) {
  const [details, metadata] = await Promise.all([
    ollamaClient.showModel(name),
    metadataStore.getMergedMetadata(name)
  ]);

  const lifecycle = await lifecycleStore.getState(name);
  const variantSummary = summarizeVariantFromMetadata(name, metadata);

  return {
    name,
    key: canonicalName(name),
    details,
    metadata,
    lifecycle,
    variantSummary
  };
}

async function enrichModelMetadata({
  name,
  ollamaClient,
  metadataStore,
  lifecycleStore,
  libraryUrl = deriveLibraryUrl(name)
}) {
  const details = await ollamaClient.showModel(name);

  let libraryData = null;
  let libraryFetchError = "";

  try {
    libraryData = await fetchLibraryData(libraryUrl);
  } catch (error: unknown) {
    libraryFetchError = getErrorMessage(error);
  }

  const fetchedPatch = libraryData
    ? {
        description: normalizeFetchedString(libraryData.description),
        bestFor: normalizeFetchedArray(libraryData.bestFor),
        notIdealFor: normalizeFetchedArray(libraryData.notIdealFor),
        extraTips: normalizeFetchedString(libraryData.extraTips),
        libraryUrl,
        libraryFetchedAt: new Date().toISOString(),
        libraryFetchError,
        availableTags: normalizeFetchedArray(libraryData.availableTags)
      }
    : {
        libraryUrl,
        libraryFetchError
      };

  await metadataStore.updateFetchedMetadata(name, {
    ...fetchedPatch,
    rawDetails: summarizeDetails(details),
    rawDetailsFetchedAt: new Date().toISOString()
  });

  const metadata = await metadataStore.getMergedMetadata(name);

  const inferredMetadata = inferMetadataFromModel({ name, details, metadata });
  if (inferredMetadata) {
    await metadataStore.updateFetchedMetadata(name, inferredMetadata);
  }

  const finalMetadata = await metadataStore.getMergedMetadata(name);
  const lifecycle = await lifecycleStore.getState(name);
  const variantSummary = summarizeVariantFromMetadata(name, finalMetadata);

  return {
    name,
    key: canonicalName(name),
    details,
    metadata: finalMetadata,
    lifecycle,
    variantSummary
  };
}

function shouldAutoEnrich(metadata: ModelMetadata): boolean {
  const missingBestFor = !Array.isArray(metadata?.bestFor) || metadata.bestFor.length === 0;
  const missingNotIdealFor =
    !Array.isArray(metadata?.notIdealFor) || metadata.notIdealFor.length === 0;

  return (
    !metadata?.rawDetails ||
    (!metadata?.libraryFetchedAt && !metadata?.libraryFetchError) ||
    missingBestFor ||
    missingNotIdealFor
  );
}

function normalizeFetchedString(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function normalizeFetchedArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function deriveLibraryUrl(modelName: string): string {
  const base = String(modelName || "").split(":")[0];
  if (base.includes("/")) {
    return `https://ollama.com/${base}`;
  }

  return `https://ollama.com/library/${base}`;
}

function summarizeVariantFromMetadata(name: string, metadata: ModelMetadata) {
  const [base, tag = "latest"] = String(name || "").split(":");
  const metadataTags = Array.isArray(metadata?.availableTags)
    ? metadata.availableTags.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const tags = dedupe([tag, ...metadataTags]).slice(0, 40);

  return {
    base,
    tag,
    availableTags: tags
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

function summarizeResult(result: unknown): Record<string, unknown> {
  if (typeof result === "object" && result !== null) {
    return result as Record<string, unknown>;
  }

  return {
    value: String(result || "")
  };
}

function summarizeDetails(details: Record<string, any>) {
  const ollamaDetails = details?.details || {};
  const capabilities = Array.isArray(details?.capabilities) ? details.capabilities : [];

  return {
    family: ollamaDetails.family || "",
    families: Array.isArray(ollamaDetails.families) ? ollamaDetails.families : [],
    parameterSize: ollamaDetails.parameter_size || "",
    quantizationLevel: ollamaDetails.quantization_level || "",
    format: ollamaDetails.format || "",
    capabilities
  };
}

function inferMetadataFromModel({
  name,
  details,
  metadata
}: {
  name: string;
  details: Record<string, any>;
  metadata: ModelMetadata;
}): Partial<ModelMetadata> | null {
  const raw = summarizeDetails(details);
  const text = [name, metadata?.description || "", raw.family || "", ...(raw.capabilities || [])]
    .join(" ")
    .toLowerCase();
  const bestFor = Array.isArray(metadata?.bestFor) ? [...metadata.bestFor] : [];
  const notIdealFor = Array.isArray(metadata?.notIdealFor) ? [...metadata.notIdealFor] : [];

  pushUnique(bestFor, /code|coder|codellama|programming/.test(text), "Code generation");
  pushUnique(bestFor, /code|coder|debug|refactor/.test(text), "Code explanation and debugging");
  pushUnique(bestFor, /embedding|embed/.test(text), "Vector embeddings and retrieval");
  pushUnique(bestFor, /reasoning|analysis|deepseek-r1/.test(text), "Complex reasoning");
  pushUnique(bestFor, /multilingual|qwen/.test(text), "Multilingual chat");
  pushUnique(bestFor, /tool/.test(text), "Tool-augmented assistants");
  pushUnique(bestFor, /phi3|small|lightweight/.test(text), "Low-latency local assistant");

  pushUnique(notIdealFor, /embedding|embed/.test(text), "Direct chat responses");
  pushUnique(notIdealFor, /embedding|embed/.test(text), "Long-form text generation");
  pushUnique(notIdealFor, /code|coder|codellama/.test(text), "General non-technical conversation");
  pushUnique(notIdealFor, /reasoning|analysis|deepseek-r1/.test(text), "Ultra-fast short chat responses");

  const parameterSize = parseParameterSize(raw.parameterSize);
  pushUnique(notIdealFor, parameterSize >= 14, "Resource-constrained devices");
  pushUnique(notIdealFor, /phi3|small|lightweight/.test(text), "Large-context deep reasoning");

  const patch: Partial<ModelMetadata> = {};
  if (bestFor.length > 0) {
    patch.bestFor = bestFor.slice(0, 6);
  }
  if (notIdealFor.length > 0) {
    patch.notIdealFor = notIdealFor.slice(0, 4);
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function pushUnique(list: string[], condition: boolean, value: string): void {
  if (!condition) {
    return;
  }

  const exists = list.some((item) => String(item).toLowerCase() === String(value).toLowerCase());
  if (!exists) {
    list.push(value);
  }
}

function parseParameterSize(value: unknown): number {
  const match = String(value || "").trim().match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : 0;
}

function normalizeString(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

module.exports = {
  createModelsRouter
};

function handleError(res: Response, error: unknown): void {
  const err = (error ?? {}) as HttpError;
  res.status(err.status || 500).json({
    error: getErrorMessage(error),
    details: err.details || null
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
