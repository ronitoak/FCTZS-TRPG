// ココフォリア HTML ログ：ファイル取込・キャラ／判定フィルタ・最終 SAN
"use strict";

(() => {
  const fileEl = document.getElementById("log-file");
  const fileNameEl = document.getElementById("log-file-name");
  const metaEl = document.getElementById("log-meta");
  const tabsEl = document.getElementById("log-tabs");
  const charactersEl = document.getElementById("log-characters");
  const finalSanEl = document.getElementById("log-final-san");
  const outcomesEl = document.getElementById("log-outcomes");
  const outputEl = document.getElementById("log-output");
  const countEl = document.getElementById("log-count");
  const copyBtn = document.getElementById("log-copy");

  /**
   * 表示対象の判定ログのみ（1d100 / CCB<= / CC<=）
   * @type {{ channel: string, speaker: string, body: string, outcome: string|null }[]}
   */
  let checkMessages = [];
  /** @type {string[]} */
  let tabNames = [];
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

  /**
   * 表示対象の判定コマンド行か。
   * 技能説明文中の「1d100発」「スペシャル成功時」などは除外し、
   * ダイスボット結果（＞ を含む実判定）だけを残す。
   */
  function isCheckRollBody(body) {
    const t = String(body || "");
    // ココフォリアの判定結果行はほぼ必ず全角「＞」を含む
    if (!/[＞>]/.test(t)) return false;
    if (/CCB<=\s*\d+/i.test(t)) return true;
    // CCB 以外の CC<=（直前が英字でない）
    if (/(^|[^A-Za-z])CC<=\s*\d+/i.test(t)) return true;
    // 1d100 / 1D100。ただし「1d100発」のような文言は除外
    if (/1[Dd]100(?!発)/.test(t)) return true;
    return false;
  }

  function detectOutcome(body) {
    const t = String(body || "");
    // より具体的な結果を先に判定
    if (/決定的成功|クリティカル/.test(t)) return "クリティカル";
    // 6版スペシャル / 7版イクストリーム成功は同列扱い
    if (/イクストリーム成功|スペシャル/.test(t)) return "スペシャル";
    if (/致命的失敗|ファンブル/.test(t)) return "ファンブル";
    if (/失敗/.test(t) && !/成功数/.test(t)) return "失敗";
    if (/成功/.test(t) && !/成功数/.test(t)) return "成功";

    // 単なる 1d100（目標値なし）: 出目 1〜5 クリティカル、96〜100 ファンブル
    const isPlainD100 =
      /1[Dd]100/.test(t) &&
      !/1[Dd]100\s*<=/.test(t) &&
      !/CCB<=\s*\d+/i.test(t) &&
      !/(^|[^A-Za-z])CC<=\s*\d+/i.test(t);
    if (isPlainD100) {
      const rolls = [...t.matchAll(/[＞>]\s*(\d+)/g)];
      if (rolls.length) {
        const n = Number(rolls[rolls.length - 1][1]);
        if (Number.isFinite(n)) {
          if (n <= 5) return "クリティカル";
          if (n >= 96) return "ファンブル";
        }
      }
    }
    return null;
  }

  function parseSanChange(body) {
    const m = String(body || "").match(
      /\[\s*(.+?)\s*\]\s*SAN\s*:\s*(-?\d+)\s*[→➡]\s*(-?\d+)/i
    );
    if (!m) return null;
    return {
      name: normalizeName(m[1]),
      to: Number(m[3])
    };
  }

  function parseCcfoliaHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const paragraphs = [...(doc.body?.children || [])].filter((el) => el.tagName === "P");
    /** @type {typeof checkMessages} */
    const checks = [];
    const sanMap = new Map();
    const names = new Set();
    const tabs = new Set();

    for (const p of paragraphs) {
      const spans = [...p.children].filter((el) => el.tagName === "SPAN");
      if (spans.length < 3) continue;

      const channelRaw = htmlToText(spans[0].innerHTML);
      const channel = channelRaw.replace(/^\[|\]$/g, "").trim();
      const speaker = normalizeName(htmlToText(spans[1].innerHTML));
      const body = htmlToText(spans[2].innerHTML);
      if (!speaker && !body) continue;

      if (channel) tabs.add(channel);

      const san = parseSanChange(body);
      if (san && Number.isFinite(san.to)) {
        sanMap.set(san.name, san.to);
        names.add(san.name);
      }

      if (!isCheckRollBody(body)) continue;

      const outcome = detectOutcome(body);
      if (speaker && speaker.toLowerCase() !== "system") {
        names.add(speaker);
      }

      checks.push({
        channel,
        speaker,
        body,
        outcome
      });
    }

    return {
      checkMessages: checks,
      finalSanByName: sanMap,
      // SAN 取得済みを先に、未取得を後ろ。同グループ内は名前順
      characterNames: [...names].sort((a, b) => {
        const aHas = sanMap.has(a) ? 0 : 1;
        const bHas = sanMap.has(b) ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        return a.localeCompare(b, "ja");
      }),
      tabNames: [...tabs].sort((a, b) => a.localeCompare(b, "ja"))
    };
  }

  function selectedTabs() {
    if (!tabsEl) return new Set(tabNames);
    return new Set(
      [...tabsEl.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value)
    );
  }

  function selectedCharacters() {
    if (!charactersEl) return new Set(characterNames);
    return new Set(
      [...charactersEl.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value)
    );
  }

  function selectedOutcomeFilters() {
    if (!outcomesEl) return [];
    return [...outcomesEl.querySelectorAll('input[type="checkbox"]:checked')].map((el) => el.value);
  }

  function outcomeMatchesFilters(outcome, filters) {
    if (!filters.length) return true;
    if (!outcome) return false;
    // 各フィルタは自分の結果のみ（包含なし）
    return filters.includes(outcome);
  }

  function messageMatchesFilters(msg, tabs, chars, outcomeFilters) {
    if (tabs.size > 0 && !tabs.has(msg.channel || "")) return false;
    if (chars.size > 0 && !chars.has(msg.speaker)) return false;
    return outcomeMatchesFilters(msg.outcome, outcomeFilters);
  }

  function formatMessage(msg) {
    const ch = msg.channel ? `[${msg.channel}] ` : "";
    return `${ch}${msg.speaker}：${msg.body}`;
  }

  function renderTabs() {
    if (!tabsEl) return;
    if (!tabNames.length) {
      tabsEl.innerHTML = `<p class="u-muted">タブを取得できませんでした。</p>`;
      return;
    }
    tabsEl.innerHTML = tabNames.map((tab) => `
      <label class="tools-toggle">
        <input type="checkbox" value="${Utils.escapeHtml(tab)}" checked>
        <span>${Utils.escapeHtml(tab)}</span>
      </label>
    `).join("");
    tabsEl.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener("change", renderFiltered);
    });
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
    finalSanEl.innerHTML = [...finalSanByName.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "ja"))
      .map(([name, san]) => `
        <div class="tools-log-san-row">
          <span>${Utils.escapeHtml(name)}</span>
          <strong>${san}</strong>
        </div>`)
      .join("");
  }

  function renderFiltered() {
    const tabs = selectedTabs();
    const chars = selectedCharacters();
    const outcomeFilters = selectedOutcomeFilters();
    const filtered = checkMessages.filter((m) =>
      messageMatchesFilters(m, tabs, chars, outcomeFilters)
    );
    const text = filtered.map(formatMessage).join("\n\n");
    if (outputEl) {
      outputEl.textContent = text || "（条件に一致するログがありません）";
    }
    if (countEl) {
      countEl.textContent = checkMessages.length
        ? `（${filtered.length} / ${checkMessages.length} 件）`
        : "";
    }
    if (copyBtn) copyBtn.disabled = !filtered.length;
  }

  function resetUi() {
    checkMessages = [];
    tabNames = [];
    characterNames = [];
    finalSanByName = new Map();
    if (metaEl) metaEl.hidden = true;
    if (tabsEl) tabsEl.innerHTML = "";
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
    const parsed = parseCcfoliaHtml(html);
    checkMessages = parsed.checkMessages;
    finalSanByName = parsed.finalSanByName;
    characterNames = parsed.characterNames;
    tabNames = parsed.tabNames;
    if (fileNameEl) fileNameEl.textContent = fileName || "読み込み済み";
    if (metaEl) metaEl.hidden = false;
    renderTabs();
    renderCharacters();
    renderFinalSan();
    renderFiltered();
    if (!checkMessages.length) {
      Utils.showToast("1d100 / CCB<= / CC<= の判定ログがありませんでした", "info");
    } else {
      Utils.showToast(`${checkMessages.length} 件の判定ログを読み込みました`, "success");
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

  document.getElementById("log-tab-all")?.addEventListener("click", () => {
    tabsEl?.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      el.checked = true;
    });
    renderFiltered();
  });
  document.getElementById("log-tab-none")?.addEventListener("click", () => {
    tabsEl?.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      el.checked = false;
    });
    renderFiltered();
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
