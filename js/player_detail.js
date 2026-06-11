"use strict";

async function main() {
  const root = document.getElementById("player-detail-root");
  if (!root) return;

  await Utils.initAuthAndHeader('common-nav', '../');

  const playerId = "p-001";
  //const playerId = Utils.getQueryParam("id");
  if (!playerId) {
    root.innerHTML = "<p>プレイヤーIDが指定されていません</p>";
    return;
  }

  try {
    // 既存のテーブルから並行してデータを取得
    const [players, profiles, characters, runs, sessions] = await Promise.all([
      Utils.apiGet("players"),
      Utils.apiGet("player_profiles").catch(() => []), // ★追加
      Utils.apiGet("characters").catch(() => []),
      Utils.apiGet("runs").catch(() => []),
      Utils.apiGet("sessions").catch(() => [])
    ]);

// プレイヤー情報の特定
    const basePlayer = players.find(p => p.player_id === playerId);
    if (!basePlayer) {
      root.innerHTML = "<p>プレイヤーが見つかりません</p>";
      return;
    }

    // ★修正：プロフィール情報を取得し、基本情報と合体させる
    const profileData = profiles.find(p => p.player_id === playerId);
    const hasProfileRecord = !!profileData; // プロフィールが既にDBにあるかどうかのフラグ
    const player = { ...basePlayer, ...(profileData || {}) }; // 空の場合は {} を合体

    // このプレイヤーが作成したキャラクター
    const myCharacters = characters
      .filter(c => c.player_id === playerId || c.player === player.player_name)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    // ★ HTMLの組み立てと描画 ★
    root.innerHTML = `
      <div class="player-detail-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
        ${buildPlayerProfileHtml(player)}
        ${buildScheduleHtml(player, runs, sessions)}
      </div>

      ${buildCustomAreaHtml(player)}
      
      <div style="margin-top: 20px;">
        ${buildMyCharactersHtml(myCharacters)}
      </div>

      <div class="player-detail-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px;">
        ${buildScenariosHtml("通過済シナリオ", "今後、キャラクターデータから頑張って引っ張ります。")}
        ${buildScenariosHtml("所有ルルブ・シナリオ", "今後、所持ルルブ・シナリオデータを編集できるようにします。")}
      </div>
    `;

  // === プロフィール編集機能のセットアップ ===
    const editBtn = document.getElementById("btn-edit-profile");
    const modal = document.getElementById("edit-profile-modal");
    const closeBtn = document.getElementById("close-profile-modal");
    const form = document.getElementById("edit-profile-form");

    if (editBtn && modal) {
      // 編集ボタンを押したらモーダルを開く
      editBtn.addEventListener("click", () => {
        form.icon_url.value = player.icon_url || "";
        form.profile_text.value = player.profile_text || "";
        form.owned_scenarios.value = player.owned_scenarios || "";
        form.tier_list_first.value = player.tier_list_first || "";
        form.tier_list_second.value = player.tier_list_second || "";
        form.tier_list_third.value = player.tier_list_third || "";
        modal.showModal();
      });

      // 閉じるボタン
      closeBtn.addEventListener("click", () => modal.close());

      // 保存処理
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type='submit']");
        submitBtn.disabled = true;

        const payload = {
          player_id: playerId,
          icon_url: form.icon_url.value.trim(),
          profile_text: form.profile_text.value.trim(),
          owned_scenarios: form.owned_scenarios.value.trim(),
          tier_list_first: form.tier_list_first.value.trim(),
          tier_list_second: form.tier_list_second.value.trim(),
          tier_list_third: form.tier_list_third.value.trim()
        };

        try {
          if (hasProfileRecord) {
            // すでにデータがある場合は更新 (PATCH)
            await Utils.apiPatch("player_profiles", payload, `player_id=eq.${playerId}`);
          } else {
            // 初めて設定する場合は新規作成 (POST)
            await Utils.apiPost("player_profiles", payload);
          }
          alert("プロフィールを更新しました！");
          location.reload();
        } catch (err) {
          console.error(err);
          alert("更新に失敗しました: " + err.message);
          submitBtn.disabled = false;
        }
      });
    }

  } catch (err) {
    console.error(err);
    root.innerHTML = "<p>データの読み込みに失敗しました。</p>";
  }
}

// ==========================================
// --- HTML生成コンポーネント ---
// ==========================================

function buildPlayerProfileHtml(player) {
  const iconSrc = player.icon_url || "../img/default_player_icon.png"; 

  return `
    <section class="player-profile" style="position: relative; display: flex; align-items: center; gap: 20px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <img src="${Utils.escapeHtml(iconSrc)}" alt="アイコン" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;">
      <div>
        <h1 style="margin: 0; font-size: 1.8rem; color: #2d3748;">${Utils.escapeHtml(player.player_name)}</h1>
        <p style="margin: 5px 0 0 0; color: #718096; font-size: 0.9rem;">ID: ${Utils.escapeHtml(player.player_id)}</p>
      </div>
      <button id="btn-edit-profile" style="position: absolute; top: 20px; right: 20px; padding: 8px 16px; background: #4a5568; color: #fff; border: none; border-radius: 4px; cursor: pointer;">📝</button>
    </section>
  `;
}

function buildCustomAreaHtml(player) {
  // TODO: 次のステップでデータベースを拡張し、本物の自己紹介データを表示します
  const profileText = player.profile_text || "まだ最強キャラが登録されていません。（※今後のアップデートで編集できるようになります）";

  return `
    <section class="player-custom-area" style="margin-top: 20px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">🎪 催事場（最強キャラランキング）</h2>
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
          <span style="">${Utils.escapeHtml(c.job)}</span>
          <span style="">${Utils.escapeHtml(c.system)}</span>
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
        <p>自分の予定が入ったカレンダーがここに表示されます。</p>
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