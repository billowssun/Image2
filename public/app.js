const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function safeUrl(value) {
  const str = String(value || "");
  if (str.startsWith("data:") || str.startsWith("https://") || str.startsWith("http://")) return str;
  return "#";
}

function safeLocalStorage() {
  try { localStorage.setItem("__test__", "1"); localStorage.removeItem("__test__"); return true; }
  catch { return false; }
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

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
    ]
  }
};

const VOICE_OPTIONS = {
  openai: ["alloy", "ash", "coral", "nova", "sage", "shimmer", "verse"],
  gemini: ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"],
  minimax: ["male-qn-qingse", "female-shaonv", "male-qn-jingying", "female-yujie", "audiobook_male_1"]
};

const state = {
  imageRefs: [],
  audioFile: null
};

const els = {
  openaiKey: $("#openaiKey"),
  geminiKey: $("#geminiKey"),
  alibabaKey: $("#alibabaKey"),
  minimaxKey: $("#minimaxKey"),
  baseUrl: $("#baseUrl"),
  rememberConnection: $("#rememberConnection"),
  keyNotice: $("#keyNotice"),
  openSettings: $("#openSettings"),
  clearConnection: $("#clearConnection"),
  settings: $(".settings"),
  imageReference: $("#imageReference"),
  imageRefs: $("#imageRefs"),
  audioFile: $("#audioFile"),
  audioFileName: $("#audioFileName"),
  historyList: $("#historyList")
};

function providerKey(provider) {
  if (provider === "gemini") return els.geminiKey.value.trim();
  if (provider === "alibaba") return els.alibabaKey.value.trim();
  if (provider === "minimax") return els.minimaxKey.value.trim();
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
    baseUrl: els.baseUrl.value.trim() || "https://api.openai.com/v1"
  };
}

function loadConnection() {
  if (!safeLocalStorage()) return;
  const saved = JSON.parse(localStorage.getItem("media-client.connection") || "{}");
  if (!saved.remember) return;
  els.openaiKey.value = saved.openaiKey || "";
  els.geminiKey.value = saved.geminiKey || "";
  els.alibabaKey.value = saved.alibabaKey || "";
  els.minimaxKey.value = saved.minimaxKey || "";
  els.baseUrl.value = saved.baseUrl || "https://api.openai.com/v1";
  els.rememberConnection.checked = true;
}

function saveConnection() {
  if (!safeLocalStorage()) return;
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
    baseUrl: els.baseUrl.value
  }));
}

function updateKeyNotice() {
  const hasAnyKey = Boolean(els.openaiKey.value.trim() || els.geminiKey.value.trim() || els.alibabaKey.value.trim() || els.minimaxKey.value.trim());
  els.keyNotice.classList.toggle("is-hidden", hasAnyKey);
}

function requireKey(provider) {
  if (providerKey(provider)) return true;
  els.settings.open = true;
  const input = provider === "gemini" ? els.geminiKey : provider === "alibaba" ? els.alibabaKey : provider === "minimax" ? els.minimaxKey : els.openaiKey;
  input.focus();
  updateKeyNotice();
  return false;
}

function setBusy(button, busy, text) {
  button.disabled = busy;
  button.textContent = busy ? "处理中..." : text;
}

function setOptions(select, options) {
  select.innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
}

function updateProviderModels(area) {
  const provider = $("#" + area + "Provider").value;
  const models = MODEL_OPTIONS[area] && MODEL_OPTIONS[area][provider];
  if (models) {
    setOptions($("#" + area + "Model"), models);
  }

  if (area === "speech") {
    const voiceSelect = $("#speechVoice");
    const voices = VOICE_OPTIONS[provider];
    if (voices) {
      voiceSelect.innerHTML = voices.map((voice) => `<option value="${escapeHtml(voice)}">${escapeHtml(voice)}</option>`).join("");
    }
  }

  if (area === "image") {
    $$("[data-image-provider]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.imageProvider === provider);
    });
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
  if (!safeLocalStorage()) return [];
  return JSON.parse(localStorage.getItem("media-client.history") || "[]");
}

function addHistory(type, title, summary) {
  if (!safeLocalStorage()) return;
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
      $$("[data-view]").forEach((item) => item.classList.toggle("is-active", item === button));
      $$("[data-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === view));
    });
  });
}

