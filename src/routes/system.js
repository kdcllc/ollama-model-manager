const express = require("express");
const { runCommand } = require("../services/commandRunner");
const { fetchLibraryData } = require("../services/libraryFetcher");

function createSystemRouter({ ollamaClient, config, systemProbe, optimizationStore }) {
  const router = express.Router();

  router.get("/health", async (req, res) => {
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

  router.get("/recommendations", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/gpu-status", async (req, res) => {
    try {
      const status = await systemProbe.getGpuStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({
        ok: false,
        gpuAvailable: false,
        devices: [],
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  router.get("/optimization-config", async (req, res) => {
    try {
      const configData = await optimizationStore.getConfig();
      res.json({ ok: true, config: configData });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/optimization-config", async (req, res) => {
    try {
      const next = await optimizationStore.updateUserPreferences({
        kvCacheMode: normalizeMode(req.body?.kvCacheMode, ["adaptive", "q8_0", "f16"]),
        flashAttentionMode: normalizeMode(req.body?.flashAttentionMode, ["auto", "on", "off"]),
        gpuPanelLiveDefault: normalizeBoolean(req.body?.gpuPanelLiveDefault),
        gpuPanelIntervalMs: normalizeInterval(req.body?.gpuPanelIntervalMs),
        cpuSuggestionMode: normalizeMode(req.body?.cpuSuggestionMode, ["dual", "strict", "warn-all"])
      });

      res.json({ ok: true, config: next });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/update-ollama", async (req, res) => {
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

    const result = await runCommand(config.ollamaUpdateCommand, config.updateTimeoutMs);
    res.status(result.ok ? 200 : 500).json({
      ...result,
      command: config.ollamaUpdateCommand
    });
  });

  router.post("/fetch-library", async (req, res) => {
    const url = String(req.body?.url || "").trim();
    if (!url) {
      res.status(400).json({ error: "Field url is required." });
      return;
    }

    try {
      const data = await fetchLibraryData(url);
      res.json(data);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}

function buildRecommendations({ capabilities, userPreferences, installedModels }) {
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

function resolveKvRecommendation({ kvCacheMode, cudaAvailable, installed }) {
  if (!cudaAvailable) {
    return "f16";
  }

  if (kvCacheMode === "q8_0" || kvCacheMode === "f16") {
    return kvCacheMode;
  }

  const hasLargeInstalled = installed.some((model) => extractParameterSize(model.name) >= 14);
  return hasLargeInstalled ? "q8_0" : "f16";
}

function splitCpuSuggestions(modelNames) {
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

function extractParameterSize(name) {
  const match = String(name || "").match(/([0-9]+(?:\.[0-9]+)?)b/i);
  return match ? Number(match[1]) : 0;
}

function normalizeMode(value, allowed) {
  const input = String(value || "").trim();
  if (!input) {
    return undefined;
  }

  return allowed.includes(input) ? input : undefined;
}

function normalizeBoolean(value) {
  if (typeof value !== "boolean") {
    return undefined;
  }

  return value;
}

function normalizeInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.min(15000, Math.max(2000, parsed));
}

module.exports = {
  createSystemRouter
};
