const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const MODEL_OPTIONS = {
  image: {
    openai: [
      ["gpt-image-2", "gpt-image-2"],
      ["gpt-image-2-2026-04-21", "gpt-image-2-2026-04-21"]
    ],
    gemini: [
      ["gemini-3.1-flash-image-preview", "Nano Banana 2"],
      ["gemini-3-pro-image-preview", "Nano Banana Pro"],
      ["gemini-2.5-flash-image", "Nano Banana"]
    ],
    alibaba: [
      ["qwen-image-2.0-pro", "Qwen-Image 2.0 Pro"],
      ["qwen-image-2.0", "Qwen-Image 2.0"],
      ["qwen-image-max", "Qwen-Image Max"],
      ["qwen-image-plus", "Qwen-Image Plus"]
    ],
    volcengine: [
      ["doubao-seedream-4-0-250828", "Seedream 4.0"],
      ["doubao-seedream-3-0-t2i-250415", "Seedream 3.0"]
    ],
    minimax: [
      ["image-01", "MiniMax Image-01"]
    ]
  },
  transcribe: {
    openai: [
      ["gpt-4o-transcribe", "gpt-4o-transcribe"],
      ["gpt-4o-mini-transcribe", "gpt-4o-mini-transcribe"],
      ["whisper-1", "whisper-1"]
    ],
    gemini: [
      ["gemini-2.5-flash", "gemini-2.5-flash"],
      ["gemini-2.5-flash-lite", "gemini-2.5-flash-lite"]
    ],
    alibaba: [
      ["paraformer-v2", "Paraformer V2"]
    ],
    volcengine: [
      ["bigasr", "Volcengine BigASR"]
    ],
    xfyun: [
      ["iat", "讯飞语音听写"]
    ]
  },
  speech: {
    openai: [
      ["gpt-4o-mini-tts", "gpt-4o-mini-tts"],
      ["tts-1", "tts-1"],
      ["tts-1-hd", "tts-1-hd"]
    ],
    gemini: [
      ["gemini-3.1-flash-tts-preview", "gemini-3.1-flash-tts-preview"],
      ["gemini-2.5-flash-preview-tts", "gemini-2.5-flash-preview-tts"]
    ],
    minimax: [
      ["speech-2.6-hd", "MiniMax Speech 2.6 HD"],
      ["speech-2.6-turbo", "MiniMax Speech 2.6 Turbo"],
      ["speech-02-hd", "MiniMax Speech-02 HD"],
      ["speech-02-turbo", "MiniMax Speech-02 Turbo"]
    ],
    alibaba: [
      ["cosyvoice-v3-flash", "CosyVoice V3 Flash"],
      ["cosyvoice-v3-plus", "CosyVoice V3 Plus"],
      ["cosyvoice-v2", "CosyVoice V2"]
    ],
    volcengine: [
      ["volcano_tts", "火山引擎 TTS"]
    ],
    xfyun: [
      ["tts", "讯飞在线语音合成"]
    ]
  }
};

MODEL_OPTIONS.video = {
  openai: [
    ["sora-2", "sora-2"],
    ["sora-2-pro", "sora-2-pro"]
  ],
  volcengine: [
    ["doubao-seedance-1-5-pro-251215", "Seedance 1.5 Pro"],
    ["doubao-seedance-1-0-pro-fast-251015", "Seedance 1.0 Pro Fast"],
    ["doubao-seedance-1-0-pro-250528", "Seedance 1.0 Pro"]
  ],
  kling: [
    ["kling-v2.6-pro", "Kling 2.6 Pro"],
    ["kling-v2.6-std", "Kling 2.6 Standard"],
    ["kling-v2.5-turbo", "Kling 2.5 Turbo"],
    ["kling-video-o1", "Kling O1"]
  ],
  minimax: [
    ["MiniMax-Hailuo-2.3", "MiniMax Hailuo 2.3"],
    ["MiniMax-Hailuo-2.3-Fast", "MiniMax Hailuo 2.3 Fast"],
    ["MiniMax-Hailuo-02", "MiniMax Hailuo 02"]
  ]
};

