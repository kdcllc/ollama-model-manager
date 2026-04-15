class OllamaError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "OllamaError";
    this.status = status;
    this.details = details;
  }
}

class OllamaClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async listModels() {
    const payload = await this.#request("/api/tags", { method: "GET" });
    const models = Array.isArray(payload.models) ? payload.models : [];

    return models.map((model) => ({
      name: model.name,
      size: model.size,
      modifiedAt: model.modified_at,
      digest: model.digest,
      details: model.details || {}
    }));
  }

  async showModel(name) {
    return this.#request("/api/show", {
      method: "POST",
      body: { name }
    });
  }

  async pullModel(name) {
    return this.#request("/api/pull", {
      method: "POST",
      body: { name, stream: false }
    });
  }

  async deleteModel(name) {
    try {
      return await this.#request("/api/delete", {
        method: "DELETE",
        body: { name }
      });
    } catch (error) {
      if (error instanceof OllamaError && error.status === 404) {
        return this.#request(`/api/tags/${encodeURIComponent(name)}`, {
          method: "DELETE"
        });
      }
      throw error;
    }
  }

  async health() {
    try {
      await this.#request("/api/tags", { method: "GET" });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error.message,
        status: error.status || 500
      };
    }
  }

  async #request(endpoint, options) {
    const url = `${this.baseUrl}${endpoint}`;
    const fetchOptions = {
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
    } catch (error) {
      throw new OllamaError(
        `Unable to connect to Ollama at ${this.baseUrl}. Is the daemon running?`,
        503,
        error.message
      );
    }

    let text = "";
    try {
      text = await response.text();
    } catch (error) {
      throw new OllamaError("Failed to read response from Ollama.", response.status, error.message);
    }

    const data = text ? safeJsonParse(text) : {};

    if (!response.ok) {
      const message =
        (data && (data.error || data.message)) ||
        `Ollama request failed with status ${response.status}.`;
      throw new OllamaError(message, response.status, data);
    }

    return data;
  }
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return { raw: text };
  }
}

module.exports = {
  OllamaClient,
  OllamaError
};
