// 便利ツール共通：PNG保存・クリップボード・簡易ヘルパ
"use strict";

window.ToolsCommon = (() => {
  function downloadCanvasPng(canvas, filename) {
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const name = filename || "download.png";
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  async function copyText(text) {
    const value = String(text ?? "");
    if (!value) {
      Utils.showToast("コピーする内容がありません", "info");
      return false;
    }
    try {
      await navigator.clipboard.writeText(value);
      Utils.showToast("コピーしました", "success");
      return true;
    } catch {
      Utils.showToast("コピーに失敗しました", "error");
      return false;
    }
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("ファイルがありません"));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("画像の読み込みに失敗しました"));
      };
      img.src = url;
    });
  }

  return { downloadCanvasPng, copyText, readImageFile };
})();
