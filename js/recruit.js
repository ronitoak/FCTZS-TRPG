"use strict";

let allPlayers = [];
let allScenarios = [];
let allRecruitments = [];
let allApplicants = [];

// 1. 初期データの読み込み（プレイヤーとシナリオ）
async function initData() {
    await Utils.initAuthAndHeader('common-nav', '../');
    try {
        [allPlayers, allScenarios] = await Promise.all([
            Utils.getPlayers(),
            Utils.apiGet("scenarios")
        ]);

        // モーダル内のプルダウン（募集主）を生成
        const ownerSelect = document.getElementById("modal-owner-id");
        if (ownerSelect) {
            ownerSelect.innerHTML = '<option value="">-- 選択してください --</option>';
            allPlayers.forEach(p => {
                ownerSelect.innerHTML += `<option value="${Utils.escapeHtml(p.player_id)}">${Utils.escapeHtml(p.player_name)}</option>`;
            });
        }

        // モーダル内のプルダウン（シナリオ）を生成
        const scenarioSelect = document.getElementById("modal-scenario-id");
        if (scenarioSelect) {
            scenarioSelect.innerHTML = '<option value="">-- 未定 --</option>';
            allScenarios.forEach(s => {
                scenarioSelect.innerHTML += `<option value="${Utils.escapeHtml(s.id)}">${Utils.escapeHtml(s.title)}</option>`;
            });
        }

        await loadRecruitments();
    } catch (err) {
        console.error("初期データの読み込みに失敗:", err);
    }
}

// 2. 募集データの取得
async function loadRecruitments() {
    const container = document.getElementById("recruit-list-container");
    container.innerHTML = "<p>読み込み中...</p>";

    try {
        // 募集本体と応募者を同時に取得
        [allRecruitments, allApplicants] = await Promise.all([
            Utils.apiGet("recruitments?order=created_at.desc"),
            Utils.apiGet("recruitment_applicants")
        ]);

        renderRecruitments();
    } catch (err) {
        console.error("募集データの読み込みに失敗:", err);
        container.innerHTML = "<p>データの取得に失敗しました。</p>";
    }
}

