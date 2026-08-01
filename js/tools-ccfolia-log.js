// ココフォリア HTML ログ：ファイル取込・キャラ／判定フィルタ・最終 SAN
"use strict";

(() => {
  const OUTCOMES = ["成功", "スペシャル", "クリティカル", "失敗", "ファンブル"];

  const fileEl = document.getElementById("log-file");
  const fileNameEl = document.getElementById("log-file-name");
  const metaEl = document.getElementById("log-meta");
  const charactersEl = document.getElementById("log-characters");
  const finalSanEl = document.getElementById("log-final-san");
  const outcomesEl = document.getElementById("log-outcomes");
  const outputEl = document.getElementById("log-output");
  const countEl = document.getElementById("log-count");
  const copyBtn = document.getElementById("log-copy");

  /** @type {{ channel: string, speaker: string, body: string, kind: string, outcome: string|null, sanName: string|null, sanTo: number|null }[]} */
  let messages = [];
  /** @type {string[]} */
  let characterNames = [];
  /** @type {Map<string, number>} */
  let finalSanByName = new Map();

  function decodeEntities(text) {
    return String(text || "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  function normalizeName(name) {
    return String(name || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function htmlToText(html) {
    return decodeEntities(
      String(html || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
    ).trim();
  }

  function detectOutcome(body) {
    const t = String(body || "");
    if (/スペシャル/.test(t)) return "スペシャル";
    if (/クリティカル/.test(t)) return "クリティカル";
    if (/致命的失敗|ファンブル/.test(t)) return "ファンブル";
    // 「成功数」は成功判定とは別扱い
    if (/失敗/.test(t) && !/成功数/.test(t)) return "失敗";
    if (/成功/.test(t) && !/成功数/.test(t)) return "成功";
    return null;
  }

  function parseSanChange(body) {
    // [ 名前 ] SAN : 60 → 59
    const m = String(body || "").match(
      /\[\s*(.+?)\s*\]\s*SAN\s*:\s*(-?\d+)\s*[→➡]\s*(-?\d+)/i
    );
    if (!m) return null;
    return {
      name: normalizeName(m[1]),
      from: Number(m[2]),
      to: Number(m[3])
    };
  }

  function isDiceBody(body) {
    const t = String(body || "");
    return /(1[Dd]\d+|CCB|\d+B100|[＞>].*(成功|失敗|スペシャル|クリティカル|ファンブル|致命的)|ダメージ判定)/.test(t);
  }

  /**
   * ココフォリア HTML エクスポートをメッセージ配列へ
   */
  function parseCcfoliaHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const paragraphs = [...(doc.body?.children || [])].filter((el) => el.tagName === "P");
    /** @type {typeof messages} */
    const list = [];

    for (const p of paragraphs) {
      const spans = [...p.children].filter((el) => el.tagName === "SPAN");
      if (spans.length < 3) continue;

      const channelRaw = htmlToText(spans[0].innerHTML);
      const channel = channelRaw.replace(/^\[|\]$/g, "").trim();
      const speaker = normalizeName(htmlToText(spans[1].innerHTML));
      const body = htmlToText(spans[2].innerHTML);
      if (!speaker && !body) continue;

      const san = parseSanChange(body);
      let kind = "speech";
      let outcome = null;
      if (san) {
        kind = "san";
      } else if (isDiceBody(body) || detectOutcome(body)) {
        kind = "dice";
        outcome = detectOutcome(body);
      } else if (speaker.toLowerCase() === "system") {
        kind = "system";
      }

      list.push({
        channel,
        speaker,
        body,
        kind,
        outcome,
        sanName: san?.name || null,
        sanTo: san && Number.isFinite(san.to) ? san.to : null
      });
    }
    return list;
  }

  function rebuildCharacterIndex() {
    const names = new Set();
    finalSanByName = new Map();

    for (const msg of messages) {
      if (msg.speaker && msg.speaker.toLowerCase() !== "system") {
        names.add(msg.speaker);
      }
      if (msg.kind === "san" && msg.sanName) {
        names.add(msg.sanName);
        finalSanByName.set(msg.sanName, msg.sanTo);
      }
    }

    characterNames = [...names].sort((a, b) => a.localeCompare(b, "ja"));
  }

  function selectedCharacters() {
    if (!charactersEl) return new Set(characterNames);
    const checked = [...charactersEl.querySelectorAll('input[type="checkbox"]:checked')]
      .map((el) => el.value);
    return new Set(checked);
  }

  function selectedOutcomes() {
    if (!outcomesEl) return new Set();
    return new Set(
      [...outcomesEl.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value)
    );
  }

  function messageMatchesFilters(msg, chars, outcomes) {
    // キャラフィルタ
    const relatedName = msg.kind === "san" ? msg.sanName : msg.speaker;
    if (chars.size > 0) {
      if (!relatedName || !chars.has(relatedName)) return false;
    }

    // 判定結果フィルタ（何か選ばれているときだけダイス行に適用）
    if (outcomes.size > 0) {
      if (msg.kind !== "dice" || !msg.outcome || !outcomes.has(msg.outcome)) {
        return false;
      }
    }
    return true;
  }

  function formatMessage(msg) {
    const ch = msg.channel ? `[${msg.channel}] ` : "";
    if (msg.kind === "san") {
      return `${ch}system：${msg.body.replace(/\n/g, " ")}`;
    }
    return `${ch}${msg.speaker}：${msg.body}`;
  }

  function renderCharacters() {
    if (!charactersEl) return;
    if (!characterNames.length) {
      charactersEl.innerHTML = `<p class="u-muted">キャラクター名を取得できませんでした。</p>`;
      return;
    }
    charactersEl.innerHTML = characterNames.map((name) => {
      const san = finalSanByName.has(name) ? finalSanByName.get(name) : null;
      const sanLabel = san == null ? "SAN ―" : `SAN ${san}`;
      return `
        <label class="tools-log-char">
          <input type="checkbox" value="${Utils.escapeHtml(name)}" checked>
          <span class="tools-log-char-name">${Utils.escapeHtml(name)}</span>
          <span class="tools-log-char-san">${sanLabel}</span>
        </label>`;
    }).join("");

    charactersEl.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener("change", renderFiltered);
    });
  }

  function renderFinalSan() {
    if (!finalSanEl) return;
    if (!finalSanByName.size) {
      finalSanEl.innerHTML = `<p class="u-muted">SAN 変化の記録はありません。</p>`;
      return;
    }
    const rows = [...finalSanByName.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "ja"))
      .map(([name, san]) => `
        <div class="tools-log-san-row">
          <span>${Utils.escapeHtml(name)}</span>
          <strong>${san}</strong>
        </div>`)
      .join("");
    finalSanEl.innerHTML = rows;
  }

  function renderFiltered() {
    const chars = selectedCharacters();
    const outcomes = selectedOutcomes();
    const filtered = messages.filter((m) => messageMatchesFilters(m, chars, outcomes));
    const text = filtered.map(formatMessage).join("\n\n");
    if (outputEl) {
      outputEl.textContent = text || "（条件に一致するログがありません）";
    }
    if (countEl) {
      countEl.textContent = messages.length
        ? `（${filtered.length} / ${messages.length} 件）`
        : "";
    }
    if (copyBtn) copyBtn.disabled = !filtered.length;
  }

  function resetUi() {
    messages = [];
    characterNames = [];
    finalSanByName = new Map();
    if (metaEl) metaEl.hidden = true;
    if (charactersEl) charactersEl.innerHTML = "";
    if (finalSanEl) finalSanEl.innerHTML = "";
    if (outputEl) outputEl.textContent = "ログファイルを選択してください。";
    if (countEl) countEl.textContent = "";
    if (copyBtn) copyBtn.disabled = true;
    if (fileNameEl) fileNameEl.textContent = "未選択";
    outcomesEl?.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      el.checked = false;
    });
  }

  function loadHtml(html, fileName) {
    messages = parseCcfoliaHtml(html);
    rebuildCharacterIndex();
    if (fileNameEl) fileNameEl.textContent = fileName || "読み込み済み";
    if (metaEl) metaEl.hidden = false;
    renderCharacters();
    renderFinalSan();
    renderFiltered();
    if (!messages.length) {
      Utils.showToast("ログメッセージを取得できませんでした", "info");
    } else {
      Utils.showToast(`${messages.length} 件のログを読み込みました`, "success");
    }
  }

  fileEl?.addEventListener("change", async () => {
    const file = fileEl.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      loadHtml(text, file.name);
    } catch {
      Utils.showToast("ファイルの読み込みに失敗しました", "error");
      resetUi();
    }
  });

  outcomesEl?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener("change", renderFiltered);
  });

  document.getElementById("log-char-all")?.addEventListener("click", () => {
    charactersEl?.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      el.checked = true;
    });
    renderFiltered();
  });
  document.getElementById("log-char-none")?.addEventListener("click", () => {
    charactersEl?.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      el.checked = false;
    });
    renderFiltered();
  });

  copyBtn?.addEventListener("click", async () => {
    const text = outputEl?.textContent || "";
    if (!text || text.startsWith("（") || text.startsWith("ログファイル")) {
      Utils.showToast("コピーするログがありません", "info");
      return;
    }
    await ToolsCommon.copyText(text);
  });

  document.getElementById("log-clear")?.addEventListener("click", () => {
    if (fileEl) fileEl.value = "";
    resetUi();
  });
})();
