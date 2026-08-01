// NPCコマ作成：ココフォリア Clipboard API（character JSON）＋6版想定の自動計算
"use strict";

(() => {
  const INITIAL_PARAMS = ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU"];

  const els = {
    name: document.getElementById("npc-name"),
    statusRows: document.getElementById("npc-status-rows"),
    paramRows: document.getElementById("npc-param-rows"),
    commandRows: document.getElementById("npc-command-rows"),
    initiative: document.getElementById("npc-initiative"),
    dbDisplay: document.getElementById("npc-db-display"),
    secret: document.getElementById("npc-secret"),
    invisible: document.getElementById("npc-invisible"),
    hideStatus: document.getElementById("npc-hide-status"),
    copyJson: document.getElementById("npc-copy-json")
  };

  /** 最新のダメージボーナス表示値（プリセット代入用） */
  let currentDbLabel = "―";

  function attr(value) {
    return Utils.escapeHtml(value);
  }

  function rollDice(count, sides) {
    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += 1 + Math.floor(Math.random() * sides);
    }
    return sum;
  }

  function rollForParamLabel(label) {
    const key = String(label || "").trim().toUpperCase();
    if (key === "EDU") return rollDice(3, 6) + 3;
    if (key === "SIZ" || key === "INT") return rollDice(2, 6) + 6;
    return rollDice(3, 6);
  }

  function diceHintForLabel(label) {
    const key = String(label || "").trim().toUpperCase();
    if (key === "EDU") return "3D6+3";
    if (key === "SIZ" || key === "INT") return "2D6+6";
    return "3D6";
  }

  function bindStatusRow(row) {
    row.querySelector(".row-remove")?.addEventListener("click", () => {
      row.remove();
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
    bindStatusRow(row);
  }

  function bindParamRow(row) {
    row.querySelector(".row-remove")?.addEventListener("click", () => {
      row.remove();
      recalculateDerived();
    });
    row.querySelectorAll(".kv-label, .kv-value").forEach((input) => {
      input.addEventListener("input", () => {
        const diceBtn = row.querySelector(".param-dice");
        if (diceBtn) {
          const label = row.querySelector(".kv-label")?.value || "";
          diceBtn.title = `${diceHintForLabel(label)} を振る`;
        }
        recalculateDerived();
      });
    });
    row.querySelector(".param-dice")?.addEventListener("click", () => {
      const label = row.querySelector(".kv-label")?.value || "";
      const valueEl = row.querySelector(".kv-value");
      if (valueEl) valueEl.value = String(rollForParamLabel(label));
      recalculateDerived();
    });
  }

  function appendParamRow(item = { label: "", value: "" }) {
    if (!els.paramRows) return;
    const hint = diceHintForLabel(item.label);
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="tools-kv-row tools-param-row">
        <input type="text" class="kv-label" placeholder="STR など" value="${attr(item.label)}" aria-label="パラメータ名">
        <input type="text" class="kv-value" placeholder="値" value="${attr(item.value)}" aria-label="パラメータ値" inputmode="numeric">
        <button type="button" class="btn-small btn-secondary param-dice" title="${hint} を振る">🎲</button>
        <button type="button" class="btn-small btn-secondary row-remove">削除</button>
      </div>`;
    const row = wrap.firstElementChild;
    if (!row) return;
    els.paramRows.appendChild(row);
    bindParamRow(row);
  }

  function bindCommandRow(row) {
    row.querySelector(".row-remove")?.addEventListener("click", () => {
      row.remove();
    });
  }

  function appendCommandRow(item = { text: "", secret: false }) {
    if (!els.commandRows) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="tools-kv-row tools-command-row">
        <input type="text" class="cmd-text" placeholder="コマンド" value="${attr(item.text)}" aria-label="コマンド">
        <label class="tools-toggle tools-toggle-compact">
          <input type="checkbox" class="cmd-secret" ${item.secret ? "checked" : ""}>
          <span>シークレットダイス</span>
        </label>
        <button type="button" class="btn-small btn-secondary row-remove">削除</button>
      </div>`;
    const row = wrap.firstElementChild;
    if (!row) return;
    els.commandRows.appendChild(row);
    bindCommandRow(row);
  }

  function getParamNumber(label) {
    const key = String(label || "").trim().toUpperCase();
    if (!els.paramRows || !key) return null;
    for (const row of els.paramRows.querySelectorAll(".tools-param-row, .tools-kv-row")) {
      const name = String(row.querySelector(".kv-label")?.value || "").trim().toUpperCase();
      if (name !== key) continue;
      const raw = String(row.querySelector(".kv-value")?.value || "").trim();
      if (raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  function calcHp(con, siz) {
    if (con == null || siz == null) return null;
    return Math.ceil((con + siz) / 2);
  }

  function calcDamageBonus(str, siz) {
    if (str == null || siz == null) return null;
    const sum = str + siz;
    if (sum < 2 || sum > 999) return "―";
    if (sum <= 12) return "-1d6";
    if (sum <= 16) return "-1d4";
    if (sum <= 24) return "±0";
    if (sum <= 32) return "+1d4";
    if (sum <= 40) return "+1d6";
    if (sum <= 56) return "+2d6";
    // 57 以降は 16 ごとに +1d6（57〜72=+3d6 … 最大 STR+SIZ=999）
    const dice = 3 + Math.floor((sum - 57) / 16);
    return `+${dice}d6`;
  }

  /** プリセット用: 1dN+DB の DB 部分 */
  function dbSuffixForCommand() {
    const db = currentDbLabel;
    if (!db || db === "―" || db === "±0") return "";
    return db;
  }

  function damageCommand(die) {
    const suffix = dbSuffixForCommand();
    return suffix ? `${die}${suffix}` : die;
  }

  function setStatusByLabel(label, value) {
    if (!els.statusRows || value == null) return;
    const row = [...els.statusRows.querySelectorAll(".tools-status-row")].find((r) => {
      return String(r.querySelector(".st-label")?.value || "").trim().toUpperCase() === label;
    });
    if (!row) return;
    const valueEl = row.querySelector(".st-value");
    const maxEl = row.querySelector(".st-max");
    if (valueEl) valueEl.value = String(value);
    if (maxEl) maxEl.value = String(value);
  }

  function recalculateDerived() {
    const str = getParamNumber("STR");
    const con = getParamNumber("CON");
    const siz = getParamNumber("SIZ");
    const pow = getParamNumber("POW");
    const dex = getParamNumber("DEX");

    const hp = calcHp(con, siz);
    if (hp != null) setStatusByLabel("HP", hp);
    if (pow != null) {
      setStatusByLabel("MP", pow);
      setStatusByLabel("SAN", pow * 5);
    }

    if (els.initiative && dex != null) {
      els.initiative.value = String(dex);
    }

    const db = calcDamageBonus(str, siz);
    currentDbLabel = db == null ? "―" : db;
    if (els.dbDisplay) {
      els.dbDisplay.textContent = currentDbLabel;
    }
  }

  function rollAllParams() {
    if (!els.paramRows) return;
    els.paramRows.querySelectorAll(".tools-param-row, .tools-kv-row").forEach((row) => {
      const label = row.querySelector(".kv-label")?.value || "";
      const valueEl = row.querySelector(".kv-value");
      if (!valueEl || !String(label).trim()) return;
      valueEl.value = String(rollForParamLabel(label));
    });
    recalculateDerived();
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
    return [...els.paramRows.querySelectorAll(".tools-param-row, .tools-kv-row")].map((row) => {
      const label = String(row.querySelector(".kv-label")?.value || "").trim();
      const value = String(row.querySelector(".kv-value")?.value || "").trim();
      return { label, value };
    }).filter((p) => p.label);
  }

  function collectCommands() {
    if (!els.commandRows) return "";
    return [...els.commandRows.querySelectorAll(".tools-command-row")].map((row) => {
      let text = String(row.querySelector(".cmd-text")?.value || "").trim();
      if (!text) return "";
      const secret = Boolean(row.querySelector(".cmd-secret")?.checked);
      if (secret && !/^s(?=\S)/i.test(text)) {
        text = `s${text}`;
      }
      return text;
    }).filter(Boolean).join("\n");
  }

  function buildCcfoliaClipboardPayload() {
    const name = String(els.name?.value || "").trim() || "NPC";
    const initiative = Number(els.initiative?.value);
    return {
      kind: "character",
      data: {
        name,
        initiative: Number.isFinite(initiative) ? initiative : 0,
        status: collectStatus(),
        params: collectParams(),
        commands: collectCommands(),
        secret: Boolean(els.secret?.checked),
        invisible: Boolean(els.invisible?.checked),
        hideStatus: Boolean(els.hideStatus?.checked)
      }
    };
  }

  [
    { label: "HP", value: 0, max: 0 },
    { label: "MP", value: 0, max: 0 },
    { label: "SAN", value: 0, max: 0 }
  ].forEach((item) => appendStatusRow(item));

  INITIAL_PARAMS.forEach((label) => {
    appendParamRow({ label, value: "" });
  });

  document.getElementById("npc-add-status")?.addEventListener("click", () => {
    appendStatusRow({ label: "", value: 0, max: 0 });
  });
  document.getElementById("npc-add-param")?.addEventListener("click", () => {
    appendParamRow({ label: "", value: "" });
  });
  document.getElementById("npc-roll-all")?.addEventListener("click", rollAllParams);

  document.getElementById("npc-add-command")?.addEventListener("click", () => {
    appendCommandRow({ text: "", secret: false });
  });
  document.getElementById("npc-preset-1d100")?.addEventListener("click", () => {
    appendCommandRow({ text: "1d100", secret: false });
  });
  document.getElementById("npc-preset-ccb")?.addEventListener("click", () => {
    appendCommandRow({ text: "CCB<= 【技能】", secret: false });
  });
  document.getElementById("npc-preset-1d3db")?.addEventListener("click", () => {
    appendCommandRow({ text: damageCommand("1d3"), secret: false });
  });
  document.getElementById("npc-preset-1d4db")?.addEventListener("click", () => {
    appendCommandRow({ text: damageCommand("1d4"), secret: false });
  });
  document.getElementById("npc-preset-1d6db")?.addEventListener("click", () => {
    appendCommandRow({ text: damageCommand("1d6"), secret: false });
  });
  document.getElementById("npc-preset-resb")?.addEventListener("click", () => {
    appendCommandRow({ text: "RESB(攻 - 受)", secret: false });
  });
  document.getElementById("npc-preset-param5")?.addEventListener("click", () => {
    INITIAL_PARAMS.forEach((p) => {
      appendCommandRow({ text: `{${p}} * 5`, secret: false });
    });
  });

  els.copyJson?.addEventListener("click", async () => {
    await ToolsCommon.copyText(JSON.stringify(buildCcfoliaClipboardPayload()));
  });

  recalculateDerived();
})();
