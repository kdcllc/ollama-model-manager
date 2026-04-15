const { runCommandFile } = require("./commandRunner");

class SystemProbe {
  constructor({ timeoutMs = 3000, ttlMs = 30000 } = {}) {
    this.timeoutMs = timeoutMs;
    this.ttlMs = ttlMs;
    this.cache = null;
    this.lastCheckAt = 0;
  }

  async getCapabilities(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cache && now - this.lastCheckAt < this.ttlMs) {
      return this.cache;
    }

    const gpuStatus = await this.getGpuStatus(forceRefresh);
    const devices = Array.isArray(gpuStatus.devices) ? gpuStatus.devices : [];

    const capabilities = {
      provider: devices.length > 0 ? "nvidia-cuda" : "cpu",
      cudaAvailable: devices.length > 0,
      gpuAvailable: devices.length > 0,
      gpuCount: devices.length,
      driverVersion: devices[0]?.driverVersion || "",
      flashAttentionSupported: devices.length > 0,
      kvCacheStrategy: devices.length > 0 ? "adaptive" : "f16",
      checkedAt: new Date().toISOString(),
      error: gpuStatus.error || ""
    };

    this.cache = capabilities;
    this.lastCheckAt = now;
    return capabilities;
  }

  async getGpuStatus(forceRefresh = false) {
    if (!forceRefresh && this.gpuCache && Date.now() - this.gpuCacheAt < 4000) {
      return this.gpuCache;
    }

    const queryFields = [
      "index",
      "name",
      "driver_version",
      "memory.total",
      "memory.used",
      "memory.free",
      "utilization.gpu",
      "utilization.memory",
      "temperature.gpu"
    ];

    const result = await runCommandFile(
      "nvidia-smi",
      [
        `--query-gpu=${queryFields.join(",")}`,
        "--format=csv,noheader,nounits"
      ],
      this.timeoutMs
    );

    if (!result.ok) {
      const unavailable = {
        ok: true,
        gpuAvailable: false,
        devices: [],
        timestamp: new Date().toISOString(),
        error: "nvidia-smi not available or no NVIDIA GPU detected"
      };
      this.gpuCache = unavailable;
      this.gpuCacheAt = Date.now();
      return unavailable;
    }

    const devices = String(result.stdout || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseGpuCsvLine)
      .filter(Boolean);

    const payload = {
      ok: true,
      gpuAvailable: devices.length > 0,
      devices,
      timestamp: new Date().toISOString(),
      error: ""
    };

    this.gpuCache = payload;
    this.gpuCacheAt = Date.now();
    return payload;
  }
}

function parseGpuCsvLine(line) {
  const parts = String(line || "")
    .split(",")
    .map((value) => value.trim());

  if (parts.length < 9) {
    return null;
  }

  const [index, name, driverVersion, totalMb, usedMb, freeMb, gpuUtil, memUtil, temp] = parts;

  return {
    index: toNumber(index),
    name,
    driverVersion,
    memory: {
      totalMb: toNumber(totalMb),
      usedMb: toNumber(usedMb),
      freeMb: toNumber(freeMb)
    },
    utilization: {
      gpuPercent: toNumber(gpuUtil),
      memoryPercent: toNumber(memUtil)
    },
    temperatureC: toNumber(temp)
  };
}

function toNumber(value) {
  const parsed = Number(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

module.exports = {
  SystemProbe
};