const VOICE_OPTIONS = {
  openai: ["alloy", "ash", "coral", "nova", "sage", "shimmer", "verse"],
  gemini: ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"],
  minimax: ["male-qn-qingse", "female-shaonv", "male-qn-jingying", "female-yujie", "audiobook_male_1"],
  alibaba: ["longanyang", "longxiaochun_v2", "longwan", "loongstella"],
  volcengine: ["BV700_V2_streaming", "BV001_streaming", "BV102_streaming"],
  xfyun: ["xiaoyan", "aisjiuxu", "aisxping", "aisjinger"]
};

const PROVIDER_LABELS = {
  openai: "OpenAI",
  gemini: "Gemini",
  alibaba: "阿里云百炼",
  minimax: "MiniMax",
  volcengine: "火山引擎",
  kling: "可灵",
  xfyun: "讯飞开放平台"
};

const PROVIDER_LIMITS = {
  openai: { imageCount: 10, references: true },
  gemini: { imageCount: 10, references: true },
  alibaba: { imageCount: 6, references: false },
  volcengine: { imageCount: 10, references: true },
  minimax: { imageCount: 9, references: true }
};

const PANEL_PROVIDER = {
  image: () => $("#imageProvider").value,
  video: () => $("#videoProvider").value,
  transcribe: () => $("#transcribeProvider").value,
  speech: () => $("#speechProvider").value,
  history: () => null
};

const state = {
  imageRefs: [],
  audioFile: null,
  activeView: "image",
  videoId: ""
};

