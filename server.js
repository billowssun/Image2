import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomUUID } from "node:crypto";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 4173);
const defaultBaseUrls = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  alibaba: process.env.ALIBABA_BASE_URL || "https://dashscope.aliyuncs.com",
  minimax: "https://api.minimax.io/v1",
  volcengine: "https://ark.cn-beijing.volces.com/api/v3",
  kling: "https://api.klingapi.com",
  xfyun: "wss://iat-api.xfyun.cn/v2/iat"
};

const PROVIDERS = { OPENAI: "openai", GEMINI: "gemini", ALIBABA: "alibaba", MINIMAX: "minimax", VOLCENGINE: "volcengine", KLING: "kling", XFYUN: "xfyun" };
const PROVIDER_NAMES = { [PROVIDERS.OPENAI]: "OpenAI", [PROVIDERS.GEMINI]: "Gemini", [PROVIDERS.ALIBABA]: "阿里云百炼", [PROVIDERS.MINIMAX]: "MiniMax", [PROVIDERS.VOLCENGINE]: "火山引擎", [PROVIDERS.KLING]: "可灵", [PROVIDERS.XFYUN]: "讯飞开放平台" };

const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LOG_THRESHOLD = Number(process.env.LOG_LEVEL) || LOG_LEVELS.debug;

function log(level, ...args) {
  if ((LOG_LEVELS[level] || 0) < LOG_THRESHOLD) return;
  const timestamp = new Date().toISOString();
  const write = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  write(`[${timestamp}] [${level}]`, ...args);
}

const FETCH_TIMEOUT = 120000;

async function safeFetch(url, options = {}) {
  const opts = { ...options };
  if (!opts.signal) opts.signal = AbortSignal.timeout(FETCH_TIMEOUT);
  return fetch(url, opts);
}

const rateWindowMs = 60000;
const rateMax = 120;
const rateStore = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  let record = rateStore.get(ip);
  if (!record || now - record.windowStart >= rateWindowMs) {
    record = { windowStart: now, count: 0 };
    rateStore.set(ip, record);
  }
  record.count++;
  return record.count <= rateMax;
}

setInterval(() => {
  const cutoff = Date.now() - rateWindowMs;
  for (const [ip, record] of rateStore) {
    if (record.windowStart < cutoff) rateStore.delete(ip);
  }
  if (rateStore.size > 20000) rateStore.clear();
}, 30000);

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
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin"
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.includes("application/json")) {
    throw Object.assign(new Error("请使用 JSON 格式请求。"), { status: 415 });
  }
  const contentLength = Number(req.headers["content-length"] || 0);
  const maxBodySize = 10 * 1024 * 1024;
  if (contentLength > maxBodySize) {
    throw Object.assign(new Error("Request body is too large."), { status: 413 });
  }
  const chunks = [];
  let totalLength = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    totalLength += chunk.length;
    if (totalLength > maxBodySize) {
      throw Object.assign(new Error("Request body is too large."), { status: 413 });
    }
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeBaseUrl(value, fallback = defaultBaseUrls.openai) {
  const raw = String(value || fallback).trim();
  const url = new URL(raw);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("File must be a base64 data URL.");
  }
  return {
    mime: match[1],
    data: match[2],
    buffer: Buffer.from(match[2], "base64")
  };
}

function auth(input, provider = input.provider || PROVIDERS.OPENAI) {
  const keySource = {
    [PROVIDERS.GEMINI]: input.geminiKey || input.apiKey,
    [PROVIDERS.ALIBABA]: input.alibabaKey || input.apiKey,
    [PROVIDERS.MINIMAX]: input.minimaxKey || input.apiKey,
    [PROVIDERS.VOLCENGINE]: input.volcengineKey || input.apiKey,
    [PROVIDERS.KLING]: input.klingKey || input.apiKey,
    [PROVIDERS.XFYUN]: input.xfyunKey || input.apiKey,
    [PROVIDERS.OPENAI]: input.openaiKey || input.apiKey
  };
  const apiKey = String(keySource[provider] || keySource[PROVIDERS.OPENAI] || "").trim();
  if (!apiKey) {
    throw new Error(`请先填写 ${PROVIDER_NAMES[provider] || "OpenAI"} API Key。`);
  }
  const baseSource = {
    [PROVIDERS.GEMINI]: input.geminiBaseUrl,
    [PROVIDERS.ALIBABA]: input.alibabaBaseUrl,
    [PROVIDERS.MINIMAX]: input.minimaxBaseUrl,
    [PROVIDERS.VOLCENGINE]: input.volcengineBaseUrl,
    [PROVIDERS.KLING]: input.klingBaseUrl,
    [PROVIDERS.XFYUN]: input.xfyunBaseUrl,
    [PROVIDERS.OPENAI]: input.baseUrl
  };
  return {
    provider,
    apiKey,
    baseUrl: normalizeBaseUrl(baseSource[provider], defaultBaseUrls[provider] || defaultBaseUrls.openai)
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || response.statusText };
  }
}

