"use strict";

// 1. グローバル変数として定義
let currentRunData = null;

function renderLink(url, label) {
  const u = String(url ?? "").trim();
  if (!u) return "";
  const safe = Utils.escapeHtml(u);
  const text = Utils.escapeHtml(label ?? u);
  return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

async function main() {
  const root = document.getElementById("session-detail");
  if (!root) return;

  const run_id = Utils.getQueryParam("id");
  if (!run_id) {
    root.innerHTML = "<p>run ID が指定されていません</p>";
    return;
  }

  try {
    const [runs, scenarios, sessions, characters] = await Promise.all([
      Utils.apiGet("runs"),
      Utils.apiGet("scenarios"),
      Utils.apiGet("sessions"),
      Utils.apiGet("characters").catch(() => []),
    ]);

    const run = (Array.isArray(runs) ? runs : []).find(r => r.id === run_id);
    if (!run) {
      root.innerHTML = "<p>卓が見つかりません</p>";
      return;
    }

    // ★重要: ここで取得したデータを外の変数に代入する
    currentRunData = run;
    const editRunBtn = `<button id="btn-open-run-edit" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8rem;">📝</button>`;
    const scenarioId = run?.scenario_id;
    const coverPath = Utils.getScenarioCoverPath(scenarioId ?? "unknown");
    const fallback = Utils.DEFAULT_SCENARIO_COVER;
    const scenario = (Array.isArray(scenarios) ? scenarios : []).find(s => s.id === run.scenario_id) ?? null;

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

    root.innerHTML = `
      <header class="session-detail-header">
        <h1 class="session-detail-title">${Utils.escapeHtml(run.title ?? run.id)}</h1>
        <span class="session-detail-badge ${statusClass}">${Utils.escapeHtml(statusJa)}</span>
      </header>

      <section class="session-detail-top">

        <div class="session-detail-imagewrap">
          <img
            class="session-detail-cover"
            src="${coverPath}"
            onerror="this.onerror=null; this.src='${fallback}';"
            alt="${Utils.escapeHtml(scenario?.title ?? run.title ?? run.id)}"
            loading="lazy"
          >
        </div>
        
        <div class="session-detail-profile">
          <h2 class="session-detail-h2">卓情報${editRunBtn}</h2> 

          <table class="session-detail-table">
            <tbody>
              <tr><th>シナリオ</th><td>${
                scenario
                  ? `<a class="session-detail-link" href="../scenarios/detail.html?id=${encodeURIComponent(scenario.id)}">${Utils.escapeHtml(scenario.title ?? scenario.id)}</a>`
                  : "（不明）"
              }</td></tr>
              <tr><th>GM</th><td>${Utils.escapeHtml(run.gm ?? "—")}</td></tr>
              <tr><th>PL</th><td>${Utils.escapeHtml((run.players ?? []).join(" / ") || "—")}</td></tr>
              <tr><th>次回</th><td>${
                run.status === "active"
                  ? (upcoming[0]?._start ? Utils.escapeHtml(Utils.formatDateTime(upcoming[0]._start)) : "未定")
                  : "—"
              }</td></tr>
              <tr><th>最終</th><td>${
                lastDone?._start ? Utils.escapeHtml(lastDone._start.toLocaleDateString("ja-JP")) : (run.status === "done" ? "未記録" : "—")
              }</td></tr>
            </tbody>
          </table>

          ${
            runChars.length
              ? `<h3 class="session-detail-h3">参加キャラクター</h3>
                 <div class="session-detail-chips">
                   ${runChars.map(c => {
                      const name = Utils.escapeHtml(c.name ?? c.id);
                      const img = Utils.getCharacterImagePath(c.id);
                      const fallbackImg = Utils.DEFAULT_CHARACTER_IMAGE;

                      return `
                        <a class="character-chip" href="../character/detail.html?id=${encodeURIComponent(c.id)}">
                          <img
                            class="character-chip-icon" 
                            src="${img}"
                            onerror="this.onerror=null; this.src='${fallbackImg}';"
                            alt="${name}"
                            loading="lazy"
                          >
                          <span class="character-chip-name">${name}</span>
                        </a>
                      `;
                    }).join("")}

                 </div>`
              : ""
          }
        </div>

      </section>

      <section class="session-detail-log">
        <h2 class="session-detail-h2">セッション履歴</h2>
        ${
          runSessions.length
            ? `<ul class="session-detail-list">
                ${runSessions.map(s => {
                  const stateLabels = {
                    "scheduled": "予定",
                    "done": "終了",
                    "cancelled": "中止" // 追加
                  };
                  const stateJa = stateLabels[s.status] || "不明";
                  const dateText = s._start ? Utils.formatDateTime(s._start) : "日付不明";

                  const linksHtml = (s.replay_url || s.stream_url)
                    ? `
                      <div class="session-links">
                        ${s.replay_url ? `${renderLink(s.replay_url, "リプレイ")}` : ""}
                        ${s.stream_url ? `${renderLink(s.stream_url, "リプレイ")}` : ""}
                      </div>
                    `
                    : "";

                  return `
                    <li class="session-detail-item ${s.status === 'cancelled' ? 'is-cancelled' : ''}">
                      <div class="session-item-row">
                        <span class="session-item-state ${Utils.escapeHtml(s.status)}">
                          ${Utils.escapeHtml(stateJa)}
                        </span>
                        
                        <span class="session-item-date">${Utils.escapeHtml(dateText)}</span>
                        
                        <span class="session-item-title">${Utils.escapeHtml(s.title ?? "")}</span>
                        
                        <span class="session-item-links">${linksHtml}</span>

                        <button class="btn-edit-session" 
                                data-id="${s.id}" 
                                data-title="${Utils.escapeHtml(s.title ?? "")}" 
                                data-start="${s.start}"
                                data-status="${s.status}">
                          📝
                        </button>
                      </div>
                    </li>
                  `;
                  
                }).join("")}

              </ul>`
            : `<p class="session-detail-muted">この卓のセッションがありません</p>`
        }
      </section>
    `;

    renderCompletionGuide(runSessions, run);

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

// 送信処理の登録
Utils.domReady(() => {
  // まず main を実行
  main();

  const subForm = document.getElementById("sub-session-form");
  if (!subForm) return;

  // 編集ボタンのクリックイベント（デリゲーション）
  document.addEventListener('click', (e) => {
    // 編集アイコン 📝 をクリックしたとき
    const btn = e.target.closest('.btn-edit-session');
    if (btn) {
      const modal = document.getElementById('edit-session-modal');
      const form = document.getElementById('edit-session-form');

      // データのセット
      form.session_id.value = btn.dataset.id;
      form.title.value = btn.dataset.title;
      
      // 日時の変換処理 (ISO -> local datetime)
      if (btn.dataset.start) {
        const d = new Date(btn.dataset.start);
        const offset = d.getTimezoneOffset() * 60000;
        const localTime = new Date(d - offset).toISOString().slice(0, 16);
        form.start.value = localTime;
      }

      form.status.value = btn.dataset.status;
      modal.style.display = 'block';
    }

    // モーダルの外側をクリックしたら閉じる（おまけの親切機能）
    const modal = document.getElementById('edit-session-modal');
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  // キャンセルボタンで閉じる
  document.getElementById('btn-close-edit')?.addEventListener('click', () => {
    document.getElementById('edit-session-modal').style.display = 'none';
  });

  // 卓編集モーダルを開く
  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-open-run-edit') {
        const modal = document.getElementById('edit-run-modal');
        const form = document.getElementById('edit-run-form');
        
        if (!currentRunData) {
            alert("データの読み込みが完了していません。");
            return;
        }
        
        // 現在の値をセット
        form.gm.value = currentRunData.gm || "";
        
        modal.style.display = 'block';
    }

    // モーダルの外側をクリックしたら閉じる（おまけの親切機能）
    const modal = document.getElementById('edit-run-modal');
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  // キャンセルボタン
  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-close-run-edit') {
        document.getElementById('edit-run-modal').style.display = 'none';
    }
  });

  // 卓情報の更新実行
  document.getElementById('edit-run-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentRunData) return;

    const payload = {
        gm: e.target.gm.value,
    };

    try {
        await Utils.apiPatch("runs", payload, `id=eq.${currentRunData.id}`);
        alert("卓情報を更新しました");
        location.reload();
    } catch (err) {
        console.error(err);
        alert("更新に失敗しました: " + err.message);
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
        status: form.status.value // 追加
      };

      try {
          // 先ほど作成した apiPatch を使用
          // セッションIDは不変（se-XXX_Y_Z）なので、これをキーに更新
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
      const notesVal = subForm.notes.value;

      if (!startVal) {
          alert("日時を選択してください。");
          return;
      }

      // 採番規則: se-YYYYMMDD (ハイフンを除去)
      // startValの "T" より前の日付部分を取得して加工
      const datePart = startVal.split('T')[0];
      const idDate = datePart.replace(/-/g, ""); 
      const newSessionId = `se-${idDate}`;
      
      // start (timestamp with time zone) の作成
      // datetime-local の文字列をそのまま Date オブジェクトに渡して ISO形式に変換
      const startTimestamp = new Date(startVal).toISOString();

      const payload = {
        // id: は含めない（DBのトリガーで自動採番される）
        run_id: currentRunData.id,
        gm: currentRunData.gm,
        start: startTimestamp,
        title: titleVal,
        notes: notesVal,
        status: 'scheduled'
      };

      const submitBtn = subForm.querySelector("button[type=submit]");
      submitBtn.disabled = true;

      try {
          await Utils.apiPost("sessions", payload);
          location.reload(); 
      } catch (err) {
          console.error(err);
          alert("保存失敗: " + err.message);
          submitBtn.disabled = false;
      }
  });
});