const els = {
  openaiKey: $("#openaiKey"),
  geminiKey: $("#geminiKey"),
  alibabaKey: $("#alibabaKey"),
  minimaxKey: $("#minimaxKey"),
  volcengineKey: $("#volcengineKey"),
  klingKey: $("#klingKey"),
  xfyunKey: $("#xfyunKey"),
  xfyunSecret: $("#xfyunSecret"),
  xfyunAppId: $("#xfyunAppId"),
  volcengineAppId: $("#volcengineAppId"),
  volcengineCluster: $("#volcengineCluster"),
  baseUrl: $("#baseUrl"),
  geminiBaseUrl: $("#geminiBaseUrl"),
  alibabaBaseUrl: $("#alibabaBaseUrl"),
  minimaxBaseUrl: $("#minimaxBaseUrl"),
  volcengineBaseUrl: $("#volcengineBaseUrl"),
  klingBaseUrl: $("#klingBaseUrl"),
  xfyunBaseUrl: $("#xfyunBaseUrl"),
  rememberConnection: $("#rememberConnection"),
  keyNotice: $("#keyNotice"),
  keyNoticeTitle: $("#keyNoticeTitle"),
  keyNoticeText: $("#keyNoticeText"),
  openSettings: $("#openSettings"),
  clearConnection: $("#clearConnection"),
  settings: $("#settings"),
  imageReference: $("#imageReference"),
  imageReferenceWrap: $("#imageReferenceWrap"),
  imageReferenceNote: $("#imageReferenceNote"),
  imageRefs: $("#imageRefs"),
  imageCount: $("#imageCount"),
  imageCountHelp: $("#imageCountHelp"),
  imageResultModel: $("#imageResultModel"),
  videoPoll: $("#videoPoll"),
  videoResultStatus: $("#videoResultStatus"),
  audioFile: $("#audioFile"),
  audioUrl: $("#audioUrl"),
  audioFileName: $("#audioFileName"),
  transcribeResultModel: $("#transcribeResultModel"),
  speechResultModel: $("#speechResultModel"),
  historyList: $("#historyList")
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeUrl(value) {
  const str = String(value || "");
  if (str.startsWith("data:") || str.startsWith("https://") || str.startsWith("http://")) return str;
  return "#";
}

function storageAvailable() {
  try {
    localStorage.setItem("__media_test__", "1");
    localStorage.removeItem("__media_test__");
    return true;
  } catch {
    return false;
  }
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function providerKey(provider) {
  if (provider === "gemini") return els.geminiKey.value.trim();
  if (provider === "alibaba") return els.alibabaKey.value.trim();
  if (provider === "minimax") return els.minimaxKey.value.trim();
  if (provider === "volcengine") return els.volcengineKey.value.trim();
  if (provider === "kling") return els.klingKey.value.trim();
  if (provider === "xfyun") return els.xfyunKey.value.trim();
  return els.openaiKey.value.trim();
}

function connection(provider = "openai") {
  return {
    provider,
    apiKey: providerKey(provider),
    openaiKey: els.openaiKey.value.trim(),
    geminiKey: els.geminiKey.value.trim(),
    alibabaKey: els.alibabaKey.value.trim(),
    minimaxKey: els.minimaxKey.value.trim(),
    volcengineKey: els.volcengineKey.value.trim(),
    klingKey: els.klingKey.value.trim(),
    xfyunKey: els.xfyunKey.value.trim(),
    xfyunSecret: els.xfyunSecret.value.trim(),
    xfyunAppId: els.xfyunAppId.value.trim(),
    volcengineAppId: els.volcengineAppId.value.trim(),
    volcengineCluster: els.volcengineCluster.value.trim(),
    baseUrl: els.baseUrl.value.trim() || "https://api.openai.com/v1",
    geminiBaseUrl: els.geminiBaseUrl.value.trim() || "https://generativelanguage.googleapis.com/v1beta",
    alibabaBaseUrl: els.alibabaBaseUrl.value.trim() || "https://dashscope.aliyuncs.com",
    minimaxBaseUrl: els.minimaxBaseUrl.value.trim() || "https://api.minimax.io/v1",
    volcengineBaseUrl: els.volcengineBaseUrl.value.trim() || "https://ark.cn-beijing.volces.com/api/v3",
    klingBaseUrl: els.klingBaseUrl.value.trim() || "https://api.klingapi.com",
    xfyunBaseUrl: els.xfyunBaseUrl.value.trim() || "wss://iat-api.xfyun.cn/v2/iat"
  };
}

function loadConnection() {
  if (!storageAvailable()) return;
  const saved = JSON.parse(localStorage.getItem("media-client.connection") || "{}");
  if (!saved.remember) return;
  els.openaiKey.value = saved.openaiKey || "";
  els.geminiKey.value = saved.geminiKey || "";
  els.alibabaKey.value = saved.alibabaKey || "";
  els.minimaxKey.value = saved.minimaxKey || "";
  els.volcengineKey.value = saved.volcengineKey || "";
  els.klingKey.value = saved.klingKey || "";
  els.xfyunKey.value = saved.xfyunKey || "";
  els.xfyunSecret.value = saved.xfyunSecret || "";
  els.xfyunAppId.value = saved.xfyunAppId || "";
  els.volcengineAppId.value = saved.volcengineAppId || "";
  els.volcengineCluster.value = saved.volcengineCluster || "volcano_tts";
  els.baseUrl.value = saved.baseUrl || "https://api.openai.com/v1";
  els.geminiBaseUrl.value = saved.geminiBaseUrl || "https://generativelanguage.googleapis.com/v1beta";
  els.alibabaBaseUrl.value = saved.alibabaBaseUrl || "https://dashscope.aliyuncs.com";
  els.minimaxBaseUrl.value = saved.minimaxBaseUrl || "https://api.minimax.io/v1";
  els.volcengineBaseUrl.value = saved.volcengineBaseUrl || "https://ark.cn-beijing.volces.com/api/v3";
  els.klingBaseUrl.value = saved.klingBaseUrl || "https://api.klingapi.com";
  els.xfyunBaseUrl.value = saved.xfyunBaseUrl || "wss://iat-api.xfyun.cn/v2/iat";
  els.rememberConnection.checked = true;
}

function saveConnection() {
  if (!storageAvailable()) return;
  if (!els.rememberConnection.checked) {
    localStorage.removeItem("media-client.connection");
    return;
  }
  localStorage.setItem("media-client.connection", JSON.stringify({
    remember: true,
    openaiKey: els.openaiKey.value,
    geminiKey: els.geminiKey.value,
    alibabaKey: els.alibabaKey.value,
    minimaxKey: els.minimaxKey.value,
    volcengineKey: els.volcengineKey.value,
    klingKey: els.klingKey.value,
    xfyunKey: els.xfyunKey.value,
    xfyunSecret: els.xfyunSecret.value,
    xfyunAppId: els.xfyunAppId.value,
    volcengineAppId: els.volcengineAppId.value,
    volcengineCluster: els.volcengineCluster.value,
    baseUrl: els.baseUrl.value,
    geminiBaseUrl: els.geminiBaseUrl.value,
    alibabaBaseUrl: els.alibabaBaseUrl.value,
    minimaxBaseUrl: els.minimaxBaseUrl.value,
    volcengineBaseUrl: els.volcengineBaseUrl.value,
    klingBaseUrl: els.klingBaseUrl.value,
    xfyunBaseUrl: els.xfyunBaseUrl.value
  }));
}

function currentProvider() {
  return PANEL_PROVIDER[state.activeView]?.() || null;
}

function updateProviderStatus() {
  $$("[data-config-status]").forEach((status) => {
    const provider = status.dataset.configStatus;
    const ready = Boolean(providerKey(provider));
    status.textContent = ready ? "已配置" : "未配置";
    status.classList.toggle("is-ready", ready);
  });

  $$("[data-provider-status]").forEach((badge) => {
    const panel = badge.dataset.providerStatus;
    const provider = PANEL_PROVIDER[panel]?.();
    if (!provider) {
      badge.textContent = "本地记录";
      badge.classList.add("is-ready");
      return;
    }
    const ready = Boolean(providerKey(provider));
    badge.textContent = `${PROVIDER_LABELS[provider]} ${ready ? "已配置" : "未配置"}`;
    badge.classList.toggle("is-ready", ready);
  });

  const provider = currentProvider();
  if (!provider) {
    els.keyNotice.classList.add("is-hidden");
    return;
  }

  const ready = Boolean(providerKey(provider));
  els.keyNotice.classList.toggle("is-hidden", ready);
  els.keyNoticeTitle.textContent = `${PROVIDER_LABELS[provider]} API Key 未配置`;
  els.keyNoticeText.textContent = `当前功能需要 ${PROVIDER_LABELS[provider]} Key。请在右上角设置中填写后再使用。`;
}

function requireKey(provider) {
  if (providerKey(provider)) return true;
  els.settings.open = true;
  const group = $(`[data-provider-config="${provider}"]`);
  if (group) group.open = true;
  const input = provider === "gemini" ? els.geminiKey : provider === "alibaba" ? els.alibabaKey : provider === "minimax" ? els.minimaxKey : provider === "volcengine" ? els.volcengineKey : provider === "kling" ? els.klingKey : provider === "xfyun" ? els.xfyunKey : els.openaiKey;
  input.focus();
  updateProviderStatus();
  return false;
}

function setBusy(button, busy, text) {
  button.disabled = busy;
  button.textContent = busy ? "处理中..." : text;
}

function setResultState(element, stateName, text) {
  element.classList.toggle("is-empty", stateName === "empty");
  element.classList.toggle("is-loading", stateName === "loading");
  element.classList.toggle("has-result", stateName === "result");
  if (text !== undefined) element.textContent = text;
}

function setOptions(select, options) {
  select.innerHTML = options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
}

function modelCacheKey(area, provider) {
  return `media-client.models.${area}.${provider}`;
}

function cachedModels(area, provider) {
  if (!storageAvailable()) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(modelCacheKey(area, provider)) || "null");
    if (!cached?.models?.length) return null;
    return cached.models;
  } catch {
    return null;
  }
}

