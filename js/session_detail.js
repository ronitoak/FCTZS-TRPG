"use strict";

// 1. グローバル変数として定義
let currentRunData = null;
let tempPlayers = [];
let tempCharacters = [];
let allPlayers = [];

async function main() {
  const root = document.getElementById("session-detail");
  if (!root) return;

  await Utils.initAuthAndHeader('common-nav', '../');
  
  const run_id = Utils.getQueryParam("id");
  if (!run_id) {
    root.innerHTML = "<p>run ID が指定されていません</p>";
    return;
  }

  try {
    const [runs, scenarios, sessions, characters, fetchedPlayers] = await Promise.all([
      Utils.apiGet("runs"),
      Utils.apiGet("scenarios"),
      Utils.apiGet("sessions"),
      Utils.apiGet("characters").catch(() => []),
      Utils.apiGet("players").catch(() => []) // プレイヤーマスタも念のため取得しておく（失敗しても空配列で続行）
    ]);

    // 取得したプレイヤーデータをグローバル変数に代入
    allPlayers = fetchedPlayers;

    const run = (Array.isArray(runs) ? runs : []).find(r => r.id === run_id);
    if (!run) {
      root.innerHTML = "<p>卓が見つかりません</p>";
      return;
    }

    // ★重要: ここで取得したデータを外の変数に代入する
    currentRunData = run;
    const editRunBtn = `<button id="btn-open-run-edit" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8rem;">📝</button>`;
    const scenarioId = run?.scenario_id;
    // 厳密な型比較(===)による不一致を防ぐため、文字列にキャストして比較
    const scenario = (Array.isArray(scenarios) ? scenarios : []).find(s => String(s.id) === String(run.scenario_id)) ?? null;
    const coverPath = run.image_url ? run.image_url : Utils.getScenarioCoverPath(scenarioId ?? "unknown", scenario?.image_url);
    const fallback = Utils.DEFAULT_SCENARIO_COVER;

    // このrunの全セッション（過去も未来も）
    const runSessions = (Array.isArray(sessions) ? sessions : [])
      .filter(s => s?.run_id === run.id)
      .map(s => ({ ...s, _start: Utils.toDate(s.start) }))
      .filter(s => s._start) // start不正は除外
      .sort((a, b) => a._start.getTime() - b._start.getTime());

    const now = new Date();
    const upcoming = runSessions.filter(s => s.status === "scheduled" && s._start > now);
    const lastDone = [...runSessions].reverse().find(s => s.status === "done") ?? null;

    const statusJa = Utils.statusMap[run.status] || "不明";
    const statusClass = run.status === "active" ? "active" : run.status === "planning" ? "planning" : "done";

    // 参加キャラ（任意）
    const charsById = new Map((Array.isArray(characters) ? characters : []).map(c => [c.id, c]));
    const runCharIds = Array.isArray(run.characters) ? run.characters : [];
    const runChars = runCharIds.map(id => charsById.get(id)).filter(Boolean);

    const playersById = new Map(allPlayers.map(p => [p.player_id, p]));
    let gmName = run.gm ?? "—";
    if (run.gm_id && playersById.has(run.gm_id)) {
        gmName = playersById.get(run.gm_id).player_name;
    }
    let plNames = run.players ?? [];
    if (run.player_ids && Array.isArray(run.player_ids) && run.player_ids.length > 0) {
        plNames = run.player_ids.map(id => playersById.get(id)?.player_name || id);
    }

    // ログインユーザーのDiscord IDを取得
    let currentUserDiscordId = null;
    try {
      const { data: { session: authSession } } = await window.supabase.auth.getSession();
      if (authSession) {
        currentUserDiscordId = authSession?.user?.user_metadata?.sub || authSession?.user?.user_metadata?.provider_id || (authSession?.user?.identities?.find(id => id.provider === 'discord')?.id);
      }
    } catch (e) {
      console.error("ログイン情報の取得に失敗しました", e);
    }

    root.innerHTML = `
      ${buildSessionHeaderHtml(run, statusClass, statusJa)}
      ${buildSessionTopHtml(run, scenario, coverPath, fallback, gmName, plNames, upcoming, lastDone, runChars, editRunBtn)}
      ${buildSessionLogHtml(runSessions, currentUserDiscordId)}
    `;

    renderCompletionGuide(runSessions, run);

    setFormInitialValues();

    Comments.mount("comments-root", "session", run_id);
  } catch (e) {
    console.error(e);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

async function loadDetail() {
    const params = new URLSearchParams(location.search);
    const runId = params.get("id");
    
    // APIからRunの詳細を取得
    const run = await Utils.apiGet(`sessions?id=eq.${runId}`); // ※既存のAPIパスに合わせてください
    currentRunData = Array.isArray(run) ? run[0] : run;
    
    // ... 既存のレンダリング処理 ...
}

/**
 * 全セッション完了時に完結を促すガイドを表示する
 */
function renderCompletionGuide(allSessions, run) {
    // 最後のセッションを取得
    const lastSession = allSessions[allSessions.length - 1];
    const isLastSessionFinished = lastSession && (lastSession.status === 'done' || lastSession.status === 'cancelled');

    // 条件：最新セッションが終了済み 且つ 卓がまだ進行中(active)
    if (isLastSessionFinished && run.status === 'active') {
        const guideArea = document.createElement('div');
        guideArea.id = 'completion-guide';
        guideArea.className = 'session-detail-log'; // スタイルを合わせる
        guideArea.innerHTML = `
            <div class="alert-completion" style="background: #f0fff4; border: 1px solid #c6f6d5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                <p style="margin: 0 0 10px 0; color: #2f855a; font-weight: bold; font-size: 1.1rem;">🎉 全ての予定セッションが完了しています</p>
                <p style="font-size: 0.9rem; margin-bottom: 15px; color: #4a5568;">この物語は完結しましたか？</p>
                <button id="btn-complete-run" class="btn-primary" style="background-color: #38a169; border: none; padding: 10px 20px; border-radius: 5px; color: white; cursor: pointer; font-weight: bold;">
                    物語が完結した
                </button>
            </div>
        `;

        // セッション履歴セクションの前か後に挿入（今回は履歴の後に挿入）
        const logSection = document.querySelector('.session-detail-log');
        if (logSection) {
            logSection.parentNode.insertBefore(guideArea, logSection.nextSibling);
        }

        // ボタンのイベント
        document.getElementById('btn-complete-run').addEventListener('click', async () => {
            if (!confirm("物語を完結させます。よろしいですか？")) return;
            try {
                // Workers経由でステータスのみ更新（PATCH）
                await Utils.apiPatch("runs", { status: 'done' }, `id=eq.${run.id}`);
                alert("物語が完結しました。お疲れ様でした。");
                location.reload();
            } catch (e) {
                console.error(e);
                alert("更新に失敗しました。");
            }
        });
    }
}

/**
 * モーダル内のプレイヤー/キャラクターリストを再描画する
 */
function renderEditLists() {
    const pList = document.getElementById('edit-players-list');
    const cList = document.getElementById('edit-characters-list');
    if(!pList || !cList) return;

    // プレイヤー表示
    pList.innerHTML = tempPlayers.map((id, index) => {
        const found = allPlayers.find(player => player.player_id === id);
        const displayName = found ? found.player_name : id; // 見つかれば名前、なければ旧テキスト
        return `
        <span class="tag">${Utils.escapeHtml(displayName)}
            <button type="button" onclick="removeTempPlayer(${index})" class="btn-remove">×</button>
        </span>`;
    }).join('');

    // キャラクター表示
    cList.innerHTML = tempCharacters.map((c, index) => `
        <span class="tag">${Utils.escapeHtml(c.name)}
            <button type="button" onclick="removeTempCharacter(${index})" class="btn-remove">×</button>
        </span>`).join('');

    updateCharacterSelectOptions();
}

/**
 * キャラクター選択肢を動的に更新する
 */
async function updateCharacterSelectOptions() {
    const charSelect = document.getElementById('add-character-select');
    if (!charSelect) return;

    try {
      const allCharacters = await Utils.apiGet("characters");
      
      // 選択されたプレイヤーのキャラクターのみに絞り込む処理
      // tempPlayers（プレイヤーIDの配列）と、キャラクターが持つ player_id を比較します
      // （旧データのために c.player でのテキスト比較も安全策として残しています）
      const filtered = tempPlayers.length > 0 
        ? allCharacters.filter(c => tempPlayers.includes(c.player_id) || tempPlayers.includes(c.player))
        : allCharacters;

      charSelect.innerHTML = '<option value="">-- キャラクターを選択 --</option>' + 
        filtered.map(c => {
          // グローバル変数の allPlayers を使ってIDから正しいプレイヤー名を逆引き
          const playerObj = allPlayers.find(p => p.player_id === c.player_id);
          const playerName = playerObj ? playerObj.player_name : (c.player || '未設定');
          
          return `
          <option value="${c.id}" data-name="${Utils.escapeHtml(c.name)}">
              ${Utils.escapeHtml(c.name)} (${Utils.escapeHtml(playerName)})
          </option>`;
        }).join('');
    } catch (e) {
      console.error("キャラクター候補の取得に失敗:", e);
    }
}

// URLパラメータから初期値をセットする処理
function setFormInitialValues() {
    const params = new URLSearchParams(location.search);
    const date = params.get("date"); // YYYY-MM-DD
    const slot = params.get("slot"); // afternoon or night
    
    const startInput = document.getElementById("new-session-start");
    if (!startInput || !date) return;

    // 時間帯に応じたデフォルト時刻を結合
    // 昼: 13:00 / 夜: 19:00[cite: 5]
    const time = (slot === "afternoon") ? "13:00" : "19:00";
    
    // datetime-local 形式 (YYYY-MM-DDThh:mm) に整形
    startInput.value = `${date}T${time}`;
    
    // ユーザーに分かりやすくするため、フォームへスクロールさせるなどの配慮も有効
    document.getElementById("add-session-record").scrollIntoView({ behavior: 'smooth' });
}

// 削除用グローバル関数 (onclickから呼ぶため)
window.removeTempPlayer = (index) => {
    tempPlayers.splice(index, 1);
    renderEditLists();
};
window.removeTempCharacter = (index) => {
    tempCharacters.splice(index, 1);
    renderEditLists();
};


// 送信処理の登録
Utils.domReady(() => {

  // まず main を実行
  main();

  const subForm = document.getElementById("sub-session-form");
  if (!subForm) return;

  // 編集ボタンのクリックイベント（デリゲーション）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-edit-session');
    if (btn) {
      const modal = document.getElementById('edit-session-modal');
      const form = document.getElementById('edit-session-form');

      // データのセット
      form.session_id.value = btn.dataset.id;
      form.title.value = btn.dataset.title;
      form.stream_url.value = btn.dataset.stream_url || "";
      // 日時の変換処理 (ISO -> local datetime)
      if (btn.dataset.start) {
        const d = new Date(btn.dataset.start);
        const offset = d.getTimezoneOffset() * 60000;
        const localTime = new Date(d - offset).toISOString().slice(0, 16);
        form.start.value = localTime;
      }

      form.status.value = btn.dataset.status;
      modal?.showModal();
    }

    // モーダルの外側をクリックしたら閉じる（おまけの親切機能）
    const modal = document.getElementById('edit-session-modal');
    if (e.target === modal) {
      modal.close();
    }
  });

  // キャンセルボタンで閉じる
  document.getElementById('btn-close-edit')?.addEventListener('click', () => {
    document.getElementById('edit-session-modal')?.close();
  });

  // 卓編集モーダルを開く
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-open-run-edit') {
      const modal = document.getElementById('edit-run-modal');
      const form = document.getElementById('edit-run-form');

      if (!currentRunData) {
        alert("データの読み込みが完了していません。");
        return;
      }

      // 現在の値をセット
      form.title.value = currentRunData.title || "";
      
      // ★修正: GM選択セレクトボックスの構築と初期値セット
      const gmSelect = document.getElementById('edit-gm-select');
      if (gmSelect) {
          gmSelect.innerHTML = '<option value="">選択してください</option>';
          allPlayers.forEach(p => {
              const opt = document.createElement("option");
              opt.value = p.player_id;
              opt.textContent = p.player_name;
              gmSelect.appendChild(opt);
          });
          gmSelect.value = currentRunData.gm_id || "";
      }

      // ★修正: 旧テキストではなくID配列を優先してセット
      tempPlayers = [...(currentRunData.player_ids || currentRunData.players || [])];

      try {
          const allChars = await Utils.apiGet("characters"); 
          tempCharacters = (currentRunData.characters || []).map(id => {
              const match = allChars.find(c => c.id === id);
              return { id: id, name: match ? match.name : id };
          });
      } catch(err) {
          console.error("キャラクターマスタの取得失敗", err);
          tempCharacters = (currentRunData.characters || []).map(id => ({ id, name: id }));
      }
      
      // ★修正: プレイヤー全件をプルダウンにセット（送信するvalueをIDに変更）
      const pSelect = document.getElementById('add-player-select');
      if (pSelect) {
          pSelect.innerHTML = '<option value="">-- プレイヤーを選択 --</option>' + 
            allPlayers.map(p => `<option value="${p.player_id}">${Utils.escapeHtml(p.player_name)}</option>`).join('');
      }

      renderEditLists();

      modal?.showModal();
    }

    // モーダルの外側をクリックしたら閉じる（おまけの親切機能）
    const modal = document.getElementById('edit-run-modal');
    if (e.target === modal) {
      modal.close();
    }
  });

  // キャンセルボタン
  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-close-run-edit') {
        document.getElementById('edit-run-modal')?.close();
    }
  });

  // 卓情報の更新実行
  const runForm = document.getElementById('edit-run-form');
  runForm?.addEventListener('submit', async (e) => {

      e.preventDefault();
      
      const submitBtn = runForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true; // 連打防止
      
      // ★修正: HTMLのname属性に依存せず、確実にIDから値を取得する
      const gmSelect = document.getElementById('edit-gm-select');
      
      const payload = {
          title: runForm.title ? runForm.title.value : document.getElementById('edit-run-title')?.value || "",
          gm_id: (gmSelect && gmSelect.value) ? gmSelect.value : null, 
          player_ids: tempPlayers,
          characters: tempCharacters.map(c => c.id)
      };

      try {
          await Utils.apiPatch("runs", payload, `id=eq.${currentRunData.id}`);
          alert("卓情報を更新しました");
          location.reload();
      } catch (err) {
          console.error(err);
          alert("更新に失敗しました: " + err.message);
          if (submitBtn) submitBtn.disabled = false;
      }
  });
  
  // 編集フォームの送信
  document.getElementById('edit-session-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const sessionId = form.session_id.value;
      
      const payload = {
        title: form.title.value,
        start: new Date(form.start.value).toISOString(),
        stream_url: form.stream_url.value,
        status: form.status.value // 追加
      };

      try {
          await Utils.apiPatch("sessions", payload, `id=eq.${sessionId}`);
          alert("セッション情報を更新しました");
          location.reload();
      } catch (err) {
          console.error(err);
          alert("更新に失敗しました: " + err.message);
      }
  });

  subForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      // currentRunData がセットされるまで待つためのチェック
      if (!currentRunData) {
          alert("データの読み込みが完了していません。");
          return;
      }

      // datetime-local から値を取得 (例: "2026-03-23T20:00")
      const startVal = subForm.start.value; 
      const titleVal = subForm.title.value;


      if (!startVal) {
          alert("日時を選択してください。");
          return;
      }

      // start (timestamp with time zone) の作成
      const startTimestamp = new Date(startVal).toISOString();

      const payload = {
        run_id: currentRunData.id,
        start: startTimestamp,
        title: titleVal,
        stream_url: subForm.stream_url.value,
        status: 'scheduled'
      };

      const submitBtn = subForm.querySelector("button[type=submit]");
      submitBtn.disabled = true;

      try {
          // ① セッションを保存
          await Utils.apiPost("sessions", payload);

          let syncPlayerIds = [];

          // ② 参加プレイヤー全員のスケジュールを 'ng' にする
          if (currentRunData.player_ids && currentRunData.player_ids.length > 0) {
              syncPlayerIds = currentRunData.player_ids; // 移行済みの場合はそのままIDを使用
          } else if (currentRunData.players && currentRunData.players.length > 0) {
              // 未移行データ用フォールバック（旧ロジック残し）
              syncPlayerIds = currentRunData.players.map(name => {
                  const found = allPlayers.find(p => p.player_name === name || p.name === name);
                  return found ? found.player_id : null;
              }).filter(id => id !== null);
          }

          if (syncPlayerIds.length > 0) {
              await Utils.syncSchedulesForFullDay(startTimestamp, syncPlayerIds);
          }

          location.reload(); 
      } catch (err) {
          console.error(err);
          alert("保存失敗: " + err.message);
          submitBtn.disabled = false;
      }
  });

  // 2. プレイヤー追加ボタン
  document.getElementById('btn-add-player')?.addEventListener('click', () => {
      const val = document.getElementById('add-player-select').value;
      if (val && !tempPlayers.includes(val)) {
          tempPlayers.push(val);
          renderEditLists();
      }
  });

  // 3. キャラクター追加ボタン
  document.getElementById('btn-add-character')?.addEventListener('click', () => {
    const select = document.getElementById('add-character-select');
    const selectedOption = select.options[select.selectedIndex];
    const id = select.value;
    const name = selectedOption.getAttribute('data-name');

    if (id && !tempCharacters.some(c => c.id === id)) {
        tempCharacters.push({ id, name }); // IDと名前のセットで保持
        renderEditLists();
    }
  });

  // 4. 観戦希望ボタンのクリックイベント
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-viewer-toggle');
    if (!btn) return;

    const sessionId = btn.dataset.id;
    if (!sessionId) return;

    btn.disabled = true;

    try {
      const { data: { session } } = await window.supabase.auth.getSession();
      if (!session) {
        alert("観戦希望するにはDiscordログインが必要です。");
        btn.disabled = false;
        return;
      }

      const discordId = session?.user?.user_metadata?.sub || session?.user?.user_metadata?.provider_id || (session?.user?.identities?.find(id => id.provider === 'discord')?.id);
      if (!discordId) {
        alert("DiscordユーザーIDが取得できませんでした。");
        btn.disabled = false;
        return;
      }

      // セッション情報を再取得して最新のnotesをベースにする
      const sessions = await Utils.apiGet("sessions");
      const sessionData = (Array.isArray(sessions) ? sessions : []).find(s => s.id === sessionId);
      if (!sessionData) {
        alert("セッションが見つかりません。");
        btn.disabled = false;
        return;
      }

      let notes = sessionData.notes || "";
      const mention = `<@${discordId}>`;
      const isJoined = btn.dataset.hasJoined === "true";

      if (isJoined) {
        // 取り消し処理
        notes = notes.replace(mention, "").trim();
        // 観戦希望エリアのクリーンアップ
        // [観戦希望] の後ろにメンションが残っていないか確認
        const mentionRegex = /<@\d+>/g;
        const hasOtherMentions = mentionRegex.test(notes);
        if (!hasOtherMentions) {
          notes = notes.replace("[観戦希望]", "").trim();
        }
        // 連続する空白・改行の整理
        notes = notes.replace(/\n\s*\n/g, "\n").trim();
      } else {
        // 希望処理
        if (notes.includes("[観戦希望]")) {
          if (!notes.includes(mention)) {
            notes = notes.replace("[観戦希望]", `[観戦希望] ${mention}`);
          }
        } else {
          if (notes) {
            notes += `\n[観戦希望] ${mention}`;
          } else {
            notes = `[観戦希望] ${mention}`;
          }
        }
      }

      // 空文字の場合はnullとして保存
      await Utils.apiPatch("sessions", { notes: notes || null }, `id=eq.${sessionId}`);
      
      if (isJoined) {
        Utils.showToast("観戦希望を取り消しました");
      } else {
        Utils.showToast("観戦希望を登録しました！");
      }
      
      location.reload();
    } catch (err) {
      console.error(err);
      alert("処理に失敗しました: " + err.message);
      btn.disabled = false;
    }
  });
});

