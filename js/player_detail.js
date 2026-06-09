"use strict";

async function main() {
  const root = document.getElementById("player-detail-root");
  if (!root) return;

  await Utils.initAuthAndHeader('common-nav', '../');

  const playerId = Utils.getQueryParam("id");
  if (!playerId) {
    root.innerHTML = "<p>プレイヤーIDが指定されていません</p>";
    return;
  }

  try {
    // 既存のテーブルから並行してデータを取得
    const [players, characters, runs, sessions] = await Promise.all([
      Utils.apiGet("players"),
      Utils.apiGet("characters").catch(() => []),
      Utils.apiGet("runs").catch(() => []),
      Utils.apiGet("sessions").catch(() => [])
    ]);

    // プレイヤー情報の特定
    const player = players.find(p => p.player_id === playerId);
    if (!player) {
      root.innerHTML = "<p>プレイヤーが見つかりません</p>";
      return;
    }

    // このプレイヤーが作成したキャラクター
    const myCharacters = characters.filter(c => c.player_id === playerId || c.player === player.player_name);

    // ★ HTMLの組み立てと描画 ★
    root.innerHTML = `
      ${buildPlayerProfileHtml(player)}
      ${buildCustomAreaHtml(player)}
      
      <div class="player-detail-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px;">
        ${buildMyCharactersHtml(myCharacters)}
        ${buildScheduleHtml(player, runs, sessions)}
      </div>

      <div class="player-detail-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px;">
        ${buildScenariosHtml("通過済シナリオ", "今後、通過履歴データと連携して表示します。")}
        ${buildScenariosHtml("GM可能（所有）シナリオ", "今後、所持ルルブ・シナリオデータを連携して表示します。")}
      </div>
    `;

  } catch (err) {
    console.error(err);
    root.innerHTML = "<p>データの読み込みに失敗しました。</p>";
  }
}

// ==========================================
// --- HTML生成コンポーネント ---
// ==========================================

function buildPlayerProfileHtml(player) {
  // アイコン画像がない場合のフォールバック（デフォルト画像）
  const iconSrc = player.icon_url || "../img/default_player_icon.png"; 

  return `
    <section class="player-profile" style="display: flex; align-items: center; gap: 20px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <img src="${Utils.escapeHtml(iconSrc)}" alt="アイコン" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;">
      <div>
        <h1 style="margin: 0; font-size: 1.8rem; color: #2d3748;">${Utils.escapeHtml(player.player_name)}</h1>
        <p style="margin: 5px 0 0 0; color: #718096; font-size: 0.9rem;">ID: ${Utils.escapeHtml(player.player_id)}</p>
      </div>
    </section>
  `;
}

function buildCustomAreaHtml(player) {
  // TODO: 次のステップでデータベースを拡張し、本物の自己紹介データを表示します
  const profileText = player.profile_text || "まだ自己紹介が登録されていません。（※今後のアップデートで編集できるようになります）";

  return `
    <section class="player-custom-area" style="margin-top: 20px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">🎪 催事場（自己紹介・傾向）</h2>
      <p style="white-space: pre-wrap; color: #4a5568;">${Utils.escapeHtml(profileText)}</p>
    </section>
  `;
}

function buildMyCharactersHtml(characters) {
  const charsList = characters.length > 0 
    ? characters.map(c => `
        <a href="../character/detail.html?id=${c.id}" style="display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; text-decoration: none; color: inherit; transition: background 0.2s;">
          <img src="${Utils.getCharacterImagePath(c.id)}" onerror="this.onerror=null; this.src='${Utils.DEFAULT_CHARACTER_IMAGE}';" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
          <span style="font-weight: bold;">${Utils.escapeHtml(c.name)}</span>
        </a>
      `).join("")
    : "<p style='color: #a0aec0;'>作成したキャラクターはまだありません。</p>";

  return `
    <section class="player-characters" style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">👥 作成キャラクター</h2>
      <div style="display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto;">
        ${charsList}
      </div>
    </section>
  `;
}

function buildScheduleHtml(player, runs, sessions) {
  // TODO: 次のステップで正式なスケジュール検索ロジックを組み込みます
  return `
    <section class="player-schedule" style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">📅 スケジュール・予定卓</h2>
      <div style="color: #718096; padding: 20px 0; text-align: center;">
        <p>近日中のセッション予定と、稼働可能な空き日程がここに表示されます。</p>
        <p style="font-size: 0.8rem;">（※今後のアップデートで実装予定）</p>
      </div>
    </section>
  `;
}

function buildScenariosHtml(title, description) {
  return `
    <section class="player-scenarios" style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">📚 ${Utils.escapeHtml(title)}</h2>
      <div style="color: #718096; padding: 20px 0; text-align: center;">
        <p>${Utils.escapeHtml(description)}</p>
      </div>
    </section>
  `;
}

// 実行
Utils.domReady(main);