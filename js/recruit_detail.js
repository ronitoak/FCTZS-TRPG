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
        // マスターデータと対象の募集データを一括取得
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

        // comments.js の初期化 (第一引数にテーブル名か識別子、第二引数にIDを渡す想定)
        // ※comments.jsの実装に合わせて適宜調整してください
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

    // プレイヤー名とシナリオ名の解決
    const ownerObj = allPlayers.find(p => p.player_id === currentRecruit.owner_player_id);
    const ownerName = ownerObj ? ownerObj.player_name : "不明なプレイヤー";

    const scenarioObj = allScenarios.find(s => s.id === currentRecruit.scenario_id);
    const scenarioName = scenarioObj ? scenarioObj.title : "未定・オリジナル";

    // 応募者の名前リストを作成
    const applicantNames = currentApplicants.map(app => {
        const pObj = allPlayers.find(p => p.player_id === app.player_id);
        return pObj ? pObj.player_name : app.player_id;
    });

    const isGMWanted = currentRecruit.recruit_role === "GM";
    const roleBadge = isGMWanted ? `<span class="recruit-role-badge" style="background:#fff5f5; color:#c53030;">GM募集</span>` : `<span class="recruit-role-badge">PL募集</span>`;
    
    // ステータスの表示
    let statusText = "募集中";
    if (currentRecruit.status === "fulfilled") statusText = "満員";
    if (currentRecruit.status === "closed") statusText = "終了";

    root.innerHTML = `
        <div class="profile-card" style="border-left: 4px solid ${isGMWanted ? '#e53e3e' : 'var(--primary-color)'};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2>${Utils.escapeHtml(scenarioName)}</h2>
                ${roleBadge}
            </div>
            <p><strong>募集主:</strong> ${Utils.escapeHtml(ownerName)}</p>
            <p><strong>ステータス:</strong> ${statusText} （現在の応募: ${currentApplicants.length}人 / 目標: ${currentRecruit.target_count}人）</p>
            <div style="margin-top: 10px; background: #f9f9f9; padding: 10px; border-radius: 4px; white-space: pre-wrap;">${Utils.escapeHtml(currentRecruit.memo || "特記事項なし")}</div>
            
            <h4 style="margin-top: 15px;">現在の応募者</h4>
            <div class="tag-container">
                ${applicantNames.length > 0 ? applicantNames.map(name => `<span class="tag">${Utils.escapeHtml(name)}</span>`).join('') : '<small style="color:#666;">まだ応募はありません</small>'}
            </div>
        </div>
    `;
}

function setupActionForms() {
    // プレイヤー選択プルダウンの構築
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

        if (currentRecruit.status !== "open") {
            return alert("この募集は現在受け付けていません。");
        }

        const isAlreadyApplied = currentApplicants.some(a => a.player_id === playerId);
        if (isAlreadyApplied) return alert("すでにこの募集に応募しています。");

        try {
            await Utils.apiPost("recruitment_applicants", [{
                recruit_id: currentRecruit.id,
                player_id: playerId
            }]);
            alert("応募しました！");
            location.reload();
        } catch (err) {
            console.error(err);
            alert("応募に失敗しました。");
        }
    });

    // 参加取り消しボタン
    document.getElementById("btn-cancel-apply")?.addEventListener("click", async () => {
        const playerId = select.value;
        if (!playerId) return alert("プレイヤーを選択してください。");

        const isAlreadyApplied = currentApplicants.some(a => a.player_id === playerId);
        if (!isAlreadyApplied) return alert("この募集には応募していません。");

        if (!confirm("本当に参加を取り消しますか？")) return;

        try {
            // recruit_id と player_id の組み合わせで削除（SupabaseのRESTに準拠）
            await Utils.apiDelete("recruitment_applicants", `recruit_id=eq.${currentRecruit.id}&player_id=eq.${playerId}`);
            alert("参加を取り消しました。");
            location.reload();
        } catch (err) {
            console.error(err);
            alert("取り消しに失敗しました。");
        }
    });

    // 募集の削除ボタン（募集主・管理者用）
    document.getElementById("btn-delete-recruit")?.addEventListener("click", async () => {
        if (!confirm("本当にこの募集を削除（中止）しますか？\n※応募データやコメントも一緒に消去されます（設定による）。")) return;
        
        try {
            await Utils.apiDelete("recruitments", `id=eq.${currentRecruit.id}`);
            alert("募集を削除しました。");
            location.href = "./index.html"; // 一覧画面へ戻る
        } catch (err) {
            console.error(err);
            alert("削除に失敗しました。");
        }
    });
}

Utils.domReady(main);