function saveModelCache(area, provider, models) {
  if (!storageAvailable() || !models?.length) return;
  localStorage.setItem(modelCacheKey(area, provider), JSON.stringify({ updatedAt: Date.now(), models }));
}

function fallbackModels(area, provider) {
  return MODEL_OPTIONS[area]?.[provider] || [];
}

async function refreshModels(area, provider, { silent = false } = {}) {
  const button = $(`[data-model-area="${area}"]`);
  const originalText = button?.textContent || "刷新模型列表";

  if (!providerKey(provider)) {
    if (!silent) requireKey(provider);
    return cachedModels(area, provider) || fallbackModels(area, provider);
  }

  if (button && !silent) setBusy(button, true, "刷新中...");

  try {
    const response = await fetch("/api/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...connection(provider), area })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "模型列表刷新失败");
    const models = Array.isArray(data.models) && data.models.length ? data.models : fallbackModels(area, provider);
    saveModelCache(area, provider, models);
    return models;
  } catch (error) {
    if (!silent) console.warn(error);
    return cachedModels(area, provider) || fallbackModels(area, provider);
  } finally {
    if (button && !silent) setBusy(button, false, originalText);
  }
}

async function updateProviderModels(area, { autoRefresh = true } = {}) {
  const provider = $(`#${area}Provider`).value;
  const select = $(`#${area}Model`);
  const models = cachedModels(area, provider) || fallbackModels(area, provider);
  if (models.length && select) setOptions(select, models);

  if (autoRefresh && providerKey(provider)) {
    const fresh = await refreshModels(area, provider, { silent: true });
    if (fresh?.length && select) setOptions(select, fresh);
  }

  if (area === "speech") {
    const voices = VOICE_OPTIONS[provider] || [];
    $("#speechVoice").innerHTML = voices.map((voice) => `<option value="${escapeHtml(voice)}">${escapeHtml(voice)}</option>`).join("");
    els.speechResultModel.textContent = `${PROVIDER_LABELS[provider]} / ${$("#speechModel").value}`;
  }

  if (area === "transcribe") {
    els.transcribeResultModel.textContent = `${PROVIDER_LABELS[provider]} / ${$("#transcribeModel").value}`;
  }

  if (area === "image") {
    updateImageCapabilities();
  }

  updateProviderStatus();
}

function updateImageCapabilities() {
  const provider = $("#imageProvider").value;
  const model = $("#imageModel").value;
  const limits = PROVIDER_LIMITS[provider] || PROVIDER_LIMITS.openai;
  els.imageResultModel.textContent = `${PROVIDER_LABELS[provider]} / ${model}`;
  els.imageCount.max = String(limits.imageCount);
  if (Number(els.imageCount.value || 1) > limits.imageCount) els.imageCount.value = String(limits.imageCount);
  els.imageCountHelp.textContent = `当前供应商最多一次生成 ${limits.imageCount} 张。`;
  els.imageReferenceWrap.classList.toggle("is-hidden", !limits.references);
  els.imageReferenceNote.textContent = limits.references ? "当前模型支持上传参考图。" : "当前供应商暂不支持参考图，上传入口已隐藏。";
  if (!limits.references && state.imageRefs.length) {
    state.imageRefs = [];
    renderImageRefs();
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: reader.result });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function historyItems() {
  if (!storageAvailable()) return [];
  return JSON.parse(localStorage.getItem("media-client.history") || "[]");
}

function addHistory(type, title, summary) {
  if (!storageAvailable()) return;
  const item = {
    id: generateId(),
    type,
    title,
    summary,
    time: new Date().toLocaleString()
  };
  localStorage.setItem("media-client.history", JSON.stringify([item, ...historyItems()].slice(0, 30)));
  renderHistory();
}

function renderHistory() {
  const items = historyItems();
  if (!items.length) {
    els.historyList.innerHTML = `<div class="empty-copy">暂无历史记录</div>`;
    return;
  }

  els.historyList.innerHTML = items.map((item) => `
    <article class="history-item">
      <span>${escapeHtml(item.type)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.summary)}</p>
      <small>${escapeHtml(item.time)}</small>
    </article>
  `).join("");
}

function bindNavigation() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      state.activeView = view;
      $$("[data-view]").forEach((item) => item.classList.toggle("is-active", item === button));
      $$("[data-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === view));
      updateProviderStatus();
    });
  });
}