// ==========================================
// --- HTML生成コンポーネント ---
// ==========================================

function buildSessionHeaderHtml(run, statusClass, statusJa) {
  return `
    <header class="session-detail-header">
      <h1 class="session-detail-title">${Utils.escapeHtml(run.title ?? run.id)}</h1>
      <span class="session-detail-badge ${statusClass}">${Utils.escapeHtml(statusJa)}</span>
    </header>
  `;
}

function buildSessionTopHtml(run, scenario, coverPath, fallback, gmName, plNames, upcoming, lastDone, runChars, editRunBtn) {
  return `
    <section class="session-detail-top">
      <div class="session-detail-imagewrap">
        <img class="session-detail-cover" src="${coverPath}" onerror="this.onerror=null; this.src='${fallback}';" alt="${Utils.escapeHtml(scenario?.title ?? run.title ?? run.id)}" loading="lazy">
      </div>
      <div class="session-detail-profile">
        <h2 class="session-detail-h2">卓情報${editRunBtn}</h2> 
        <table class="session-detail-table">
          <tbody>
            <tr><th>シナリオ</th><td>${scenario ? `<a class="session-detail-link" href="../scenarios/detail.html?id=${encodeURIComponent(scenario.id)}">${Utils.escapeHtml(scenario.title ?? scenario.id)}</a>` : "（不明）"}</td></tr>
            <tr><th>GM</th><td>${Utils.escapeHtml(gmName)}</td></tr>
            <tr><th>PL</th><td>${Utils.escapeHtml(plNames.join(" / ")) || "—"}</td></tr>
            <tr><th>次回</th><td>${run.status === "active" ? (upcoming[0]?._start ? Utils.escapeHtml(Utils.formatDateTime(upcoming[0]._start)) : "未定") : "—"}</td></tr>
            <tr><th>最終</th><td>${lastDone?._start ? Utils.escapeHtml(lastDone._start.toLocaleDateString("ja-JP")) : (run.status === "done" ? "未記録" : "—")}</td></tr>
          </tbody>
        </table>
        ${runChars.length ? `<h3 class="session-detail-h3">参加キャラクター</h3><div class="session-detail-chips">${runChars.map(c => `<a class="character-chip" href="../character/detail.html?id=${encodeURIComponent(c.id)}"><img class="character-chip-icon" src="${Utils.getCharacterImagePath(c.id, c.image_url)}" onerror="this.onerror=null; this.src='${Utils.DEFAULT_CHARACTER_IMAGE}';" alt="${Utils.escapeHtml(c.name ?? c.id)}" loading="lazy"><span class="character-chip-name">${Utils.escapeHtml(c.name ?? c.id)}</span></a>`).join("")}</div>` : ""}
      </div>
    </section>
  `;
}

