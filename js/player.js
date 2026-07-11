"use strict";

// プルダウンの選択肢をデータベースのデータから自動生成する関数
async function initPlayerOptions() {
  try {
   // 2. プレイヤー名の抽出 (重複を排除してあいうえお順に)
    const players = await Utils.apiGet("players");
    const playerProfiles = await Utils.apiGet("player_profiles");
    const characters = await Utils.apiGet("characters").catch(() => []);

    // 厳密な型比較(Map)を避けるため、キーをStringに統一
    const charactersMap = new Map(characters.map(c => [String(c.id), c]));

    const joinedProfiles = playerProfiles
      .filter(playerProfile => players.some(player => player.player_id === playerProfile.player_id))
      .map(profile => {
        const player = players.find(p => p.player_id === profile.player_id); // 対応するデータを取得
        const charObj = profile.icon_url ? charactersMap.get(String(profile.icon_url)) : null;
        return { 
          ...profile, 
          ...player,
          icon_image_url: charObj ? charObj.image_url : null
        }; // データを結合
    });
    const filterPlayer = document.getElementById("select-player");
    if (filterPlayer) {
        players.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.player_id; 
            opt.textContent = p.player_name;
            filterPlayer.appendChild(opt);
        });
    }

    renderPlayers(joinedProfiles);

  } catch (e) {
    console.error("何かに失敗しました", e);
  }
}

// クエリ引数(query)を削除し、純粋に「渡された配列を描画する」だけの関数にします
function renderPlayers(players) {
  const root = document.getElementById("player-list");
  if (!root) return;


  root.innerHTML = "";

  const list = Array.isArray(players) ? players : [];

  // ★追加：レーダーチャートがすべて初期値（3）または未設定のプレイヤーを除外する
  const filteredList = list.filter(p => {
    // それぞれのパラメーターが 3 (または undefined/null) であるかを判定
    const isAllDefault = 
      (p.desire_avatar == null || p.desire_avatar === 3) &&
      (p.desire_active == null || p.desire_active === 3) &&
      (p.desire_chaos == null || p.desire_chaos === 3) &&
      (p.desire_story == null || p.desire_story === 3) &&
      (p.desire_harmony == null || p.desire_harmony === 3) &&
      (p.desire_clear == null || p.desire_clear === 3);
    
    // 全てデフォルトなら false (除外)、1つでも違う値があれば true (表示)
    return !isAllDefault;
  });

  // ★修正：描画対象を list から filteredList に変更
  if (filteredList.length === 0) {
    root.innerHTML = "<p>何かに失敗しました</p>";
    return;
  }

  const grid = document.createElement("div");
  grid.className = "card-grid";
  root.appendChild(grid);

  for (const c of filteredList) {
    const name = Utils.escapeHtml(c.player_name ?? "");
    const imagePath = Utils.getCharacterImagePath(c.icon_url, c.icon_image_url);
    const DEFAULT_IMAGE = Utils.DEFAULT_CHARACTER_IMAGE;

    const cardLink = document.createElement("a");
    cardLink.href = `./detail.html?id=${encodeURIComponent(c.player_id)}`;
    cardLink.className = "player-card-wrapper";
    cardLink.style.textDecoration = "none";
    cardLink.style.color = "inherit";
    cardLink.style.display = "block";

    const card = document.createElement("article");
    card.className = "card";

    const canvasId = `radar-${c.player_id}`;

    card.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; height: 100%;">
        <img src="${imagePath}" 
             onerror="this.onerror=null; this.src='${Utils.DEFAULT_CHARACTER_IMAGE}';" 
             alt="${name}" 
             style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;">
        
        <h2 style="margin: 0; font-size: 1.2rem; border: none; padding: 0;">${name}</h2>
        
        <div style="width: 100%; max-width: 250px; margin-top: auto;">
          <canvas id="${canvasId}"></canvas>
        </div>
      </div>
    `;

    cardLink.appendChild(card);
    grid.appendChild(cardLink);

    Utils.renderRadarChart(c, canvasId);
  }
}

// 検索を実行する関数
async function getPlayerPage() {
    try {
        const playerVal = document.getElementById("select-player")?.value || "";

        if (!playerVal) {
            alert("プレイヤーを選択してください");
            return;
        }

        window.location.href = `./detail.html?id=${encodeURIComponent(playerVal)}`;
    } catch (err) {
        console.error(err);
    }
}

async function main() {

  await Utils.initAuthAndHeader('common-nav', '../');
  
  // ★ まず最初に、プルダウンの選択肢を構築する
  await initPlayerOptions();

  // イベントリスナーの登録
  const searchBtn = document.getElementById("select-button");
  if (searchBtn) {
    searchBtn.addEventListener("click", getPlayerPage);
  }
}

main();