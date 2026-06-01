"use strict";

let currentRecruit = null;
let allPlayers = [];
let allScenarios = [];
let currentApplicants = [];

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
            // ★修正: recruit_id ではなく recruitment_id で取得
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
    const scenarioImage = scenarioObj && scenarioObj.image_url ? scenarioObj.image_url : "../images/default_scenario.jpg"; // 画像がない場合のデフォルト

    const applicantNames = currentApplicants.map(app => {
        const pObj = allPlayers.find(p => p.player_id === app.player_id);
        return pObj ? pObj.player_name : app.player_id;
    });

    const isGMWanted = currentRecruit.recruit_role === "GM";
    const roleBadge = isGMWanted ? `<span class="recruit-role-badge" style="background:#fff5f5; color:#c53030; border: 1px solid #fc8181;">GM募集</span>` : `<span class="recruit-role-badge">PL募集</span>`;
    
    let statusText = "募集中";
    if (currentRecruit.status === "fulfilled") statusText = "満員";
    if (currentRecruit.status === "closed") statusText = "終了";

    // シナリオ詳細画面に準じたレイアウト構造
    root.innerHTML = `
        <section class="profile-header">
            <div class="profile-image-container" style="text-align: center;">
                <img src="${Utils.escapeHtml(scenarioImage)}" alt="Scenario" style="max-width: 100%; max-height: 300px; object-fit: cover; border-radius: 8px;" onerror="this.src='../images/default_scenario.jpg';">
            </div>
            
            <div class="profile-info">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <h2 style="margin: 0;">${Utils.escapeHtml(scenarioName)}</h2>
                    ${roleBadge}
                </div>
                <p><strong>募集主:</strong> ${Utils.escapeHtml(ownerName)}</p>
                <p><strong>ステータス:</strong> ${statusText} （現在の応募: ${currentApplicants.length}人 / 目標: ${currentRecruit.target_count}人）</p>
                
                <h4 style="margin-top: 15px; margin-bottom: 5px;">自由記入欄</h4>
                <div style="background: #f9f9f9; padding: 10px; border-radius: 4px; white-space: pre-wrap; font-size: 0.95em; border: 1px solid #eee; min-height: 60px;">${Utils.escapeHtml(currentRecruit.memo || "特記事項なし")}</div>
            </div>
        </section>

        <section class="profile-details" style="margin-top: 30px;">
            <h3>現在の応募者</h3>
            <div class="tag-container" style="margin-bottom: 20px;">
                ${applicantNames.length > 0 ? applicantNames.map(name => `<span class="tag">${Utils.escapeHtml(name)}</span>`).join('') : '<small style="color:#666;">まだ応募はありません</small>'}
            </div>

            <fieldset class="form-section">
                <legend>参加 / 参加取り消し</legend>
                <div class="input-group" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <select id="action-player-select" class="form-control" style="max-width: 250px;">
                        <option value="">-- プレイヤーを選択 --</option>
                    </select>
                    <button type="button" id="btn-apply" class="primary-btn">応募する</button>
                    <button type="button" id="btn-cancel-apply" class="secondary-btn" style="color: #c53030; border-color: #fc8181;">参加を取り消す</button>
                </div>
            </fieldset>

            <fieldset class="form-section" style="margin-top: 20px; border: 1px solid #fc8181; background: #fff5f5;">
                <legend style="color: #c53030;">募集の管理（募集主用）</legend>
                <button type="button" id="btn-delete-recruit" class="secondary-btn" style="background: #e53e3e; color: white; border: none;">この募集を削除する</button>
            </fieldset>
        </section>

        <hr style="margin: 30px 0;" />
        <div id="comments-root"></div>
        
        <footer>
          <hr />
          <small><a href="./index.html">Back to Recruitments</a></small>
        </footer>
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
                recruitment_id: currentRecruit.id, // ★修正: recruitment_id に統一
                player_id: playerId
            }]);
            alert("応募しました！");
            location.reload();
        } catch (err) {
            console.error(err);
            alert("応募に失敗しました。");
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
            // ★修正: recruitment_id に統一
            await Utils.apiDelete("recruitment_applicants", `recruitment_id=eq.${currentRecruit.id}&player_id=eq.${playerId}`);
            alert("参加を取り消しました。");
            location.reload();
        } catch (err) {
            console.error(err);
            alert("取り消しに失敗しました。");
            btn.disabled = false;
        }
    });

    // 募集の削除ボタン
    document.getElementById("btn-delete-recruit")?.addEventListener("click", async () => {
        if (!confirm("本当にこの募集を削除（中止）しますか？\n※応募データも一緒に消去されます。")) return;
        
        const btn = document.getElementById("btn-delete-recruit");
        btn.disabled = true;

        try {
            // ★修正: 外部キー制約エラーを回避するため、先に応募者レコードを消す
            if (currentApplicants.length > 0) {
                await Utils.apiDelete("recruitment_applicants", `recruitment_id=eq.${currentRecruit.id}`);
            }
            
            // その後、募集本体を消す
            await Utils.apiDelete("recruitments", `id=eq.${currentRecruit.id}`);
            alert("募集を削除しました。");
            location.href = "./index.html"; 
        } catch (err) {
            console.error(err);
            alert("削除に失敗しました。コンソールを確認してください。");
            btn.disabled = false;
        }
    });
}

Utils.domReady(main);