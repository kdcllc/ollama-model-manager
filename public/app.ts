// @ts-nocheck

const state = {
  models: [],
  modelSearchIndex: [],
  selectedModel: null,
  busy: false,
  capabilities: null,
  recommendations: null,
  optimizationConfig: null,
  gpuStatus: null,
  gpuLive: false,
  gpuPollIntervalMs: 5000,
  gpuPollTimer: null,
  searchDebounceTimer: null,
  uiQuery: "",
  uiSort: "updated-desc",
  uiViewMode: "cards",
  uiTierFilter: "all",
  uiBestForFilter: "",
  modelRenderExpanded: false,
  modelRenderLimit: 180
};

const el = {
  healthBadge: document.getElementById("healthBadge"),
  refreshBtn: document.getElementById("refreshBtn"),
  updateOllamaBtn: document.getElementById("updateOllamaBtn"),
  pullForm: document.getElementById("pullForm"),
  pullName: document.getElementById("pullName"),
  createForm: document.getElementById("createForm"),
  createName: document.getElementById("createName"),
  createModelfile: document.getElementById("createModelfile"),
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
  gpuPanel: document.getElementById("gpuPanel"),
  modelSearchInput: document.getElementById("modelSearchInput"),
  clearModelSearchBtn: document.getElementById("clearModelSearchBtn"),
  modelSortSelect: document.getElementById("modelSortSelect"),
  viewCardsBtn: document.getElementById("viewCardsBtn"),
  viewListBtn: document.getElementById("viewListBtn"),
  modelFilterChips: document.getElementById("modelFilterChips"),
  modelsSummary: document.getElementById("modelsSummary")
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
    const openDialog = window.openSudoPasswordDialog;
    let sudoPassword: string | null = null;
    if (typeof openDialog === "function") {
      sudoPassword = await openDialog();
      if (sudoPassword === null) {
        log("Ollama update canceled.");
        return;
      }
    }

    await runAction("Updating Ollama runtime...", async () => {
      const body: Record<string, unknown> = { confirm: true };
      if (sudoPassword !== null) {
        body.sudoPassword = sudoPassword;
      }
      const result = await apiPost("/api/system/update-ollama", body);
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

  if (el.createForm) {
    el.createForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = String(el.createName?.value || "").trim();
      const modelfile = String(el.createModelfile?.value || "").trim();

      if (!name || !modelfile) {
        log("Custom model name and Modelfile are required.");
        return;
      }

      await runAction(`Creating custom model ${name}...`, async () => {
        const result = await apiPost("/api/models/create", { name, modelfile });
        log(`Custom model build finished for ${name}.`);
        state.selectedModel = result.model?.name || name;
        await loadModels({ refreshSelected: false });
        await loadRecommendations();
      });

      await showDetails(state.selectedModel || name);
    });
  }

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

  if (el.modelSearchInput) {
    el.modelSearchInput.addEventListener("input", (event) => {
      const nextValue = String(event.target?.value || "").trim();
      if (nextValue === state.uiQuery) {
        return;
      }

      state.uiQuery = nextValue;
      state.modelRenderExpanded = false;
      if (state.searchDebounceTimer) {
        clearTimeout(state.searchDebounceTimer);
      }

      state.searchDebounceTimer = setTimeout(() => {
        updateModelsDisplay();
      }, 150);
    });

    el.modelSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (el.modelSearchInput.value) {
          el.modelSearchInput.value = "";
        }
        state.uiQuery = "";
        state.modelRenderExpanded = false;
        updateModelsDisplay();
      }
    });
  }

  if (el.clearModelSearchBtn) {
    el.clearModelSearchBtn.addEventListener("click", () => {
      if (el.modelSearchInput) {
        el.modelSearchInput.value = "";
      }
      state.uiQuery = "";
      state.uiBestForFilter = "";
      state.uiTierFilter = "all";
      state.modelRenderExpanded = false;
      updateModelsDisplay();
    });
  }

  if (el.modelSortSelect) {
    el.modelSortSelect.addEventListener("change", (event) => {
      state.uiSort = String(event.target?.value || "updated-desc");
      state.modelRenderExpanded = false;
      updateModelsDisplay();
    });
  }

  if (el.viewCardsBtn) {
    el.viewCardsBtn.addEventListener("click", () => {
      if (state.uiViewMode === "cards") {
        return;
      }
      state.uiViewMode = "cards";
      syncViewModeButtons();
      updateModelsDisplay();
    });
  }

  if (el.viewListBtn) {
    el.viewListBtn.addEventListener("click", () => {
      if (state.uiViewMode === "list") {
        return;
      }
      state.uiViewMode = "list";
      syncViewModeButtons();
      updateModelsDisplay();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "/") {
      return;
    }

    const target = event.target;
    const isTypingSurface =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable;

    if (isTypingSurface || !el.modelSearchInput) {
      return;
    }

    event.preventDefault();
    el.modelSearchInput.focus();
    el.modelSearchInput.select();
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
    state.modelSearchIndex = state.models.map((model, index) => ({
      model,
      index,
      searchText: normalizeModelSearchText(model)
    }));
    state.capabilities = payload.capabilities || state.capabilities;
    updateModelsDisplay();

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

function syncViewModeButtons() {
  if (!el.viewCardsBtn || !el.viewListBtn) {
    return;
  }

  const cardsActive = state.uiViewMode === "cards";
  el.viewCardsBtn.classList.toggle("btn-primary", cardsActive);
  el.viewListBtn.classList.toggle("btn-primary", !cardsActive);
}

function normalizeModelSearchText(model) {
  const metadata = model.metadata || {};
  const bestFor = Array.isArray(metadata.bestFor) ? metadata.bestFor.join(" ") : "";
  const notIdealFor = Array.isArray(metadata.notIdealFor) ? metadata.notIdealFor.join(" ") : "";

  return [
    model.name,
    metadata.description,
    bestFor,
    notIdealFor,
    model.suggestionTier,
    formatBytes(model.size || 0)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function applyModelFilters(indexedModels) {
  const query = state.uiQuery.toLowerCase();

  return indexedModels.filter((entry) => {
    const model = entry.model;

    if (query && !entry.searchText.includes(query)) {
      return false;
    }

    if (state.uiTierFilter !== "all") {
      const tier = String(model.suggestionTier || "").toLowerCase();
      if (state.uiTierFilter === "recommended" && !tier.startsWith("recommended")) {
        return false;
      }
      if (state.uiTierFilter === "advanced" && !tier.startsWith("advanced")) {
        return false;
      }
      if (state.uiTierFilter === "gpu" && !tier.includes("gpu")) {
        return false;
      }
      if (state.uiTierFilter === "cpu" && !tier.includes("cpu")) {
        return false;
      }
    }

    if (state.uiBestForFilter) {
      const bestFor = Array.isArray(model.metadata?.bestFor) ? model.metadata.bestFor : [];
      if (!bestFor.includes(state.uiBestForFilter)) {
        return false;
      }
    }

    return true;
  });
}

function applyModelSort(filteredEntries) {
  const sorted = [...filteredEntries];

  sorted.sort((left, right) => {
    const l = left.model;
    const r = right.model;

    if (state.uiSort === "name-asc") {
      const value = String(l.name || "").localeCompare(String(r.name || ""));
      return value || left.index - right.index;
    }

    if (state.uiSort === "size-desc") {
      const value = (r.size || 0) - (l.size || 0);
      return value || left.index - right.index;
    }

    if (state.uiSort === "size-asc") {
      const value = (l.size || 0) - (r.size || 0);
      return value || left.index - right.index;
    }

    const leftUpdated = l.modifiedAt ? new Date(l.modifiedAt).getTime() : 0;
    const rightUpdated = r.modifiedAt ? new Date(r.modifiedAt).getTime() : 0;
    const value = rightUpdated - leftUpdated;
    return value || left.index - right.index;
  });

  return sorted;
}

function groupModels(models) {
  const groups = {
    recommended: [],
    advanced: [],
    other: []
  };

  for (const model of models) {
    const tier = String(model.suggestionTier || "").toLowerCase();
    if (tier.startsWith("recommended")) {
      groups.recommended.push(model);
      continue;
    }
    if (tier.startsWith("advanced")) {
      groups.advanced.push(model);
      continue;
    }
    groups.other.push(model);
  }

  return groups;
}

function getTopBestForTags(limit = 8) {
  const counts = new Map();
  for (const model of state.models) {
    const tags = Array.isArray(model.metadata?.bestFor) ? model.metadata.bestFor : [];
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

function renderFilterChips() {
  if (!el.modelFilterChips) {
    return;
  }

  const topTags = getTopBestForTags();
  const chips = [
    { label: "All tiers", type: "tier", value: "all" },
    { label: "Recommended", type: "tier", value: "recommended" },
    { label: "Advanced", type: "tier", value: "advanced" },
    { label: "GPU", type: "tier", value: "gpu" },
    { label: "CPU", type: "tier", value: "cpu" },
    ...topTags.map((tag) => ({ label: tag, type: "bestFor", value: tag }))
  ];

  el.modelFilterChips.innerHTML = chips
    .map((chip) => {
      const active =
        (chip.type === "tier" && state.uiTierFilter === chip.value) ||
        (chip.type === "bestFor" && state.uiBestForFilter === chip.value);

      return `<button class="chip${active ? " chip-active" : ""}" data-chip-type="${escapeHtml(chip.type)}" data-chip-value="${escapeHtml(chip.value)}" type="button">${escapeHtml(chip.label)}</button>`;
    })
    .join("");

  el.modelFilterChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const chipType = chip.getAttribute("data-chip-type") || "";
      const chipValue = chip.getAttribute("data-chip-value") || "";

      if (chipType === "tier") {
        state.uiTierFilter = state.uiTierFilter === chipValue ? "all" : chipValue;
      } else if (chipType === "bestFor") {
        state.uiBestForFilter = state.uiBestForFilter === chipValue ? "" : chipValue;
      }

      state.modelRenderExpanded = false;
      updateModelsDisplay();
    });
  });
}

function renderModelsSummary(totalCount, matchedCount, shownCount) {
  if (!el.modelsSummary) {
    return;
  }

  const filters = [];
  if (state.uiQuery) {
    filters.push(`query: "${state.uiQuery}"`);
  }
  if (state.uiTierFilter !== "all") {
    filters.push(`tier: ${state.uiTierFilter}`);
  }
  if (state.uiBestForFilter) {
    filters.push(`tag: ${state.uiBestForFilter}`);
  }

  const pieces = [
    `${matchedCount} of ${totalCount} models`,
    filters.length ? `Filters: ${filters.join(" | ")}` : ""
  ].filter(Boolean);

  if (shownCount < matchedCount) {
    pieces.push(`Showing first ${shownCount}`);
  }

  const html = [`<span>${escapeHtml(pieces.join(". "))}</span>`];
  if (shownCount < matchedCount) {
    html.push(
      `<button id="loadMoreModelsBtn" class="btn btn-small" type="button">Load all ${matchedCount} results</button>`
    );
  }

  el.modelsSummary.innerHTML = html.join(" ");

  const loadMoreBtn = document.getElementById("loadMoreModelsBtn");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      state.modelRenderExpanded = true;
      updateModelsDisplay();
    });
  }
}

