const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  size: "1024x1024",
  aspectRatio: "1:1",
  referenceImages: []
};

const els = {
  apiKey: $("#apiKey"),
  baseUrl: $("#baseUrl"),
  rememberConnection: $("#rememberConnection"),
  model: $("#model"),
  customModelWrap: $("#customModelWrap"),
  customModel: $("#customModel"),
  quality: $("#quality"),
  outputFormat: $("#outputFormat"),
  count: $("#count"),
  prompt: $("#prompt"),
  promptCount: $("#promptCount"),
  workflowMode: $("#workflowMode"),
  referenceInput: $("#referenceInput"),
  referenceGrid: $("#referenceGrid"),
  generateBtn: $("#generateBtn"),
  imageGrid: $("#imageGrid"),
  statusDot: $("#statusDot"),
  statusText: $("#statusText"),
  clearConnection: $("#clearConnection")
};

function loadConnection() {
  const saved = JSON.parse(localStorage.getItem("image2.connection") || "{}");
  if (!saved.remember) return;
  els.apiKey.value = saved.apiKey || "";
  els.baseUrl.value = saved.baseUrl || "https://api.openai.com/v1";
  els.rememberConnection.checked = true;
}

function saveConnection() {
  if (!els.rememberConnection.checked) {
    localStorage.removeItem("image2.connection");
    return;
  }

  localStorage.setItem("image2.connection", JSON.stringify({
    remember: true,
    apiKey: els.apiKey.value,
    baseUrl: els.baseUrl.value
  }));
}

function selectedModel() {
  return els.model.value === "custom" ? els.customModel.value.trim() : els.model.value;
}

function payload(includeSecret = false) {
  const data = {
    baseUrl: els.baseUrl.value.trim() || "https://api.openai.com/v1",
    model: selectedModel() || "gpt-image-2",
    prompt: els.prompt.value.trim(),
    size: state.size,
    aspectRatio: state.aspectRatio,
    quality: els.quality.value,
    outputFormat: els.outputFormat.value,
    count: Math.max(1, Math.min(10, Number(els.count.value || 1)))
  };

  if (includeSecret) {
    data.apiKey = els.apiKey.value.trim();
    data.referenceImages = state.referenceImages.map(({ name, dataUrl }) => ({ name, dataUrl }));
  }

  return data;
}

function setStatus(type, text) {
  els.statusDot.classList.toggle("is-busy", type === "busy");
  els.statusDot.classList.toggle("is-done", type === "done");
  els.statusText.textContent = text;
}

function setGenerating(isGenerating) {
  els.generateBtn.classList.toggle("is-loading", isGenerating);
  els.generateBtn.disabled = isGenerating;
  els.generateBtn.innerHTML = isGenerating
    ? `<span class="spinner" aria-hidden="true"></span>生成中`
    : `<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z" /></svg>生成图片`;
}

function renderLoadingGrid(count) {
  const total = Math.max(1, Math.min(4, count || 1));
  els.imageGrid.innerHTML = Array.from({ length: total }, (_, index) => `
    <article class="loading-card" aria-label="图片 ${index + 1} 正在生成">
      <div class="loading-image">
        <span></span>
      </div>
      <div class="loading-caption">
        <i></i>
        <i></i>
      </div>
    </article>
  `).join("");
}

function updateMeta() {
  els.promptCount.textContent = `${els.prompt.value.length} / 32000`;
  els.workflowMode.textContent = state.referenceImages.length ? "Image edit" : "Text to image";
}

function imageSource(item, format) {
  if (item.b64_json) return `data:image/${format};base64,${item.b64_json}`;
  return item.url || "";
}

