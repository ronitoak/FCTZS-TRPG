"use strict";

// プルダウンの選択肢をデータベースのデータから自動生成する関数
async function initPlayerOptions() {
  try {
   // 2. プレイヤー名の抽出 (重複を排除してあいうえお順に)
    const players = await Utils.apiGet("players");
    const filterPlayer = document.getElementById("select-player");
    if (filterPlayer) {
        players.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.player_id; 
            opt.textContent = p.player_name;
            filterPlayer.appendChild(opt);
        });
    }

  } catch (e) {
    console.error("何かに失敗しました", e);
  }
}

async function main() {

  await Utils.initAuthAndHeader('common-nav', '../');
  
  // ★ まず最初に、プルダウンの選択肢を構築する
  await initPlayerOptions();

  // 検索を実行する関数
  async function fetchAndRender() {
    try {
      const playerVal = document.getElementById("select-player")?.value || "";

      const playerId = playerVal ? `?player_id=${encodeURIComponent(playerVal)}` : "";

      window.location.href = './player_detail.html' + playerId;
    } catch (err) {
      console.error(err);
      root.innerHTML = "<p>読み込みに失敗しました</p>";
    }
  }

  // 初回読み込み時の実行
  await fetchAndRender();

  // イベントリスナーの登録
  const searchBtn = document.getElementById("select-button");
  if (searchBtn) {
    searchBtn.addEventListener("click", fetchAndRender);
  }
}

main();