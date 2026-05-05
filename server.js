import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 4173);
const geminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
const alibabaBaseUrl = process.env.ALIBABA_BASE_URL || "https://dashscope.aliyuncs.com";

const PROVIDERS = { OPENAI: "openai", GEMINI: "gemini", ALIBABA: "alibaba", MINIMAX: "minimax" };
const PROVIDER_NAMES = { [PROVIDERS.OPENAI]: "OpenAI", [PROVIDERS.GEMINI]: "Gemini", [PROVIDERS.ALIBABA]: "阿里云百炼", [PROVIDERS.MINIMAX]: "MiniMax" };

function log(level, ...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}]`, ...args);
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
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const contentLength = Number(req.headers["content-length"] || 0);
  const maxBodySize = 64 * 1024 * 1024;
  if (contentLength > maxBodySize) {
    throw new Error("Request body is too large.");
  }
  const chunks = [];
  let totalLength = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    totalLength += chunk.length;
    if (totalLength > maxBodySize) {
      throw new Error("Request body is too large.");
    }
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function normalizeBaseUrl(value) {
  const raw = String(value || "https://api.openai.com/v1").trim();
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
    [PROVIDERS.OPENAI]: input.openaiKey || input.apiKey
  };
  const apiKey = String(keySource[provider] || keySource[PROVIDERS.OPENAI] || "").trim();
  if (!apiKey) {
    throw new Error(`请先填写 ${PROVIDER_NAMES[provider] || "OpenAI"} API Key。`);
  }
  return {
    provider,
    apiKey,
    baseUrl: normalizeBaseUrl(input.baseUrl)
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
  const response = await fetch(`${baseUrl}${endpoint}`, {
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
      const response = await fetch(endpoint, {
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
  const { apiKey } = auth(input, PROVIDERS.GEMINI);
  const response = await fetch(`${geminiBaseUrl}/models/${model}:generateContent`, {
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
  const { apiKey } = auth(input, PROVIDERS.ALIBABA);
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

  const response = await fetch(`${alibabaBaseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data.code) return sendJson(res, response.status || 500, { error: data.message || apiError(data, response), detail: data });

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

async function proxyGenerate(req, res) {
  try {
    const input = await readJson(req);
    if ((input.provider || PROVIDERS.OPENAI) === PROVIDERS.GEMINI) return await geminiImage(input, res);
    if ((input.provider || PROVIDERS.OPENAI) === PROVIDERS.ALIBABA) return await alibabaImage(input, res);
    return await openAIImage(input, res);
  } catch (error) {
    log("error", "generate", error.message);
    return sendJson(res, 500, { error: error.message || "图片请求失败。" });
  }
}

async function proxyVideo(req, res) {
  try {
    const input = await readJson(req);
    const { apiKey, baseUrl } = auth(input, PROVIDERS.OPENAI);
    const prompt = String(input.prompt || "").trim();
    if (!prompt) return sendJson(res, 400, { error: "请先填写视频提示词。" });

    const form = new FormData();
    form.append("model", input.model || "sora-2");
    form.append("prompt", prompt);
    form.append("size", input.size || "1280x720");
    form.append("seconds", String(input.seconds || "4"));

    const response = await fetch(`${baseUrl}/videos`, {
      method: "POST",
      headers: { "authorization": `Bearer ${apiKey}` },
      body: form
    });
    const data = await readJsonResponse(response);
    if (!response.ok) return sendJson(res, response.status, { error: apiError(data, response), detail: data });
    return sendJson(res, 200, { response: data });
  } catch (error) {
    log("error", "video", error.message);
    return sendJson(res, 500, { error: error.message || "视频请求失败。" });
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
    if (!input.file?.dataUrl) return sendJson(res, 400, { error: "请先上传音频文件。" });

    if ((input.provider || PROVIDERS.OPENAI) === PROVIDERS.GEMINI) {
      const audio = parseDataUrl(input.file.dataUrl);
      const data = await geminiGenerateContent(input, input.model || "gemini-2.5-flash", [
        { text: "Transcribe this audio accurately. Return only the transcript text." },
        { inlineData: { mimeType: audio.mime, data: audio.data } }
      ]);
      const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("").trim();
      return sendJson(res, 200, { response: { text, raw: data } });
    }

    const { apiKey, baseUrl } = auth(input, PROVIDERS.OPENAI);
    const audio = parseDataUrl(input.file.dataUrl);
    const form = new FormData();
    form.append("model", input.model || "gpt-4o-transcribe");
    form.append("file", new Blob([audio.buffer], { type: audio.mime }), input.file.name || "audio.mp3");

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
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
      const { apiKey } = auth(input, PROVIDERS.MINIMAX);
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
      const response = await fetch("https://api.minimax.io/v1/t2a_v2", {
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

    const { apiKey, baseUrl } = auth(input, PROVIDERS.OPENAI);
    const response = await fetch(`${baseUrl}/audio/speech`, {
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
      "cache-control": "no-store"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  const ip = req.socket.remoteAddress || "unknown";
  if (req.method === "POST" && !checkRateLimit(ip)) {
    log("warn", "rate-limit", ip);
    return sendJson(res, 429, { error: "请求过于频繁，请稍后再试。" });
  }

  if (req.method === "POST" && req.url === "/api/generate") return proxyGenerate(req, res);
  if (req.method === "POST" && req.url === "/api/video") return proxyVideo(req, res);
  if (req.method === "POST" && req.url === "/api/transcribe") return proxyTranscribe(req, res);
  if (req.method === "POST" && req.url === "/api/speech") return proxySpeech(req, res);
  if (req.method === "POST" && req.url === "/api/moderation") return proxyModeration(req, res);

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
});

server.listen(port, () => {
  log("info", `Media Client running at http://localhost:${port}`);
});

process.on("SIGTERM", () => {
  log("info", "SIGTERM received, shutting down gracefully...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  log("info", "SIGINT received, shutting down gracefully...");
  server.close(() => process.exit(0));
});