function renderImages(images, meta) {
  if (!images.length) {
    els.imageGrid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z" /><path d="m4 15 4-4 4 4 2-2 6 6" /><circle cx="16" cy="9" r="1.5" /></svg>
        <p>接口没有返回图片</p>
      </div>`;
    return;
  }

  els.imageGrid.innerHTML = images.map((item, index) => {
    const src = imageSource(item, meta.outputFormat);
    const filename = `gpt-image-2-${Date.now()}-${index + 1}.${meta.outputFormat}`;
    return `
      <article class="result-card">
        <img src="${src}" alt="生成图片 ${index + 1}" />
        <div class="result-actions">
          <button type="button" data-copy-image="${index}">复制</button>
          <a download="${filename}" href="${src}">下载</a>
        </div>
      </article>`;
  }).join("");

  requestAnimationFrame(() => {
    $$(".result-card").forEach((card) => card.classList.add("is-visible"));
  });

  $$("[data-copy-image]").forEach((button) => {
    button.addEventListener("click", async () => {
      const img = images[Number(button.dataset.copyImage)];
      await navigator.clipboard.writeText(imageSource(img, meta.outputFormat));
      button.textContent = "已复制";
      setTimeout(() => {
        button.textContent = "复制";
      }, 1100);
    });
  });
}

function renderReferences() {
  els.referenceGrid.innerHTML = state.referenceImages.map((item, index) => `
    <div class="reference-thumb">
      <img src="${item.dataUrl}" alt="参考图 ${index + 1}" />
      <button type="button" data-remove-reference="${index}" title="移除参考图">
        <svg viewBox="0 0 24 24"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
      </button>
    </div>
  `).join("");

  $$("[data-remove-reference]").forEach((button) => {
    button.addEventListener("click", () => {
      state.referenceImages.splice(Number(button.dataset.removeReference), 1);
      renderReferences();
      updateMeta();
    });
  });
}

async function generate() {
  if (window.location.protocol === "file:") {
    setStatus("idle", "请通过 npm run dev 打开本地服务后再生成");
    return;
  }

  const data = payload(true);
  saveConnection();

  if (!data.apiKey) {
    setStatus("idle", "请先填写 API Key");
    els.apiKey.focus();
    return;
  }

  if (!data.prompt) {
    setStatus("idle", "请先填写 Prompt");
    els.prompt.focus();
    return;
  }

  setGenerating(true);
  renderLoadingGrid(data.count);
  setStatus("busy", "正在生成...");

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "生成失败");
    }

    const images = result.response?.data || [];
    renderImages(images, data);
    setStatus("done", `完成，返回 ${images.length} 张`);
  } catch (error) {
    setStatus("idle", error.message || "生成失败");
  } finally {
    setGenerating(false);
  }
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: reader.result });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function bindEvents() {
  els.prompt.addEventListener("input", updateMeta);
  els.rememberConnection.addEventListener("change", saveConnection);
  els.apiKey.addEventListener("change", saveConnection);
  els.baseUrl.addEventListener("change", saveConnection);

  els.model.addEventListener("change", () => {
    els.customModelWrap.classList.toggle("is-hidden", els.model.value !== "custom");
  });

  $$("#sizeGroup button").forEach((button) => {
    button.addEventListener("click", () => {
      $$("#sizeGroup button").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      state.size = button.dataset.value;
      state.aspectRatio = button.dataset.ratio || "auto";
    });
  });

  $$("#styleChips button").forEach((button) => {
    button.addEventListener("click", () => {
      const text = button.dataset.text;
      button.classList.toggle("is-active");
      if (!els.prompt.value.includes(text)) {
        els.prompt.value = [els.prompt.value.trim(), text].filter(Boolean).join("，");
      }
      updateMeta();
    });
  });

  els.referenceInput.addEventListener("change", async () => {
    const files = Array.from(els.referenceInput.files || []).slice(0, 16 - state.referenceImages.length);
    const loaded = await Promise.all(files.map(readImageFile));
    state.referenceImages.push(...loaded);
    els.referenceInput.value = "";
    renderReferences();
    updateMeta();
  });

  els.generateBtn.addEventListener("click", generate);

  els.clearConnection.addEventListener("click", () => {
    els.apiKey.value = "";
    els.baseUrl.value = "https://api.openai.com/v1";
    els.rememberConnection.checked = false;
    saveConnection();
  });
}

loadConnection();
bindEvents();
renderReferences();
updateMeta();
