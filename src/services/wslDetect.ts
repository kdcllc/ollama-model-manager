import fs from "fs";

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
    const procVersion = fs.readFileSync("/proc/version", "utf-8");
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
export function getWslWindowsHostIp(): string | null {
  const nameserverIp = readNameserverIp();
  if (nameserverIp && !nameserverIp.startsWith("127.")) {
    return nameserverIp;
  }

  // Nameserver is loopback (systemd-resolved stub or mirrored networking).
  // Try the default gateway from /proc/net/route as a fallback.
  const gatewayIp = readDefaultGatewayIp();
  if (gatewayIp && !gatewayIp.startsWith("127.")) {
    return gatewayIp;
  }

  // Both sources are loopback — WSL2 mirrored networking; localhost works fine.
  return null;
}

/**
 * Reads the first nameserver from /etc/resolv.conf.
 * Returns null if the file cannot be read or contains no IPv4 nameserver.
 */
function readNameserverIp(): string | null {
  try {
    const resolveConf = fs.readFileSync("/etc/resolv.conf", "utf-8");
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
    const routeTable = fs.readFileSync("/proc/net/route", "utf-8");
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
export function resolveDefaultOllamaBaseUrl(): { url: string; wslOverride: boolean } {
  const fallback = "http://127.0.0.1:11434";

  if (!isRunningInWsl()) {
    return { url: fallback, wslOverride: false };
  }

  const windowsHostIp = getWslWindowsHostIp();
  if (!windowsHostIp) {
    return { url: fallback, wslOverride: false };
  }

  return { url: `http://${windowsHostIp}:11434`, wslOverride: true };
}