function createModelCardNode(model) {
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
    card.classList.add("card-selected");
  }

  return fragment;
}

function createModelRowNode(model) {
  const row = document.createElement("article");
  row.className = "model-row";
  if (state.selectedModel === model.name) {
    row.classList.add("model-row-selected");
  }

  const bestFor = Array.isArray(model.metadata?.bestFor) ? model.metadata.bestFor.slice(0, 2) : [];
  const tagsHtml = bestFor.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(" ");
  const tierHtml = model.suggestionTier
    ? `<span class="tag tag-tier">${escapeHtml(model.suggestionTier)}</span>`
    : "";

  row.innerHTML = `
    <div class="model-row-main">
      <div class="model-row-title">${escapeHtml(model.name)}</div>
      <div class="model-row-meta">
        <span>${escapeHtml(formatBytes(model.size || 0))}</span>
        <span>${escapeHtml(model.modifiedAt ? new Date(model.modifiedAt).toLocaleString() : "unknown update")}</span>
      </div>
      <div class="tags-row">${tagsHtml} ${tierHtml}</div>
    </div>
    <div class="actions-row">
      <button class="btn btn-small view-btn">Details</button>
      <button class="btn btn-small btn-primary pull-btn">Update</button>
      <button class="btn btn-small btn-danger delete-btn">Delete</button>
    </div>
  `;

  row.querySelector(".view-btn").addEventListener("click", () => showDetails(model.name));
  row.querySelector(".pull-btn").addEventListener("click", () => pullModel(model.name));
  row.querySelector(".delete-btn").addEventListener("click", () => deleteModel(model.name));

  return row;
}

