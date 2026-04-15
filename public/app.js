const state = {
  models: [],
  selectedModel: null,
  busy: false,
  capabilities: null,
  recommendations: null,
  optimizationConfig: null,
  gpuStatus: null,
  gpuLive: false,
  gpuPollIntervalMs: 5000,
  gpuPollTimer: null
};

const el = {
  healthBadge: document.getElementById("healthBadge"),
  refreshBtn: document.getElementById("refreshBtn"),
  updateOllamaBtn: document.getElementById("updateOllamaBtn"),
  pullForm: document.getElementById("pullForm"),
  pullName: document.getElementById("pullName"),
  modelsGrid: document.getElementById("modelsGrid"),
  detailsContent: document.getElementById("detailsContent"),
  activityLog: document.getElementById("activityLog"),
  modelCardTemplate: document.getElementById("modelCardTemplate"),
  systemSummary: document.getElementById("systemSummary"),
  setupGuidance: document.getElementById("setupGuidance"),
  recommendedModels: document.getElementById("recommendedModels"),
  advancedModels: document.getElementById("advancedModels"),
  kvCacheModeSelect: document.getElementById("kvCacheModeSelect"),
  flashAttentionModeSelect: document.getElementById("flashAttentionModeSelect"),
  saveOptimizationBtn: document.getElementById("saveOptimizationBtn"),
  effectiveEnvVars: document.getElementById("effectiveEnvVars"),
  effectiveEnvExport: document.getElementById("effectiveEnvExport"),
  effectiveEnvSystemd: document.getElementById("effectiveEnvSystemd"),
  gpuStatusPill: document.getElementById("gpuStatusPill"),
  toggleGpuLiveBtn: document.getElementById("toggleGpuLiveBtn"),
  refreshGpuBtn: document.getElementById("refreshGpuBtn"),
  gpuPanel: document.getElementById("gpuPanel")
};

init();

async function init() {
  wireEvents();
  await loadOptimizationConfig();
  await refreshAll();
}

function wireEvents() {
  el.refreshBtn.addEventListener("click", () => refreshAll());

  el.updateOllamaBtn.addEventListener("click", async () => {
    const confirmed = confirm(
      "Run Ollama update on this machine now? This may take a few minutes."
    );
    if (!confirmed) {
      return;
    }

    await runAction("Updating Ollama runtime...", async () => {
      const result = await apiPost("/api/system/update-ollama", { confirm: true });
      log(
        result.ok
          ? "Ollama update completed successfully."
          : "Ollama update reported failure."
      );
      if (result.stdout) {
        log("stdout:\n" + result.stdout);
      }
      if (result.stderr) {
        log("stderr:\n" + result.stderr);
      }
    });
  });

  el.pullForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = el.pullName.value.trim();
    if (!name) {
      return;
    }

    await runAction(`Pulling model ${name}...`, async () => {
      const result = await apiPost("/api/models/pull", { name });
      log(`Model pull finished for ${name}.`);
      el.pullName.value = "";
      state.selectedModel = result.model?.name || name;
      await loadModels({ refreshSelected: false });
      await loadRecommendations();
    });

    await showDetails(state.selectedModel || name);
  });

  el.saveOptimizationBtn.addEventListener("click", async () => {
    await runAction("Saving optimization preferences...", async () => {
      const payload = {
        kvCacheMode: el.kvCacheModeSelect.value,
        flashAttentionMode: el.flashAttentionModeSelect.value,
        gpuPanelIntervalMs: state.gpuPollIntervalMs
      };
      const result = await apiPatch("/api/system/optimization-config", payload);
      state.optimizationConfig = result.config;
      log("Optimization preferences updated.");
      await loadRecommendations();
      renderEffectiveEnvPreview();
    });
  });

  el.kvCacheModeSelect.addEventListener("change", () => {
    renderEffectiveEnvPreview();
  });

  el.flashAttentionModeSelect.addEventListener("change", () => {
    renderEffectiveEnvPreview();
  });

  el.toggleGpuLiveBtn.addEventListener("click", () => {
    if (state.gpuLive) {
      stopGpuLive();
      return;
    }

    startGpuLive();
  });

  el.refreshGpuBtn.addEventListener("click", async () => {
    await loadGpuStatus(true);
  });
}

async function refreshAll() {
  await Promise.all([
    loadHealth(),
    loadModels(),
    loadRecommendations(),
    loadGpuStatus(false)
  ]);
}

