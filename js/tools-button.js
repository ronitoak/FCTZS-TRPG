// 画像ボタン作成：背景（またはデフォルト描画）＋文字を PNG 出力
"use strict";

(() => {
  const canvas = document.getElementById("btn-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  /** @type {HTMLImageElement|null} */
  let bgImage = null;
  let customFontFamily = "";

  const els = {
    image: document.getElementById("btn-image"),
    clearImage: document.getElementById("btn-clear-image"),
    width: document.getElementById("btn-width"),
    height: document.getElementById("btn-height"),
    text: document.getElementById("btn-text"),
    font: document.getElementById("btn-font"),
    fontFile: document.getElementById("btn-font-file"),
    fontSize: document.getElementById("btn-font-size"),
    textColor: document.getElementById("btn-text-color"),
    posX: document.getElementById("btn-pos-x"),
    posY: document.getElementById("btn-pos-y"),
    download: document.getElementById("btn-download")
  };

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawDefaultButton(w, h) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#4a5568");
    grad.addColorStop(1, "#2d3748");
    roundRect(0, 0, w, h, Math.round(h * 0.22));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = Math.max(2, Math.round(h * 0.04));
    ctx.strokeStyle = "#1a202c";
    ctx.stroke();
    // 上辺ハイライト
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(w * 0.08), Math.round(h * 0.28));
    ctx.lineTo(Math.round(w * 0.92), Math.round(h * 0.28));
    ctx.stroke();
  }

  function drawBackground(w, h) {
    if (!bgImage) {
      drawDefaultButton(w, h);
      return;
    }
    const iw = bgImage.naturalWidth || bgImage.width;
    const ih = bgImage.naturalHeight || bgImage.height;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.drawImage(bgImage, dx, dy, dw, dh);
  }

  function fontStack() {
    const selected = els.font?.value || "sans-serif";
    if (selected === "custom") {
      return customFontFamily ? `"${customFontFamily}", sans-serif` : "sans-serif";
    }
    return selected;
  }

  function render() {
    const w = Math.max(80, Number(els.width?.value) || 320);
    const h = Math.max(40, Number(els.height?.value) || 96);
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    drawBackground(w, h);

    const text = els.text?.value || "";
    const fontSize = Math.max(8, Number(els.fontSize?.value) || 28);
    const xPct = Number(els.posX?.value);
    const yPct = Number(els.posY?.value);
    const x = (Number.isFinite(xPct) ? xPct : 50) / 100 * w;
    const y = (Number.isFinite(yPct) ? yPct : 50) / 100 * h;

    ctx.fillStyle = els.textColor?.value || "#ffffff";
    ctx.font = `bold ${fontSize}px ${fontStack()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // 読みやすさ用の薄い影
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillText(text, x + 1, y + 1, w - 16);
    ctx.fillStyle = els.textColor?.value || "#ffffff";
    ctx.fillText(text, x, y, w - 16);
  }

  els.image?.addEventListener("change", async () => {
    const file = els.image.files?.[0];
    if (!file) return;
    try {
      bgImage = await ToolsCommon.readImageFile(file);
      render();
    } catch (err) {
      Utils.showToast(err?.message || "画像読み込み失敗", "error");
    }
  });

  els.clearImage?.addEventListener("click", () => {
    bgImage = null;
    if (els.image) els.image.value = "";
    render();
  });

  els.fontFile?.addEventListener("change", async () => {
    const file = els.fontFile.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const family = `FctzsBtnFont_${Date.now()}`;
      const face = new FontFace(family, buffer);
      await face.load();
      document.fonts.add(face);
      customFontFamily = family;
      if (els.font) els.font.value = "custom";
      render();
      Utils.showToast("フォントを読み込みました", "success");
    } catch {
      Utils.showToast("フォントの読み込みに失敗しました", "error");
    }
  });

  [
    els.width, els.height, els.text, els.font, els.fontSize,
    els.textColor, els.posX, els.posY
  ].forEach((el) => {
    el?.addEventListener("input", render);
    el?.addEventListener("change", render);
  });

  els.download?.addEventListener("click", () => {
    const name = (els.text?.value || "button").trim().replace(/[\\/:*?"<>|]/g, "_") || "button";
    ToolsCommon.downloadCanvasPng(canvas, `${name}-button.png`);
  });

  render();
})();