function renderModelGroup(container, label, models) {
  if (!models.length) {
    return;
  }

  const section = document.createElement("section");
  section.className = "model-group";
  section.innerHTML = `<div class="model-group-head"><h3>${escapeHtml(label)}</h3><span class="hint">${models.length}</span></div>`;

  const items = document.createElement("div");
  items.className = state.uiViewMode === "cards" ? "cards" : "model-list";

  for (const model of models) {
    if (state.uiViewMode === "cards") {
      items.appendChild(createModelCardNode(model));
    } else {
      items.appendChild(createModelRowNode(model));
    }
  }

  section.appendChild(items);
  container.appendChild(section);
}

function updateModelsDisplay() {
  syncViewModeButtons();
  renderFilterChips();

  el.modelsGrid.innerHTML = "";

  if (!state.models.length) {
    renderModelsSummary(0, 0, 0);
    el.modelsGrid.innerHTML =
      "<p class='hint'>No installed models found. Pull one above to get started.</p>";
    return;
  }

  const filteredEntries = applyModelFilters(state.modelSearchIndex);
  const sortedEntries = applyModelSort(filteredEntries);

  const matchedCount = sortedEntries.length;
  const totalCount = state.models.length;
  const shouldLimit = matchedCount > state.modelRenderLimit && !state.modelRenderExpanded;
  const visibleEntries = shouldLimit
    ? sortedEntries.slice(0, state.modelRenderLimit)
    : sortedEntries;
  const visibleModels = visibleEntries.map((entry) => entry.model);

  renderModelsSummary(totalCount, matchedCount, visibleModels.length);

  if (!visibleModels.length) {
    el.modelsGrid.innerHTML =
      "<p class='hint'>No matches found. Try a broader search or clear active filters.</p>";
    return;
  }

  const grouped = groupModels(visibleModels);
  renderModelGroup(el.modelsGrid, "Recommended", grouped.recommended);
  renderModelGroup(el.modelsGrid, "Advanced", grouped.advanced);
  renderModelGroup(el.modelsGrid, "Other", grouped.other);
}

function renderModels() {
  updateModelsDisplay();
}

async function showDetails(name) {
  state.selectedModel = name;
  updateModelsDisplay();

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

    const payload = error?.payload;
    if (payload && typeof payload === "object") {
      if (payload.exitCode !== undefined) {
        log("exitCode: " + String(payload.exitCode));
      }
      if (payload.command) {
        log("command: " + String(payload.command));
      }
      if (payload.stdout) {
        log("stdout:\n" + String(payload.stdout));
      }
      if (payload.stderr) {
        log("stderr:\n" + String(payload.stderr));
      }
    }
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
    const detail =
      data?.error ||
      data?.message ||
      data?.stderr ||
      (typeof data?.raw === "string" ? data.raw : "");

    const error = new Error(detail ? `${detail} (HTTP ${response.status})` : `Request failed (HTTP ${response.status})`);
    error.status = response.status;
    error.payload = data;
    throw error;
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