async function loadHealth() {
  try {
    const health = await apiGet("/api/system/health");
    if (health.ok) {
      state.capabilities = health.capabilities || null;
      el.healthBadge.className = "pill pill-good";
      el.healthBadge.textContent = health.capabilities?.cudaAvailable
        ? "Ollama online - CUDA available"
        : "Ollama online - CPU mode";
      return;
    }

    setHealthError(health.error || "Unknown health issue");
  } catch (error) {
    setHealthError(error.message);
  }
}

function setHealthError(message) {
  el.healthBadge.className = "pill pill-bad";
  el.healthBadge.textContent = `Ollama offline: ${message}`;
}

async function loadModels(options = {}) {
  const refreshSelected = options.refreshSelected !== false;

  try {
    const payload = await apiGet("/api/models");
    state.models = payload.models || [];
    state.capabilities = payload.capabilities || state.capabilities;
    renderModels();

    if (refreshSelected && state.selectedModel) {
      const found = state.models.find((m) => m.name === state.selectedModel);
      if (found) {
        await showDetails(found.name);
      }
    }
  } catch (error) {
    log("Failed to load models: " + error.message);
    el.modelsGrid.innerHTML = "<p class='hint'>Unable to load models right now.</p>";
  }
}

async function loadOptimizationConfig() {
  try {
    const payload = await apiGet("/api/system/optimization-config");
    state.optimizationConfig = payload.config || null;
    const prefs = state.optimizationConfig?.userPreferences || {};

    el.kvCacheModeSelect.value = prefs.kvCacheMode || "adaptive";
    el.flashAttentionModeSelect.value = prefs.flashAttentionMode || "auto";
    state.gpuPollIntervalMs = Number(prefs.gpuPanelIntervalMs || 5000);
    renderEffectiveEnvPreview();
  } catch (error) {
    log("Unable to load optimization config: " + error.message);
  }
}

async function loadRecommendations() {
  try {
    const payload = await apiGet("/api/system/recommendations");
    state.recommendations = payload;
    renderRecommendations();
  } catch (error) {
    el.systemSummary.textContent = "Unable to load recommendations right now.";
    el.setupGuidance.textContent = "";
  }
}

function renderRecommendations() {
  const rec = state.recommendations;
  if (!rec) {
    return;
  }

  const profileText = rec.runtimeProfile === "gpu-cuda" ? "GPU/CUDA profile" : "CPU-only profile";
  el.systemSummary.textContent = `${profileText}: ${rec.summary}`;

  const env = rec.envRecommendation || {};
  const sessionCmd = rec.setup?.sessionExportCommand || "";
  const setupText = [
    `Recommended env: OLLAMA_FLASH_ATTENTION=${env.OLLAMA_FLASH_ATTENTION || ""}`,
    `OLLAMA_KV_CACHE_TYPE=${env.OLLAMA_KV_CACHE_TYPE || ""}`,
    sessionCmd ? `Session example: ${sessionCmd}` : ""
  ]
    .filter(Boolean)
    .join(" | ");

  el.setupGuidance.textContent = setupText;

  renderEffectiveEnvPreview();

  const suggested = rec.suggestedModels || {};
  renderList(el.recommendedModels, suggested.recommended || [], "No recommended models yet.");
  renderList(el.advancedModels, suggested.advanced || [], "No advanced models listed.");
}

function renderEffectiveEnvPreview() {
  const env = getEffectiveEnvVars();
  if (!el.effectiveEnvVars || !el.effectiveEnvExport || !el.effectiveEnvSystemd) {
    return;
  }

  const varsBlock = [
    `OLLAMA_FLASH_ATTENTION=${env.OLLAMA_FLASH_ATTENTION}`,
    `OLLAMA_KV_CACHE_TYPE=${env.OLLAMA_KV_CACHE_TYPE}`
  ].join("\n");

  const exportBlock = [
    `export OLLAMA_FLASH_ATTENTION=${env.OLLAMA_FLASH_ATTENTION}`,
    `export OLLAMA_KV_CACHE_TYPE=${env.OLLAMA_KV_CACHE_TYPE}`
  ].join("\n");

  const systemdBlock = [
    "[Service]",
    `Environment=\"OLLAMA_FLASH_ATTENTION=${env.OLLAMA_FLASH_ATTENTION}\"`,
    `Environment=\"OLLAMA_KV_CACHE_TYPE=${env.OLLAMA_KV_CACHE_TYPE}\"`
  ].join("\n");

  el.effectiveEnvVars.textContent = varsBlock;
  el.effectiveEnvExport.textContent = exportBlock;
  el.effectiveEnvSystemd.textContent = systemdBlock;
}

