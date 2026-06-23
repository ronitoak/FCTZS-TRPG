"use strict";

async function main() {
  const root = document.getElementById("player-detail-root");
  if (!root) return;

  await Utils.initAuthAndHeader('common-nav', '../');

  //const playerId = "p-001";
  const playerId = Utils.getQueryParam("id");
  if (!playerId) {
    root.innerHTML = "<p>プレイヤーIDが指定されていません</p>";
    return;
  }

  try {
    // 既存のテーブルから並行してデータを取得
    const [players, profiles, characters, runs, sessions, availabilities, scenarios] = await Promise.all([
      Utils.apiGet("players"),
      Utils.apiGet("player_profiles").catch(() => []),
      Utils.apiGet("characters").catch(() => []),
      Utils.apiGet("runs").catch(() => []),
      Utils.apiGet("sessions").catch(() => []),
      Utils.apiGet(`player_availability?player_id=eq.${playerId}`).catch(() => []),
      Utils.apiGet("scenarios").catch(() => []) // ★追加
    ]);

    // --- (中略：既存のプレイヤー・キャラクター特定のコード) ---
    const basePlayer = players.find(p => p.player_id === playerId);
    if (!basePlayer) {
      root.innerHTML = "<p>プレイヤーが見つかりません</p>";
      return;
    }
    // ★修正：プロフィールデータが存在するかどうかをチェックして変数に保存する
    const profileData = profiles.find(p => p.player_id === playerId);
    const hasProfileRecord = profileData !== undefined; // データがあれば true、なければ false
    const player = { ...basePlayer, ...(profileData || {}) };

    const myCharacters = characters
      .filter(c => c.player_id === playerId || c.player === player.player_name)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    // ★追加：自分の空き日程と、参加しているセッションを抽出
    const myAvailabilities = availabilities.filter(a => a.player_id === playerId);
    const myRunsGM = runs.filter(r => String(r.gm_id) === String(playerId));
    const myRunsPL = runs.filter(r => {
      let isPL = false;
      if (Array.isArray(r.player_ids)) {
        isPL = r.player_ids.some(id => String(id) === String(playerId));
      } else if (typeof r.player_ids === 'string') {
        isPL = r.player_ids.includes(String(playerId));
      }
      return isPL;
    });
    
    // 全てのIDを文字列に統一して比較用の配列を作る（GMとPL両方を合体！）
    const myRunsAll = [...myRunsGM, ...myRunsPL];
    const myRunIds = myRunsAll.map(r => String(r.id));
    const mySessions = sessions.filter(s => s.start && myRunIds.includes(String(s.run_id)));

    // 通過済（PLとして参加し、ステータスが 'done'）のシナリオを抽出
    const passedRuns = myRunsPL.filter(r => r.status === "done" && r.scenario_id);
    const passedScenarioIds = [...new Set(passedRuns.map(r => r.scenario_id))]; // 重複を排除
    const passedScenarios = (scenarios || []).filter(s => passedScenarioIds.includes(s.id));

    // ★追加：GM可能（GMとして参加予定、または完了済）のシナリオを抽出
    const gmRuns = myRunsGM.filter(r => r.scenario_id);
    const gmScenarioIds = [...new Set(gmRuns.map(r => r.scenario_id))]; // 重複を排除
    const gmScenarios = (scenarios || []).filter(s => gmScenarioIds.includes(s.id));

    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth();

    function renderSchedule() {
      const wrapper = document.getElementById("schedule-wrapper");
      if (wrapper) {
        // ★修正：myRunsPL ではなく myRunsAll を渡すことでGM卓もカレンダーにタイトル表示
        wrapper.innerHTML = buildScheduleHtml(player, myAvailabilities, mySessions, myRunsAll, currentYear, currentMonth);
      }
    }

    // ★追加：データベースからお気に入り配列を取得（なければ空の配列）
    let favChars = player.favorite_character_ids || [];
    let favScenarios = player.favorite_scenario_ids || [];

    // ★ HTMLの組み立てと描画 ★
    root.innerHTML = `
      <div class="player-detail-grid" style="display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start;">
        <div style="flex: 1 1 300px; max-width: 450px;">
          ${buildPlayerProfileHtml(player)}
        </div>
        <div id="schedule-wrapper" style="flex: 2 1 500px;">
          ${buildScheduleHtml(player, myAvailabilities, mySessions, myRunsAll, currentYear, currentMonth)}
        </div>
      </div>

      ${buildCustomAreaHtml(player, characters, scenarios)}
      
      <div style="margin-top: 20px;">
        ${buildMyCharactersHtml(myCharacters, favChars)}
      </div>

      <div class="player-detail-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px;">
        ${buildScenariosHtml("PL通過済シナリオ", passedScenarios, favScenarios)}
        ${buildScenariosHtml("GM経験済シナリオ", gmScenarios, favScenarios, "GM履歴はまだありません。")}
      </div>
    `;

    // ★裏側でこっそり保存する関数
    async function updateFavoritesSilent(column, arrayData) {
      const payload = { [column]: arrayData };
      try {
        if (!hasProfileRecord) {
          payload.player_id = playerId;
          await Utils.apiPost("player_profiles", payload);
          hasProfileRecord = true; // 次回からは上書きになるように更新
        } else {
          await Utils.apiPatch("player_profiles", payload, `player_id=eq.${playerId}`);
        }
      } catch(err) {
        console.error("お気に入り保存エラー", err);
      }
    }

    // イベントリスナー
    root.addEventListener("click", (e) => {
      // カレンダーの月切り替え
      if (e.target.closest("#btn-prev-month")) {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        renderSchedule();
      } else if (e.target.closest("#btn-next-month")) {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        renderSchedule();
      }

      // ★追加：キャラのお気に入り（★）ボタンが押された時
      const favCharBtn = e.target.closest(".btn-fav-char");
      if (favCharBtn) {
        e.preventDefault();
        const id = favCharBtn.getAttribute("data-id");
        if (favChars.includes(id)) {
          favChars = favChars.filter(x => x !== id); // 配列から外す
          favCharBtn.style.color = "#e2e8f0";        // グレーにする
        } else {
          favChars.push(id);                         // 配列に入れる
          favCharBtn.style.color = "#ecc94b";        // ゴールドにする
        }
        updateFavoritesSilent("favorite_character_ids", favChars);
      }

      // ★追加：シナリオのお気に入り（★）ボタンが押された時
      const favScenarioBtn = e.target.closest(".btn-fav-scenario");
      if (favScenarioBtn) {
        e.preventDefault();
        const id = favScenarioBtn.getAttribute("data-id");
        if (favScenarios.includes(id)) {
          favScenarios = favScenarios.filter(x => x !== id);
          favScenarioBtn.style.color = "#e2e8f0";
        } else {
          favScenarios.push(id);
          favScenarioBtn.style.color = "#ecc94b";
        }
        updateFavoritesSilent("favorite_scenario_ids", favScenarios);
      }
    });

    // ★追加：HTMLを流し込んだ直後にチャートを描画！
    renderRadarChart(player);

  // === プロフィール編集機能のセットアップ ===
    const charSelect = document.getElementById('icon-character-select');
    const editBtn = document.getElementById("btn-edit-profile");
    const modal = document.getElementById("edit-profile-modal");
    const closeBtn = document.getElementById("close-profile-modal");
    const form = document.getElementById("edit-profile-form");

    charSelect.innerHTML = '<option value="">-- キャラクターを選択 --</option>' + 
    myCharacters.map(c => 
      `<option value="${c.id}" data-name="${Utils.escapeHtml(c.name)}">
          ${Utils.escapeHtml(c.name)}
      </option>`
    ).join('');


    if (editBtn && modal) {
      editBtn.addEventListener("click", () => {
        form.tier_list_first.value = player.tier_list_first || "";
        form.tier_list_second.value = player.tier_list_second || "";
        form.tier_list_third.value = player.tier_list_third || "";
        charSelect.value = player.icon_url || "";
        // ★追加：スライダーに現在の値をセット
        form.desire_avatar.value = player.desire_avatar || 3;
        form.desire_active.value = player.desire_active || 3;
        form.desire_chaos.value = player.desire_chaos || 3;
        form.desire_story.value = player.desire_story || 3;
        form.desire_harmony.value = player.desire_harmony || 3;
        form.desire_clear.value = player.desire_clear || 3;

        modal.showModal();
      });

      closeBtn.addEventListener("click", () => modal.close());

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type='submit']");
        submitBtn.disabled = true;

        const payload = {
          player_id: playerId,
          tier_list_first: form.tier_list_first.value.trim(),
          tier_list_second: form.tier_list_second.value.trim(),
          tier_list_third: form.tier_list_third.value.trim(),
          // ★追加：スライダーの値を数値に変換して送信
          desire_avatar: parseInt(form.desire_avatar.value, 10),
          desire_active: parseInt(form.desire_active.value, 10),
          desire_chaos: parseInt(form.desire_chaos.value, 10),
          desire_story: parseInt(form.desire_story.value, 10),
          desire_harmony: parseInt(form.desire_harmony.value, 10),
          desire_clear: parseInt(form.desire_clear.value, 10)
        };

        try {
          if (hasProfileRecord) {
            await Utils.apiPatch("player_profiles", payload, `player_id=eq.${playerId}`);
          } else {
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

  const profileImage = player.icon_url || Utils.DEFAULT_CHARACTER_IMAGE;

  return `
    <section class="player-profile" style="position: relative; display: flex; flex-direction: column; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); height: 550px; ">
      <div style="display: flex; align-items: center; gap: 20px;">
        <img src="${profileImage}" alt="アイコン" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;">
        <div>
          <h1 style="margin: 0; font-size: 1.8rem; color: #2d3748;">${Utils.escapeHtml(player.player_name)}</h1>
          <p style="margin: 5px 0 0 0; color: #718096; font-size: 0.9rem;">ID: ${Utils.escapeHtml(player.player_id)}</p>
        </div>
      </div>
      
      <div style="margin-top: 20px; width: 100%; max-width: 320px; align-self: center;">
        <canvas id="desire-radar-chart"></canvas>
      </div>

      <button id="btn-edit-profile" style="position: absolute; top: 20px; right: 20px; padding: 8px 16px; background: #4a5568; color: #fff; border: none; border-radius: 4px; cursor: pointer;">📝</button>
    </section>
  `;
}

// ★引数に allCharacters と allScenarios を追加し、お気に入りを抽出して描画
function buildCustomAreaHtml(player, allCharacters, allScenarios) {
  const favCharIds = player.favorite_character_ids || [];
  const favScenIds = player.favorite_scenario_ids || [];

  // IDリストから実際のデータを抽出
  const favChars = (allCharacters || []).filter(c => favCharIds.includes(String(c.id)));
  const favScens = (allScenarios || []).filter(s => favScenIds.includes(String(s.id)));

  // もしお気に入りが1つも設定されていない場合は、案内テキストを出す
  if (favChars.length === 0 && favScens.length === 0) {
    return `
      <section class="player-custom-area" style="margin-top: 20px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
        <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">最強キャラランキング</h2>
        <p style="color: #a0aec0; margin-top: 20px; font-weight: bold;">まだ最強キャラが登録されていません。</p>
      </section>
    `;
  }

  // 最強キャラHTML組み立て
  let charsHtml = "";
  if (favChars.length > 0) {
    charsHtml = `
      <h3 style="margin: 15px 0 10px; font-size: 1.1rem; color: #2d3748; padding-left: 8px;">最強キャラ</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 15px;">
        ${favChars.map(c => `
          <a href="../character/detail.html?id=${c.id}" style="display: flex; flex-direction: column; align-items: center; text-decoration: none; color: inherit; width: 90px; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
            <img src="${Utils.getCharacterImagePath(c.id)}" onerror="this.onerror=null; this.src='${Utils.DEFAULT_CHARACTER_IMAGE}';" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <span style="font-size: 0.85rem; font-weight: bold; text-align: center; margin-top: 8px; word-break: break-all; line-height: 1.2;">${Utils.escapeHtml(c.name)}</span>
          </a>
        `).join("")}
      </div>
    `;
  }

  // 最強シナリオHTML組み立て
  let scensHtml = "";
  if (favScens.length > 0) {
    scensHtml = `
      <h3 style="margin: 25px 0 10px; font-size: 1.1rem; color: #2d3748; padding-left: 8px;">最強シナリオ</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 10px;">
        ${favScens.map(s => `
          <a href="../scenario/detail.html?id=${s.id}" style="font-size: 0.9rem; background: #daebf0; border: 1px solid #5c97ff; color: #2d3748; padding: 6px 12px; border-radius: 20px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            ★ ${Utils.escapeHtml(s.title)}
          </a>
        `).join("")}
      </div>
    `;
  }

  return `
    <section class="player-custom-area" style="margin-top: 20px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">最強キャラランキング</h2>
      ${charsHtml}
      ${scensHtml}
    </section>
  `;
}

// ★引数に favoriteIds を追加し、★ボタンを描画
function buildMyCharactersHtml(characters, favoriteIds = []) {
  const charsList = characters.length > 0 
    ? characters.map(c => {
        const isFav = favoriteIds.includes(String(c.id));
        const starColor = isFav ? "#ecc94b" : "#e2e8f0"; // ゴールドかグレーか
        return `
        <div style="display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; transition: background 0.2s;">
          <button class="btn-fav-char" data-id="${c.id}" style="background: none; border: none; cursor: pointer; font-size: 1.5rem; color: ${starColor}; padding: 0; outline: none; transition: transform 0.1s;">★</button>
          <a href="../character/detail.html?id=${c.id}" style="display: flex; align-items: center; gap: 10px; flex-grow: 1; text-decoration: none; color: inherit;">
            <img src="${Utils.getCharacterImagePath(c.id)}" onerror="this.onerror=null; this.src='${Utils.DEFAULT_CHARACTER_IMAGE}';" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
            <span style="font-weight: bold;">${Utils.escapeHtml(c.name)}</span>
            <span style="font-size: 0.9rem; color: #718096;">${Utils.escapeHtml(c.job || '')}</span>
            <span style="font-size: 0.8rem; background: #edf2f7; padding: 2px 6px; border-radius: 4px;">${Utils.escapeHtml(c.system || '')}</span>
          </a>
        </div>
      `}).join("")
    : "<p style='color: #a0aec0;'>作成したキャラクターはまだありません。</p>";

  return `
    <section class="player-characters" style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">作成キャラクター</h2>
      <div style="display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto;">
        ${charsList}
      </div>
    </section>
  `;
}

// ★修正4：引数に year と month を追加
function buildScheduleHtml(player, availabilities, mySessions, myRunsAll, year, month) {
  const today = new Date();
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const slotLabels = {'afternoon': '昼', 'night': '夜'};
  const slotOrder = ['afternoon', 'night'];
  const statusMarks = { 
    'ok': '<span style="color: #38b2ac; font-weight: bold;">〇</span>', 
    'maybe': '<span style="color: #d69e2e; font-weight: bold;">△</span>', 
    'ng': '<span style="color: #e53e3e; font-weight: bold;">×</span>' 
  };

  let calendarHtml = `
    <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: #e2e8f0; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden;">
      ${["日", "月", "火", "水", "木", "金", "土"].map((d, i) => 
        `<div style="background: ${i===0 ? '#fed7d7' : i===6 ? '#bee3f8' : '#f7fafc'}; text-align: center; font-weight: bold; padding: 5px; font-size: 0.8rem;">${d}</div>`
      ).join("")}
  `;

  for (let i = 0; i < firstDay; i++) {
    calendarHtml += `<div style="background: #fff; padding: 5px;"></div>`;
  }

  for (let d = 1; d <= lastDate; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    const todaysAvails = availabilities.filter(a => a.target_date === dateStr);
    let availHtml = "";
    if (todaysAvails.length > 0) {
      availHtml = `<div style="display: flex; flex-wrap: wrap; gap: 2px; margin-top: 2px;">`;
      slotOrder.forEach(slot => {
        const a = todaysAvails.find(x => x.time_slot === slot);
        if (a && statusMarks[a.status]) {
          availHtml += `<span style="font-size: 0.65rem; background: #f7fafc; border: 1px solid #cbd5e0; border-radius: 2px; padding: 1px 2px; line-height: 1;">${slotLabels[slot]}${statusMarks[a.status]}</span>`;
        }
      });
      availHtml += `</div>`;
    }

    const todaysSessions = mySessions.filter(s => {
      if (!s.start) return false;
      const sDate = new Date(s.start);
      return !isNaN(sDate) && sDate.getFullYear() === year && sDate.getMonth() === month && sDate.getDate() === d;
    });

    let sessionHtml = "";
    if (todaysSessions.length > 0) {
      sessionHtml = `<div style="display: flex; flex-wrap: wrap; gap: 2px; margin-top: 2px;">`;
      todaysSessions.forEach(s => {
        const run = myRunsAll.find(r => r.id === s.run_id);
        const title = run ? run.title : "不明な卓";
        const sTime = new Date(s.start);
        const timeStr = `${String(sTime.getHours()).padStart(2, '0')}:${String(sTime.getMinutes()).padStart(2, '0')}`;
        const tooltipText = `[${timeStr}] ${title}`;
        sessionHtml += `<span style="font-size: 0.65rem; background: #4299e1; color: white; border-radius: 2px; padding: 1px 3px; line-height: 1; cursor: help; display: inline-block;" title="${Utils.escapeHtml(tooltipText)}">卓</span>`;
      });
      sessionHtml += `</div>`;
    }

    // ★ 今日の日付判定も、表示している年・月が現在と一致しているかを考慮する
    const isToday = (d === today.getDate() && month === today.getMonth() && year === today.getFullYear()) ? "background: #fffff0;" : "background: #fff;";

    calendarHtml += `
      <div style="${isToday} padding: 4px; height: 60px; display: flex; flex-direction: column; border-top: 1px solid #e2e8f0; min-width: 0; overflow: hidden;">
        <div style="font-size: 0.8rem; font-weight: bold; text-align: left;">${d}</div>
        ${availHtml}
        <div style="flex-grow: 1;">${sessionHtml}</div>
      </div>
    `;
  }

  calendarHtml += `</div>`;

  return `
    <section class="player-schedule" style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); height: 550px;">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
        <span>スケジュール</span>
        <!-- ★ ヘッダーに切り替えボタンを追加 -->
        <div style="display: flex; align-items: center; gap: 10px; font-size: 1rem;">
          <button id="btn-prev-month" style="cursor: pointer; background: #e2e8f0; border: none; border-radius: 4px; padding: 4px 10px;">◀</button>
          <span style="font-weight: bold; width: 90px; text-align: center;">${year}年${month + 1}月</span>
          <button id="btn-next-month" style="cursor: pointer; background: #e2e8f0; border: none; border-radius: 4px; padding: 4px 10px;">▶</button>
        </div>
      </h2>
      <div style="margin-top: 10px;">
        ${calendarHtml}
      </div>
    </section>
  `;
}

// ★引数に favoriteIds を追加し、箇条書きのリストに★ボタンを統合
function buildScenariosHtml(title, scenariosList, favoriteIds = [], fallbackText = "通過履歴はまだありません。") {
  let contentHtml = "";
  
  if (scenariosList && scenariosList.length > 0) {
    // デフォルトの「・」の箇条書きを消して、★を弾頭にする
    contentHtml = `<ul style="margin: 0; padding-left: 0; list-style-type: none; color: #4a5568; line-height: 1.8;">`;
    scenariosList.forEach(s => {
      const isFav = favoriteIds.includes(String(s.id));
      const starColor = isFav ? "#ecc94b" : "#e2e8f0";
      const systemTag = s.system ? `<span style="font-size: 0.75rem; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; margin-left: 5px;">${Utils.escapeHtml(s.system)}</span>` : "";
      
      contentHtml += `
        <li style="display: flex; align-items: center; gap: 8px; padding: 2px 0;">
          <button class="btn-fav-scenario" data-id="${s.id}" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; color: ${starColor}; padding: 0; outline: none;">★</button>
          <span style="font-weight: bold;">${Utils.escapeHtml(s.title)}</span>${systemTag}
        </li>`;
    });
    contentHtml += `</ul>`;
  } else {
    contentHtml = `<p style="text-align: center; color: #a0aec0;">${Utils.escapeHtml(fallbackText)}</p>`;
  }

  return `
    <section class="player-scenarios" style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); height: 100%; display: flex; flex-direction: column;">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">${Utils.escapeHtml(title)} ${scenariosList ? `(${scenariosList.length})本` : ''}</h2>
      <div style="padding: 10px 0; overflow-y: auto; flex-grow: 1; max-height: 250px;">
        ${contentHtml}
      </div>
    </section>
  `;
}

// ★追加：レーダーチャートを描画する関数
function renderRadarChart(player) {
  const ctx = document.getElementById('desire-radar-chart');
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

// 実行
Utils.domReady(main);