"use strict";

let allPlayers = [];
let allScenarios = [];
let allRecruitments = [];
let allApplicants = [];
let currentUserProfile = null;

function getTrendTagsHtml(scenario) {
  const tags = [];
  if (scenario.trend_story_chaos === 'story') tags.push('<span class="trend-tag trend-story">物語重視</span>');
  if (scenario.trend_story_chaos === 'chaos') tags.push('<span class="trend-tag trend-chaos">混沌歓迎</span>');
  if (scenario.trend_avatar_clear === 'avatar') tags.push('<span class="trend-tag trend-avatar">RP・没入</span>');
  if (scenario.trend_avatar_clear === 'clear') tags.push('<span class="trend-tag trend-clear">攻略重視</span>');
  if (scenario.trend_harmony_active === 'harmony') tags.push('<span class="trend-tag trend-harmony">協調重視</span>');
  if (scenario.trend_harmony_active === 'active') tags.push('<span class="trend-tag trend-active">活躍推奨</span>');
  
  if (tags.length === 0) return '';
  return `<div class="trend-tags-container" style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; margin-bottom: 8px;">${tags.join('')}</div>`;
}

// シナリオの傾向とログイン中プレイヤーの欲求から相性を0〜3点で算出
function calculateMatchScore(scenario, profile) {
    if (!scenario || !profile) return 0;

    let score = 0;
    if (scenario.trend_story_chaos === "story" && (profile.desire_story === 4 || profile.desire_story === 5)) score++;
    if (scenario.trend_story_chaos === "chaos" && (profile.desire_chaos === 4 || profile.desire_chaos === 5)) score++;
    if (scenario.trend_avatar_clear === "avatar" && (profile.desire_avatar === 4 || profile.desire_avatar === 5)) score++;
    if (scenario.trend_avatar_clear === "clear" && (profile.desire_clear === 4 || profile.desire_clear === 5)) score++;
    if (scenario.trend_harmony_active === "harmony" && (profile.desire_harmony === 4 || profile.desire_harmony === 5)) score++;
    if (scenario.trend_harmony_active === "active" && (profile.desire_active === 4 || profile.desire_active === 5)) score++;

    return score;
}

function findRecruitmentScenario(recruitment) {
    return allScenarios.find(s => String(s.id) === String(recruitment.scenario_id));
}

// 1. 初期データの読み込み（プレイヤーとシナリオ）
async function initData() {
    await Utils.initAuthAndHeader('common-nav', '../');
    try {
        [allPlayers, allScenarios] = await Promise.all([
            Utils.getPlayers(),
            Utils.apiGet("scenarios")
        ]);

        // ログイン中ユーザーに対応するプレイヤープロフィールを取得
        currentUserProfile = null;
        if (window.supabase) {
            try {
                const { data: { session } } = await window.supabase.auth.getSession();
                if (session) {
                    const myPlayer = allPlayers.find(p => p.user_id === session.user.id);
                    if (myPlayer) {
                        const profiles = await Utils.apiGet("player_profiles");
                        currentUserProfile = Array.isArray(profiles)
                            ? profiles.find(p => String(p.player_id) === String(myPlayer.player_id)) || null
                            : null;
                    }
                }
            } catch (err) {
                console.warn("傾向マッチング用プロフィールの取得に失敗:", err);
            }
        }

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

        // 厳密な型比較による不一致を防ぐためStringキャスト比較
        const scenario = findRecruitmentScenario(recruit);
        const scenarioTitle = scenario ? scenario.title : "未定";
        const coverPath = scenario ? Utils.getScenarioCoverPath(scenario.id, scenario.image_url) : Utils.DEFAULT_SCENARIO_COVER;
        const fallback = Utils.DEFAULT_SCENARIO_COVER;

        const applicantsForThis = allApplicants.filter(a => a.recruitment_id === recruit.id);
        const currentCount = applicantsForThis.length;
        const isFulfilled = recruit.status === "fulfilled" || currentCount >= recruit.target_count;

        // カードDOMの生成
        const card = document.createElement("div");
        card.className = `card recruit-card ${recruit.recruit_role === 'GM' ? 'gm-wanted' : ''}`;

        let matchBadgeHtml = "";
        const matchScore = calculateMatchScore(scenario, currentUserProfile);
        if (matchScore === 3) {
            card.classList.add("match-high");
            matchBadgeHtml = '<div class="match-badge match-3">相性抜群！ ★★★</div>';
        } else if (matchScore === 2) {
            card.classList.add("match-medium");
            matchBadgeHtml = '<div class="match-badge match-2">好相性！ ★★</div>';
        } else if (matchScore === 1) {
            card.classList.add("match-low");
            matchBadgeHtml = '<div class="match-badge match-1">相性良！ ★</div>';
        }
        
        // 参加者のチップ（名前タグ）を生成
        let applicantsHtml = applicantsForThis.map(a => {
            const p = allPlayers.find(pl => pl.player_id === a.player_id);
            return `<span class="applicant-chip">${Utils.escapeHtml(p ? p.player_name : "不明")}</span>`;
        }).join("");

        if (!applicantsHtml) applicantsHtml = "<span class='u-muted' style='font-size: 0.8rem;'>まだ応募はありません</span>";

        card.style.cursor = "pointer";
        card.onclick = () => {
            location.href = `./detail.html?id=${recruit.id}`;
        };

        // まだ参加していないプレイヤーの選択肢を作る
        const unjoinedPlayers = allPlayers.filter(p => 
            p.player_id !== recruit.owner_player_id && 
            !applicantsForThis.some(a => a.player_id === p.player_id)
        );

        const isOwner = true; // 本来はログインユーザーIDと比較: recruit.owner_player_id === currentUserId;

        const trendTagsHtml = scenario ? getTrendTagsHtml(scenario) : "";

        card.innerHTML = `
            ${matchBadgeHtml}
            <div class="recruit-header">
                <span class="recruit-role-badge">${recruit.recruit_role === 'GM' ? 'GM募集' : 'PL募集'}</span>
                <span class="recruit-progress" style="color: ${isFulfilled ? 'var(--success-color)' : 'inherit'}">
                    ${isFulfilled ? '満員御礼！' : `${currentCount} / ${recruit.target_count} 人`}
                </span>
            </div>
            <img class="scenario-detail-cover"
            src="${coverPath}"
            onerror="this.onerror=null; this.src='${fallback}';"
            alt="${Utils.escapeHtml(scenarioTitle)}"
            loading="lazy">
            <h3 style="margin: 0; font-size: 1.1rem;">${Utils.escapeHtml(scenarioTitle)}</h3>
            ${trendTagsHtml}
            <div style="font-size: 0.9rem; color: var(--text-muted); margin-top: 4px;">
                募集主: <strong>${Utils.escapeHtml(ownerName)}</strong>
            </div>
            ${recruit.memo ? `<div style="background: #f8fafc; padding: 12px; border-radius: 4px; font-size: 0.9rem; white-space: pre-wrap; border: 1px solid var(--border-color); margin-top: 8px;">${Utils.escapeHtml(recruit.memo)}</div>` : ''}
            
            <div style="margin-top: 8px;">
                <div style="font-size: 0.85rem; font-weight: bold; margin-bottom: 4px;">現在の参加者:</div>
                <div class="applicant-list">${applicantsHtml}</div>
            </div>
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
    document.getElementById("recruit-modal")?.showModal();
});

window.addEventListener("click", (e) => {
    if (e.target.tagName === "DIALOG" && e.target.classList.contains("modal")) {
        e.target.close();
    }
});

// 6. 募集フォーム of 送信
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
        document.getElementById("recruit-modal")?.close();
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