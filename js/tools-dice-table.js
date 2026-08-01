// オリジナルダイス表：編集・試行・localStorage 下書き・テキスト書き出し
"use strict";

(() => {
  const STORAGE_KEY = "fctzs-dice-table-draft";
  const rowsEl = document.getElementById("dice-rows");
  const previewEl = document.getElementById("dice-preview");
  const resultEl = document.getElementById("dice-roll-result");
  const titleEl = document.getElementById("dice-title");
  const sidesEl = document.getElementById("dice-sides");

  /** @type {{ from: number, to: number, text: string }[]} */
  let rows = [];

  function sides() {
    return Math.max(2, Number(sidesEl?.value) || 100);
  }

  function defaultRows(n) {
    if (n <= 20) {
      return Array.from({ length: n }, (_, i) => ({
        from: i + 1,
        to: i + 1,
        text: `結果 ${i + 1}`
      }));
    }
    // 1d100 などは10区切りのサンプル
    const step = Math.floor(n / 10) || 1;
    const out = [];
    for (let start = 1; start <= n; start += step) {
      const end = Math.min(n, start + step - 1);
      out.push({ from: start, to: end, text: `${start}〜${end} の結果` });
    }
    return out;
  }

  function collectFromDom() {
    if (!rowsEl) return;
    const next = [];
    rowsEl.querySelectorAll(".tools-dice-row").forEach((row) => {
      const from = Number(row.querySelector(".dice-from")?.value);
      const to = Number(row.querySelector(".dice-to")?.value);
      const text = String(row.querySelector(".dice-text")?.value || "");
      if (!Number.isFinite(from) || !Number.isFinite(to)) return;
      next.push({
        from: Math.min(from, to),
        to: Math.max(from, to),
        text
      });
    });
    rows = next;
  }

  function renderRows() {
    if (!rowsEl) return;
    rowsEl.innerHTML = rows.map((r, i) => `
      <div class="tools-dice-row" data-index="${i}">
        <input class="dice-from" type="number" value="${r.from}" min="1" aria-label="from">
        <input class="dice-to" type="number" value="${r.to}" min="1" aria-label="to">
        <input class="dice-text" type="text" value="${Utils.escapeHtml(r.text)}" aria-label="結果">
        <button type="button" class="btn-small btn-secondary dice-remove" data-index="${i}">削除</button>
      </div>
    `).join("");

    rowsEl.querySelectorAll(".dice-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        collectFromDom();
        const idx = Number(btn.getAttribute("data-index"));
        rows.splice(idx, 1);
        renderRows();
        updatePreview();
      });
    });

    rowsEl.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        collectFromDom();
        updatePreview();
      });
    });
  }

  function formatTableText() {
    const title = (titleEl?.value || "オリジナル表").trim();
    const die = `1d${sides()}`;
    const lines = [
      `# ${title}`,
      `ダイス: ${die}`,
      "",
      ...rows.map((r) => {
        const range = r.from === r.to ? String(r.from) : `${r.from}-${r.to}`;
        return `${range}: ${r.text}`;
      })
    ];
    return lines.join("\n");
  }

  function updatePreview() {
    if (previewEl) previewEl.textContent = formatTableText();
  }

  function findResult(roll) {
    return rows.find((r) => roll >= r.from && roll <= r.to) || null;
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (titleEl && typeof data.title === "string") titleEl.value = data.title;
      if (sidesEl && data.sides) sidesEl.value = String(data.sides);
      if (Array.isArray(data.rows) && data.rows.length) {
        rows = data.rows.map((r) => ({
          from: Number(r.from) || 1,
          to: Number(r.to) || 1,
          text: String(r.text || "")
        }));
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  function saveDraft() {
    collectFromDom();
    const payload = {
      title: titleEl?.value || "",
      sides: sides(),
      rows
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    Utils.showToast("下書きを保存しました", "success");
  }

  document.getElementById("dice-add-row")?.addEventListener("click", () => {
    collectFromDom();
    const last = rows[rows.length - 1];
    const from = last ? last.to + 1 : 1;
    rows.push({ from, to: from, text: "新しい結果" });
    renderRows();
    updatePreview();
  });

  document.getElementById("dice-fill")?.addEventListener("click", () => {
    rows = defaultRows(sides());
    renderRows();
    updatePreview();
  });

  document.getElementById("dice-roll")?.addEventListener("click", () => {
    collectFromDom();
    const n = sides();
    const roll = 1 + Math.floor(Math.random() * n);
    const hit = findResult(roll);
    if (resultEl) {
      resultEl.hidden = false;
      resultEl.textContent = hit
        ? `出目 ${roll} → ${hit.text}`
        : `出目 ${roll} → （該当行なし）`;
    }
  });

  document.getElementById("dice-save")?.addEventListener("click", saveDraft);
  document.getElementById("dice-export")?.addEventListener("click", () => {
    collectFromDom();
    ToolsCommon.copyText(formatTableText());
  });

  sidesEl?.addEventListener("change", updatePreview);
  titleEl?.addEventListener("input", updatePreview);

  if (!loadDraft()) {
    rows = defaultRows(sides());
  }
  renderRows();
  updatePreview();
})();
