import type { Request, Response, Router } from "express";
import type { AppConfig } from "../config";
import type { ModelLifecycleStore } from "../services/modelLifecycleStore";
import type { OllamaClient } from "../services/ollamaClient";
import type { OptimizationStore } from "../services/optimizationStore";
import type { SystemProbe } from "../services/systemProbe";
import type {
  CpuSuggestionMode,
  FlashAttentionMode,
  KvCacheMode,
  ModelSummary,
  SystemCapabilities
} from "../types";

const express = require("express");
const { runCommand, runCommandWithSudoPassword } = require("../services/commandRunner");
const { fetchLibraryData } = require("../services/libraryFetcher");

interface SystemRouterDeps {
  ollamaClient: OllamaClient;
  config: AppConfig;
  systemProbe: SystemProbe;
  optimizationStore: OptimizationStore;
  lifecycleStore: ModelLifecycleStore;
}

interface RecommendationResponse {
  runtimeProfile: "gpu-cuda" | "cpu-only";
  summary: string;
  envRecommendation: {
    OLLAMA_FLASH_ATTENTION: string;
    OLLAMA_KV_CACHE_TYPE: string;
  };
  suggestedModels: {
    recommended: string[];
    advanced: string[];
  };
}

function createSystemRouter({
  ollamaClient,
  config,
  systemProbe,
  optimizationStore,
  lifecycleStore
}: SystemRouterDeps): Router {
  const router: Router = express.Router();

  router.get("/health", async (_req: Request, res: Response) => {
    const health = await ollamaClient.health();
    if (!health.ok) {
      res.status(503).json(health);
      return;
    }

    const [capabilities, optimizationConfig] = await Promise.all([
      systemProbe.getCapabilities(),
      optimizationStore.getConfig()
    ]);

    await optimizationStore.updateSystemProfile({
      ...capabilities,
      ollamaBaseUrl: config.ollamaBaseUrl
    });

    res.json({
      ok: true,
      ollamaBaseUrl: config.ollamaBaseUrl,
      updateEnabled: config.allowOllamaUpdate,
      capabilities,
      optimization: {
        userPreferences: optimizationConfig.userPreferences
      }
    });
  });

  router.get("/recommendations", async (_req: Request, res: Response) => {
    try {
      const [capabilities, optimizationConfig, installedModels] = await Promise.all([
        systemProbe.getCapabilities(),
        optimizationStore.getConfig(),
        ollamaClient.listModels()
      ]);

      const recommendation = buildRecommendations({
        capabilities,
        userPreferences: optimizationConfig.userPreferences,
        installedModels
      });

      res.json({
        ok: true,
        ...recommendation,
        setup: {
          sessionExportCommand:
            "export OLLAMA_FLASH_ATTENTION=true && export OLLAMA_KV_CACHE_TYPE=f16 && ollama run phi4-reasoning:latest",
          systemdInstructions: [
            "sudo systemctl edit ollama.service",
            "Add [Service] entries for OLLAMA_FLASH_ATTENTION and OLLAMA_KV_CACHE_TYPE",
            "sudo systemctl daemon-reload",
            "sudo systemctl restart ollama"
          ]
        }
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get("/gpu-status", async (_req: Request, res: Response) => {
    try {
      const status = await systemProbe.getGpuStatus();
      res.json(status);
    } catch (error: unknown) {
      res.status(500).json({
        ok: false,
        gpuAvailable: false,
        devices: [],
        error: getErrorMessage(error),
        timestamp: new Date().toISOString()
      });
    }
  });

  router.get("/running-models", async (_req: Request, res: Response) => {
    try {
      const models = await ollamaClient.listRunningModels();
      res.json({ ok: true, models, count: models.length });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get("/lifecycle-activity", async (req: Request, res: Response) => {
    const limit = Number(req.query.limit || 100);
    try {
      const events = await lifecycleStore.listHistory({ limit });
      res.json({ ok: true, events });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get("/optimization-config", async (_req: Request, res: Response) => {
    try {
      const configData = await optimizationStore.getConfig();
      res.json({ ok: true, config: configData });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.patch("/optimization-config", async (req: Request, res: Response) => {
    try {
      const next = await optimizationStore.updateUserPreferences({
        kvCacheMode: normalizeMode(req.body?.kvCacheMode, ["adaptive", "q8_0", "f16"]),
        flashAttentionMode: normalizeMode(req.body?.flashAttentionMode, ["auto", "on", "off"]),
        gpuPanelLiveDefault: normalizeBoolean(req.body?.gpuPanelLiveDefault),
        gpuPanelIntervalMs: normalizeInterval(req.body?.gpuPanelIntervalMs),
        cpuSuggestionMode: normalizeMode(req.body?.cpuSuggestionMode, ["dual", "strict", "warn-all"])
      });

      res.json({ ok: true, config: next });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post("/update-ollama", async (req: Request, res: Response) => {
    if (!config.allowOllamaUpdate) {
      res.status(403).json({
        error: "Ollama update is disabled. Set ALLOW_OLLAMA_UPDATE=true to enable it."
      });
      return;
    }

    if (req.body?.confirm !== true) {
      res.status(400).json({
        error: "Confirmation is required. Send { confirm: true } in request body."
      });
      return;
    }

    const rawPassword = req.body?.sudoPassword;
    const sudoPassword = typeof rawPassword === "string" ? rawPassword.replace(/[\r\n]/g, "") : "";
    const result = sudoPassword
      ? await runCommandWithSudoPassword(config.ollamaUpdateCommand, sudoPassword, config.updateTimeoutMs)
      : await runCommand(config.ollamaUpdateCommand, config.updateTimeoutMs);
    res.status(result.ok ? 200 : 500).json({
      ...result,
      command: config.ollamaUpdateCommand
    });
  });

  router.post("/fetch-library", async (req: Request, res: Response) => {
    const url = String(req.body?.url || "").trim();
    if (!url) {
      res.status(400).json({ error: "Field url is required." });
      return;
    }

    try {
      const data = await fetchLibraryData(url);
      res.json(data);
    } catch (error: unknown) {
      res.status(400).json({ error: getErrorMessage(error) });
    }
  });

  return router;
}

function buildRecommendations({
  capabilities,
  userPreferences,
  installedModels
}: {
  capabilities: SystemCapabilities;
  userPreferences: {
    kvCacheMode?: KvCacheMode;
  };
  installedModels: ModelSummary[];
}): RecommendationResponse {
  const preferences = userPreferences || {};
  const installed = Array.isArray(installedModels) ? installedModels : [];

  const kvCacheRecommendation = resolveKvRecommendation({
    kvCacheMode: preferences.kvCacheMode,
    cudaAvailable: capabilities.cudaAvailable,
    installed
  });

  if (capabilities.cudaAvailable) {
    return {
      runtimeProfile: "gpu-cuda",
      summary:
        "CUDA is available. Flash Attention can improve long-context performance; KV cache strategy should be chosen based on model/context size.",
      envRecommendation: {
        OLLAMA_FLASH_ATTENTION: "true",
        OLLAMA_KV_CACHE_TYPE: kvCacheRecommendation
      },
      suggestedModels: {
        recommended: installed.slice(0, 6).map((model) => model.name),
        advanced: []
      }
    };
  }

  const split = splitCpuSuggestions(installed.map((model) => model.name));
  return {
    runtimeProfile: "cpu-only",
    summary:
      "CUDA was not detected. Use smaller quantized models first for responsiveness, and treat larger models as advanced options with lower tokens-per-second.",
    envRecommendation: {
      OLLAMA_FLASH_ATTENTION: "false",
      OLLAMA_KV_CACHE_TYPE: "f16"
    },
    suggestedModels: {
      recommended: split.recommended,
      advanced: split.advanced
    }
  };
}

function resolveKvRecommendation({
  kvCacheMode,
  cudaAvailable,
  installed
}: {
  kvCacheMode?: KvCacheMode;
  cudaAvailable: boolean;
  installed: ModelSummary[];
}): "q8_0" | "f16" {
  if (!cudaAvailable) {
    return "f16";
  }

  if (kvCacheMode === "q8_0" || kvCacheMode === "f16") {
    return kvCacheMode;
  }

  const hasLargeInstalled = installed.some((model) => extractParameterSize(model.name) >= 14);
  return hasLargeInstalled ? "q8_0" : "f16";
}

function splitCpuSuggestions(modelNames: string[]): { recommended: string[]; advanced: string[] } {
  const names = Array.isArray(modelNames) ? modelNames : [];
  const recommended = names.filter((name) => extractParameterSize(name) > 0 && extractParameterSize(name) <= 8);
  const advanced = names.filter((name) => !recommended.includes(name));

  if (!recommended.length && names.length) {
    return {
      recommended: names.slice(0, 3),
      advanced: names.slice(3)
    };
  }

  return {
    recommended,
    advanced
  };
}

function extractParameterSize(name: string): number {
  const match = String(name || "").match(/([0-9]+(?:\.[0-9]+)?)b/i);
  return match ? Number(match[1]) : 0;
}

function normalizeMode<T extends string>(value: unknown, allowed: T[]): T | undefined {
  const input = String(value || "").trim();
  if (!input) {
    return undefined;
  }

  return allowed.includes(input as T) ? (input as T) : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value !== "boolean") {
    return undefined;
  }

  return value;
}

function normalizeInterval(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.min(15000, Math.max(2000, parsed));
}

module.exports = {
  createSystemRouter
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
