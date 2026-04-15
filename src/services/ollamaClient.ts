import { ModelSummary } from "../types";

interface OllamaRequestOptions {
  method: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
}

interface OllamaHealth {
  ok: boolean;
  error?: string;
  status?: number;
}

export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

export class OllamaClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async listModels(): Promise<ModelSummary[]> {
    const payload = await this.#request<Record<string, unknown>>("/api/tags", { method: "GET" });
    const models = Array.isArray(payload.models) ? payload.models : [];

    return models.map((model) => {
      const normalized = (model ?? {}) as Record<string, unknown>;
      return {
        name: String(normalized.name || ""),
        size: Number(normalized.size || 0),
        modifiedAt: String(normalized.modified_at || ""),
        digest: String(normalized.digest || ""),
        details: (normalized.details as Record<string, unknown>) || {}
      };
    });
  }

  async showModel(name: string): Promise<Record<string, unknown>> {
    return this.#request("/api/show", {
      method: "POST",
      body: { name }
    });
  }

  async pullModel(name: string): Promise<Record<string, unknown>> {
    return this.#request("/api/pull", {
      method: "POST",
      body: { name, stream: false }
    });
  }

  async deleteModel(name: string): Promise<Record<string, unknown>> {
    try {
      return await this.#request("/api/delete", {
        method: "DELETE",
        body: { name }
      });
    } catch (error: unknown) {
      if (error instanceof OllamaError && error.status === 404) {
        return this.#request(`/api/tags/${encodeURIComponent(name)}`, {
          method: "DELETE"
        });
      }
      throw error;
    }
  }

  async health(): Promise<OllamaHealth> {
    try {
      await this.#request("/api/tags", { method: "GET" });
      return { ok: true };
    } catch (error: unknown) {
      const status =
        error instanceof OllamaError ? error.status : 500;
      const message = error instanceof Error ? error.message : String(error);

      return {
        ok: false,
        error: message,
        status
      };
    }
  }

  async #request<T = Record<string, unknown>>(
    endpoint: string,
    options: OllamaRequestOptions
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const fetchOptions: RequestInit = {
      method: options.method,
      headers: {
        "Content-Type": "application/json"
      }
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OllamaError(
        `Unable to connect to Ollama at ${this.baseUrl}. Is the daemon running?`,
        503,
        message
      );
    }

    let text = "";
    try {
      text = await response.text();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OllamaError("Failed to read response from Ollama.", response.status, message);
    }

    const data = text ? safeJsonParse(text) : {};

    if (!response.ok) {
      const errorRecord = asRecord(data);
      const message =
        (errorRecord && (String(errorRecord.error || "") || String(errorRecord.message || ""))) ||
        `Ollama request failed with status ${response.status}.`;
      throw new OllamaError(message, response.status, data);
    }

    return data as T;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}
