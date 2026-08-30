"use strict";

// 募集本体と応募者を詳細表示へ統合し、参加・取消・締切・抽選・募集削除の整合性を保つ。
(() => {

let currentRecruit = null;
let allPlayers = [];
let allScenarios = [];
let currentApplicants = [];
let currentUserPlayer = null;

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

        if (window.Comments && typeof window.Comments.mount === "function") {
            window.Comments.mount("comments-root", "recruitment", recruitId);
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

    const scenarioObj = allScenarios.find(s => String(s.id) === String(currentRecruit.scenario_id));
    const scenarioName = scenarioObj ? scenarioObj.title : "未定・オリジナル";

    const scenarioImage = scenarioObj
        ? Utils.getScenarioCoverPath(scenarioObj.id, scenarioObj.image_url)
        : Utils.DEFAULT_SCENARIO_COVER;
    const fallback = Utils.DEFAULT_SCENARIO_COVER;

    const isGMWanted = currentRecruit.recruit_role === "GM";
    const roleBadge = isGMWanted
        ? `<span class="recruit-role-badge" style="background:#fff5f5; color:#c53030; border: 1px solid #fc8181; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; font-weight: bold;">GM募集</span>`
        : `<span class="recruit-role-badge" style="background:#ebf8ff; color:#2b6cb0; border: 1px solid #90cdf4; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; font-weight: bold;">PL募集</span>`;

    let statusText = "募集中";
    if (currentRecruit.status === "fulfilled") statusText = "満員";
    if (currentRecruit.status === "closed") statusText = "締切";

    const capacityLabel = Utils.formatRecruitCapacity(currentRecruit);
    const modeLabel = Utils.recruitSelectionModeLabel(currentRecruit.selection_mode);
    const deadlineLabel = Utils.formatRecruitDeadline(currentRecruit.deadline);
    const deadlinePassed = Utils.isRecruitDeadlinePassed(currentRecruit);
    const canApply = currentRecruit.status === "open" && !deadlinePassed;
    const needsLottery = String(currentRecruit.selection_mode) === "lottery"
        && !currentRecruit.lottery_drawn_at
        && (currentRecruit.status === "closed" || deadlinePassed)
        && currentApplicants.length > Number(currentRecruit.target_count || 0);

    const trendTagsHtml = scenarioObj ? Utils.getTrendTagsHtml(scenarioObj) : "";

    const applicantTags = currentApplicants.map(app => {
        const pObj = allPlayers.find(p => p.player_id === app.player_id);
        const name = pObj ? pObj.player_name : app.player_id;
        let suffix = "";
        if (app.is_selected === true) suffix = "（当選）";
        if (app.is_selected === false) suffix = "（落選）";
        return `<span class="tag" style="display: inline-block; background: var(--bg-color); padding: 4px 10px; border-radius: 12px; margin: 4px; border: 1px solid var(--border-color);">${Utils.escapeHtml(name + suffix)}</span>`;
    }).join("");

    root.innerHTML = `
      <header class="scenario-detail-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h1 class="scenario-detail-title">${Utils.escapeHtml(scenarioName)}</h1>
        ${roleBadge}
      </header>

      <div class="detail-next-actions" aria-label="次の操作">
        <span class="detail-next-actions-label">次にやること</span>
        ${canApply
          ? `<button type="button" class="btn-primary" onclick="document.getElementById('btn-apply')?.click()">応募する</button>`
          : `<span class="u-muted">現在は応募を受け付けていません</span>`}
        <a class="btn-secondary" href="#recruit-manage">募集を管理</a>
      </div>

      <section class="scenario-detail-top">
        <div class="scenario-detail-imagewrap">
          <img class="scenario-detail-cover"
            src="${scenarioImage}"
            onerror="this.onerror=null; this.src='${fallback}';"
            alt="${Utils.escapeHtml(scenarioName)}"
            loading="lazy">
        </div>

        <div class="scenario-detail-info">
            <h2 class="scenario-detail-h2">募集情報</h2>
            <div class="scenario-info-meta">
                <div><strong>シナリオ</strong> ${scenarioObj ? `<a class="session-detail-link" href="../scenarios/detail.html?id=${encodeURIComponent(currentRecruit.scenario_id)}">${Utils.escapeHtml(scenarioName ?? currentRecruit.scenario_id)}</a>` : "（不明）"}</div>
                <div><strong>募集主:</strong> ${Utils.escapeHtml(ownerName)}</div>
                <div><strong>募集状態:</strong> ${Utils.escapeHtml(statusText)}</div>
                <div><strong>募集人数:</strong> ${Utils.escapeHtml(capacityLabel)} （現在の応募: ${currentApplicants.length}人）</div>
                <div><strong>方式:</strong> ${Utils.escapeHtml(modeLabel)}</div>
                <div><strong>応募締切:</strong> ${Utils.escapeHtml(deadlineLabel)}</div>
            </div>
            ${trendTagsHtml}
            <div class="scenario-base-info">
                <div><strong>自由記入欄:</strong><br>${Utils.renderMultilineText(currentRecruit.memo)}</div>
            </div>
        </div>
      </section>

      <section class="scenario-detail-section">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid var(--border-color, #eee); padding-bottom: 8px; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
            <h2 class="scenario-detail-h2" style="margin: 0; border: none; padding: 0;">現在の応募者</h2>

            <div class="input-group" style="display: flex; gap: 8px; align-items: center; margin: 0;">
                <span id="action-player-label" class="u-muted" style="font-size: 0.9em;"></span>
                <button type="button" id="btn-apply" class="btn-primary btn-join" style="padding: 6px 12px; font-size: 0.95em;">応募する</button>
                <button type="button" id="btn-cancel-apply" class="btn-cancel" style="padding: 6px 12px; font-size: 0.95em;">取り消す</button>
            </div>
        </div>

        <div class="scenario-detail-characters">
            ${applicantTags || '<p class="scenario-detail-muted"><small>まだ応募はありません</small></p>'}
        </div>
      </section>

        <section id="recruit-manage" class="scenario-detail-section" style="margin-top: 30px;">
        <fieldset class="form-section" style="border: 1px solid #fc8181; background: #fff5f5; padding: 15px;">
            <legend style="color: #c53030; font-weight: bold;">募集の管理（募集主用）</legend>
            <p style="font-size: 0.9em; margin-bottom: 10px; color: #666;">
                ※応募締切を過ぎると自動で締め切ります（削除はしません）。<br>
                ※抽選募集は締切後、応募が上限を超えている場合に抽選できます。<br>
                ※募集を完全に中止・削除する場合は「削除する」を押してください。
            </p>
            <div style="display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 12px;">
                <button type="button" id="btn-close-recruit" class="btn-secondary" style="padding: 6px 12px; font-size: 0.95em;">募集を締め切る</button>
                <button type="button" id="btn-draw-lottery" class="btn-primary" style="padding: 6px 12px; font-size: 0.95em;" ${needsLottery ? "" : "disabled"}>抽選する</button>
                <button type="button" id="btn-extend-recruit" class="btn-primary btn-join" style="padding: 6px 12px; font-size: 0.95em;">締切を延長する</button>
                <button type="button" id="btn-delete-recruit" class="btn-cancel" style="padding: 6px 12px; font-size: 0.95em;">この募集を削除する</button>
            </div>
            <div class="form-group" style="margin: 0; max-width: 320px;">
                <label for="extend-deadline">延長後の締切</label>
                <input type="datetime-local" id="extend-deadline" class="form-control">
            </div>
        </fieldset>
      </section>
    `;
}

async function setupActionForms() {
    const { session, player: me } = await Utils.getCurrentUserPlayerContext({
      players: allPlayers,
      loadProfile: false
    });
    currentUserPlayer = me || null;
    const label = document.getElementById("action-player-label");
    const applyBtn = document.getElementById("btn-apply");
    const cancelBtn = document.getElementById("btn-cancel-apply");
    const deadlinePassed = Utils.isRecruitDeadlinePassed(currentRecruit);
    const canApply = currentRecruit.status === "open" && !deadlinePassed;

    if (!session) {
      if (label) label.textContent = "応募にはDiscordログインが必要です";
      if (applyBtn) applyBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
    } else if (!me) {
      if (label) label.textContent = "プレイヤー名簿との連携がありません（discord_id未登録の可能性）";
      if (applyBtn) applyBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
    } else if (label) {
      label.textContent = `応募者: ${me.player_name}`;
    }
    if (applyBtn && !canApply) applyBtn.disabled = true;

    const extendInput = document.getElementById("extend-deadline");
    if (extendInput) {
        const base = currentRecruit.deadline ? new Date(currentRecruit.deadline) : new Date();
        const next = new Date(Math.max(base.getTime(), Date.now()) + 7 * 24 * 60 * 60 * 1000);
        extendInput.value = new Date(next.getTime() - next.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }

    document.getElementById("btn-apply")?.addEventListener("click", async () => {
        if (!me?.player_id) {
          Utils.showToast("ログイン中のプレイヤーを解決できません。", "error");
          return;
        }
        if (!canApply) {
          Utils.showToast("この募集は現在受け付けていません。", "error");
          return;
        }
        if (currentApplicants.some(a => a.player_id === me.player_id)) {
          Utils.showToast("すでにこの募集に応募しています。", "error");
          return;
        }

        const btn = document.getElementById("btn-apply");
        btn.disabled = true;

        try {
            await Utils.apiPost("recruitment_applicants", [{
                recruitment_id: currentRecruit.id
            }]);
            Utils.showToast("応募しました！", "success");
            location.reload();
        } catch (err) {
            console.error(err);
            Utils.showToast("応募に失敗しました: " + (err.message || "特設サイト関連に報告してください。"), "error");
            btn.disabled = false;
        }
    });

    document.getElementById("btn-cancel-apply")?.addEventListener("click", async () => {
        if (!me?.player_id) {
          Utils.showToast("ログイン中のプレイヤーを解決できません。", "error");
          return;
        }
        if (!currentApplicants.some(a => a.player_id === me.player_id)) {
          Utils.showToast("この募集には応募していません。", "info");
          return;
        }
        if (!confirm("本当に参加を取り消しますか？")) return;

        const btn = document.getElementById("btn-cancel-apply");
        btn.disabled = true;

        try {
            await Utils.apiDelete(
              "recruitment_applicants",
              `recruitment_id=eq.${currentRecruit.id}&player_id=eq.${encodeURIComponent(me.player_id)}`
            );
            Utils.showToast("参加を取り消しました。", "success");
            location.reload();
        } catch (err) {
            console.error(err);
            Utils.showToast("取り消しに失敗しました: " + (err.message || "特設サイト関連に報告してください。"), "error");
            btn.disabled = false;
        }
    });

    // 募集の削除ボタン
    document.getElementById("btn-delete-recruit")?.addEventListener("click", async () => {
        if (!confirm("本当にこの募集を削除（中止）しますか？")) return;

        const btn = document.getElementById("btn-delete-recruit");
        btn.disabled = true;

        try {
            await Utils.apiDelete("recruitments", `id=eq.${currentRecruit.id}`);
            Utils.showToast("募集を削除しました。", "success");
            location.href = "./index.html";
        } catch (err) {
            console.error(err);
            Utils.showToast("削除に失敗しました。特設サイト関連に報告してください。", "error");
            btn.disabled = false;
        }
    });

    document.getElementById("btn-close-recruit")?.addEventListener("click", async () => {
        if (!confirm("この募集を締め切りますか？")) return;
        try {
            await Utils.apiPatch("recruitments", { status: "closed" }, `id=eq.${currentRecruit.id}`);
            Utils.showToast("募集を締め切りました。", "success");
            location.reload();
        } catch (err) {
            console.error(err);
            Utils.showToast("締め切りに失敗しました: " + err.message, "error");
        }
    });

    document.getElementById("btn-draw-lottery")?.addEventListener("click", async () => {
        if (!confirm("抽選を実行します。よろしいですか？")) return;
        const btn = document.getElementById("btn-draw-lottery");
        btn.disabled = true;
        try {
            await Utils.apiPost("recruitments/draw", { recruitment_id: currentRecruit.id });
            Utils.showToast("抽選が完了しました。", "success");
            location.reload();
        } catch (err) {
            console.error(err);
            Utils.showToast("抽選に失敗しました: " + err.message, "error");
            btn.disabled = false;
        }
    });

    // 募集の延長ボタン
    document.getElementById("btn-extend-recruit")?.addEventListener("click", async () => {
        const local = document.getElementById("extend-deadline")?.value;
        if (!local) {
            Utils.showToast("延長後の締切を指定してください", "error");
            return;
        }
        const iso = new Date(local).toISOString();
        if (new Date(iso).getTime() <= Date.now()) {
            Utils.showToast("締切は未来の日時にしてください", "error");
            return;
        }
        if (!confirm("応募締切を延長しますか？")) return;

        const btn = document.getElementById("btn-extend-recruit");
        btn.disabled = true;

        try {
            const patch = { deadline: iso };
            if (currentRecruit.status === "closed" && !currentRecruit.lottery_drawn_at) {
                patch.status = "open";
            }
            await Utils.apiPatch("recruitments", patch, `id=eq.${currentRecruit.id}`);
            Utils.showToast("締切を延長しました！", "success");
            location.reload();
        } catch (err) {
            console.error(err);
            Utils.showToast("延長に失敗しました。", "error");
            btn.disabled = false;
        }
    });
}

Utils.domReady(main);
})();