function apiError(data, response) {
  return data?.error?.message || data?.error || response.statusText || "请求失败";
}

function firstAvailable(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function makeDataUrlFromBase64(base64, mime) {
  return `data:${mime};base64,${String(base64 || "").replace(/^data:[^,]+,/, "")}`;
}

function signedXfyunUrl(rawUrl, apiKey, apiSecret) {
  const url = new URL(rawUrl);
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${url.host}\ndate: ${date}\nGET ${url.pathname} HTTP/1.1`;
  const signature = createHmac("sha256", apiSecret).update(signatureOrigin).digest("base64");
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  url.searchParams.set("authorization", Buffer.from(authorizationOrigin).toString("base64"));
  url.searchParams.set("date", date);
  url.searchParams.set("host", url.host);
  return url.toString();
}

function wsRequest(url, { onOpen, onMessage, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error("WebSocket 请求超时。"));
    }, timeoutMs);
    ws.addEventListener("open", () => {
      try { onOpen(ws); } catch (error) { reject(error); }
    });
    ws.addEventListener("message", (event) => {
      try {
        const done = onMessage(event.data, messages, ws);
        if (done) {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve(done);
        }
      } catch (error) {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        reject(error);
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WebSocket 连接失败。"));
    });
  });
}

function toModelOptions(ids) {
  return Array.from(new Set(ids.filter(Boolean))).map((id) => [id, id]);
}

function filterModels(provider, area, ids) {
  const list = ids.map((id) => String(id || "").replace(/^models\//, ""));
  if (provider === PROVIDERS.OPENAI) {
    if (area === "image") return list.filter((id) => /^(gpt-image|dall-e)/i.test(id));
    if (area === "video") return list.filter((id) => /^sora/i.test(id));
    if (area === "transcribe") return list.filter((id) => /(transcribe|whisper)/i.test(id));
    if (area === "speech") return list.filter((id) => /(tts|speech)/i.test(id));
    return list;
  }
  if (provider === PROVIDERS.GEMINI) {
    if (area === "image") return list.filter((id) => /image/i.test(id));
    if (area === "speech") return list.filter((id) => /tts/i.test(id));
    if (area === "transcribe") return list.filter((id) => /gemini/i.test(id) && !/image|tts/i.test(id));
    return list;
  }
  if (provider === PROVIDERS.ALIBABA) {
    if (area === "image") return list.filter((id) => /qwen.*image|wanx/i.test(id));
    return [];
  }
  if (provider === PROVIDERS.MINIMAX) {
    if (area === "image") return list.filter((id) => /image/i.test(id));
    if (area === "video") return list.filter((id) => /hailuo|video/i.test(id));
    if (area === "speech") return list.filter((id) => /(speech|tts|audio)/i.test(id));
    return [];
  }
  if (provider === PROVIDERS.VOLCENGINE) {
    if (area === "image") return list.filter((id) => /seedream|image/i.test(id));
    if (area === "video") return list.filter((id) => /seedance|video/i.test(id));
    if (area === "transcribe") return list.filter((id) => /asr|bigasr/i.test(id));
    if (area === "speech") return list.filter((id) => /tts|speech/i.test(id));
  }
  if (provider === PROVIDERS.KLING) return area === "video" ? list : [];
  if (provider === PROVIDERS.XFYUN) return list;
  return list;
}

function wavDataUrlFromPcm(base64Pcm, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const pcm = Buffer.from(base64Pcm, "base64");
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return `data:audio/wav;base64,${Buffer.concat([header, pcm]).toString("base64")}`;
}

function buildOpenAIImagePayload(input) {
  return {
    model: input.model || "gpt-image-2",
    prompt: input.prompt,
    n: Number(input.n || 1),
    size: input.size || "auto",
    quality: input.quality || "auto",
    output_format: input.output_format || "png",
    background: input.background || "auto",
    moderation: input.moderation || "auto"
  };
}

async function proxyJsonPost(authResult, endpoint, payload) {
  const { apiKey, baseUrl } = authResult;
  const response = await safeFetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await readJsonResponse(response);
  if (!response.ok) {
    const err = new Error(apiError(data, response));
    err.status = response.status;
    err.detail = data;
    throw err;
  }
  return data;
}

async function openAIImage(input, res) {
  const authResult = auth(input, PROVIDERS.OPENAI);
  const prompt = String(input.prompt || "").trim();
  if (!prompt) return sendJson(res, 400, { error: "请先填写图片提示词。" });

  const references = Array.isArray(input.referenceImages) ? input.referenceImages.slice(0, 16) : [];
  const endpoint = `${authResult.baseUrl}${references.length ? "/images/edits" : "/images/generations"}`;
  const payload = buildOpenAIImagePayload({ ...input, prompt });

  try {
    let data;
    if (references.length) {
      const form = new FormData();
      Object.entries(payload).forEach(([key, value]) => form.append(key, String(value)));
      references.forEach((item, index) => {
        const image = parseDataUrl(item.dataUrl);
        form.append(references.length > 1 ? "image[]" : "image", new Blob([image.buffer], { type: image.mime }), item.name || `reference-${index + 1}.png`);
      });
      const response = await safeFetch(endpoint, {
        method: "POST",
        headers: { "authorization": `Bearer ${authResult.apiKey}` },
        body: form
      });
      data = await readJsonResponse(response);
      if (!response.ok) throw Object.assign(new Error(apiError(data, response)), { status: response.status, detail: data });
    } else {
      data = await proxyJsonPost(authResult, references.length ? "/images/edits" : "/images/generations", payload);
    }

    return sendJson(res, 200, { request: payload, response: data });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message || "图片生成失败。", detail: error.detail });
  }
}

async function geminiGenerateContent(input, model, parts, generationConfig) {
  const { apiKey, baseUrl } = auth(input, PROVIDERS.GEMINI);
  const response = await safeFetch(`${baseUrl}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ parts }],
      ...(generationConfig ? { generationConfig } : {})
    })
  });
  const data = await readJsonResponse(response);
  if (!response.ok) {
    const error = new Error(apiError(data, response));
    error.status = response.status;
    error.detail = data;
    throw error;
  }
  return data;
}

