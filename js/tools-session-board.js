// セッションボード：PDF・キャラ（能力値・技能）・メモを自由パネルで並べ、JSON で保存／再開する
"use strict";

(() => {
  const SNAPSHOT_VERSION = 1;
  const MIN_W = 220;
  const MIN_H = 160;
  const DEFAULTS = {
    pdf: { w: 520, h: 680 },
    character: { w: 380, h: 460 },
    memo: { w: 340, h: 300 }
  };
  const TYPE_LABEL = { pdf: "PDF", character: "キャラ", memo: "メモ" };
  const SYSTEM_DISPLAY_NAMES = {
    CoC6: "クトゥルフ神話TRPG",
    CoC7: "新クトゥルフ神話TRPG",
    エモクロアTRPG: "エモクロアTRPG",
    ガイアケアTRPG: "ガイアケアTRPG"
  };
  const COC_ABILITIES = [
    ["STR", "ability_str"],
    ["CON", "ability_con"],
    ["POW", "ability_pow"],
    ["DEX", "ability_dex"],
    ["APP", "ability_app"],
    ["SIZ", "ability_siz"],
    ["INT", "ability_int"],
    ["EDU", "ability_edu"]
  ];

  const panels = new Map();
  const systemAttrCache = new Map();
  let zTop = 1;
  let pendingPdfPanelId = "";
  let characterCatalog = [];
  let runCatalog = [];

  const els = {};

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function systemLabel(system) {
    const raw = String(system || "");
    return SYSTEM_DISPLAY_NAMES[raw] || raw;
  }

  function nextCascadePos() {
    const n = panels.size;
    const step = n % 10;
    return { x: 24 + step * 28, y: 24 + step * 28 };
  }

  function toIntOrNull(v) {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function fileIdentity(file) {
    return {
      fileName: String(file?.name || "").trim() || "document.pdf",
      relativePath: String(file?.webkitRelativePath || file?.path || "").trim()
    };
  }

  function applyPdfIdentity(panel, identity) {
    if (!identity) return;
    if (identity.fileName) panel.fileName = identity.fileName;
    panel.relativePath = identity.relativePath || "";
  }

  function filesMatchPanel(panel, file) {
    const ident = fileIdentity(file);
    const savedName = String(panel.fileName || "").toLowerCase();
    const pickedName = ident.fileName.toLowerCase();
    if (savedName && pickedName === savedName) return true;
    const savedRel = String(panel.relativePath || "").replace(/\\/g, "/").toLowerCase();
    const pickedRel = ident.relativePath.replace(/\\/g, "/").toLowerCase();
    if (savedRel && pickedRel && savedRel === pickedRel) return true;
    if (savedRel && pickedName === savedRel.split("/").pop()) return true;
    return false;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
      reader.readAsText(file, "utf-8");
    });
  }

  async function getAuthSession() {
    if (!window.supabase?.auth) return null;
    const { data } = await window.supabase.auth.getSession();
    return data?.session || null;
  }

  function updateEmptyState() {
    if (els.empty) els.empty.hidden = panels.size > 0;
  }

  function setChromeHidden(hidden) {
    document.body.classList.toggle("session-board-page--focus", hidden);
    if (els.showChrome) els.showChrome.hidden = !hidden;
  }

  function applyPanelBox(panel) {
    const node = panel.el;
    if (!node) return;
    node.style.left = `${panel.x}px`;
    node.style.top = `${panel.y}px`;
    node.style.width = `${panel.w}px`;
    node.style.height = `${panel.h}px`;
    node.style.zIndex = String(panel.z);
  }

  function bringToFront(panel) {
    zTop += 1;
    panel.z = zTop;
    if (panel.el) panel.el.style.zIndex = String(panel.z);
  }

  function workspacePoint(event) {
    const rect = els.board.getBoundingClientRect();
    return {
      x: event.clientX - rect.left + els.board.scrollLeft,
      y: event.clientY - rect.top + els.board.scrollTop
    };
  }

  function clampSize(w, h) {
    return { w: Math.max(MIN_W, w), h: Math.max(MIN_H, h) };
  }

  function revokePdf(panel) {
    if (panel.pdfUrl) {
      URL.revokeObjectURL(panel.pdfUrl);
      panel.pdfUrl = "";
    }
  }

  function attachPdfFile(panel, file) {
    if (!panel || !file) return;
    revokePdf(panel);
    applyPdfIdentity(panel, fileIdentity(file));
    panel.pdfUrl = URL.createObjectURL(file);
    const iframe = panel.el?.querySelector("iframe");
    const fallback = panel.el?.querySelector("[data-pdf-fallback]");
    if (iframe) {
      iframe.src = panel.pdfUrl;
      iframe.hidden = false;
      iframe.title = panel.fileName || "PDF";
    }
    if (fallback) fallback.hidden = true;
    const heading = panel.el?.querySelector(".session-board-heading");
    if (heading) heading.textContent = panel.fileName;
  }

  function pdfHintHtml(panel) {
    const name = panel.fileName ? Utils.escapeHtml(panel.fileName) : "（ファイル名なし）";
    const path = panel.relativePath ? `<p class="session-board-muted">パス: ${Utils.escapeHtml(panel.relativePath)}</p>` : "";
    return `
      <div class="session-board-pdf-fallback" data-pdf-fallback>
        <p class="session-board-muted">JSON にはファイル名だけ保存しています。同じ PDF を選び直してください。</p>
        <p class="session-board-pdf-name">${name}</p>
        ${path}
        <button type="button" class="btn-secondary" data-pdf-pick>このPDFを選び直す</button>
      </div>
    `;
  }

  function removePanel(id) {
    const panel = panels.get(id);
    if (!panel) return;
    revokePdf(panel);
    panel.el?.remove();
    panels.delete(id);
    updateEmptyState();
  }

  function bindMoveAndResize(panel) {
    const bar = panel.el.querySelector(".session-board-titlebar");
    bar?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest("button")) return;
      bringToFront(panel);
      const point = workspacePoint(event);
      const grabX = point.x - panel.x;
      const grabY = point.y - panel.y;
      panel.el.classList.add("is-dragging");
      try { bar.setPointerCapture(event.pointerId); } catch { /* capture 非対応でも document で追う */ }

      const onMove = (ev) => {
        const p = workspacePoint(ev);
        panel.x = Math.max(0, p.x - grabX);
        panel.y = Math.max(0, p.y - grabY);
        applyPanelBox(panel);
      };
      const onUp = () => {
        panel.el.classList.remove("is-dragging");
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });

    panel.el.querySelectorAll("[data-resize]").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.button !== 0) return;
        bringToFront(panel);
        const corner = handle.getAttribute("data-resize");
        const start = workspacePoint(event);
        const orig = { x: panel.x, y: panel.y, w: panel.w, h: panel.h };
        panel.el.classList.add("is-resizing");
        try { handle.setPointerCapture(event.pointerId); } catch { /* capture 非対応でも document で追う */ }

        const onMove = (ev) => {
          const p = workspacePoint(ev);
          const dx = p.x - start.x;
          const dy = p.y - start.y;
          let x = orig.x;
          let y = orig.y;
          let w = orig.w;
          let h = orig.h;
          if (corner.includes("e")) w = orig.w + dx;
          if (corner.includes("s")) h = orig.h + dy;
          if (corner.includes("w")) {
            w = orig.w - dx;
            x = orig.x + dx;
          }
          if (corner.includes("n")) {
            h = orig.h - dy;
            y = orig.y + dy;
          }
          const sized = clampSize(w, h);
          if (corner.includes("w")) x = orig.x + (orig.w - sized.w);
          if (corner.includes("n")) y = orig.y + (orig.h - sized.h);
          panel.x = Math.max(0, x);
          panel.y = Math.max(0, y);
          panel.w = sized.w;
          panel.h = sized.h;
          applyPanelBox(panel);
        };
        const onUp = () => {
          panel.el.classList.remove("is-resizing");
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          document.removeEventListener("pointercancel", onUp);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
      });
    });

    panel.el.addEventListener("pointerdown", () => bringToFront(panel));
  }

  function panelChrome(type, title) {
    return `
      <div class="session-board-titlebar">
        <span class="session-board-type">${TYPE_LABEL[type] || type}</span>
        <span class="session-board-heading">${Utils.escapeHtml(title)}</span>
        <button type="button" class="session-board-close" aria-label="閉じる">×</button>
      </div>
      <div class="session-board-body${type === "pdf" ? " session-board-body--pdf" : ""}" data-body></div>
      <span class="session-board-resize session-board-resize-nw" data-resize="nw"></span>
      <span class="session-board-resize session-board-resize-ne" data-resize="ne"></span>
      <span class="session-board-resize session-board-resize-sw" data-resize="sw"></span>
      <span class="session-board-resize session-board-resize-se" data-resize="se"></span>
    `;
  }

  function mountPanel(panel) {
    const node = document.createElement("article");
    node.className = "session-board-panel";
    node.dataset.panelId = panel.id;
    node.innerHTML = panelChrome(panel.type, panelTitle(panel));
    panel.el = node;
    els.board.appendChild(node);
    applyPanelBox(panel);
    node.querySelector(".session-board-close")?.addEventListener("click", (event) => {
      event.stopPropagation();
      removePanel(panel.id);
    });
    bindMoveAndResize(panel);
    renderPanelBody(panel);
    updateEmptyState();
  }

  function panelTitle(panel) {
    if (panel.type === "pdf") return panel.fileName || "PDF";
    if (panel.type === "character") return panel.characterName || "キャラクター";
    return "メモ";
  }

  function createPanel(partial) {
    const type = partial.type;
    const pos = nextCascadePos();
    const size = DEFAULTS[type] || DEFAULTS.memo;
    const panel = {
      id: partial.id || uid(),
      type,
      x: Number.isFinite(partial.x) ? Math.max(0, partial.x) : pos.x,
      y: Number.isFinite(partial.y) ? Math.max(0, partial.y) : pos.y,
      w: Number.isFinite(partial.w) ? Math.max(MIN_W, partial.w) : size.w,
      h: Number.isFinite(partial.h) ? Math.max(MIN_H, partial.h) : size.h,
      z: Number.isFinite(partial.z) ? partial.z : (zTop += 1),
      text: partial.text || "",
      characterId: partial.characterId || "",
      characterName: partial.characterName || "",
      fileName: partial.fileName || "",
      relativePath: partial.relativePath || "",
      pdfUrl: ""
    };
    if (Number.isFinite(partial.z) && partial.z > zTop) zTop = partial.z;
    panels.set(panel.id, panel);
    mountPanel(panel);
    if (type === "character" && panel.characterId) {
      loadCharacterPanel(panel);
    }
    return panel;
  }

  function renderPanelBody(panel) {
    const body = panel.el.querySelector("[data-body]");
    if (!body) return;
    if (panel.type === "memo") {
      body.innerHTML = `<textarea class="session-board-memo" aria-label="メモ">${Utils.escapeHtml(panel.text || "")}</textarea>`;
      const ta = body.querySelector("textarea");
      ta?.addEventListener("input", () => {
        panel.text = ta.value;
      });
      return;
    }
    if (panel.type === "pdf") {
      body.innerHTML = `
        ${pdfHintHtml(panel)}
        <iframe class="session-board-pdf" title="${Utils.escapeHtml(panel.fileName || "PDF")}" hidden></iframe>
      `;
      if (panel.pdfUrl) {
        const iframe = body.querySelector("iframe");
        const fallback = body.querySelector("[data-pdf-fallback]");
        if (iframe) {
          iframe.src = panel.pdfUrl;
          iframe.hidden = false;
        }
        if (fallback) fallback.hidden = true;
      }
      return;
    }
    if (panel.type === "character") {
      body.innerHTML = `<p class="session-board-muted">読み込み中…</p>`;
    }
  }

  function renderChips(pairs) {
    if (!pairs.length) return `<p class="session-board-muted">未登録</p>`;
    return `<div class="character-detail-chips">${pairs.map(([k, v]) => (
      `<span class="character-detail-chip"><span class="character-detail-chip-key">${Utils.escapeHtml(String(k))}</span><span class="character-detail-chip-val">${Utils.escapeHtml(String(v))}</span></span>`
    )).join("")}</div>`;
  }

  function buildAttrMap(rows) {
    const map = new Map();
    for (const row of (Array.isArray(rows) ? rows : [])) {
      const key = row?.key;
      if (!key) continue;
      map.set(String(key), {
        value_int: row?.value_int ?? null,
        value_emotion: row?.value_emotion ?? null
      });
    }
    return map;
  }

  async function getSystemAttrs(system) {
    const key = String(system || "");
    if (systemAttrCache.has(key)) return systemAttrCache.get(key);
    const rows = await Utils.apiGet(`system_attributes?system=${encodeURIComponent(key)}`).catch(() => []);
    const safe = Array.isArray(rows) ? rows : [];
    systemAttrCache.set(key, safe);
    return safe;
  }

  function abilityChips(character, defs, attrMap) {
    const intDefs = (Array.isArray(defs) ? defs : [])
      .filter((d) => d?.kind === "int")
      .slice()
      .sort((a, b) => Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0));
    const chips = [];
    const system = character?.system;

    if (system === "エモクロアTRPG" || system === "ガイアケアTRPG") {
      const body = toIntOrNull(attrMap.get("身体")?.value_int);
      const spirit = toIntOrNull(attrMap.get("精神")?.value_int);
      const intellect = toIntOrNull(attrMap.get("知力")?.value_int);
      if (body != null) chips.push(["HP", String(body + 10)]);
      if (spirit != null && intellect != null) chips.push(["MP", String(spirit + intellect)]);
    }

    if (intDefs.length) {
      for (const def of intDefs) {
        const key = String(def.key);
        const label = def.label ?? key;
        const entry = attrMap.get(key) || attrMap.get(label);
        const n = toIntOrNull(entry?.value_int);
        chips.push([label, n == null ? "—" : String(n)]);
      }
      return chips;
    }

    for (const [label, field] of COC_ABILITIES) {
      const n = toIntOrNull(character?.[field]);
      if (n != null) chips.push([label, String(n)]);
    }
    return chips;
  }

  function skillChips(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const name = String(row?.name || "").trim();
        const value = row?.display_value ?? row?.override_value ?? row?.base_value;
        if (!name || value == null || String(value).trim() === "") return null;
        return [name, String(value)];
      })
      .filter(Boolean);
  }

  async function loadCharacterPanel(panel) {
    const body = panel.el?.querySelector("[data-body]");
    if (!body) return;
    try {
      const [characters, attrRows, skillRows] = await Promise.all([
        Utils.apiGet(`characters?id=${encodeURIComponent(panel.characterId)}`),
        Utils.apiGet(`character_attributes?character_id=${encodeURIComponent(panel.characterId)}`).catch(() => []),
        Utils.apiGet(`character_skill_list?character_id=${encodeURIComponent(panel.characterId)}`).catch(() => [])
      ]);
      const character = (Array.isArray(characters) ? characters : []).find((c) => String(c?.id) === String(panel.characterId));
      if (!character) {
        body.innerHTML = `<p class="session-board-muted">キャラクターが見つかりません</p>`;
        return;
      }
      panel.characterName = character.name || panel.characterId;
      const heading = panel.el.querySelector(".session-board-heading");
      const sys = systemLabel(character.system);
      if (heading) heading.textContent = sys ? `${panel.characterName} · ${sys}` : panel.characterName;

      const defs = await getSystemAttrs(character.system);
      const attrMap = buildAttrMap(attrRows);
      const attrs = abilityChips(character, defs, attrMap);
      const skills = skillChips(skillRows);
      body.innerHTML = `
        <section class="session-board-section">
          <h3 class="session-board-section-title">能力値</h3>
          ${renderChips(attrs)}
        </section>
        <section class="session-board-section">
          <h3 class="session-board-section-title">技能</h3>
          ${renderChips(skills)}
        </section>
      `;
    } catch (err) {
      console.error(err);
      body.innerHTML = `<p class="session-board-muted">読み込みに失敗しました</p>`;
    }
  }

  function clearBoard() {
    for (const id of [...panels.keys()]) removePanel(id);
    zTop = 1;
  }

  function addPdfFromFile(file) {
    if (!file) return;
    try {
      const ident = fileIdentity(file);
      const panel = createPanel({ type: "pdf", ...ident });
      attachPdfFile(panel, file);
    } catch (err) {
      console.error(err);
      Utils.showToast("PDF の読み込みに失敗しました", "error");
    }
  }

  function assignPdfFiles(fileList) {
    const files = [...(fileList || [])].filter(Boolean);
    if (!files.length) return;
    const waiting = [...panels.values()].filter((p) => p.type === "pdf" && !p.pdfUrl);
    let assigned = 0;
    for (const file of files) {
      const target = waiting.find((p) => !p.pdfUrl && filesMatchPanel(p, file));
      if (!target) continue;
      attachPdfFile(target, file);
      assigned += 1;
    }
    const leftover = files.length - assigned;
    if (!assigned) {
      Utils.showToast("ファイル名が一致する PDF パネルがありません", "info");
      return;
    }
    const extra = leftover > 0 ? `（一致しなかった ${leftover} 件は未割り当て）` : "";
    Utils.showToast(`${assigned}件の PDF を割り当てました${extra}`, "success");
  }

  function closeModal(dialog) {
    if (dialog?.open) dialog.close();
  }

  function bindModal(dialog) {
    if (!dialog) return;
    dialog.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(dialog));
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeModal(dialog);
    });
  }

  function renderPickList(container, items, onPick) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = `<p class="session-board-muted" style="padding:12px;">該当なし</p>`;
      return;
    }
    container.innerHTML = "";
    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "session-board-pick-item";
      btn.innerHTML = `<strong>${Utils.escapeHtml(item.title)}</strong>${
        item.meta ? `<span class="session-board-pick-meta">${Utils.escapeHtml(item.meta)}</span>` : ""
      }`;
      btn.addEventListener("click", () => onPick(item));
      container.appendChild(btn);
    }
  }

  function filterCharacters(keyword) {
    const q = String(keyword || "").trim().toLowerCase();
    const list = Array.isArray(characterCatalog) ? characterCatalog : [];
    if (!q) return list;
    return list.filter((c) => {
      const hay = [c.name, c.job, c.system, systemLabel(c.system), c.players?.player_name]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }

  function characterPickItems(list) {
    return list.map((c) => ({
      id: c.id,
      title: c.name || c.id,
      meta: [c.players?.player_name, systemLabel(c.system)].filter(Boolean).join(" / "),
      character: c
    }));
  }

  async function openCharacterPicker() {
    const session = await getAuthSession();
    if (!session) {
      Utils.showToast("キャラ参照は Discord ログインを推奨します", "info");
    }
    els.charFilter.value = "";
    els.charList.innerHTML = `<p class="session-board-muted" style="padding:12px;">読み込み中…</p>`;
    els.charModal.showModal();
    try {
      const rows = await Utils.apiGet("characters");
      characterCatalog = Array.isArray(rows) ? rows : [];
      characterCatalog.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "ja"));
      renderPickList(els.charList, characterPickItems(filterCharacters("")), (item) => {
        closeModal(els.charModal);
        createPanel({
          type: "character",
          characterId: item.id,
          characterName: item.title
        });
      });
    } catch (err) {
      console.error(err);
      els.charList.innerHTML = `<p class="session-board-muted" style="padding:12px;">取得に失敗しました。ログインが必要な場合があります。</p>`;
    }
  }

  function filterRuns(keyword) {
    const q = String(keyword || "").trim().toLowerCase();
    const list = Array.isArray(runCatalog) ? runCatalog : [];
    if (!q) return list;
    return list.filter((run) => String(run.title || run.id || "").toLowerCase().includes(q));
  }

  function runPickItems(list) {
    return list.map((run) => ({
      id: run.id,
      title: run.title || run.id,
      meta: Utils.statusMap[run.status] || run.status || "",
      run
    }));
  }

  async function openRunPicker() {
    const session = await getAuthSession();
    if (!session) {
      Utils.showToast("卓の取得は Discord ログインを推奨します", "info");
    }
    els.runFilter.value = "";
    els.runList.innerHTML = `<p class="session-board-muted" style="padding:12px;">読み込み中…</p>`;
    els.runModal.showModal();
    try {
      const rows = await Utils.apiGet("runs");
      runCatalog = (Array.isArray(rows) ? rows : [])
        .filter((run) => String(run?.status || "") !== "done")
        .sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id), "ja"));
      if (!runCatalog.length) {
        els.runList.innerHTML = `<p class="session-board-muted" style="padding:12px;">進行中・計画中の卓がありません</p>`;
        return;
      }
      renderPickList(els.runList, runPickItems(filterRuns("")), (item) => {
        closeModal(els.runModal);
        addCharactersFromRun(item.run);
      });
    } catch (err) {
      console.error(err);
      els.runList.innerHTML = `<p class="session-board-muted" style="padding:12px;">取得に失敗しました。ログインが必要な場合があります。</p>`;
    }
  }

  function addCharactersFromRun(run) {
    const ids = Array.isArray(run?.characters) ? run.characters.filter(Boolean) : [];
    if (!ids.length) {
      Utils.showToast("この卓に参加キャラがありません", "info");
      return;
    }
    const existing = new Set([...panels.values()]
      .filter((p) => p.type === "character")
      .map((p) => String(p.characterId)));
    let added = 0;
    ids.forEach((id, index) => {
      const key = String(id);
      if (existing.has(key)) return;
      existing.add(key);
      createPanel({
        type: "character",
        characterId: key,
        x: 24 + index * 36,
        y: 24 + index * 24
      });
      added += 1;
    });
    if (!added) {
      Utils.showToast("参加キャラはすでに並んでいます", "info");
      return;
    }
    Utils.showToast(`${added}人のキャラを並べました`, "success");
  }

  async function exportSnapshot() {
    if (!panels.size) {
      Utils.showToast("書き出すパネルがありません", "info");
      return;
    }
    try {
      const snapshot = {
        version: SNAPSHOT_VERSION,
        exportedAt: new Date().toISOString(),
        panels: [...panels.values()].map((panel) => {
          const row = {
            id: panel.id,
            type: panel.type,
            x: panel.x,
            y: panel.y,
            w: panel.w,
            h: panel.h,
            z: panel.z
          };
          if (panel.type === "memo") row.text = panel.text || "";
          if (panel.type === "character") row.characterId = panel.characterId;
          if (panel.type === "pdf") {
            row.fileName = panel.fileName || "document.pdf";
            if (panel.relativePath) row.relativePath = panel.relativePath;
          }
          return row;
        })
      };
      const blob = new Blob([JSON.stringify(snapshot)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const day = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `session-board-${day}.json`;
      a.click();
      URL.revokeObjectURL(url);
      Utils.showToast("JSON を書き出しました", "success");
    } catch (err) {
      console.error(err);
      Utils.showToast("書き出しに失敗しました", "error");
    }
  }

  function restoreSnapshot(data) {
    if (!data || Number(data.version) !== SNAPSHOT_VERSION || !Array.isArray(data.panels)) {
      throw new Error("対応していないファイルです");
    }
    clearBoard();
    const allowed = new Set(["pdf", "character", "memo"]);
    for (const row of data.panels) {
      if (!row || !allowed.has(row.type)) continue;
      const partial = {
        id: row.id,
        type: row.type,
        x: row.x,
        y: row.y,
        w: row.w,
        h: row.h,
        z: row.z,
        text: row.text,
        characterId: row.characterId,
        fileName: row.fileName,
        relativePath: row.relativePath || ""
      };
      createPanel(partial);
    }
    if (!panels.size) {
      Utils.showToast("復元できるパネルがありませんでした", "info");
      return;
    }
    const pdfWaiting = [...panels.values()].some((p) => p.type === "pdf" && !p.pdfUrl);
    Utils.showToast(pdfWaiting ? "作業状態を読み込みました。PDF は同じファイルを選び直してください" : "作業状態を読み込みました", "success");
  }

  async function importSnapshotFile(file) {
    if (!file) return;
    if (panels.size && !window.confirm("現在のボードを破棄して読み込みますか？")) return;
    try {
      const text = await readFileAsText(file);
      restoreSnapshot(JSON.parse(text));
    } catch (err) {
      console.error(err);
      Utils.showToast("JSON の読み込みに失敗しました", "error");
    }
  }

  function wireToolbar() {
    els.addPdf?.addEventListener("click", () => {
      pendingPdfPanelId = "";
      els.pdfInput?.click();
    });
    els.assignPdf?.addEventListener("click", () => els.pdfAssignInput?.click());
    els.addChar?.addEventListener("click", () => openCharacterPicker());
    els.addMemo?.addEventListener("click", () => createPanel({ type: "memo" }));
    els.addFromRun?.addEventListener("click", () => openRunPicker());
    els.exportBtn?.addEventListener("click", () => exportSnapshot());
    els.importBtn?.addEventListener("click", () => els.jsonInput?.click());
    els.toggleChrome?.addEventListener("click", () => setChromeHidden(true));
    els.showChrome?.addEventListener("click", () => setChromeHidden(false));
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (document.body.classList.contains("session-board-page--focus")) {
        const openModal = document.querySelector("dialog.modal[open]");
        if (!openModal) setChromeHidden(false);
      }
    });

    els.board?.addEventListener("click", (event) => {
      const pickBtn = event.target.closest("[data-pdf-pick]");
      if (!pickBtn) return;
      const panelEl = pickBtn.closest(".session-board-panel");
      const panel = panels.get(panelEl?.dataset.panelId);
      if (!panel) return;
      pendingPdfPanelId = panel.id;
      els.pdfInput?.click();
    });

    els.pdfInput?.addEventListener("change", () => {
      const file = els.pdfInput.files?.[0];
      els.pdfInput.value = "";
      if (!file) return;
      if (pendingPdfPanelId) {
        const panel = panels.get(pendingPdfPanelId);
        pendingPdfPanelId = "";
        if (panel) attachPdfFile(panel, file);
        return;
      }
      addPdfFromFile(file);
    });
    els.pdfAssignInput?.addEventListener("change", () => {
      const files = [...(els.pdfAssignInput.files || [])];
      els.pdfAssignInput.value = "";
      assignPdfFiles(files);
    });
    els.jsonInput?.addEventListener("change", async () => {
      const file = els.jsonInput.files?.[0];
      els.jsonInput.value = "";
      await importSnapshotFile(file);
    });

    els.charFilter?.addEventListener("input", () => {
      renderPickList(els.charList, characterPickItems(filterCharacters(els.charFilter.value)), (item) => {
        closeModal(els.charModal);
        createPanel({
          type: "character",
          characterId: item.id,
          characterName: item.title
        });
      });
    });
    els.runFilter?.addEventListener("input", () => {
      renderPickList(els.runList, runPickItems(filterRuns(els.runFilter.value)), (item) => {
        closeModal(els.runModal);
        addCharactersFromRun(item.run);
      });
    });
  }

  async function main() {
    els.board = document.getElementById("session-board");
    els.empty = document.getElementById("sb-empty");
    els.addPdf = document.getElementById("sb-add-pdf");
    els.assignPdf = document.getElementById("sb-assign-pdf");
    els.addChar = document.getElementById("sb-add-char");
    els.addMemo = document.getElementById("sb-add-memo");
    els.addFromRun = document.getElementById("sb-add-from-run");
    els.exportBtn = document.getElementById("sb-export");
    els.importBtn = document.getElementById("sb-import");
    els.toggleChrome = document.getElementById("sb-toggle-chrome");
    els.showChrome = document.getElementById("sb-show-chrome");
    els.pdfInput = document.getElementById("sb-pdf-input");
    els.pdfAssignInput = document.getElementById("sb-pdf-assign-input");
    els.jsonInput = document.getElementById("sb-json-input");
    els.charModal = document.getElementById("sb-char-modal");
    els.runModal = document.getElementById("sb-run-modal");
    els.charFilter = document.getElementById("sb-char-filter");
    els.runFilter = document.getElementById("sb-run-filter");
    els.charList = document.getElementById("sb-char-list");
    els.runList = document.getElementById("sb-run-list");
    if (!els.board) return;

    await Utils.initAuthAndHeader("common-nav", "../");
    bindModal(els.charModal);
    bindModal(els.runModal);
    wireToolbar();
    updateEmptyState();
  }

  Utils.domReady(main);
})();