function buildSessionLogHtml(runSessions, currentUserDiscordId) {
  return `
    <section class="session-detail-log">
      <h2 class="session-detail-h2">セッション履歴</h2>
      ${runSessions.length ? `<ul class="session-detail-list">${runSessions.map(s => {
        const stateLabels = { "scheduled": "予定", "done": "終了", "cancelled": "中止" };
        const stateJa = stateLabels[s.status] || "不明";
        const dateText = s._start ? Utils.formatDateTime(s._start) : "日付不明";
        const linksHtml = (s.replay_url || s.stream_url) ? `<div class="session-links">${s.stream_url ? `${Utils.renderLink(s.stream_url, "配信or動画")}` : ""}</div>` : "";
        
        let viewerBtnHtml = "";
        if (s.status === "scheduled") {
          if (currentUserDiscordId) {
            const hasJoined = s.notes && s.notes.includes(`<@${currentUserDiscordId}>`);
            const btnClass = hasJoined ? "btn-secondary" : "btn-primary";
            const btnText = hasJoined ? "👀 観戦取消" : "👀 観戦希望";
            viewerBtnHtml = `<button class="btn-viewer-toggle ${btnClass}" data-id="${s.id}" data-has-joined="${hasJoined}" style="padding: 2px 8px; font-size: 0.8rem; margin-right: 5px;">${btnText}</button>`;
          } else {
            viewerBtnHtml = `<button class="btn-viewer-toggle btn-secondary" disabled title="観戦希望にはDiscordログインが必要です" style="padding: 2px 8px; font-size: 0.8rem; margin-right: 5px; opacity: 0.6;">👀 観戦希望</button>`;
          }
        }

        return `
          <li class="session-detail-item ${s.status === 'cancelled' ? 'is-cancelled' : ''}">
            <div class="session-item-row">
              <span class="session-item-state ${Utils.escapeHtml(s.status)}">${Utils.escapeHtml(stateJa)}</span>
              <span class="session-item-date">${Utils.escapeHtml(dateText)}</span>
              <span class="session-item-title">${Utils.escapeHtml(s.title ?? "")}</span>
              <span class="session-item-links">${linksHtml}</span>
              ${viewerBtnHtml}
              <button class="btn-edit-session" data-id="${s.id}" data-title="${Utils.escapeHtml(s.title ?? "")}" data-start="${s.start}" data-status="${s.status}">📝</button>
            </div>
          </li>`;
      }).join("")}</ul>` : `<p class="session-detail-muted">この卓のセッションがありません</p>`}
    </section>
  `;
}