function renderImageRefs() {
  els.imageRefs.innerHTML = state.imageRefs.map((item, index) => `
    <div class="thumb">
      <img src="${escapeHtml(item.dataUrl)}" alt="参考图 ${index + 1}" />
      <button data-remove-image="${index}" type="button">x</button>
    </div>
  `).join("");

  $$("[data-remove-image]").forEach((button) => {
    button.addEventListener("click", () => {
      state.imageRefs.splice(Number(button.dataset.removeImage), 1);
      renderImageRefs();
    });
  });
}

function imageSource(item, format = "png") {
  const src = (() => {
    if (typeof item === "string") return item;
    if (item.b64_json) return `data:image/${format};base64,${item.b64_json}`;
    if (item.inlineData?.data) return `data:${item.inlineData.mimeType || "image/png"};base64,${item.inlineData.data}`;
    if (item.inline_data?.data) return `data:${item.inline_data.mime_type || "image/png"};base64,${item.inline_data.data}`;
    return item.url || "";
  })();
  return safeUrl(src);
}

async function runImage() {
  const provider = $("#imageProvider").value;
  if (!requireKey(provider)) return;
  const button = $("#imageRun");
  const resultBox = $("#imageResults");
  const prompt = $("#imagePrompt").value.trim();
  if (!prompt) {
    setResultState(resultBox, "empty", "请先填写提示词");
    return;
  }

  const limits = PROVIDER_LIMITS[provider] || PROVIDER_LIMITS.openai;
  setBusy(button, true, "生成图片");
  setResultState(resultBox, "loading", "正在生成图片...");

  try {
    const n = Math.max(1, Math.min(limits.imageCount, Number($("#imageCount").value || 1)));
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...connection(provider),
        model: $("#imageModel").value,
        prompt,
        n,
        size: $("#imageSize").value,
        quality: $("#imageQuality").value,
        output_format: "png",
        referenceImages: limits.references ? state.imageRefs : []
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "图片生成失败");

    const images = data.response?.data || data.response?.images || [];
    resultBox.classList.remove("is-empty", "is-loading");
    resultBox.classList.add("has-result");
    resultBox.innerHTML = images.length
      ? images.map((item, index) => {
        const src = imageSource(item);
        return `<article class="image-card"><img src="${src}" alt="生成图片 ${index + 1}" /><a href="${src}" download="image-${index + 1}.png">下载</a></article>`;
      }).join("")
      : "接口没有返回图片";
    addHistory("图片生成", `${PROVIDER_LABELS[provider]} / ${$("#imageModel").value}`, prompt.slice(0, 80));
  } catch (error) {
    setResultState(resultBox, "empty", error.message || "图片生成失败");
  } finally {
    setBusy(button, false, "生成图片");
  }
}

