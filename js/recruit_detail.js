"use strict";

let currentRecruit = null;
let allPlayers = [];
let allScenarios = [];
let currentApplicants = [];

// 改行を <br> に変換するヘルパー（シナリオ詳細と同じもの）
function renderMultilineText(text) {
  const normalized = String(text ?? "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\\n", "\n");
  const escaped = Utils.escapeHtml(normalized);
  return escaped.replaceAll("\n", "<br>");
}

async function main() {
    await Utils.initAuthAndHeader('common-nav', '../');

    const recruitId = Utils.getQueryParam("id");
    if (!recruitId) {
        document.getElementById("recruit-detail-root").innerHTML = "<p>募集IDが指定されていません。</p>";
        return;
    }

    try {
        const [players, scenarios, recruitments, applicants] = await Promise.all([
            Utils.apiGet("players"),
            Utils.apiGet("scenarios"),
            Utils.apiGet("recruitments", `id=eq.${recruitId}`),
            Utils.apiGet("recruitment_applicants", `recruitment_id=eq.${recruitId}`)
        ]);

        allPlayers = Array.isArray(players) ? players : [];
        allScenarios = Array.isArray(scenarios) ? scenarios : [];
        currentApplicants = Array.isArray(applicants) ? applicants : [];

        if (!recruitments || recruitments.length === 0) {
            document.getElementById("recruit-detail-root").innerHTML = "<p>対象の募集が見つかりません（削除された可能性があります）。</p>";
            return;
        }
        currentRecruit = recruitments[0];

        renderDetail();
        setupActionForms();

        if (typeof initComments === "function") {

            initComments("recruitments", recruitId, "comments-root", allPlayers);
        }

    } catch (err) {
        console.error(err);
        document.getElementById("recruit-detail-root").innerHTML = `<p>エラーが発生しました: ${Utils.escapeHtml(err.message)}</p>`;
    }
}

function renderDetail() {
    const root = document.getElementById("recruit-detail-root");

    const ownerObj = allPlayers.find(p => p.player_id === currentRecruit.owner_player_id);
    const ownerName = ownerObj ? ownerObj.player_name : "不明なプレイヤー";

    const scenarioObj = allScenarios.find(s => s.id === currentRecruit.scenario_id);
    const scenarioName = scenarioObj ? scenarioObj.title : "未定・オリジナル";
    
    // 画像パスの生成（シナリオIDがあればその画像、なければデフォルト）
    const scenarioImage = scenarioObj ? `../img/scenario/${scenarioObj.id}.png` : "../img/scenario/default.png";

    const applicantNames = currentApplicants.map(app => {
        const pObj = allPlayers.find(p => p.player_id === app.player_id);
        return pObj ? pObj.player_name : app.player_id;
    });

    const isGMWanted = currentRecruit.recruit_role === "GM";
    const roleBadge = isGMWanted ? `<span class="recruit-role-badge" style="background:#fff5f5; color:#c53030; border: 1px solid #fc8181; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; font-weight: bold;">GM募集</span>` : `<span class="recruit-role-badge" style="background:#ebf8ff; color:#2b6cb0; border: 1px solid #90cdf4; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; font-weight: bold;">PL募集</span>`;
    
    let statusText = "募集中";
    if (currentRecruit.status === "fulfilled") statusText = "満員";
    if (currentRecruit.status === "closed") statusText = "終了";

    // シナリオ詳細に完全に準拠したHTML構造
    root.innerHTML = `
      <header class="scenario-detail-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h1 class="scenario-detail-title">${Utils.escapeHtml(scenarioName)}</h1>
        ${roleBadge}
      </header>

      <section class="scenario-detail-top">
        <div class="scenario-detail-imagewrap">
          <img class="scenario-detail-cover"
            src="${Utils.escapeHtml(scenarioImage)}"
            onerror="this.onerror=null; this.src='../img/scenario/default.png';"
            alt="${Utils.escapeHtml(scenarioName)}"
            loading="lazy">
        </div>

        <div class="scenario-detail-info">
            <h2 class="scenario-detail-h2">募集情報</h2>
            <div class="scenario-info-meta">
                <div><strong>募集主:</strong> ${Utils.escapeHtml(ownerName)}</div>
                <div><strong>募集状態:</strong> ${Utils.escapeHtml(statusText)}</div>
                <div><strong>募集人数:</strong> ${currentRecruit.target_count}人 （現在の応募: ${currentApplicants.length}人）</div>
            </div>
                <div class="scenario-base-info">
                <div><strong>自由記入欄:</strong><br>${renderMultilineText(currentRecruit.memo)}</div>
            </div>
        </div>
      </section>

      <section class="scenario-detail-section">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid var(--border-color, #eee); padding-bottom: 8px; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
            <h2 class="scenario-detail-h2" style="margin: 0; border: none; padding: 0;">現在の応募者</h2>
            
            <div class="input-group" style="display: flex; gap: 8px; align-items: center; margin: 0;">
                <select id="action-player-select" class="form-control" style="width: auto; padding: 4px 8px; font-size: 0.95em;">
                    <option value="">-- プレイヤーを選択 --</option>
                </select>
                <button type="button" id="btn-apply" class="btn-primary btn-join" style="padding: 6px 12px; font-size: 0.95em;">応募する</button>
                <button type="button" id="btn-cancel-apply" class="btn-cancel" style="padding: 6px 12px; font-size: 0.95em;">取り消す</button>
            </div>
        </div>

        <div class="scenario-detail-characters">
            ${applicantNames.length > 0 
                ? applicantNames.map(name => `<span class="tag" style="display: inline-block; background: var(--bg-color); padding: 4px 10px; border-radius: 12px; margin: 4px; border: 1px solid var(--border-color);">${Utils.escapeHtml(name)}</span>`).join('') 
                : '<p class="scenario-detail-muted"><small>まだ応募はありません</small></p>'}
        </div>
      </section>

        <section class="scenario-detail-section" style="margin-top: 30px;">
            <fieldset class="form-section" style="border: 1px solid #fc8181; background: #fff5f5; padding: 15px;">
                <legend style="color: #c53030; font-weight: bold;">募集の削除</legend>
                <button type="button" id="btn-delete-recruit" class="secondary-btn" style="background: #e53e3e; color: white; border: none; width: 100%; padding: 20px; font-size: 1.3rem; font-weight: bold; cursor: pointer; border-radius: 5px;">この募集を削除する</button>
            </fieldset>
        </section>
    `;
}