// 3. 募集カードの描画
function renderRecruitments() {
    const container = document.getElementById("recruit-list-container");
    container.innerHTML = "";

    // 募集中、または満員のものを表示（取り下げられたものは隠す）
    const activeRecruitments = allRecruitments.filter(r => r.status === "open" || r.status === "fulfilled");

    if (activeRecruitments.length === 0) {
        container.innerHTML = "<p class='u-muted' style='text-align: center; padding: 40px 0;'>現在、募集はありません。<br>右上のボタンから新しく募集を立ててみましょう！</p>";
        return;
    }

    activeRecruitments.forEach(recruit => {
        // 関連データの紐付け
        const owner = allPlayers.find(p => p.player_id === recruit.owner_player_id);
        const ownerName = owner ? owner.player_name : "不明なプレイヤー";

        const scenario = allScenarios.find(s => s.id === recruit.scenario_id);
        const scenarioTitle = scenario ? scenario.title : "未定";
        const coverPath = Utils.getScenarioCoverPath(scenario.id);
        const fallback = Utils.DEFAULT_SCENARIO_COVER;

        const applicantsForThis = allApplicants.filter(a => a.recruitment_id === recruit.id);
        const currentCount = applicantsForThis.length;
        const isFulfilled = recruit.status === "fulfilled" || currentCount >= recruit.target_count;

        // カードDOMの生成
        const card = document.createElement("div");
        card.className = `card recruit-card ${recruit.recruit_role === 'GM' ? 'gm-wanted' : ''}`;
        
        // 参加者のチップ（名前タグ）を生成
        let applicantsHtml = applicantsForThis.map(a => {
            const p = allPlayers.find(pl => pl.player_id === a.player_id);
            return `<span class="applicant-chip">${Utils.escapeHtml(p ? p.player_name : "不明")}</span>`;
        }).join("");

        if (!applicantsHtml) applicantsHtml = "<span class='u-muted' style='font-size: 0.8rem;'>まだ応募はありません</span>";

        // まだ参加していないプレイヤーの選択肢を作る
        const unjoinedPlayers = allPlayers.filter(p => 
            p.player_id !== recruit.owner_player_id && 
            !applicantsForThis.some(a => a.player_id === p.player_id)
        );

        const isOwner = true; // 本来はログインユーザーIDと比較: recruit.owner_player_id === currentUserId;

        card.innerHTML = `
            <div class="recruit-header">
                <span class="recruit-role-badge">${recruit.recruit_role === 'GM' ? 'GM募集' : 'PL募集'}</span>
                <span class="recruit-progress" style="color: ${isFulfilled ? 'var(--success-color)' : 'inherit'}">
                    ${isFulfilled ? '満員御礼！' : `${currentCount} / ${recruit.target_count} 人`}
                </span>
            </div>
            <img class="scenario-detail-cover"
            src="${coverPath}"
            onerror="this.onerror=null; this.src='${fallback}';"
            alt="${Utils.escapeHtml(scenario.title ?? scenario.id)}"
            loading="lazy">
            <a href="../scenarios/detail.html?id=${scenario?.id}" style="text-decoration: none; color: inherit;">
                <h3 style="margin: 0; font-size: 1.1rem;">${Utils.escapeHtml(scenarioTitle)}</h3>
            </a>
            <div style="font-size: 0.9rem; color: var(--text-muted);">
                募集主: <strong>${Utils.escapeHtml(ownerName)}</strong>
            </div>
            ${recruit.memo ? `<div style="background: #f8fafc; padding: 12px; border-radius: 4px; font-size: 0.9rem; white-space: pre-wrap; border: 1px solid var(--border-color);">${Utils.escapeHtml(recruit.memo)}</div>` : ''}
            
            <div style="margin-top: 8px;">
                <div style="font-size: 0.85rem; font-weight: bold; margin-bottom: 4px;">現在の参加者:</div>
                <div class="applicant-list">${applicantsHtml}</div>
            </div>

            <div style="margin-top: 15px; text-align: right;">
                    <a href="./detail.html?id=${r.id}" class="secondary-btn" style="text-decoration: none; display: inline-block;">詳細を見る / 応募する</a>
            </div>
            
            ${!isFulfilled ? `
                <div style="margin-top: 16px; display: flex; gap: 8px;">
                    <select class="form-control join-player-select" style="flex: 1;">
                        <option value="">-- 参加するプレイヤー --</option>
                        ${unjoinedPlayers.map(p => `<option value="${Utils.escapeHtml(p.player_id)}">${Utils.escapeHtml(p.player_name)}</option>`).join("")}
                    </select>
                    <button class="btn-primary btn-join" data-id="${recruit.id}" style="white-space: nowrap;">参加する</button>
                </div>
            ` : `
                <div style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
                    <a href="../schedule/index.html" class="btn-secondary" style="font-size: 0.85rem;">日程調整へ進む ▶</a>
                    <button class="btn-close-recruit" data-id="${recruit.id}" style="font-size: 0.8rem; background: none; border: 1px solid #ccc; cursor: pointer; padding: 4px 8px; border-radius: 4px;">募集を終了する</button>
                </div>
            `}
        `;

        container.appendChild(card);
    });

    // 4. 参加ボタンのイベント
    document.querySelectorAll(".btn-join").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const recruitId = e.target.dataset.id;
            const select = e.target.previousElementSibling;
            const playerId = select.value;

            if (!playerId) return alert("参加するプレイヤーを選択してください");

            try {
                e.target.disabled = true;
                e.target.textContent = "処理中...";
                
                // 応募テーブルに登録
                await Utils.apiPost("recruitment_applicants", [{
                    recruitment_id: recruitId,
                    player_id: playerId
                }]);

                // 満員になったかのチェック
                const recruit = allRecruitments.find(r => r.id === recruitId);
                const newCount = allApplicants.filter(a => a.recruitment_id === recruitId).length + 1;
                
                if (newCount >= recruit.target_count) {
                    // 満員になったらステータスを更新
                    await Utils.apiPatch("recruitments", { status: "fulfilled" }, `id=eq.${recruitId}`);

                } else {
                    alert("参加しました！");
                }

                await loadRecruitments(); // 画面を再描画
            } catch (err) {
                console.error(err);
                alert("参加処理に失敗しました。すでに参加している可能性があります。");
                e.target.disabled = false;
                e.target.textContent = "参加する";
            }
        });
    });

    // 募集終了ボタン（ステータスをclosed等に変更して一覧から消す）
    document.querySelectorAll(".btn-close-recruit").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            if (!confirm("この募集を終了し、一覧から非表示にしますか？")) return;
            
            const recruitId = e.target.dataset.id;
            try {
                // ステータスを 'closed' に更新（これにより filter から外れる）
                await Utils.apiPatch("recruitments", { status: "closed" }, `id=eq.${recruitId}`);
                alert("募集を終了しました。");
                await loadRecruitments();
            } catch (err) {
                console.error(err);
                alert("処理に失敗しました。");
            }
        });
    });
}



// 5. 募集作成モーダルの制御
document.getElementById("btn-open-recruit-modal")?.addEventListener("click", () => {
    document.getElementById("recruit-modal").style.display = "block";
});

window.addEventListener("click", (e) => {
    if (e.target.id === "recruit-modal") e.target.style.display = "none";
});

// 6. 募集フォームの送信
document.getElementById("recruit-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("button[type='submit']");
    
    const payload = {
        owner_player_id: fd.get("owner_player_id"),
        recruit_role: fd.get("recruit_role"),
        scenario_id: fd.get("scenario_id") || null, // 空ならnullにして未定扱い
        target_count: parseInt(fd.get("target_count"), 10),
        memo: fd.get("memo")
    };

    try {
        btn.disabled = true;
        btn.textContent = "送信中...";
        await Utils.apiPost("recruitments", [payload]);
        alert("募集を作成しました！");
        document.getElementById("recruit-modal").style.display = "none";
        e.target.reset(); // フォームの中身を空にする
        await loadRecruitments();
    } catch (err) {
        console.error(err);
        alert("募集の作成に失敗しました");
    } finally {
        btn.disabled = false;
        btn.textContent = "募集を開始する";
    }
});

// 起動！
Utils.domReady(initData);