function getEffectiveEnvVars() {
  const recommendation = state.recommendations?.envRecommendation || {};
  const flashMode = String(el.flashAttentionModeSelect?.value || "auto");
  const kvMode = String(el.kvCacheModeSelect?.value || "adaptive");

  let flashValue = recommendation.OLLAMA_FLASH_ATTENTION || "false";
  if (flashMode === "on") {
    flashValue = "true";
  } else if (flashMode === "off") {
    flashValue = "false";
  }

  let kvValue = recommendation.OLLAMA_KV_CACHE_TYPE || "f16";
  if (kvMode === "q8_0" || kvMode === "f16") {
    kvValue = kvMode;
  }

  if (kvMode === "adaptive" && !state.capabilities?.cudaAvailable) {
    kvValue = "f16";
  }

  return {
    OLLAMA_FLASH_ATTENTION: flashValue,
    OLLAMA_KV_CACHE_TYPE: kvValue
  };
}

function renderList(container, items, emptyText) {
  container.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = emptyText;
    container.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

function renderModels() {
  el.modelsGrid.innerHTML = "";

  if (!state.models.length) {
    el.modelsGrid.innerHTML =
      "<p class='hint'>No installed models found. Pull one above to get started.</p>";
    return;
  }

  for (const model of state.models) {
    const fragment = el.modelCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".card");
    fragment.querySelector(".model-name").textContent = model.name;
    fragment.querySelector(".model-size").textContent = formatBytes(model.size || 0);

    const description = model.metadata?.description || "No description yet for this model.";
    fragment.querySelector(".model-description").textContent = description;

    const bestFor = Array.isArray(model.metadata?.bestFor) ? model.metadata.bestFor : [];
    const tagsNode = fragment.querySelector(".model-best-for");
    bestFor.slice(0, 3).forEach((item) => {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = item;
      tagsNode.appendChild(tag);
    });

    if (model.suggestionTier) {
      const tier = document.createElement("span");
      tier.className = "tag tag-tier";
      tier.textContent = model.suggestionTier;
      tagsNode.appendChild(tier);
    }

    fragment.querySelector(".model-updated").textContent = model.modifiedAt
      ? "Updated: " + new Date(model.modifiedAt).toLocaleString()
      : "Updated: unknown";

    fragment.querySelector(".view-btn").addEventListener("click", () => showDetails(model.name));
    fragment.querySelector(".pull-btn").addEventListener("click", () => pullModel(model.name));
    fragment.querySelector(".delete-btn").addEventListener("click", () => deleteModel(model.name));

    if (state.selectedModel === model.name) {
      card.style.borderColor = "#29b6f6";
    }

    el.modelsGrid.appendChild(fragment);
  }
}

async function showDetails(name) {
  state.selectedModel = name;
  renderModels();

  el.detailsContent.innerHTML = `<p class="hint">Loading details for <strong>${escapeHtml(name)}</strong>...</p>`;
  document.getElementById("detailsPanel").scrollIntoView({ behavior: "smooth", block: "start" });

  await runAction(
    `Loading details for ${name}...`,
    async () => {
      const payload = await apiGet(`/api/models/${encodeURIComponent(name)}`);
      renderDetails(payload);
    },
    { silentSuccess: true }
  );
}

function deriveLibraryUrl(modelName) {
  const base = modelName.split(":")[0];
  if (base.includes("/")) {
    return `https://ollama.com/${base}`;
  }
  return `https://ollama.com/library/${base}`;
}

