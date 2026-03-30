"use strict";

function normalize(s) {
  return String(s ?? "").toLowerCase();
}

// クエリ引数(query)を削除し、純粋に「渡された配列を描画する」だけの関数にします
function renderCharacters(root, characters, lastByCharId) {
  root.innerHTML = "";

  const list = Array.isArray(characters) ? characters : [];

  // ソート（最終セッションが新しい順 → 同順なら名前）のみフロントで維持します
  list.sort((a, b) => {
    const at = lastByCharId?.get(a.id) ?? -Infinity;
    const bt = lastByCharId?.get(b.id) ?? -Infinity;
    if (at !== bt) return bt - at;
    return String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), "ja");
  });

  if (list.length === 0) {
    root.innerHTML = "<p>該当するキャラクターがありません</p>";
    return;
  }

  const grid = document.createElement("div");
  grid.className = "character-grid";
  root.appendChild(grid);

  for (const c of list) {
    const name = Utils.escapeHtml(c.name ?? c.id ?? "（無名）");
    const job = Utils.escapeHtml(c.job ?? "");
    const player = Utils.escapeHtml(c.player ?? "");
    const system = Utils.escapeHtml(c.system ?? "");
    const state = typeof c.state === "string" ? c.state : "";
    const imagePath = Utils.getCharacterImagePath(c.id);
    const DEFAULT_IMAGE = Utils.DEFAULT_CHARACTER_IMAGE;

    const cardLink = document.createElement("a");
    cardLink.href = `./detail.html?id=${encodeURIComponent(c.id)}`;
    cardLink.className = "character-card-wrapper";
    cardLink.style.textDecoration = "none";
    cardLink.style.color = "inherit";
    cardLink.style.display = "block";

    const card = document.createElement("article");
    card.className = `character-card ${state}`.trim();

    card.innerHTML = `
      <img class="character-thumb"
        src="${imagePath}"
        onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';"
        alt="${name}"
        loading="lazy"
      >
      <h2 class="character-title">${name}</h2>
        <div class="character-meta">
            <div>職業: ${job || "—"}</div>
            <div>PL: ${player || "—"}</div>
            <div>System: ${system || "—"}</div>
        </div>
    `;

    cardLink.appendChild(card);
    grid.appendChild(cardLink);
  }
}

async function main() {
  const root = document.getElementById("character-list");
  if (!root) return;

  // 検索を実行する関数
  async function fetchAndRender() {
    try {
      // 1. UIから値を取得
      const systemVal = document.getElementById("filter-system")?.value || "";
      const stateVal = document.getElementById("filter-state")?.value || "";
      const keywordVal = document.getElementById("filter-keyword")?.value || "";

      // 2. クエリパラメータを組み立てる
      const params = new URLSearchParams();
      if (systemVal) params.append("system", systemVal);
      if (stateVal) params.append("state", stateVal);
      if (keywordVal) params.append("keyword", keywordVal);

      // パラメータがあれば「?system=...」の形にする
      const queryStr = params.toString() ? `?${params.toString()}` : "";

      // 3. API通信 (改修したWorkerのAPIを叩く)
      const [characters, lastRows] = await Promise.all([
        Utils.apiGet(`characters${queryStr}`),
        Utils.apiGet("character_last_session"), // ソート用の最終参加日ビューはそのまま
      ]);

      const lastByCharId = new Map();
      for (const r of Array.isArray(lastRows) ? lastRows : []) {
        const cid = r?.character_id;
        if (!cid) continue;
        const t = Date.parse(r.last_session_start ?? "");
        if (!Number.isFinite(t)) continue;
        lastByCharId.set(cid, t);
      }

      // 4. 描画
      renderCharacters(root, characters, lastByCharId);
    } catch (err) {
      console.error(err);
      root.innerHTML = "<p>読み込みに失敗しました</p>";
    }
  }

  // 初回読み込み時の実行
  await fetchAndRender();

  // 検索ボタンが押された時のイベントリスナー
  const searchBtn = document.getElementById("search-button");
  if (searchBtn) {
    searchBtn.addEventListener("click", fetchAndRender);
  }
  
  // エンターキーでの検索もサポート（UX向上のため）
  const keywordInput = document.getElementById("filter-keyword");
  if (keywordInput) {
    keywordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") fetchAndRender();
    });
  }
}

main();