function extractVideoId(data) {
  return data?.id || data?.task_id || data?.data?.task_id || data?.response?.task_id || data?.response?.id || data?.response?.data?.task_id || data?.video?.id || data?.response?.video?.id || "";
}

async function runVideo() {
  const provider = $("#videoProvider").value;
  if (!requireKey(provider)) return;
  const button = $("#videoRun");
  const resultBox = $("#videoResults");
  const prompt = $("#videoPrompt").value.trim();
  if (!prompt) {
    setResultState(resultBox, "empty", "请先填写提示词");
    return;
  }

  setBusy(button, true, "创建视频任务");
  setResultState(resultBox, "loading", "正在创建视频任务...");

  try {
    const response = await fetch("/api/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...connection(provider),
        model: $("#videoModel").value,
        prompt,
        size: $("#videoSize").value,
        seconds: $("#videoSeconds").value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "视频任务创建失败");
    state.videoId = extractVideoId(data);
    els.videoPoll.disabled = !state.videoId;
    els.videoResultStatus.textContent = state.videoId ? `任务 ${state.videoId}` : "任务已创建";
    resultBox.classList.remove("is-empty", "is-loading");
    resultBox.classList.add("has-result");
    resultBox.textContent = JSON.stringify(data.response, null, 2);
    addHistory("视频生成", $("#videoModel").value, prompt.slice(0, 80));
  } catch (error) {
    setResultState(resultBox, "empty", error.message || "视频任务创建失败");
  } finally {
    setBusy(button, false, "创建视频任务");
  }
}