function renderDetails(payload, options = {}) {
  const metadata = payload.metadata || {};
  const rawDetails = metadata.rawDetails || {};
  const ollamaDetails = payload.details?.details || {};
  const detailFamily = ollamaDetails.family || rawDetails.family || "";
  const detailFamilies = Array.isArray(ollamaDetails.families)
    ? ollamaDetails.families
    : Array.isArray(rawDetails.families)
      ? rawDetails.families
      : [];
  const capabilities = Array.isArray(payload.details?.capabilities)
    ? payload.details.capabilities
    : Array.isArray(rawDetails.capabilities)
      ? rawDetails.capabilities
      : [];
  const bestForInput = Array.isArray(metadata.bestFor) ? metadata.bestFor.join(", ") : "";
  const notIdealInput = Array.isArray(metadata.notIdealFor) ? metadata.notIdealFor.join(", ") : "";
  const libraryUrl = deriveLibraryUrl(payload.name);
  const fetchStatus = options.fetchStatus || "";

  const infoRows = [
    ["Family", detailFamily || detailFamilies.join(", ")],
    ["Parameters", ollamaDetails.parameter_size || rawDetails.parameterSize],
    ["Quantization", ollamaDetails.quantization_level || rawDetails.quantizationLevel],
    ["Format", ollamaDetails.format || rawDetails.format],
    ["Capabilities", capabilities.join(", ") || null]
  ]
    .filter(([, value]) => value)
    .map(
      ([key, value]) =>
        `<div class="model-info-row"><span class="info-label">${escapeHtml(key)}</span><span class="info-value">${escapeHtml(value)}</span></div>`
    )
    .join("");

  el.detailsContent.innerHTML = `
    <div class="details-grid">
      <div class="model-info-block">
        <div class="model-info-name">${escapeHtml(payload.name)}</div>
        <div class="model-info-rows">${infoRows}</div>
      </div>

      <div class="fetch-section">
        <label>Auto-populate from Ollama Library</label>
        <div class="inline-form">
          <input id="libraryUrlInput" type="text" value="${escapeHtml(libraryUrl)}" placeholder="https://ollama.com/library/..." />
          <button id="fetchLibraryBtn" class="btn btn-small btn-primary">Fetch</button>
        </div>
        <p id="fetchStatus" class="hint">${escapeHtml(fetchStatus || metadata.libraryFetchError || "")}</p>
      </div>

      <div>
        <label>Description</label>
        <textarea id="metaDescription" rows="3">${escapeHtml(metadata.description || "")}</textarea>
      </div>
      <div>
        <label>Best for (comma separated)</label>
        <input id="metaBestFor" type="text" value="${escapeHtml(bestForInput)}" />
      </div>
      <div>
        <label>Not ideal for (comma separated)</label>
        <input id="metaNotIdealFor" type="text" value="${escapeHtml(notIdealInput)}" />
      </div>
      <div>
        <label>Notes</label>
        <textarea id="metaNotes" rows="3">${escapeHtml(metadata.notes || "")}</textarea>
      </div>
      <div>
        <label>Extra tips</label>
        <textarea id="metaTips" rows="3">${escapeHtml(metadata.extraTips || "")}</textarea>
      </div>
      <div class="actions-row">
        <button id="saveMetadataBtn" class="btn btn-primary">Save</button>
      </div>
    </div>
  `;

  document.getElementById("fetchLibraryBtn").addEventListener("click", async () => {
    const url = document.getElementById("libraryUrlInput").value.trim();
    const statusEl = document.getElementById("fetchStatus");
    statusEl.textContent = "Fetching...";

    try {
      const result = await apiPost(`/api/models/${encodeURIComponent(payload.name)}/enrich`, { url });
      const nextPayload = result.model || payload;

      let msg = "Fields populated from library. Edit as needed, then Save.";
      if (Array.isArray(nextPayload.metadata?.availableTags) && nextPayload.metadata.availableTags.length > 0) {
        msg += ` Available tags: ${nextPayload.metadata.availableTags.slice(0, 8).join(", ")}.`;
      }

      await loadModels();
      renderDetails(nextPayload, { fetchStatus: msg });
      log(`Fetched library metadata for ${payload.name}.`);
    } catch (error) {
      statusEl.textContent = "Fetch failed: " + error.message;
      log("Library fetch error: " + error.message);
    }
  });

  document.getElementById("saveMetadataBtn").addEventListener("click", async () => {
    const description = document.getElementById("metaDescription").value.trim();
    const bestFor = parseCommaList(document.getElementById("metaBestFor").value);
    const notIdealFor = parseCommaList(document.getElementById("metaNotIdealFor").value);
    const notes = document.getElementById("metaNotes").value.trim();
    const extraTips = document.getElementById("metaTips").value.trim();

    await runAction(`Saving metadata for ${payload.name}...`, async () => {
      await apiPatch(`/api/models/${encodeURIComponent(payload.name)}/notes`, {
        description,
        bestFor,
        notIdealFor,
        notes,
        extraTips
      });

      log(`Saved notes for ${payload.name}.`);
      await loadModels({ refreshSelected: false });
    });

    await showDetails(payload.name);
  });
}

async function loadGpuStatus(forceRefresh) {
  try {
    const payload = await apiGet("/api/system/gpu-status");
    state.gpuStatus = payload;
    renderGpuStatus();
  } catch (error) {
    state.gpuStatus = {
      gpuAvailable: false,
      devices: [],
      error: error.message
    };
    renderGpuStatus();
  }
}

