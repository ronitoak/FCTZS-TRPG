// NPCコマ作成：ココフォリア Clipboard API（character JSON）の組み立て
"use strict";

(() => {
  const jsonPreviewEl = document.getElementById("npc-json-preview");

  const els = {
    name: document.getElementById("npc-name"),
    initiative: document.getElementById("npc-initiative"),
    memo: document.getElementById("npc-memo"),
    statusRows: document.getElementById("npc-status-rows"),
    paramRows: document.getElementById("npc-param-rows"),
    skillRows: document.getElementById("npc-skill-rows"),
    copyJson: document.getElementById("npc-copy-json")
  };

  function attr(value) {
    return Utils.escapeHtml(value);
  }

  function bindRowEvents(container) {
    container.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", refreshJsonPreview);
    });
    container.querySelectorAll(".row-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.closest(".tools-kv-row")?.remove();
        refreshJsonPreview();
      });
    });
  }

  function appendStatusRow(item = { label: "", value: 0, max: 0 }) {
    if (!els.statusRows) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="tools-kv-row tools-status-row">
        <input type="text" class="st-label" placeholder="ラベル" value="${attr(item.label)}" aria-label="ステータス名">
        <input type="number" class="st-value" placeholder="現在" value="${attr(item.value)}" aria-label="現在値">
        <input type="number" class="st-max" placeholder="最大" value="${attr(item.max)}" aria-label="最大値">
        <button type="button" class="btn-small btn-secondary row-remove">削除</button>
      </div>`;
    const row = wrap.firstElementChild;
    if (!row) return;
    els.statusRows.appendChild(row);
    bindRowEvents(els.statusRows);
  }

  function appendKvRow(container, item, placeholders) {
    if (!container) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="tools-kv-row">
        <input type="text" class="kv-label" placeholder="${placeholders.label}" value="${attr(item.label)}" aria-label="名前">
        <input type="text" class="kv-value" placeholder="${placeholders.value}" value="${attr(item.value)}" aria-label="値">
        <button type="button" class="btn-small btn-secondary row-remove">削除</button>
      </div>`;
    const row = wrap.firstElementChild;
    if (!row) return;
    container.appendChild(row);
    bindRowEvents(container);
  }

  function collectStatus() {
    if (!els.statusRows) return [];
    return [...els.statusRows.querySelectorAll(".tools-status-row")].map((row) => {
      const label = String(row.querySelector(".st-label")?.value || "").trim();
      const value = Number(row.querySelector(".st-value")?.value);
      const max = Number(row.querySelector(".st-max")?.value);
      return {
        label,
        value: Number.isFinite(value) ? value : 0,
        max: Number.isFinite(max) ? max : 0
      };
    }).filter((s) => s.label);
  }

  function collectLabelValues(container) {
    if (!container) return [];
    return [...container.querySelectorAll(".tools-kv-row")].map((row) => {
      const label = String(row.querySelector(".kv-label")?.value || "").trim();
      const value = String(row.querySelector(".kv-value")?.value || "").trim();
      return { label, value };
    }).filter((p) => p.label);
  }

  function buildSkillCommands(skills) {
    return skills.map((s) => {
      const n = Number(s.value);
      if (Number.isFinite(n) && String(s.value).trim() !== "") {
        return `1d100<=${n} 【${s.label}】`;
      }
      if (s.value) return `${s.value} 【${s.label}】`;
      return `【${s.label}】`;
    }).join("\n");
  }

  /**
   * CCFOLIA Clipboard API:
   * { kind: "character", data: Partial<Character> }
   * iconUrl / faces / x / y / active は外部から設定しない。
   */
  function buildCcfoliaClipboardPayload() {
    const name = String(els.name?.value || "").trim() || "NPC";
    const initiative = Number(els.initiative?.value);
    const memo = String(els.memo?.value || "");
    const status = collectStatus();
    const params = collectLabelValues(els.paramRows);
    const skills = collectLabelValues(els.skillRows);

    const paramMap = new Map();
    params.forEach((p) => paramMap.set(p.label, p.value));
    skills.forEach((s) => paramMap.set(s.label, s.value));
    const mergedParams = [...paramMap.entries()].map(([label, value]) => ({ label, value }));

    return {
      kind: "character",
      data: {
        name,
        memo,
        initiative: Number.isFinite(initiative) ? initiative : 0,
        externalUrl: "",
        status,
        params: mergedParams,
        commands: buildSkillCommands(skills),
        secret: false,
        invisible: false,
        hideStatus: false
      }
    };
  }

  function refreshJsonPreview() {
    if (jsonPreviewEl) {
      jsonPreviewEl.textContent = JSON.stringify(buildCcfoliaClipboardPayload(), null, 2);
    }
  }

  appendStatusRow({ label: "HP", value: 10, max: 10 });
  appendStatusRow({ label: "MP", value: 10, max: 10 });
  appendKvRow(els.paramRows, { label: "STR", value: "" }, { label: "STR など", value: "値" });
  appendKvRow(els.paramRows, { label: "DEX", value: "" }, { label: "STR など", value: "値" });
  appendKvRow(els.paramRows, { label: "INT", value: "" }, { label: "STR など", value: "値" });
  appendKvRow(els.skillRows, { label: "", value: "" }, { label: "技能名", value: "技能値" });

  document.getElementById("npc-add-status")?.addEventListener("click", () => {
    appendStatusRow({ label: "", value: 0, max: 0 });
    refreshJsonPreview();
  });
  document.getElementById("npc-add-param")?.addEventListener("click", () => {
    appendKvRow(els.paramRows, { label: "", value: "" }, { label: "STR など", value: "値" });
    refreshJsonPreview();
  });
  document.getElementById("npc-add-skill")?.addEventListener("click", () => {
    appendKvRow(els.skillRows, { label: "", value: "" }, { label: "技能名", value: "技能値" });
    refreshJsonPreview();
  });

  els.copyJson?.addEventListener("click", async () => {
    await ToolsCommon.copyText(JSON.stringify(buildCcfoliaClipboardPayload()));
  });

  [els.name, els.initiative, els.memo].forEach((el) => {
    el?.addEventListener("input", refreshJsonPreview);
  });

  refreshJsonPreview();
})();
