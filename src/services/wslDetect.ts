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
 * Resolves the Windows host IP address from /etc/resolv.conf when running in WSL2.
 * In WSL2 NAT mode, the nameserver entry points to the Windows host.
 * Returns null if the IP cannot be determined or if it resolves to a loopback address
 * (which indicates WSL2 mirrored networking mode, where localhost already works).
 */
export function getWslWindowsHostIp(): string | null {
  try {
    const resolveConf = fs.readFileSync("/etc/resolv.conf", "utf-8");
    const match = resolveConf.match(/^nameserver\s+([\d.]+)/m);
    if (!match) {
      return null;
    }

    const ip = match[1];
    // In WSL2 mirrored networking mode, the nameserver is 127.0.0.1 (loopback),
    // meaning localhost already works transparently — no need to override.
    if (ip.startsWith("127.")) {
      return null;
    }

    return ip;
  } catch {
    return null;
  }
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
