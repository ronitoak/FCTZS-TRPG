// オリジナル表：/roll-table 形式テキストの作成
"use strict";

(() => {
  const titleEl = document.getElementById("dice-title");
  const countEl = document.getElementById("dice-count");
  const itemsEl = document.getElementById("dice-items");
  const previewEl = document.getElementById("dice-preview");
  const copyBtn = document.getElementById("dice-copy");

  function itemCount() {
    const n = Math.floor(Number(countEl?.value));
    if (!Number.isFinite(n)) return 1;
    return Math.min(100, Math.max(1, n));
  }

  function collectItemTexts() {
    if (!itemsEl) return [];
    return [...itemsEl.querySelectorAll(".dice-item-input")].map((input) =>
      String(input.value || "")
    );
  }

  function renderItemFields() {
    if (!itemsEl) return;
    const prev = collectItemTexts();
    const n = itemCount();
    if (countEl && Number(countEl.value) !== n) countEl.value = String(n);

    itemsEl.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const wrap = document.createElement("div");
      wrap.className = "tools-kv-row tools-dice-item-row";
      wrap.innerHTML = `
        <span class="tools-dice-item-index">${i + 1}</span>
        <input type="text" class="dice-item-input" placeholder="項目入力" value="${Utils.escapeHtml(prev[i] || "")}" aria-label="項目 ${i + 1}">
      `;
      const input = wrap.querySelector(".dice-item-input");
      input?.addEventListener("input", updatePreview);
      itemsEl.appendChild(wrap);
    }
    updatePreview();
  }

  function buildRollTableText() {
    const title = String(titleEl?.value || "").trim() || "オリジナル表";
    const n = itemCount();
    const items = collectItemTexts();
    const lines = [
      "/roll-table",
      title,
      `1D${n}`,
      ...Array.from({ length: n }, (_, i) => `${i + 1}:${items[i] || ""}`)
    ];
    return lines.join("\n");
  }

  function updatePreview() {
    if (previewEl) previewEl.textContent = buildRollTableText();
  }

  titleEl?.addEventListener("input", updatePreview);
  countEl?.addEventListener("input", renderItemFields);
  countEl?.addEventListener("change", renderItemFields);

  copyBtn?.addEventListener("click", async () => {
    await ToolsCommon.copyText(buildRollTableText());
  });

  renderItemFields();
})();
