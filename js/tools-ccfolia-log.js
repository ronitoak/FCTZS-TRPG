// ココフォリア等の生ログを実用向けに整形する
"use strict";

(() => {
  const inputEl = document.getElementById("log-input");
  const outputEl = document.getElementById("log-output");
  const dropSystemEl = document.getElementById("log-drop-system");
  const dropDiceEl = document.getElementById("log-drop-dice");
  const normalizeEl = document.getElementById("log-normalize-speaker");
  const formatEl = document.getElementById("log-format");

  // ココフォリアHTMLエクスポートやテキストログのざっくりパターン
  const SYSTEM_RE = /^(システム|System|\[システム\]|部屋に入室|部屋から退室|がログイン|がログアウト)/i;
  const DICE_RE = /(DiceBot|ダイスボット|1[Dd]\d+|\[\d+\]|クリティカル|ファンブル|成功|失敗|＞\s*\d+)/;
  const SPEAKER_LINE_RE = /^([^：:：\n]{1,40})[：:：]\s*(.*)$/;
  const HTML_TAG_RE = /<[^>]+>/g;
  const BR_RE = /<br\s*\/?>/gi;

  function stripHtml(text) {
    return String(text || "")
      .replace(BR_RE, "\n")
      .replace(HTML_TAG_RE, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"');
  }

  function normalizeSpeaker(name) {
    return String(name || "")
      .replace(/^【|】$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isSystemLine(line) {
    return SYSTEM_RE.test(line.trim());
  }

  function isDiceLine(line) {
    const t = line.trim();
    if (/^[（(]?[^）)]*[）)]?\s*[：:：]/.test(t) && DICE_RE.test(t)) return true;
    if (/^[^：:：]+[：:：].*(1[Dd]\d+|DiceBot)/i.test(t)) return true;
    // 「名前: (1d100<=50) ＞ 12」系
    if (DICE_RE.test(t) && /[＞>]/.test(t)) return true;
    return false;
  }

  /**
   * @returns {{ speaker: string|null, text: string }[]}
   */
  function parseLines(raw) {
    const text = stripHtml(raw).replace(/\r\n/g, "\n");
    const lines = text.split("\n");
    /** @type {{ speaker: string|null, text: string }[]} */
    const entries = [];
    let currentSpeaker = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (dropSystemEl?.checked && isSystemLine(trimmed)) continue;
      if (dropDiceEl?.checked && isDiceLine(trimmed)) continue;

      const m = trimmed.match(SPEAKER_LINE_RE);
      if (m) {
        let speaker = m[1].trim();
        if (normalizeEl?.checked) speaker = normalizeSpeaker(speaker);
        currentSpeaker = speaker;
        const body = m[2].trim();
        if (body) entries.push({ speaker, text: body });
        continue;
      }

      // 続き行
      if (currentSpeaker) {
        entries.push({ speaker: currentSpeaker, text: trimmed });
      } else {
        entries.push({ speaker: null, text: trimmed });
      }
    }
    return entries;
  }

  function formatPlain(entries) {
    return entries.map((e) => (e.speaker ? `${e.speaker}：${e.text}` : e.text)).join("\n");
  }

  function formatMarkdown(entries) {
    const blocks = [];
    let last = null;
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      if (last) {
        blocks.push(`### ${last}`);
        blocks.push(buf.join("\n"));
      } else {
        blocks.push(buf.join("\n"));
      }
      blocks.push("");
      buf = [];
    };
    for (const e of entries) {
      if (e.speaker !== last) {
        flush();
        last = e.speaker;
      }
      buf.push(e.text);
    }
    flush();
    return blocks.join("\n").trim();
  }

  function runFormat() {
    const entries = parseLines(inputEl?.value || "");
    const mode = formatEl?.value || "plain";
    const out = mode === "markdown" ? formatMarkdown(entries) : formatPlain(entries);
    if (outputEl) outputEl.textContent = out || "（出力なし）";
    return out;
  }

  document.getElementById("log-format-btn")?.addEventListener("click", runFormat);
  document.getElementById("log-copy")?.addEventListener("click", () => {
    const text = outputEl?.textContent || "";
    if (!text || text === "（出力なし）") {
      runFormat();
    }
    ToolsCommon.copyText(outputEl?.textContent || "");
  });
  document.getElementById("log-clear")?.addEventListener("click", () => {
    if (inputEl) inputEl.value = "";
    if (outputEl) outputEl.textContent = "";
  });

  [dropSystemEl, dropDiceEl, normalizeEl, formatEl].forEach((el) => {
    el?.addEventListener("change", () => {
      if ((inputEl?.value || "").trim()) runFormat();
    });
  });
})();