async function pollVideo() {
  if (!state.videoId) return;
  if (!requireKey("openai")) return;
  const resultBox = $("#videoResults");
  setBusy(els.videoPoll, true, "查询任务状态");
  setResultState(resultBox, "loading", "正在查询任务状态...");

  try {
    const response = await fetch("/api/video/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...connection($("#videoProvider").value), id: state.videoId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "任务查询失败");
    resultBox.classList.remove("is-empty", "is-loading");
    resultBox.classList.add("has-result");
    resultBox.textContent = JSON.stringify(data.response, null, 2);
    els.videoResultStatus.textContent = data.response?.status ? `状态 ${data.response.status}` : `任务 ${state.videoId}`;
  } catch (error) {
    setResultState(resultBox, "empty", error.message || "任务查询失败");
  } finally {
    setBusy(els.videoPoll, false, "查询任务状态");
  }
}

async function runTranscribe() {
  const provider = $("#transcribeProvider").value;
  if (!requireKey(provider)) return;
  const button = $("#transcribeRun");
  const resultBox = $("#transcribeResults");
  if (!state.audioFile && !els.audioUrl.value.trim()) {
    setResultState(resultBox, "empty", "请先选择音频文件");
    return;
  }

  setBusy(button, true, "开始转写");
  setResultState(resultBox, "loading", "正在转写...");

  try {
    const audio = state.audioFile ? await fileToDataUrl(state.audioFile) : null;
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...connection(provider),
        model: $("#transcribeModel").value,
        file: audio,
        audioUrl: els.audioUrl.value.trim()
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "转写失败");
    resultBox.classList.remove("is-empty", "is-loading");
    resultBox.classList.add("has-result");
    resultBox.textContent = data.response?.text || JSON.stringify(data.response, null, 2);
    addHistory("音频转文字", `${PROVIDER_LABELS[provider]} / ${$("#transcribeModel").value}`, state.audioFile.name);
  } catch (error) {
    setResultState(resultBox, "empty", error.message || "转写失败");
  } finally {
    setBusy(button, false, "开始转写");
  }
}

async function runSpeech() {
  const provider = $("#speechProvider").value;
  if (!requireKey(provider)) return;
  const button = $("#speechRun");
  const resultBox = $("#speechResults");
  const input = $("#speechText").value.trim();
  if (!input) {
    setResultState(resultBox, "empty", "请先输入文本");
    return;
  }

  setBusy(button, true, "生成语音");
  setResultState(resultBox, "loading", "正在生成语音...");

  try {
    const response = await fetch("/api/speech", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...connection(provider),
        model: $("#speechModel").value,
        voice: $("#speechVoice").value,
        input
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "语音生成失败");
    const audioSrc = safeUrl(data.audio);
    const ext = escapeHtml(data.extension || "mp3");
    resultBox.classList.remove("is-empty", "is-loading");
    resultBox.classList.add("has-result");
    resultBox.innerHTML = `<audio controls src="${audioSrc}"></audio><a class="download-link" href="${audioSrc}" download="speech.${ext}">下载音频</a>`;
    addHistory("文字转语音", `${PROVIDER_LABELS[provider]} / ${$("#speechModel").value}`, input.slice(0, 80));
  } catch (error) {
    setResultState(resultBox, "empty", error.message || "语音生成失败");
  } finally {
    setBusy(button, false, "生成语音");
  }
}

