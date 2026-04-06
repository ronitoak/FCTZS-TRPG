"use strict";

// システム名の辞書
const SYSTEM_DISPLAY_NAMES = {
  "CoC6": "クトゥルフ神話TRPG",
  "CoC7": "新クトゥルフ神話TRPG",
  "エモクロアTRPG": "エモクロアTRPG",
  "ガイアケアTRPG": "ガイアケアTRPG"
};

// 表示ラベルから、DB検索用の文字列（カンマ区切り）を生成する関数
function getSystemQueryString(displayLabel) {
  const values = Object.keys(SYSTEM_ALIASES).filter(k => SYSTEM_ALIASES[k] === displayLabel);
  return values.length > 0 ? values.join(',') : displayLabel;
}

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

// プルダウンの選択肢をデータベースのデータから自動生成する関数
async function initFilterOptions() {
  try {
    const [allCharacters, allScenarios] = await Promise.all([
      Utils.apiGet("characters"),
      Utils.apiGet("scenarios")
    ]);
    
    // 1. システムの抽出 (DB内の実際の値をそのまま取得)
    const rawSystems = [...new Set((allCharacters || []).map(c => c.system).filter(Boolean))].sort();
    
    const systemSelect = document.getElementById("filter-system");
    if (systemSelect) {
      rawSystems.forEach(sys => {
        const option = document.createElement("option");
        // 送信時はDBの生の値（例: "CoC6"）を送る
        option.value = sys; 
        // 画面の表示は辞書から引いた綺麗な名前（例: "クトゥルフ神話TRPG"）にする
        // 辞書にないシステムが追加された場合は、とりあえずそのまま表示する
        option.textContent = SYSTEM_DISPLAY_NAMES[sys] || sys; 
        systemSelect.appendChild(option);
      });
    }

    // 2. プレイヤー名の抽出 (重複を排除してあいうえお順に)
    const players = [...new Set((allCharacters || []).map(c => c.player).filter(Boolean))].sort();
    const playerSelect = document.getElementById("filter-player");
    if (playerSelect) {
      players.forEach(pl => {
        const option = document.createElement("option");
        option.value = pl;
        option.textContent = pl;
        playerSelect.appendChild(option);
      });
    }

    // 3. シナリオの抽出 (あいうえお順に)
    const scenarioSelect = document.getElementById("filter-scenario");
    if (scenarioSelect && Array.isArray(allScenarios)) {
      allScenarios.sort((a, b) => (a.title || "").localeCompare(b.title || "", "ja"));
      allScenarios.forEach(sc => {
        if (!sc.id) return;
        const option = document.createElement("option");
        option.value = sc.id;
        option.textContent = sc.title || "名称未設定";
        scenarioSelect.appendChild(option);
      });
    }
  } catch (e) {
    console.error("フィルタ選択肢の初期化に失敗しました", e);
  }
}

async function main() {
  const root = document.getElementById("character-list");
  if (!root) return;

  // ★ まず最初に、プルダウンの選択肢を構築する
  await initFilterOptions();

  // 検索を実行する関数
  async function fetchAndRender() {
    try {
      const systemVal = document.getElementById("filter-system")?.value || "";
      const playerVal = document.getElementById("filter-player")?.value || "";
      const scenarioVal = document.getElementById("filter-scenario")?.value || ""; // ★追加
      const stateVal = document.getElementById("filter-state")?.value || "";
      const keywordVal = document.getElementById("filter-keyword")?.value || "";

      const params = new URLSearchParams();
      if (systemVal) params.append("system", systemVal); 
      if (playerVal) params.append("player", playerVal);
      if (scenarioVal) params.append("scenario_id", scenarioVal); // ★追加
      if (stateVal) params.append("state", stateVal);
      if (keywordVal) params.append("keyword", keywordVal);

      const queryStr = params.toString() ? `?${params.toString()}` : "";

      const [characters, lastRows] = await Promise.all([
        Utils.apiGet(`characters${queryStr}`),
        Utils.apiGet("character_last_session"),
      ]);

      const lastByCharId = new Map();
      for (const r of Array.isArray(lastRows) ? lastRows : []) {
        const cid = r?.character_id;
        if (!cid) continue;
        const t = Date.parse(r.last_session_start ?? "");
        if (!Number.isFinite(t)) continue;
        lastByCharId.set(cid, t);
      }

      renderCharacters(root, characters, lastByCharId);
    } catch (err) {
      console.error(err);
      root.innerHTML = "<p>読み込みに失敗しました</p>";
    }
  }

  // 初回読み込み時の実行
  await fetchAndRender();

  // イベントリスナーの登録
  const searchBtn = document.getElementById("search-button");
  if (searchBtn) {
    searchBtn.addEventListener("click", fetchAndRender);
  }
  
  const keywordInput = document.getElementById("filter-keyword");
  if (keywordInput) {
    keywordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") fetchAndRender();
    });
  }
}

main();