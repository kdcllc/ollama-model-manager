const ALLOWED_HOST = "https://ollama.com/";
const FETCH_TIMEOUT_MS = 15000;

async function fetchLibraryData(url) {
  if (!url.startsWith(ALLOWED_HOST)) {
    throw new Error(
      "Only https://ollama.com/ URLs are supported for library lookups."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 ollama-model-manager/1.0"
      }
    });
  } catch (error) {
    const reason = error.name === "AbortError" ? "request timed out" : error.message;
    throw new Error(`Cannot reach ${url}: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status} for that URL.`);
  }

  const html = await response.text();
  return parsePage(html);
}

function parsePage(html) {
  const description = extractMetaDescription(html) || extractTextDescription(html);
  const { features, bestFor, notIdealFor } = extractFeatures(html, description);
  const availableTags = extractAvailableTags(html);

  const extraTips =
    features.length > 0
      ? "Key features:\n" + features.map((f) => `• ${f}`).join("\n")
      : "";

  return { description, bestFor, notIdealFor, extraTips, availableTags };
}

function extractMetaDescription(html) {
  const patterns = [
    /property=["']og:description["'][^>]+content=["']([^"']{20,})["']/i,
    /content=["']([^"']{20,})["'][^>]+property=["']og:description["']/i,
    /name=["']description["'][^>]+content=["']([^"']{20,})["']/i,
    /content=["']([^"']{20,})["'][^>]+name=["']description["']/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return decodeEntities(match[1]);
    }
  }

  return "";
}

function extractTextDescription(html) {
  const text = stripHtml(html);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.length > 50 && line.length < 350) {
      if (/\b(is|are|designed|built|optimized|trained|focused)\b/i.test(line)) {
        if (
          !line.startsWith("http") &&
          !/download|privacy|terms|contact|copyright/i.test(line)
        ) {
          return line;
        }
      }
    }
  }

  return "";
}

function extractFeatures(html, description) {
  const text = stripHtml(html);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const features = [];
  let inFeatures = false;

  for (const line of lines) {
    const lower = line.toLowerCase().replace(/^#{1,4}\s*/, "");

    if (lower === "features" || lower === "capabilities" || lower === "highlights") {
      inFeatures = true;
      continue;
    }

    if (inFeatures) {
      if (/^#{1,4}\s/.test(line) || (line.length < 30 && /^[A-Z]/.test(line) && features.length > 0)) {
        break;
      }

      const cleaned = line.replace(/^[•\-\*\u2022\u25e6\u2023]\s*/, "").trim();
      if (cleaned.length > 10 && cleaned.length < 300) {
        features.push(cleaned);
      }
    }
  }

  const bestFor = dedupeItems([
    ...features
    .filter((f) => {
      const colon = f.indexOf(":");
      return (colon > 0 && colon < 45) || (f.split(" ").length <= 6 && f.length <= 50);
    })
    .slice(0, 6)
    .map((f) => {
      const colon = f.indexOf(":");
      if (colon > 0 && colon < 45) {
        return f.substring(0, colon).trim();
      }
      return f.split(" ").slice(0, 4).join(" ");
    }),
    ...inferBestFor(description, features)
  ]).slice(0, 6);

  const notIdealFor = dedupeItems(inferNotIdealFor(description, features)).slice(0, 4);

  return { features, bestFor, notIdealFor };
}

function inferBestFor(description, features) {
  const text = [description || "", ...features].join(" ").toLowerCase();
  const inferred = [];

  pushWhen(inferred, /code|coding|programming|developer|refactor|bug fix/.test(text), "Code generation");
  pushWhen(inferred, /code reasoning|code fix|debug|refactor/.test(text), "Code explanation and debugging");
  pushWhen(inferred, /reasoning|analysis|logical|problem solving/.test(text), "Complex reasoning");
  pushWhen(inferred, /multilingual|multiple languages|translation/.test(text), "Multilingual chat");
  pushWhen(inferred, /embedding|retrieval|semantic search|similarity/.test(text), "Vector embeddings and retrieval");
  pushWhen(inferred, /tool use|tool calling|function calling|agent/.test(text), "Tool-augmented assistants");
  pushWhen(inferred, /low[- ]latency|lightweight|small|efficient|edge/.test(text), "Low-latency local assistant");
  pushWhen(inferred, /summar|draft|rewrite|content generation/.test(text), "Drafting and summarization");

  return inferred;
}

function inferNotIdealFor(description, features) {
  const text = [description || "", ...features].join(" ").toLowerCase();
  const inferred = [];

  pushWhen(inferred, /embedding|retrieval|semantic search|similarity/.test(text), "Direct chat responses");
  pushWhen(inferred, /embedding|retrieval|semantic search|similarity/.test(text), "Long-form text generation");
  pushWhen(inferred, /code|coding|programming|developer/.test(text), "General non-technical conversation");
  pushWhen(inferred, /reasoning|analysis|logical|deliberate/.test(text), "Ultra-fast short chat responses");
  pushWhen(inferred, /small|lightweight|edge|efficient/.test(text), "Large-context deep reasoning");

  return inferred;
}

function pushWhen(list, condition, value) {
  if (condition) {
    list.push(value);
  }
}

function dedupeItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of items || []) {
    const value = String(item || "").trim();
    if (!value) {
      continue;
    }

    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function extractAvailableTags(html) {
  const seen = new Set();
  const tags = [];

  const pattern = /href="\/[^"]*:([a-z0-9_.][a-z0-9_.\-]*)"/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const tag = match[1];
    if (!seen.has(tag) && tag.length < 60) {
      seen.add(tag);
      tags.push(tag);
    }
  }

  return tags;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, "\n");
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#0*34;/g, '"')
    .replace(/&#0*38;/g, "&")
    .replace(/&#0*60;/g, "<")
    .replace(/&#0*62;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#[0-9]+;/g, (m) => {
      const code = parseInt(m.slice(2, -1), 10);
      return String.fromCharCode(code);
    });
}

module.exports = { fetchLibraryData };
