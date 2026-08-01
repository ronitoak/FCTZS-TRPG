// NPCコマ作成：画像＋ラベルを Canvas で合成して PNG 出力
"use strict";

(() => {
  const canvas = document.getElementById("npc-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  /** @type {HTMLImageElement|null} */
  let sourceImage = null;

  const els = {
    image: document.getElementById("npc-image"),
    name: document.getElementById("npc-name"),
    fit: document.getElementById("npc-fit"),
    size: document.getElementById("npc-size"),
    labelPos: document.getElementById("npc-label-pos"),
    fontSize: document.getElementById("npc-font-size"),
    textColor: document.getElementById("npc-text-color"),
    band: document.getElementById("npc-band"),
    bandColor: document.getElementById("npc-band-color"),
    download: document.getElementById("npc-download")
  };

  function drawPlaceholder(size) {
    ctx.fillStyle = "#d0d0d0";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#666";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("画像を選択", size / 2, size / 2);
  }

  function drawFittedImage(img, size, fit) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    let dw;
    let dh;
    let dx;
    let dy;
    if (fit === "contain") {
      const scale = Math.min(size / iw, size / ih);
      dw = iw * scale;
      dh = ih * scale;
      dx = (size - dw) / 2;
      dy = (size - dh) / 2;
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, size, size);
    } else {
      const scale = Math.max(size / iw, size / ih);
      dw = iw * scale;
      dh = ih * scale;
      dx = (size - dw) / 2;
      dy = (size - dh) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function render() {
    const size = Number(els.size?.value) || 280;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);

    if (!sourceImage) {
      drawPlaceholder(size);
      return;
    }

    drawFittedImage(sourceImage, size, els.fit?.value || "cover");

    const name = (els.name?.value || "").trim() || "NPC";
    const fontSize = Math.max(10, Number(els.fontSize?.value) || 22);
    const bandH = Math.round(fontSize * 1.8);
    const atTop = els.labelPos?.value === "top";
    const bandY = atTop ? 0 : size - bandH;

    if (els.band?.checked) {
      const color = els.bandColor?.value || "#000000";
      ctx.fillStyle = color.length === 7 ? `${color}b3` : "rgba(0,0,0,0.7)";
      // hex + alpha: simpler path
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = els.bandColor?.value || "#000000";
      ctx.fillRect(0, bandY, size, bandH);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = els.textColor?.value || "#ffffff";
    ctx.font = `bold ${fontSize}px "Hiragino Sans", "Noto Sans JP", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, size / 2, bandY + bandH / 2, size - 12);
  }

  els.image?.addEventListener("change", async () => {
    const file = els.image.files?.[0];
    if (!file) return;
    try {
      sourceImage = await ToolsCommon.readImageFile(file);
      render();
    } catch (err) {
      Utils.showToast(err?.message || "画像読み込み失敗", "error");
    }
  });

  ["input", "change"].forEach((ev) => {
    [els.name, els.fit, els.size, els.labelPos, els.fontSize, els.textColor, els.band, els.bandColor]
      .forEach((el) => el?.addEventListener(ev, render));
  });

  els.download?.addEventListener("click", () => {
    if (!sourceImage) {
      Utils.showToast("先に画像を選んでください", "info");
      return;
    }
    const name = (els.name?.value || "npc").trim().replace(/[\\/:*?"<>|]/g, "_") || "npc";
    ToolsCommon.downloadCanvasPng(canvas, `${name}-token.png`);
  });

  render();
})();
