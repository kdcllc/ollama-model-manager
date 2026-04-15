import type { Request, Response, Router } from "express";
import type { MetadataStore } from "../services/metadataStore";
import type { OllamaClient } from "../services/ollamaClient";
import type { SystemProbe } from "../services/systemProbe";
import type { ModelMetadata } from "../types";

const express = require("express");
const { canonicalName } = require("../services/metadataStore");
const { fetchLibraryData } = require("../services/libraryFetcher");

interface ModelsRouterDeps {
  ollamaClient: OllamaClient;
  metadataStore: MetadataStore;
  systemProbe: SystemProbe;
}

interface HttpError {
  status?: number;
  details?: unknown;
  message?: string;
}

function createModelsRouter({ ollamaClient, metadataStore, systemProbe }: ModelsRouterDeps): Router {
  const router: Router = express.Router();

  router.get("/", async (_req: Request, res: Response) => {
    try {
      const models = await ollamaClient.listModels();
      const [merged, capabilities] = await Promise.all([
        metadataStore.mergeModels(models),
        systemProbe.getCapabilities()
      ]);

      const enriched = merged.map((model) => ({
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
      let payload = await loadModelPayload({ name, ollamaClient, metadataStore });

      if (shouldAutoEnrich(payload.metadata)) {
        payload = await enrichModelMetadata({ name, ollamaClient, metadataStore });
      }

      res.json(payload);
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
      const result = await ollamaClient.pullModel(name);
      const payload = await enrichModelMetadata({ name, ollamaClient, metadataStore });
      res.json({ ok: true, result, model: payload });
    } catch (error: unknown) {
      handleError(res, error);
    }
  });

  router.delete("/:name", async (req: Request, res: Response) => {
    const name = decodeURIComponent(req.params.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "Model name is required." });
      return;
    }

    try {
      const result = await ollamaClient.deleteModel(name);
      res.json({ ok: true, result });
    } catch (error: unknown) {
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
        libraryUrl: url || undefined
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
  metadataStore
}: {
  name: string;
  ollamaClient: OllamaClient;
  metadataStore: MetadataStore;
}) {
  const [details, metadata] = await Promise.all([
    ollamaClient.showModel(name),
    metadataStore.getMergedMetadata(name)
  ]);

  return {
    name,
    key: canonicalName(name),
    details,
    metadata
  };
}

async function enrichModelMetadata({
  name,
  ollamaClient,
  metadataStore,
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

  return {
    name,
    key: canonicalName(name),
    details,
    metadata: finalMetadata
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
