import fs from "fs";

export type OllamaBaseUrlResolutionMethod =
  | "non-wsl-localhost"
  | "wsl-localhost-default"
  | "wsl-windows-host-nameserver"
  | "wsl-windows-host-gateway"
  | "wsl-windows-host-fallback-localhost";

export interface OllamaBaseUrlResolution {
  url: string;
  wslOverride: boolean;
  wslDetected: boolean;
  method: OllamaBaseUrlResolutionMethod;
  reason?: string;
}

interface WslWindowsHostCandidate {
  ip: string;
  method: "nameserver" | "gateway";
}

export interface WslResolutionOptions {
  preferWindowsHostInWsl?: boolean;
}

/**
 * Checks whether the current process is running inside WSL (Windows Subsystem for Linux).
 * Detection uses the WSL_DISTRO_NAME environment variable (set in all WSL versions)
 * and /proc/version as a secondary check.
 */
export function isRunningInWsl(): boolean {
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    return true;
  }

  try {
    const procVersion = fs.readFileSync("/proc/version", "utf8");
    return /microsoft/i.test(procVersion);
  } catch {
    return false;
  }
}

/**
 * Resolves the Windows host IP address when running in WSL2 NAT mode.
 *
 * Strategy:
 * 1. Try /etc/resolv.conf nameserver — works in standard WSL2 NAT setups.
 * 2. Fall back to the default gateway from /proc/net/route — works when
 *    systemd-resolved is active (Ubuntu 22.04+ on WSL2), which sets the
 *    nameserver to 127.0.0.53 (a local stub) instead of the Windows host IP.
 *
 * Returns null when:
 * - Both sources return a loopback address (WSL2 mirrored networking mode,
 *   where localhost already routes transparently to Windows — no override needed).
 * - Neither source can be read.
 */
export function getWslWindowsHostIp(): WslWindowsHostCandidate | null {
  const nameserverIp = readNameserverIp();
  if (isValidWslWindowsHostIp(nameserverIp)) {
    return {
      ip: nameserverIp,
      method: "nameserver"
    };
  }

  // Nameserver is loopback (systemd-resolved stub or mirrored networking).
  // Try the default gateway from /proc/net/route as a fallback.
  const gatewayIp = readDefaultGatewayIp();
  if (isValidWslWindowsHostIp(gatewayIp)) {
    return {
      ip: gatewayIp,
      method: "gateway"
    };
  }

  // Both sources are loopback — WSL2 mirrored networking; localhost works fine.
  return null;
}

function isValidWslWindowsHostIp(ip: string | null): ip is string {
  if (!ip) {
    return false;
  }

  if (!isIpv4Address(ip)) {
    return false;
  }

  const octets = ip.split(".").map((value) => Number(value));
  const [first, second, third, fourth] = octets;

  if (first === 0) {
    return false;
  }

  if (first === 127) {
    return false;
  }

  // Link-local addresses are not useful as a stable Windows host target.
  if (first === 169 && second === 254) {
    return false;
  }

  // Multicast and reserved ranges are never valid Ollama host endpoints.
  if (first >= 224) {
    return false;
  }

  // Observed in WSL route tables when no usable host target exists.
  if (first === 10 && second === 255 && third === 255) {
    return false;
  }

  // Broadcast address.
  if (first === 255 && second === 255 && third === 255 && fourth === 255) {
    return false;
  }

  return true;
}

function isIpv4Address(value: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return false;
  }

  return value
    .split(".")
    .map((part) => Number(part))
    .every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}

/**
 * Reads the first nameserver from /etc/resolv.conf.
 * Returns null if the file cannot be read or contains no IPv4 nameserver.
 */
function readNameserverIp(): string | null {
  try {
    const resolveConf = fs.readFileSync("/etc/resolv.conf", "utf8");
    const match = resolveConf.match(/^nameserver\s+([\d.]+)/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Reads the default gateway IP from /proc/net/route.
 * The gateway for the default route (Destination = 00000000) is stored as a
 * little-endian 32-bit hex value. This source is reliable even when
 * systemd-resolved manages DNS and sets the nameserver to a local stub address.
 * Returns null if the file cannot be read or no default route is found.
 */
function readDefaultGatewayIp(): string | null {
  try {
    const routeTable = fs.readFileSync("/proc/net/route", "utf8");
    for (const line of routeTable.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      // /proc/net/route columns (0-indexed): 0=Iface, 1=Destination, 2=Gateway, 3=Flags, ...
      // Default route: Destination == "00000000", Gateway must be non-zero.
      if (cols.length >= 3 && cols[1] === "00000000" && cols[2] !== "00000000") {
        return hexLeToIp(cols[2]);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Converts a little-endian hex-encoded 32-bit IPv4 address (as used in
 * /proc/net/route) to a dotted-decimal string.
 * Example: "0101A8C0" → "192.168.1.1"
 */
function hexLeToIp(hex: string): string | null {
  if (!/^[0-9A-Fa-f]{8}$/.test(hex)) {
    return null;
  }
  const bytes = [
    parseInt(hex.slice(6, 8), 16),
    parseInt(hex.slice(4, 6), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(0, 2), 16)
  ];
  return bytes.join(".");
}

/**
 * Resolves the default Ollama base URL for the current environment.
 * When running in WSL2 NAT mode (without an explicit OLLAMA_BASE_URL env var),
 * it resolves the Windows host IP from /etc/resolv.conf so that Ollama running
 * on the Windows host is reachable from within WSL2.
 *
 * Returns the resolved URL string and a boolean indicating whether a WSL override was applied.
 */
export function resolveDefaultOllamaBaseUrl(
  options: WslResolutionOptions = {}
): OllamaBaseUrlResolution {
  const fallback = "http://127.0.0.1:11434";

  if (!isRunningInWsl()) {
    return {
      url: fallback,
      wslOverride: false,
      wslDetected: false,
      method: "non-wsl-localhost"
    };
  }

  if (!options.preferWindowsHostInWsl) {
    return {
      url: fallback,
      wslOverride: false,
      wslDetected: true,
      method: "wsl-localhost-default",
      reason:
        "WSL localhost mode is enabled by default. Set OLLAMA_WSL_USE_WINDOWS_HOST=true to try Windows host IP resolution."
    };
  }

  const windowsHostCandidate = getWslWindowsHostIp();
  if (!windowsHostCandidate) {
    return {
      url: fallback,
      wslOverride: false,
      wslDetected: true,
      method: "wsl-windows-host-fallback-localhost",
      reason: "No valid Windows host IP candidate was detected from nameserver or gateway sources."
    };
  }

  return {
    url: `http://${windowsHostCandidate.ip}:11434`,
    wslOverride: true,
    wslDetected: true,
    method:
      windowsHostCandidate.method === "nameserver"
        ? "wsl-windows-host-nameserver"
        : "wsl-windows-host-gateway"
  };
}