async function geminiImage(input, res) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) return sendJson(res, 400, { error: "请先填写图片提示词。" });

  const parts = [{ text: prompt }];
  const references = Array.isArray(input.referenceImages) ? input.referenceImages.slice(0, 16) : [];
  references.forEach((item) => {
    const image = parseDataUrl(item.dataUrl);
    parts.push({ inlineData: { mimeType: image.mime, data: image.data } });
  });

  try {
    const data = await geminiGenerateContent(input, input.model || "gemini-3.1-flash-image-preview", parts);
    const images = [];
    const text = [];
    for (const part of data.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) images.push(part);
      if (part.text) text.push(part.text);
    }
    return sendJson(res, 200, {
      response: {
        provider: "gemini",
        text: text.join("\n"),
        images
      }
    });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message || "Gemini 图片请求失败。", detail: error.detail });
  }
}

function mapAlibabaImageSize(size) {
  const value = String(size || "auto");
  if (value === "auto") return "2048*2048";
  return value.replace("x", "*");
}

async function alibabaImage(input, res) {
  const { apiKey, baseUrl } = auth(input, PROVIDERS.ALIBABA);
  const prompt = String(input.prompt || "").trim();
  if (!prompt) return sendJson(res, 400, { error: "请先填写图片提示词。" });

  const payload = {
    model: input.model || "qwen-image-2.0-pro",
    input: {
      messages: [
        {
          role: "user",
          content: [{ text: prompt }]
        }
      ]
    },
    parameters: {
      size: mapAlibabaImageSize(input.size),
      n: Math.max(1, Math.min(6, Number(input.n || 1))),
      prompt_extend: true,
      watermark: false
    }
  };

  const response = await safeFetch(`${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data.code) return sendJson(res, response.ok && data.code ? 502 : response.status || 500, { error: data.message || apiError(data, response), detail: data });

  const images = [];
  for (const choice of data.output?.choices || []) {
    for (const part of choice.message?.content || []) {
      if (part.image) images.push(part.image);
    }
  }
  return sendJson(res, 200, {
    request: payload,
    response: {
      provider: "alibaba",
      images,
      raw: data
    }
  });
}

async function compatibleImage(input, provider, res) {
  const authResult = auth(input, provider);
  const prompt = String(input.prompt || "").trim();
  if (!prompt) return sendJson(res, 400, { error: "请先填写图片提示词。" });
  const payload = {
    model: input.model,
    prompt,
    n: Number(input.n || 1),
    size: input.size || "1024x1024",
    response_format: "b64_json"
  };
  const data = await proxyJsonPost(authResult, "/images/generations", payload);
  return sendJson(res, 200, { request: payload, response: data });
}

async function minimaxImage(input, res) {
  const { apiKey, baseUrl } = auth(input, PROVIDERS.MINIMAX);
  const prompt = String(input.prompt || "").trim();
  if (!prompt) return sendJson(res, 400, { error: "请先填写图片提示词。" });
  const payload = {
    model: input.model || "image-01",
    prompt,
    aspect_ratio: String(input.size || "1:1").includes("1536x1024") ? "3:2" : String(input.size || "").includes("1024x1536") ? "2:3" : "1:1",
    response_format: "base64",
    n: Math.max(1, Math.min(9, Number(input.n || 1)))
  };
  const response = await safeFetch(`${baseUrl}/image_generation`, {
    method: "POST",
    headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data.base_resp?.status_code) return sendJson(res, response.status || 500, { error: data.base_resp?.status_msg || apiError(data, response), detail: data });
  const list = data.data?.image_base64 || data.image_base64 || [];
  return sendJson(res, 200, {
    request: payload,
    response: { provider: "minimax", images: list.map((item) => ({ b64_json: item })), raw: data }
  });
}

async function proxyGenerate(req, res) {
  try {
    const input = await readJson(req);
    if ((input.provider || PROVIDERS.OPENAI) === PROVIDERS.GEMINI) return await geminiImage(input, res);
    if ((input.provider || PROVIDERS.OPENAI) === PROVIDERS.ALIBABA) return await alibabaImage(input, res);
    if ((input.provider || PROVIDERS.OPENAI) === PROVIDERS.MINIMAX) return await minimaxImage(input, res);
    if ((input.provider || PROVIDERS.OPENAI) === PROVIDERS.VOLCENGINE) return await compatibleImage(input, PROVIDERS.VOLCENGINE, res);
    return await openAIImage(input, res);
  } catch (error) {
    log("error", "generate", error.message);
    return sendJson(res, error.status || 500, { error: error.message || "图片请求失败。" });
  }
}

async function proxyVideo(req, res) {
  try {
    const input = await readJson(req);
    const provider = input.provider || PROVIDERS.OPENAI;
    const { apiKey, baseUrl } = auth(input, provider);
    const prompt = String(input.prompt || "").trim();
    if (!prompt) return sendJson(res, 400, { error: "请先填写视频提示词。" });

    if (provider === PROVIDERS.MINIMAX) {
      const payload = { model: input.model || "MiniMax-Hailuo-2.3", prompt, duration: Number(input.seconds || 5) };
      const response = await safeFetch(`${baseUrl}/video_generation`, {
        method: "POST",
        headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(response);
      if (!response.ok || data.base_resp?.status_code) return sendJson(res, response.status || 500, { error: data.base_resp?.status_msg || apiError(data, response), detail: data });
      return sendJson(res, 200, { response: data });
    }

    if (provider === PROVIDERS.KLING) {
      const payload = {
        model: input.model || "kling-v2.6-pro",
        prompt,
        duration: Number(input.seconds || 5),
        aspect_ratio: String(input.size || "1280x720").startsWith("720x") ? "9:16" : "16:9",
        mode: String(input.model || "").includes("pro") ? "professional" : "standard"
      };
      const response = await safeFetch(`${baseUrl}/v1/videos/text2video`, {
        method: "POST",
        headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(response);
      if (!response.ok) return sendJson(res, response.status, { error: apiError(data, response), detail: data });
      return sendJson(res, 200, { response: data });
    }

    if (provider === PROVIDERS.VOLCENGINE) {
      const payload = {
        model: input.model || "doubao-seedance-1-0-pro-fast-251015",
        prompt,
        size: input.size || "1280x720",
        duration: Number(input.seconds || 5)
      };
      const data = await proxyJsonPost({ apiKey, baseUrl }, "/video/generations", payload);
      return sendJson(res, 200, { response: data });
    }

    const form = new FormData();
    form.append("model", input.model || "sora-2");
    form.append("prompt", prompt);
    form.append("size", input.size || "1280x720");
    form.append("seconds", String(input.seconds || "4"));

    const response = await safeFetch(`${baseUrl}/videos`, {
      method: "POST",
      headers: { "authorization": `Bearer ${apiKey}` },
      body: form
    });
    const data = await readJsonResponse(response);
    if (!response.ok) return sendJson(res, response.status, { error: apiError(data, response), detail: data });
    return sendJson(res, 200, { response: data });
  } catch (error) {
    log("error", "video", error.message);
    return sendJson(res, error.status || 500, { error: error.message || "视频请求失败。" });
  }
}

async function proxyVideoStatus(req, res) {
  try {
    const input = await readJson(req);
    const provider = input.provider || PROVIDERS.OPENAI;
    const { apiKey, baseUrl } = auth(input, provider);
    const id = String(input.id || "").trim();
    if (!id) return sendJson(res, 400, { error: "请先提供视频任务 ID。" });

    if (provider === PROVIDERS.MINIMAX) {
      const response = await safeFetch(`${baseUrl}/query/video_generation?task_id=${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { "authorization": `Bearer ${apiKey}` }
      });
      const data = await readJsonResponse(response);
      if (!response.ok || data.base_resp?.status_code) return sendJson(res, response.status || 500, { error: data.base_resp?.status_msg || apiError(data, response), detail: data });
      return sendJson(res, 200, { response: data });
    }

    if (provider === PROVIDERS.KLING) {
      const response = await safeFetch(`${baseUrl}/v1/videos/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { "authorization": `Bearer ${apiKey}` }
      });
      const data = await readJsonResponse(response);
      if (!response.ok) return sendJson(res, response.status, { error: apiError(data, response), detail: data });
      return sendJson(res, 200, { response: data });
    }

    if (provider === PROVIDERS.VOLCENGINE) {
      const response = await safeFetch(`${baseUrl}/video/generations/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { "authorization": `Bearer ${apiKey}` }
      });
      const data = await readJsonResponse(response);
      if (!response.ok) return sendJson(res, response.status, { error: apiError(data, response), detail: data });
      return sendJson(res, 200, { response: data });
    }

    const response = await safeFetch(`${baseUrl}/videos/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { "authorization": `Bearer ${apiKey}` }
    });
    const data = await readJsonResponse(response);
    if (!response.ok) return sendJson(res, response.status, { error: apiError(data, response), detail: data });
    return sendJson(res, 200, { response: data });
  } catch (error) {
    log("error", "video-status", error.message);
    return sendJson(res, error.status || 500, { error: error.message || "视频任务查询失败。", detail: error.detail });
  }
}

async function proxyModels(req, res) {
  try {
    const input = await readJson(req);
    const provider = input.provider || PROVIDERS.OPENAI;
    const area = input.area || "image";
    const { apiKey, baseUrl } = auth(input, provider);
    let ids = [];

    if (provider === PROVIDERS.OPENAI) {
      const response = await safeFetch(`${baseUrl}/models`, {
        method: "GET",
        headers: { "authorization": `Bearer ${apiKey}` }
      });
      const data = await readJsonResponse(response);
      if (!response.ok) return sendJson(res, response.status, { error: apiError(data, response), detail: data });
      ids = (data.data || []).map((model) => model.id);
    } else if (provider === PROVIDERS.GEMINI) {
      const response = await safeFetch(`${baseUrl}/models`, {
        method: "GET",
        headers: { "x-goog-api-key": apiKey }
      });
      const data = await readJsonResponse(response);
      if (!response.ok) return sendJson(res, response.status, { error: apiError(data, response), detail: data });
      ids = (data.models || []).map((model) => model.name || model.displayName);
    } else if (provider === PROVIDERS.MINIMAX) {
      const response = await safeFetch(`${baseUrl}/models`, {
        method: "GET",
        headers: { "authorization": `Bearer ${apiKey}` }
      });
      const data = await readJsonResponse(response);
      if (!response.ok) return sendJson(res, response.status, { error: apiError(data, response), detail: data });
      ids = (data.data || []).map((model) => model.id);
    } else if (provider === PROVIDERS.ALIBABA) {
      const response = await safeFetch(`${baseUrl}/compatible-mode/v1/models`, {
        method: "GET",
        headers: { "authorization": `Bearer ${apiKey}` }
      });
      const data = await readJsonResponse(response);
      if (!response.ok) return sendJson(res, response.status, { error: apiError(data, response), detail: data });
      ids = (data.data || data.models || []).map((model) => model.id || model.name);
    }

    const filtered = filterModels(provider, area, ids);
    return sendJson(res, 200, {
      provider,
      area,
      models: toModelOptions(filtered)
    });
  } catch (error) {
    log("error", "models", error.message);
    return sendJson(res, error.status || 500, { error: error.message || "模型列表刷新失败。", detail: error.detail });
  }
}

async function proxyModeration(req, res) {
  try {
    const input = await readJson(req);
    const data = await proxyJsonPost(auth(input, PROVIDERS.OPENAI), "/moderations", {
      model: input.model || "omni-moderation-latest",
      input: input.input || ""
    });
    return sendJson(res, 200, { response: data });
  } catch (error) {
    log("error", "moderation", error.message);
    return sendJson(res, error.status || 500, { error: error.message || "审核请求失败。", detail: error.detail });
  }
}

async function proxyTranscribe(req, res) {
  try {
    const input = await readJson(req);
    if (!input.file?.dataUrl && !input.audioUrl) return sendJson(res, 400, { error: "请先上传音频文件或填写音频 URL。" });

    if ((input.provider || PROVIDERS.OPENAI) === PROVIDERS.GEMINI) {
      const audio = parseDataUrl(input.file.dataUrl);
      const data = await geminiGenerateContent(input, input.model || "gemini-2.5-flash", [
        { text: "Transcribe this audio accurately. Return only the transcript text." },
        { inlineData: { mimeType: audio.mime, data: audio.data } }
      ]);
      const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("").trim();
      return sendJson(res, 200, { response: { text, raw: data } });
    }

    if ((input.provider || PROVIDERS.OPENAI) === PROVIDERS.ALIBABA) {
      const { apiKey, baseUrl } = auth(input, PROVIDERS.ALIBABA);
      const audioUrl = String(input.audioUrl || "").trim();
      if (!audioUrl) return sendJson(res, 400, { error: "阿里云 Paraformer 需要公网可访问的音频 URL。请上传到 OSS 或填写音频 URL 后重试。" });
      const payload = { model: input.model || "paraformer-v2", input: { file_urls: [audioUrl] } };
      const response = await safeFetch(`${baseUrl}/api/v1/services/audio/asr/transcription`, {
        method: "POST",
        headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json", "X-DashScope-Async": "enable" },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(response);
      if (!response.ok || data.code) return sendJson(res, response.status || 500, { error: data.message || apiError(data, response), detail: data });
      return sendJson(res, 200, { response: { text: JSON.stringify(data.output || data, null, 2), raw: data } });
    }

    if ((input.provider || PROVIDERS.OPENAI) === PROVIDERS.XFYUN) {
      const { apiKey, baseUrl } = auth(input, PROVIDERS.XFYUN);
      const apiSecret = String(input.xfyunSecret || "").trim();
      const appId = String(input.xfyunAppId || "").trim();
      if (!apiSecret || !appId) return sendJson(res, 400, { error: "讯飞 ASR 需要 AppID、APIKey、APISecret。" });
      const audio = parseDataUrl(input.file.dataUrl);
      const signedUrl = signedXfyunUrl(baseUrl || defaultBaseUrls.xfyun, apiKey, apiSecret);
      const result = await wsRequest(signedUrl, {
        onOpen(ws) {
          ws.send(JSON.stringify({
            common: { app_id: appId },
            business: { language: "zh_cn", domain: "iat", accent: "mandarin", dwa: "wpgs" },
            data: { status: 2, format: audio.mime.includes("mp3") ? "audio/L16;rate=16000" : "audio/L16;rate=16000", encoding: audio.mime.includes("mp3") ? "lame" : "raw", audio: audio.data }
          }));
        },
        onMessage(raw, messages) {
          const data = JSON.parse(String(raw));
          if (data.code) throw new Error(data.message || "讯飞转写失败。");
          const words = data.data?.result?.ws?.flatMap((item) => item.cw || []).map((item) => item.w).join("") || "";
          if (words) messages.push(words);
          if (data.data?.status === 2) return { text: messages.join(""), raw: data };
          return null;
        }
      });
      return sendJson(res, 200, { response: result });
    }

    if ((input.provider || PROVIDERS.OPENAI) === PROVIDERS.VOLCENGINE) {
      const { apiKey } = auth(input, PROVIDERS.VOLCENGINE);
      const audio = input.file?.dataUrl ? parseDataUrl(input.file.dataUrl) : null;
      const taskId = randomUUID();
      const payload = {
        user: { uid: input.volcengineAppId || "media-client" },
        audio: input.audioUrl ? { url: input.audioUrl } : { data: audio?.data },
        request: { model_name: "bigmodel" }
      };
      const headers = {
        "content-type": "application/json",
        "X-Api-Key": apiKey,
        "X-Api-App-Key": input.volcengineAppId || apiKey,
        "X-Api-Access-Key": apiKey,
        "X-Api-Resource-Id": "volc.bigasr.auc_turbo",
        "X-Api-Request-Id": taskId,
        "X-Api-Sequence": "-1"
      };
      const response = await safeFetch("https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash", {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(response);
      const statusCode = response.headers.get("X-Api-Status-Code");
      if (!response.ok || (statusCode && statusCode !== "20000000")) return sendJson(res, response.status || 500, { error: response.headers.get("X-Api-Message") || apiError(data, response), detail: data });
      return sendJson(res, 200, { response: { text: data.result?.text || "", raw: data } });
    }

    const { apiKey, baseUrl } = auth(input, PROVIDERS.OPENAI);
    const audio = parseDataUrl(input.file.dataUrl);
    const form = new FormData();
    form.append("model", input.model || "gpt-4o-transcribe");
    form.append("file", new Blob([audio.buffer], { type: audio.mime }), input.file.name || "audio.mp3");

    const response = await safeFetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { "authorization": `Bearer ${apiKey}` },
      body: form
    });
    const data = await readJsonResponse(response);
    if (!response.ok) return sendJson(res, response.status, { error: apiError(data, response), detail: data });
    return sendJson(res, 200, { response: data });
  } catch (error) {
    log("error", "transcribe", error.message);
    return sendJson(res, error.status || 500, { error: error.message || "转写请求失败。", detail: error.detail });
  }
}

async function proxySpeech(req, res) {
  try {
    const input = await readJson(req);
    const provider = input.provider || PROVIDERS.OPENAI;
    const text = String(input.input || "").trim();
    if (!text) return sendJson(res, 400, { error: "请先输入要朗读的文本。" });

    if (provider === PROVIDERS.GEMINI) {
      const data = await geminiGenerateContent(input, input.model || "gemini-3.1-flash-tts-preview", [
        { text }
      ], {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: input.voice || "Kore" }
          }
        }
      });
      const audioPart = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
      if (!audioPart) return sendJson(res, 502, { error: "Gemini 没有返回音频。" });
      return sendJson(res, 200, {
        response: data,
        audio: wavDataUrlFromPcm(audioPart.inlineData.data),
        extension: "wav"
      });
    }

    if (provider === PROVIDERS.MINIMAX) {
      const { apiKey, baseUrl } = auth(input, PROVIDERS.MINIMAX);
      const payload = {
        model: input.model || "speech-2.6-hd",
        text,
        voice_id: input.voice || "male-qn-qingse",
        speed: 1,
        vol: 1,
        pitch: 0,
        audio_sample_rate: 32000,
        bitrate: 128000,
        format: "mp3"
      };
      const response = await safeFetch(`${baseUrl}/t2a_v2`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(response);
      if (!response.ok || data.base_resp?.status_code) return sendJson(res, response.status || 500, { error: data.base_resp?.status_msg || apiError(data, response), detail: data });
      return sendJson(res, 200, {
        response: data,
        audio: `data:audio/mpeg;base64,${data.audio_file}`,
        extension: "mp3"
      });
    }

    if (provider === PROVIDERS.ALIBABA) {
      const { apiKey, baseUrl } = auth(input, PROVIDERS.ALIBABA);
      const payload = {
        model: input.model || "cosyvoice-v3-flash",
        input: { text, voice: input.voice || "longanyang", format: "mp3", sample_rate: 24000 }
      };
      const response = await safeFetch(`${baseUrl}/api/v1/services/audio/tts/SpeechSynthesizer`, {
        method: "POST",
        headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(response);
      if (!response.ok || data.code) return sendJson(res, response.status || 500, { error: data.message || apiError(data, response), detail: data });
      const audio = firstAvailable(data.output?.audio?.data, data.output?.audio, data.audio);
      if (!audio) return sendJson(res, 502, { error: "阿里云 CosyVoice 没有返回音频数据。", detail: data });
      return sendJson(res, 200, { response: data, audio: makeDataUrlFromBase64(audio, "audio/mpeg"), extension: "mp3" });
    }

    if (provider === PROVIDERS.VOLCENGINE) {
      const { apiKey, baseUrl } = auth(input, PROVIDERS.VOLCENGINE);
      const payload = {
        app: { appid: input.volcengineAppId || "media-client", token: "access_token", cluster: input.volcengineCluster || "volcano_tts" },
        user: { uid: "media-client" },
        audio: { voice_type: input.voice || "BV700_V2_streaming", encoding: "mp3", speed_ratio: 1, volume_ratio: 1, pitch_ratio: 1 },
        request: { reqid: randomUUID(), text, text_type: "plain", operation: "query" }
      };
      const endpoint = baseUrl.includes("ark.cn-") ? "https://openspeech.bytedance.com/api/v1/tts" : `${baseUrl}/api/v1/tts`;
      const response = await safeFetch(endpoint, {
        method: "POST",
        headers: { "authorization": `Bearer;${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readJsonResponse(response);
      if (!response.ok || data.code) return sendJson(res, response.status || 500, { error: data.message || apiError(data, response), detail: data });
      const audio = firstAvailable(data.data, data.audio, data.result?.audio);
      if (!audio) return sendJson(res, 502, { error: "火山 TTS 没有返回音频数据。", detail: data });
      return sendJson(res, 200, { response: data, audio: makeDataUrlFromBase64(audio, "audio/mpeg"), extension: "mp3" });
    }

    if (provider === PROVIDERS.XFYUN) {
      const { apiKey } = auth(input, PROVIDERS.XFYUN);
      const apiSecret = String(input.xfyunSecret || "").trim();
      const appId = String(input.xfyunAppId || "").trim();
      if (!apiSecret || !appId) return sendJson(res, 400, { error: "讯飞 TTS 需要 AppID、APIKey、APISecret。" });
      const signedUrl = signedXfyunUrl("wss://tts-api.xfyun.cn/v2/tts", apiKey, apiSecret);
      const result = await wsRequest(signedUrl, {
        onOpen(ws) {
          ws.send(JSON.stringify({
            common: { app_id: appId },
            business: { aue: "lame", auf: "audio/L16;rate=16000", vcn: input.voice || "xiaoyan", speed: 50, volume: 50, pitch: 50, tte: "UTF8" },
            data: { status: 2, text: Buffer.from(text).toString("base64") }
          }));
        },
        onMessage(raw, messages) {
          const data = JSON.parse(String(raw));
          if (data.code) throw new Error(data.message || "讯飞语音合成失败。");
          if (data.data?.audio) messages.push(data.data.audio);
          if (data.data?.status === 2) return { audio: messages.join(""), raw: data };
          return null;
        }
      });
      return sendJson(res, 200, { response: result.raw, audio: makeDataUrlFromBase64(result.audio, "audio/mpeg"), extension: "mp3" });
    }

    const { apiKey, baseUrl } = auth(input, PROVIDERS.OPENAI);
    const response = await safeFetch(`${baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: input.model || "gpt-4o-mini-tts",
        input: text,
        voice: input.voice || "alloy",
        response_format: "mp3"
      })
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      let data;
      try {
        data = JSON.parse(buffer.toString("utf8"));
      } catch {
        data = { error: response.statusText };
      }
      return sendJson(res, response.status, { error: apiError(data, response), detail: data });
    }
    return sendJson(res, 200, {
      audio: `data:audio/mpeg;base64,${buffer.toString("base64")}`,
      extension: "mp3"
    });
  } catch (error) {
    log("error", "speech", error.message);
    return sendJson(res, error.status || 500, { error: error.message || "语音请求失败。", detail: error.detail });
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
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin"
    });
    res.end(content);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    } else {
      log("error", `Static file error: ${err.message}`);
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Server error");
    }
  }
}

function safeRoute(fn, req, res) {
  fn(req, res).catch((err) => {
    if (!res.headersSent) sendJson(res, 500, { error: "服务器内部错误" });
    log("error", `路由异常: ${err.message}`);
  });
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, GET, OPTIONS",
      "access-control-allow-headers": "content-type"
    });
    return res.end();
  }

  const ip = req.socket?.remoteAddress || "unknown";
  if (req.method === "POST" && !checkRateLimit(ip)) {
    log("warn", "rate-limit", ip);
    return sendJson(res, 429, { error: "请求过于频繁，请稍后再试。" });
  }

  if (req.method === "POST" && req.url === "/api/generate") { safeRoute(proxyGenerate, req, res); return; }
  if (req.method === "POST" && req.url === "/api/models") { safeRoute(proxyModels, req, res); return; }
  if (req.method === "POST" && req.url === "/api/video") { safeRoute(proxyVideo, req, res); return; }
  if (req.method === "POST" && req.url === "/api/video/status") { safeRoute(proxyVideoStatus, req, res); return; }
  if (req.method === "POST" && req.url === "/api/transcribe") { safeRoute(proxyTranscribe, req, res); return; }
  if (req.method === "POST" && req.url === "/api/speech") { safeRoute(proxySpeech, req, res); return; }
  if (req.method === "POST" && req.url === "/api/moderation") { safeRoute(proxyModeration, req, res); return; }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
});

server.listen(port, () => {
  log("info", `BYOK running at http://localhost:${port}`);
});

process.on("SIGTERM", () => {
  log("info", "SIGTERM received, shutting down gracefully...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  log("info", "SIGINT received, shutting down gracefully...");
  server.close(() => process.exit(0));
});
