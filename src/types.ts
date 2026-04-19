export interface CommandResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RawDetailsSummary {
  family?: string;
  families?: string[];
  parameterSize?: string;
  quantizationLevel?: string;
  format?: string;
  capabilities?: string[];
}

export interface ModelMetadata {
  description?: string;
  notes?: string;
  bestFor?: string[];
  notIdealFor?: string[];
  extraTips?: string;
  libraryUrl?: string;
  libraryFetchedAt?: string;
  libraryFetchError?: string;
  availableTags?: string[];
  rawDetails?: RawDetailsSummary;
  rawDetailsFetchedAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ModelSummary {
  name: string;
  size: number;
  modifiedAt: string;
  digest: string;
  details: Record<string, unknown>;
  metadata?: ModelMetadata;
  suggestionTier?: string;
  lifecycle?: ModelLifecycleRecord;
  variantSummary?: ModelVariantSummary;
}

export type ModelLifecycleState =
  | "unknown"
  | "queued"
  | "pulling"
  | "building"
  | "ready"
  | "failed"
  | "deleting";

export interface ModelPullProgress {
  status: string;
  completed: number;
  total: number;
  percent: number;
}

export interface ModelLifecycleRecord {
  name: string;
  key: string;
  state: ModelLifecycleState;
  lastError: string;
  progress: ModelPullProgress | null;
  lastPulledAt: string;
  lastDeletedAt: string;
  updatedAt: string;
}

export interface ModelVariantSummary {
  base: string;
  tag: string;
  availableTags: string[];
}

export interface RunningModelSummary {
  name: string;
  size: number;
  digest: string;
  processor: string;
  expiresAt: string;
  details: Record<string, unknown>;
}

export type ModelHistoryAction =
  | "pull-started"
  | "pull-succeeded"
  | "pull-failed"
  | "create-started"
  | "create-succeeded"
  | "create-failed"
  | "delete-started"
  | "delete-succeeded"
  | "delete-failed"
  | "metadata-enriched"
  | "metadata-updated"
  | "batch-pull-started"
  | "batch-pull-completed";

export interface ModelHistoryEntry {
  id: string;
  name: string;
  key: string;
  action: ModelHistoryAction;
  message: string;
  ok: boolean;
  at: string;
  details?: Record<string, unknown>;
}

export interface ModelLifecycleSnapshot {
  schemaVersion: number;
  modelStates: Record<string, ModelLifecycleRecord>;
  updatedAt: string;
}

export interface ModelHistorySnapshot {
  schemaVersion: number;
  events: ModelHistoryEntry[];
  updatedAt: string;
}

export interface GpuDevice {
  index: number;
  name: string;
  driverVersion: string;
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
  };
  utilization: {
    gpuPercent: number;
    memoryPercent: number;
  };
  temperatureC: number;
}

export interface GpuStatus {
  ok: boolean;
  gpuAvailable: boolean;
  devices: GpuDevice[];
  timestamp: string;
  error: string;
}

export interface SystemCapabilities {
  provider: "nvidia-cuda" | "cpu";
  cudaAvailable: boolean;
  gpuAvailable: boolean;
  gpuCount: number;
  driverVersion: string;
  flashAttentionSupported: boolean;
  kvCacheStrategy: "adaptive" | "f16";
  checkedAt: string;
  error: string;
}

export type KvCacheMode = "adaptive" | "q8_0" | "f16";
export type FlashAttentionMode = "auto" | "on" | "off";
export type CpuSuggestionMode = "dual" | "strict" | "warn-all";

export interface OptimizationUserPreferences {
  kvCacheMode: KvCacheMode;
  flashAttentionMode: FlashAttentionMode;
  gpuPanelLiveDefault: boolean;
  gpuPanelIntervalMs: number;
  cpuSuggestionMode: CpuSuggestionMode;
}

export interface OptimizationConfig {
  schemaVersion: number;
  userPreferences: OptimizationUserPreferences;
  systemProfile: Record<string, unknown>;
  modelOverrides: Record<string, unknown>;
  updatedAt: string;
}