function bindEvents() {
  bindNavigation();
  loadConnection();
  renderHistory();
  updateProviderModels("image");
  updateProviderModels("video");
  updateProviderModels("transcribe");
  updateProviderModels("speech");
  updateProviderStatus();

  els.openSettings.addEventListener("click", () => {
    els.settings.open = true;
    const provider = currentProvider() || "openai";
    const input = provider === "gemini" ? els.geminiKey : provider === "alibaba" ? els.alibabaKey : provider === "minimax" ? els.minimaxKey : provider === "volcengine" ? els.volcengineKey : provider === "kling" ? els.klingKey : provider === "xfyun" ? els.xfyunKey : els.openaiKey;
    input.focus();
  });
  els.rememberConnection.addEventListener("change", saveConnection);
  [els.openaiKey, els.geminiKey, els.alibabaKey, els.minimaxKey, els.volcengineKey, els.klingKey, els.xfyunKey, els.xfyunSecret, els.xfyunAppId, els.volcengineAppId, els.volcengineCluster].forEach((input) => {
    input.addEventListener("input", updateProviderStatus);
    input.addEventListener("change", saveConnection);
  });
  [els.baseUrl, els.geminiBaseUrl, els.alibabaBaseUrl, els.minimaxBaseUrl, els.volcengineBaseUrl, els.klingBaseUrl, els.xfyunBaseUrl].forEach((input) => {
    input.addEventListener("change", saveConnection);
  });
  els.clearConnection.addEventListener("click", () => {
    els.openaiKey.value = "";
    els.geminiKey.value = "";
    els.alibabaKey.value = "";
    els.minimaxKey.value = "";
    els.volcengineKey.value = "";
    els.klingKey.value = "";
    els.xfyunKey.value = "";
    els.xfyunSecret.value = "";
    els.xfyunAppId.value = "";
    els.volcengineAppId.value = "";
    els.volcengineCluster.value = "volcano_tts";
    els.baseUrl.value = "https://api.openai.com/v1";
    els.geminiBaseUrl.value = "https://generativelanguage.googleapis.com/v1beta";
    els.alibabaBaseUrl.value = "https://dashscope.aliyuncs.com";
    els.minimaxBaseUrl.value = "https://api.minimax.io/v1";
    els.volcengineBaseUrl.value = "https://ark.cn-beijing.volces.com/api/v3";
    els.klingBaseUrl.value = "https://api.klingapi.com";
    els.xfyunBaseUrl.value = "wss://iat-api.xfyun.cn/v2/iat";
    els.rememberConnection.checked = false;
    if (storageAvailable()) localStorage.removeItem("media-client.connection");
    updateProviderStatus();
  });
  $$("[data-provider-config]").forEach((group) => {
    group.addEventListener("toggle", () => {
      if (!group.open) return;
      $$("[data-provider-config]").forEach((item) => {
        if (item !== group) item.open = false;
      });
    });
  });

  $("#imageProvider").addEventListener("change", () => updateProviderModels("image"));
  $("#imageModel").addEventListener("change", updateImageCapabilities);
  $("#videoProvider").addEventListener("change", () => updateProviderModels("video"));
  $("#transcribeProvider").addEventListener("change", () => updateProviderModels("transcribe"));
  $("#transcribeModel").addEventListener("change", () => updateProviderModels("transcribe"));
  $("#speechProvider").addEventListener("change", () => updateProviderModels("speech"));
  $("#speechModel").addEventListener("change", () => updateProviderModels("speech"));

  $$("[data-model-area]").forEach((button) => {
    button.addEventListener("click", async () => {
      const area = button.dataset.modelArea;
      const provider = $(`#${area}Provider`).value;
      const models = await refreshModels(area, provider);
      if (models?.length) {
        setOptions($(`#${area}Model`), models);
        if (area === "image") updateImageCapabilities();
        if (area === "transcribe") els.transcribeResultModel.textContent = `${PROVIDER_LABELS[provider]} / ${$("#transcribeModel").value}`;
        if (area === "speech") els.speechResultModel.textContent = `${PROVIDER_LABELS[provider]} / ${$("#speechModel").value}`;
      }
    });
  });

  els.imageReference.addEventListener("change", async () => {
    const files = Array.from(els.imageReference.files || []).slice(0, 16 - state.imageRefs.length);
    state.imageRefs.push(...await Promise.all(files.map(fileToDataUrl)));
    els.imageReference.value = "";
    renderImageRefs();
  });

  els.audioFile.addEventListener("change", () => {
    state.audioFile = Array.from(els.audioFile.files || [])[0] || null;
    els.audioFileName.textContent = state.audioFile ? state.audioFile.name : "支持 mp3、wav、m4a 等常见格式";
  });

  $("#imageRun").addEventListener("click", runImage);
  $("#videoRun").addEventListener("click", runVideo);
  els.videoPoll.addEventListener("click", pollVideo);
  $("#transcribeRun").addEventListener("click", runTranscribe);
  $("#speechRun").addEventListener("click", runSpeech);
  $("#clearHistory").addEventListener("click", () => {
    if (!storageAvailable()) return;
    localStorage.removeItem("media-client.history");
    renderHistory();
  });
}

bindEvents();
