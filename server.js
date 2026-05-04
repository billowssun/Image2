import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8 * 1024 * 1024) {
      throw new Error("Request body is too large.");
    }
  }
  return JSON.parse(body || "{}");
}

function normalizeBaseUrl(value) {
  const raw = String(value || "https://api.openai.com/v1").trim();
  const url = new URL(raw);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function buildImagePayload(input) {
  const payload = {
    model: input.model || "gpt-image-2",
    prompt: input.prompt,
    n: Number(input.count || 1),
    size: input.size || "1024x1024",
    quality: input.quality || "auto",
    output_format: input.outputFormat || "png"
  };

  return payload;
}

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Reference image must be a base64 data URL.");
  }

  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

async function proxyGenerate(req, res) {
  try {
    const input = await readJson(req);
    const apiKey = String(input.apiKey || "").trim();
    const prompt = String(input.prompt || "").trim();

    if (!apiKey) {
      return sendJson(res, 400, { error: "请先填写 API Key。" });
    }

    if (!prompt) {
      return sendJson(res, 400, { error: "请先填写图片提示词。" });
    }

    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const references = Array.isArray(input.referenceImages) ? input.referenceImages.slice(0, 16) : [];
    const endpoint = `${baseUrl}${references.length ? "/images/edits" : "/images/generations"}`;
    const payload = buildImagePayload({ ...input, prompt });

    if (references.length) {
      const form = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        form.append(key, String(value));
      });

      references.forEach((item, index) => {
        const image = parseDataUrl(item.dataUrl);
        const blob = new Blob([image.buffer], { type: image.mime });
        form.append("image", blob, item.name || `reference-${index + 1}.png`);
      });

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${apiKey}`
        },
        body: form
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text || response.statusText };
      }

      if (!response.ok) {
        return sendJson(res, response.status, {
          error: data?.error?.message || data?.error || response.statusText,
          detail: data
        });
      }

      return sendJson(res, 200, { request: { ...payload, reference_images: references.length }, response: data });
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text || response.statusText };
    }

    if (!response.ok) {
      return sendJson(res, response.status, {
        error: data?.error?.message || data?.error || response.statusText,
        detail: data
      });
    }

    return sendJson(res, 200, { request: payload, response: data });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "生成请求失败。" });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(publicDir, pathname));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/generate") {
    proxyGenerate(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
}).listen(port, () => {
  console.log(`OpenAI Image2 Workbench running at http://localhost:${port}`);
});
