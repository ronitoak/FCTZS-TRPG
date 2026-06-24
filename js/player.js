"use strict";

// プルダウンの選択肢をデータベースのデータから自動生成する関数
async function initPlayerOptions() {
  try {
   // 2. プレイヤー名の抽出 (重複を排除してあいうえお順に)
    const players = await Utils.apiGet("players");
    const playerProfiles = await Utils.apiGet("player_profiles");

    const joinedProfiles = playerProfiles
      .filter(playerProfile => players.some(player => player.player_id === playerProfile.player_id))
      .map(profile => {const player = players.find(p => p.player_id === profile.player_id); // 対応するデータを取得
      return { ...profile, ...player }; // データを結合
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

  if (list.length === 0) {
    root.innerHTML = "<p>何かに失敗しました</p>";
    return;
  }

  const grid = document.createElement("div");
  grid.className = "card-grid";
  root.appendChild(grid);

  for (const c of list) {
    const name = Utils.escapeHtml(c.player_name ?? "");
    const iconSrc = Utils.escapeHtml(c.icon_url ?? "");
    const imagePath = Utils.getCharacterImagePath(c.icon_url);
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
        <img src="${iconSrc}" 
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

    renderRadarChart(c, canvasId);
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

// ★追加：レーダーチャートを描画する関数
function renderRadarChart(player, canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  // DBの値を取得（未設定ならすべて真ん中の3）
  const data = [
    player.desire_avatar || 3, // 上: 化身欲
    player.desire_active || 3, // 右上: 活躍欲
    player.desire_chaos || 3,  // 右下: 混沌欲
    player.desire_story || 3,  // 下: 物語欲
    player.desire_harmony || 3,// 左下: 協調欲
    player.desire_clear || 3   // 左上: 攻略欲
  ];

  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['🎭 化身欲', '✨ 活躍欲', '🌪 混沌欲', '📖 物語欲', '🤝 協調欲', '🧩 攻略欲'],
      datasets: [{
        label: 'プレイスタイル傾向',
        data: data,
        backgroundColor: 'rgba(66, 153, 225, 0.2)', // 綺麗なブルー
        borderColor: 'rgba(66, 153, 225, 1)',
        pointBackgroundColor: 'rgba(66, 153, 225, 1)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgba(66, 153, 225, 1)'
      }]
    },
    options: {
      scales: {
        r: {
          min: 0,
          max: 5,
          ticks: {
            stepSize: 1,
            display: false // 数値の目盛りを隠してスッキリさせる
          },
          pointLabels: {
            font: { size: 11, weight: 'bold' } // ラベルを見やすく
          }
        }
      },
      plugins: {
        legend: { display: false } // 余計な凡例を非表示
      }
    }
  });
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