// NPCコマ作成：ココフォリア Clipboard API（character JSON）
"use strict";

(() => {
  const els = {
    name: document.getElementById("npc-name"),
    statusRows: document.getElementById("npc-status-rows"),
    paramRows: document.getElementById("npc-param-rows"),
    secret: document.getElementById("npc-secret"),
    invisible: document.getElementById("npc-invisible"),
    hideStatus: document.getElementById("npc-hide-status"),
    commands: document.getElementById("npc-commands"),
    secretDice: document.getElementById("npc-secret-dice"),
    copyJson: document.getElementById("npc-copy-json")
  };

  /** シークレットダイス ON 前の生コマンド（s 付与前） */
  let rawCommands = "";

  function attr(value) {
    return Utils.escapeHtml(value);
  }

  function bindRowEvents(container) {
    container.querySelectorAll(".row-remove").forEach((btn) => {
      btn.onclick = () => {
        btn.closest(".tools-kv-row")?.remove();
      };
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

  function appendParamRow(item = { label: "", value: "" }) {
    if (!els.paramRows) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="tools-kv-row">
        <input type="text" class="kv-label" placeholder="STR など" value="${attr(item.label)}" aria-label="パラメータ名">
        <input type="text" class="kv-value" placeholder="値" value="${attr(item.value)}" aria-label="パラメータ値">
        <button type="button" class="btn-small btn-secondary row-remove">削除</button>
      </div>`;
    const row = wrap.firstElementChild;
    if (!row) return;
    els.paramRows.appendChild(row);
    bindRowEvents(els.paramRows);
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

  function collectParams() {
    if (!els.paramRows) return [];
    return [...els.paramRows.querySelectorAll(".tools-kv-row")].map((row) => {
      const label = String(row.querySelector(".kv-label")?.value || "").trim();
      const value = String(row.querySelector(".kv-value")?.value || "").trim();
      return { label, value };
    }).filter((p) => p.label);
  }

  function stripSecretPrefix(line) {
    const t = String(line || "");
    // 行頭の s / S（ダイスシークレット）だけ外す。空白は維持しない
    return t.replace(/^s(?=\S)/i, "");
  }

  function applySecretPrefix(line) {
    const t = String(line || "").trimEnd();
    if (!t.trim()) return t;
    if (/^s(?=\S)/i.test(t)) return t;
    return `s${t}`;
  }

  function syncCommandsFromRaw() {
    if (!els.commands) return;
    const lines = rawCommands.split("\n");
    const next = els.secretDice?.checked
      ? lines.map(applySecretPrefix).join("\n")
      : lines.map(stripSecretPrefix).join("\n");
    els.commands.value = next;
  }

  function captureRawFromTextarea() {
    if (!els.commands) return;
    // 表示中のテキストから s を除いたものを生データとして保持
    rawCommands = els.commands.value
      .split("\n")
      .map(stripSecretPrefix)
      .join("\n");
  }

  function appendPreset(commandLine) {
    captureRawFromTextarea();
    const base = String(commandLine || "");
    if (!rawCommands.trim()) {
      rawCommands = base;
    } else {
      rawCommands = `${rawCommands.replace(/\n+$/, "")}\n${base}`;
    }
    syncCommandsFromRaw();
  }

  function buildCommandsForExport() {
    captureRawFromTextarea();
    const lines = rawCommands.split("\n");
    if (els.secretDice?.checked) {
      return lines.map(applySecretPrefix).join("\n");
    }
    return lines.map(stripSecretPrefix).join("\n");
  }

  function buildCcfoliaClipboardPayload() {
    const name = String(els.name?.value || "").trim() || "NPC";
    return {
      kind: "character",
      data: {
        name,
        status: collectStatus(),
        params: collectParams(),
        commands: buildCommandsForExport(),
        secret: Boolean(els.secret?.checked),
        invisible: Boolean(els.invisible?.checked),
        hideStatus: Boolean(els.hideStatus?.checked)
      }
    };
  }

  // 初期ステータス
  [
    { label: "HP", value: 0, max: 0 },
    { label: "MP", value: 0, max: 0 },
    { label: "SAN", value: 0, max: 0 }
  ].forEach(appendStatusRow);

  // 初期パラメータ
  ["STR", "CON", "SIZ", "INT", "POW", "DEX", "APP", "EDU"].forEach((label) => {
    appendParamRow({ label, value: "" });
  });

  document.getElementById("npc-add-status")?.addEventListener("click", () => {
    appendStatusRow({ label: "", value: 0, max: 0 });
  });
  document.getElementById("npc-add-param")?.addEventListener("click", () => {
    appendParamRow({ label: "", value: "" });
  });

  document.getElementById("npc-preset-1d100")?.addEventListener("click", () => {
    appendPreset("1d100");
  });
  document.getElementById("npc-preset-ccb")?.addEventListener("click", () => {
    appendPreset("CCB<= 【技能】");
  });

  els.secretDice?.addEventListener("change", () => {
    captureRawFromTextarea();
    syncCommandsFromRaw();
  });

  els.commands?.addEventListener("input", () => {
    // 編集中は表示どおりを取り込み、トグル／書き出し時に s を正しく付け外しできるよう生データを更新
    captureRawFromTextarea();
  });
  els.commands?.addEventListener("blur", () => {
    captureRawFromTextarea();
    syncCommandsFromRaw();
  });

  els.copyJson?.addEventListener("click", async () => {
    await ToolsCommon.copyText(JSON.stringify(buildCcfoliaClipboardPayload()));
  });
})();