function renderGpuStatus() {
  const status = state.gpuStatus;
  if (!status) {
    el.gpuPanel.innerHTML = "<p class='hint'>No GPU data yet.</p>";
    el.gpuStatusPill.className = "pill pill-muted";
    el.gpuStatusPill.textContent = "GPU unknown";
    return;
  }

  if (!status.gpuAvailable) {
    el.gpuPanel.innerHTML = `<p class='hint'>${escapeHtml(status.error || "No NVIDIA GPU available.")}</p>`;
    el.gpuStatusPill.className = "pill pill-bad";
    el.gpuStatusPill.textContent = "GPU unavailable";
    return;
  }

  el.gpuStatusPill.className = "pill pill-good";
  el.gpuStatusPill.textContent = `GPU online (${status.devices.length})`;

  el.gpuPanel.innerHTML = status.devices
    .map((device) => {
      const memoryPercent = device.memory.totalMb
        ? Math.round((device.memory.usedMb / device.memory.totalMb) * 100)
        : 0;
      return `
        <article class="gpu-card">
          <h3>${escapeHtml(device.name)} (#${escapeHtml(device.index)})</h3>
          <div class="gpu-metrics">
            <div>Driver: ${escapeHtml(device.driverVersion || "unknown")}</div>
            <div>GPU Util: ${escapeHtml(device.utilization.gpuPercent)}%</div>
            <div>Mem Util: ${escapeHtml(device.utilization.memoryPercent)}%</div>
            <div>Temp: ${escapeHtml(device.temperatureC)} C</div>
            <div>VRAM: ${escapeHtml(device.memory.usedMb)} / ${escapeHtml(device.memory.totalMb)} MB (${memoryPercent}%)</div>
          </div>
          <div class="gpu-bar"><span style="width:${memoryPercent}%"></span></div>
        </article>
      `;
    })
    .join("");
}

function startGpuLive() {
  if (state.gpuPollTimer) {
    return;
  }

  state.gpuLive = true;
  el.toggleGpuLiveBtn.textContent = "Stop Live";
  state.gpuPollTimer = setInterval(() => {
    loadGpuStatus(false);
  }, state.gpuPollIntervalMs);
  log(`Started GPU live monitoring (${state.gpuPollIntervalMs} ms interval).`);
}

function stopGpuLive() {
  state.gpuLive = false;
  el.toggleGpuLiveBtn.textContent = "Start Live";
  if (state.gpuPollTimer) {
    clearInterval(state.gpuPollTimer);
    state.gpuPollTimer = null;
  }
  log("Stopped GPU live monitoring.");
}

async function pullModel(name) {
  await runAction(`Updating ${name}...`, async () => {
    const result = await apiPost("/api/models/pull", { name });
    log(`Updated model ${name}.`);
    state.selectedModel = result.model?.name || name;
    await loadModels({ refreshSelected: false });
    await loadRecommendations();
  });

  await showDetails(state.selectedModel || name);
}

async function deleteModel(name) {
  const confirmed = confirm(`Delete model ${name}? This cannot be undone.`);
  if (!confirmed) {
    return;
  }

  await runAction(`Deleting ${name}...`, async () => {
    await apiDelete(`/api/models/${encodeURIComponent(name)}`);
    log(`Deleted model ${name}.`);
    if (state.selectedModel === name) {
      state.selectedModel = null;
      el.detailsContent.textContent = "No model selected.";
    }
    await loadModels();
    await loadRecommendations();
  });
}

async function runAction(message, action, options = {}) {
  if (state.busy) {
    log("Another action is running. Please wait.");
    return;
  }

  state.busy = true;
  setButtonsDisabled(true);
  log(message);

  try {
    await action();
    if (!options.silentSuccess) {
      log("Done.");
    }
  } catch (error) {
    log("Error: " + error.message);
  } finally {
    state.busy = false;
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(disabled) {
  document.querySelectorAll("button").forEach((button) => {
    button.disabled = disabled;
  });
}

function parseCommaList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function log(message) {
  const time = new Date().toLocaleTimeString();
  el.activityLog.textContent = `[${time}] ${message}\n` + el.activityLog.textContent;
}

function formatBytes(bytes) {
  if (!bytes) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unit]}`;
}

async function apiGet(url) {
  const response = await fetch(url);
  return handleResponse(response);
}

async function apiPost(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return handleResponse(response);
}

async function apiPatch(url, body) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return handleResponse(response);
}

async function apiDelete(url) {
  const response = await fetch(url, {
    method: "DELETE"
  });
  return handleResponse(response);
}

async function handleResponse(response) {
  const text = await response.text();
  const data = text ? tryParseJson(text) : {};

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed (${response.status})`);
  }

  return data;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