function renderImageRefs() {
  els.imageRefs.innerHTML = state.imageRefs.map((item, index) => `
    <div class="thumb">
      <img src="${item.dataUrl}" alt="参考图 ${index + 1}" />
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
  const src = (function() {
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
    resultBox.textContent = "请先填写提示词";
    return;
  }

  setBusy(button, true, "生成图片");
  resultBox.innerHTML = `<div class="loading-copy">正在生成图片...</div>`;

  try {
    const maxN = provider === "alibaba" ? 6 : 10;
    const n = Math.max(1, Math.min(maxN, Number($("#imageCount").value || 1)));

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
        referenceImages: state.imageRefs
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "图片生成失败");

    const images = data.response?.data || data.response?.images || [];
    resultBox.innerHTML = images.length
      ? images.map((item, index) => {
        const src = imageSource(item);
        const alt = `生成图片 ${index + 1}`;
        return `<article class="image-card"><img src="${src}" alt="${escapeHtml(alt)}" /><a href="${src}" download="image-${index + 1}.png">下载</a></article>`;
      }).join("")
      : "接口没有返回图片";
    addHistory("图片生成", `${escapeHtml(provider)} / ${escapeHtml($("#imageModel").value)}`, prompt.slice(0, 80));
  } catch (error) {
    resultBox.textContent = error.message || "图片生成失败";
  } finally {
    setBusy(button, false, "生成图片");
  }
}

async function runVideo() {
  if (!requireKey("openai")) return;
  const button = $("#videoRun");
  const resultBox = $("#videoResults");
  const prompt = $("#videoPrompt").value.trim();
  if (!prompt) {
    resultBox.textContent = "请先填写提示词";
    return;
  }

  setBusy(button, true, "创建视频任务");
  resultBox.textContent = "正在创建视频任务...";

  try {
    const response = await fetch("/api/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...connection("openai"),
        model: $("#videoModel").value,
        prompt,
        size: $("#videoSize").value,
        seconds: $("#videoSeconds").value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "视频任务创建失败");
    resultBox.textContent = JSON.stringify(data.response, null, 2);
    addHistory("视频生成", escapeHtml($("#videoModel").value), prompt.slice(0, 80));
  } catch (error) {
    resultBox.textContent = error.message || "视频任务创建失败";
  } finally {
    setBusy(button, false, "创建视频任务");
  }
}

async function runTranscribe() {
  const provider = $("#transcribeProvider").value;
  if (!requireKey(provider)) return;
  const button = $("#transcribeRun");
  const resultBox = $("#transcribeResults");
  if (!state.audioFile) {
    resultBox.textContent = "请先选择音频文件";
    return;
  }

  setBusy(button, true, "开始转写");
  resultBox.textContent = "正在转写...";

  try {
    const audio = await fileToDataUrl(state.audioFile);
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...connection(provider),
        model: $("#transcribeModel").value,
        file: audio
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "转写失败");
    resultBox.textContent = data.response?.text || JSON.stringify(data.response, null, 2);
    addHistory("音频转文字", `${escapeHtml(provider)} / ${escapeHtml($("#transcribeModel").value)}`, escapeHtml(state.audioFile.name));
  } catch (error) {
    resultBox.textContent = error.message || "转写失败";
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
    resultBox.textContent = "请先输入文本";
    return;
  }

  setBusy(button, true, "生成语音");
  resultBox.textContent = "正在生成语音...";

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
    resultBox.innerHTML = `<audio controls src="${audioSrc}"></audio><a class="download-link" href="${audioSrc}" download="speech.${ext}">下载音频</a>`;
    addHistory("文字转语音", `${escapeHtml(provider)} / ${escapeHtml($("#speechModel").value)}`, input.slice(0, 80));
  } catch (error) {
    resultBox.textContent = error.message || "语音生成失败";
  } finally {
    setBusy(button, false, "生成语音");
  }
}

async function runModeration() {
  if (!requireKey("openai")) return;
  const button = $("#moderationRun");
  const resultBox = $("#moderationResults");
  const input = $("#moderationInput").value.trim();
  if (!input) {
    resultBox.textContent = "请先输入待审核文本";
    return;
  }

  setBusy(button, true, "开始审核");
  resultBox.textContent = "正在审核...";

  try {
    const response = await fetch("/api/moderation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...connection("openai"), input })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "审核失败");
    resultBox.textContent = JSON.stringify(data.response, null, 2);
    addHistory("内容审核", "omni-moderation-latest", escapeHtml(input).slice(0, 80));
  } catch (error) {
    resultBox.textContent = error.message || "审核失败";
  } finally {
    setBusy(button, false, "开始审核");
  }
}

function bindEvents() {
  bindNavigation();
  loadConnection();
  updateKeyNotice();
  renderHistory();
  updateProviderModels("image");
  updateProviderModels("transcribe");
  updateProviderModels("speech");

  els.openSettings.addEventListener("click", () => {
    els.settings.open = true;
    els.openaiKey.focus();
  });
  els.rememberConnection.addEventListener("change", saveConnection);
  [els.openaiKey, els.geminiKey, els.alibabaKey, els.minimaxKey].forEach((input) => {
    input.addEventListener("input", updateKeyNotice);
    input.addEventListener("change", saveConnection);
  });
  els.baseUrl.addEventListener("change", saveConnection);
  els.clearConnection.addEventListener("click", () => {
    els.openaiKey.value = "";
    els.geminiKey.value = "";
    els.alibabaKey.value = "";
    els.minimaxKey.value = "";
    els.baseUrl.value = "https://api.openai.com/v1";
    els.rememberConnection.checked = false;
    if (safeLocalStorage()) localStorage.removeItem("media-client.connection");
    updateKeyNotice();
  });

  $("#imageProvider").addEventListener("change", () => updateProviderModels("image"));
  $("#transcribeProvider").addEventListener("change", () => updateProviderModels("transcribe"));
  $("#speechProvider").addEventListener("change", () => updateProviderModels("speech"));

  $$("[data-image-provider]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#imageProvider").value = button.dataset.imageProvider;
      updateProviderModels("image");
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
  $("#transcribeRun").addEventListener("click", runTranscribe);
  $("#speechRun").addEventListener("click", runSpeech);
  $("#moderationRun").addEventListener("click", runModeration);
  $("#clearHistory").addEventListener("click", () => {
    if (!safeLocalStorage()) return;
    localStorage.removeItem("media-client.history");
    renderHistory();
  });
}

bindEvents();