function setupActionForms() {
    const select = document.getElementById("action-player-select");
    if (select) {
        allPlayers.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.player_id;
            opt.textContent = p.player_name;
            select.appendChild(opt);
        });
    }

    // 応募ボタン
    document.getElementById("btn-apply")?.addEventListener("click", async () => {
        const playerId = select.value;
        if (!playerId) return alert("プレイヤーを選択してください。");

        if (currentRecruit.status !== "open") return alert("この募集は現在受け付けていません。");
        if (currentApplicants.some(a => a.player_id === playerId)) return alert("すでにこの募集に応募しています。");

        const btn = document.getElementById("btn-apply");
        btn.disabled = true;

        try {
            await Utils.apiPost("recruitment_applicants", [{
                recruitment_id: currentRecruit.id, // ★修正: recruitment_id
                player_id: playerId
            }]);
            alert("応募しました！");
            location.reload();
        } catch (err) {
            console.error(err);
            alert("応募に失敗しました。特設サイト関連に報告してください。");
            btn.disabled = false;
        }
    });

    // 参加取り消しボタン
    document.getElementById("btn-cancel-apply")?.addEventListener("click", async () => {
        const playerId = select.value;
        if (!playerId) return alert("プレイヤーを選択してください。");
        if (!currentApplicants.some(a => a.player_id === playerId)) return alert("この募集には応募していません。");
        if (!confirm("本当に参加を取り消しますか？")) return;

        const btn = document.getElementById("btn-cancel-apply");
        btn.disabled = true;

        try {
            // ★修正: recruitment_id
            await Utils.apiDelete("recruitment_applicants", `recruitment_id=eq.${currentRecruit.id}&player_id=eq.${playerId}`);
            alert("参加を取り消しました。");
            location.reload();
        } catch (err) {
            console.error(err);
            alert("取り消しに失敗しました。特設サイト関連に報告してください。");
            btn.disabled = false;
        }
    });

    // 募集の削除ボタン
    document.getElementById("btn-delete-recruit")?.addEventListener("click", async () => {
        if (!confirm("本当にこの募集を削除（中止）しますか？")) return;
        
        const btn = document.getElementById("btn-delete-recruit");
        btn.disabled = true;

        try {
            // ★修正: 外部キー制約エラーを回避するため、先に応募者レコードを消去する
            if (currentApplicants.length > 0) {
                await Utils.apiDelete("recruitment_applicants", `recruitment_id=eq.${currentRecruit.id}`);
            }
            
            // その後、募集本体を消去する
            await Utils.apiDelete("recruitments", `id=eq.${currentRecruit.id}`);
            alert("募集を削除しました。");
            location.href = "./index.html"; 
        } catch (err) {
            console.error(err);
            alert("削除に失敗しました。特設サイト関連に報告してください。");
            btn.disabled = false;
        }
    });
}

Utils.domReady(main);