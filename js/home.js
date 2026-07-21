// ホーム画面をゲスト向け概要とログイン利用者向け予定ダッシュボードへ切り替えて描画する。
"use strict";

(() => {

const homeDashboardState = {
  playerId: null,
  currentDate: new Date(),
  sessions: [],
  runs: [],
  availabilities: []
};
const availabilityRequestToken = Utils.createLatestRequestToken();

function toValidDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 開催レコードだけでは名称を持たないため、卓・シナリオの参照表と結合して直近予定を表示する。
 * 不正な日時を除外してから最短を選び、壊れた1件でダッシュボード全体が止まらないようにする。
 */
function renderNextSession(container, sessions, runsById, scenariosById) {
  const now = new Date();

  const upcoming = (Array.isArray(sessions) ? sessions : [])
    .filter(s => s && s.status === "scheduled")
    .map(s => ({ ...s, _start: toValidDate(s.start) }))
    .filter(s => s._start && s._start > now)
    .sort((a, b) => a._start - b._start);

  if (upcoming.length === 0) {
    container.innerHTML = `<p>直近の予定はありません</p>`;
    return;
  }

  const ses = upcoming[0];
  const runs = runsById.get(String(ses.run_id));
  const scenario = runs ? scenariosById.get(String(runs.scenario_id)) : null;

  const dateStr = ses._start.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const timeStr = ses._start.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const duration = (typeof ses.durationHours === "number" && ses.durationHours > 0)
    ? `${ses.durationHours}h`
    : "";

  const scenarioTitle = Utils.escapeHtml(scenario?.title || "（シナリオ未設定）");
  const runTitle = Utils.escapeHtml(runs?.title || runs?.id || "（卓未設定）");
  const sessionTitle = Utils.escapeHtml(ses.title || "");


  // 詳細連携はしない方針なので、リンクは貼らず表示だけ
  container.innerHTML = `

    <p><strong>${dateStr} ${timeStr}</strong> ${duration ? `(${duration})` : ""}</p>
    <ul><li><p>${runTitle} ${sessionTitle}</p>
      <small>シナリオ: ${scenarioTitle}</small>
    </li></ul>
  `;
}

/**
 * Ongoing Scenarios
 * - runs.json の status==="active" を「進行中」とみなす
 */
function renderOngoing(container, runs, scenariosById, sessionsByRunId, playersById) {
  const now = new Date();

  const activeRuns = (Array.isArray(runs) ? runs : [])
    .filter(r => r && r.status !== "done");

  if (activeRuns.length === 0) {
    container.innerHTML = `<p>進行中のシナリオはありません</p>`;
    return;
  }

  // 表示は最大5件
  const list = activeRuns.slice(0, 5).map(r => {

    const scenario = scenariosById.get(String(r.scenario_id));

    const scenarioTitle = Utils.escapeHtml(scenario?.title || r.scenario_id || "（不明）");
    const runTitle = Utils.escapeHtml(r.title || r.id || "（卓）");

    let playersText = "";
    if (r.player_ids && Array.isArray(r.player_ids) && r.player_ids.length > 0) {
        playersText = r.player_ids.map(id => {
            const p = playersById?.get(String(id));
            return p ? p.player_name : id;
        }).map(Utils.escapeHtml).join(" / ");
    }

    // このrunに紐づくsession一覧から「次回」を取る
    const runSessions = sessionsByRunId?.get(String(r.id)) ?? [];
    const next = runSessions
      .filter(s => s && s.status === "scheduled")
      .map(s => ({ ...s, _start: toValidDate(s.start) }))
      .filter(s => s._start && s._start > now)
      .sort((a, b) => a._start - b._start)[0];

    let nextText = "未定";
    if (next && next._start) {
      const d = next._start;
      const dateStr = d.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
      });
      const timeStr = d.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      });
      nextText = `${dateStr} ${timeStr}`;
    }

    // 進行中シナリオ欄だけど、同一シナリオ複数卓を区別するため卓名も出す
    return `<li>
        <strong>${runTitle}</strong>
        <div><small>シナリオ: ${scenarioTitle}</small></div>
        <div><small>プレイヤー: ${playersText}</small></div>
        <div><small>次回予定: ${Utils.escapeHtml(nextText)}</small></div>
      </li>`;
  }).join("");

  container.innerHTML = `<ul>${list}</ul>`;
}

function runIncludesPlayer(run, playerId) {
  if (String(run?.gm_id) === String(playerId)) return true;
  if (Array.isArray(run?.player_ids)) {
    return run.player_ids.some(id => String(id) === String(playerId));
  }
  if (typeof run?.player_ids === "string") {
    try {
      const parsed = JSON.parse(run.player_ids);
      if (Array.isArray(parsed)) {
        return parsed.some(id => String(id) === String(playerId));
      }
    } catch {
      // JSONでない旧形式は部分一致で判定する
    }
    return run.player_ids.includes(String(playerId));
  }
  return false;
}

function renderMyRecruitments(container, recruitments, applicants, scenariosById) {
  const statusLabels = {
    open: "募集中",
    fulfilled: "満員",
    closed: "終了"
  };
  const myRecruitments = (Array.isArray(recruitments) ? recruitments : [])
    .filter(item => String(item.owner_player_id) === String(homeDashboardState.playerId));

  if (myRecruitments.length === 0) {
    container.innerHTML = '<p class="u-muted">自分が立てた募集はありません。</p>';
    return;
  }

  container.innerHTML = `<ul class="dashboard-recruitment-list">${myRecruitments.map(recruitment => {
    const scenario = scenariosById.get(String(recruitment.scenario_id));
    const legacyCount = (Array.isArray(applicants) ? applicants : [])
      .filter(item => String(item.recruitment_id) === String(recruitment.id)).length;
    const currentCount = Number.isFinite(Number(recruitment.applicant_count))
      ? Number(recruitment.applicant_count)
      : legacyCount;
    const status = statusLabels[recruitment.status] || recruitment.status || "不明";
    const title = Utils.escapeHtml(recruitment.scenario_title || scenario?.title || "シナリオ未定");
    return `
      <li>
        <a href="./recruit/detail.html?id=${encodeURIComponent(recruitment.id)}">${title}</a>
        <span class="dashboard-status dashboard-status--${Utils.escapeHtml(recruitment.status || "unknown")}">${Utils.escapeHtml(status)}</span>
        <small>${currentCount} / ${Number(recruitment.target_count) || 0}人</small>
      </li>
    `;
  }).join("")}</ul>`;
}

function isDefaultDesireProfile(profile) {
  if (!profile) return true;
  const keys = [
    "desire_avatar", "desire_active", "desire_chaos",
    "desire_story", "desire_harmony", "desire_clear"
  ];
  return keys.every(key => {
    const raw = profile[key];
    const value = raw == null ? 3 : Number(raw);
    return !Number.isFinite(value) || value === 3;
  });
}

/**
 * おすすめ対象から外すシナリオID（PL通過済 / GM経験 / 部活外履歴のID）。
 */
function collectExperiencedScenarioIds(playerId, runs, profile) {
  const excluded = new Set();
  const pid = String(playerId || "");

  for (const run of (Array.isArray(runs) ? runs : [])) {
    if (!run?.scenario_id) continue;
    const sid = String(run.scenario_id);
    if (String(run.gm_id) === pid) {
      excluded.add(sid);
      continue;
    }
    if (String(run.status || "").toLowerCase() !== "done") continue;
    let isPl = false;
    if (Array.isArray(run.player_ids)) {
      isPl = run.player_ids.some(id => String(id) === pid);
    } else if (typeof run.player_ids === "string") {
      isPl = run.player_ids.includes(pid);
    }
    if (isPl) excluded.add(sid);
  }

  let external = profile?.external_passed_scenarios;
  if (typeof external === "string") {
    try {
      external = JSON.parse(external);
    } catch {
      external = [];
    }
  }
  if (Array.isArray(external)) {
    for (const item of external) {
      if (!item || typeof item !== "object") continue;
      if (item.id) excluded.add(String(item.id));
      const title = String(item.title || "").trim().toLowerCase();
      if (title) excluded.add(`title:${title}`);
    }
  }

  return excluded;
}

/**
 * 欲求4以上の軸とシナリオ傾向の一致数でおすすめを並べる。
 * 通過済・GM経験・部活外は除外する。
 */
function renderStyleMatches(container, profile, scenarios, openRecruitments, runs, playerId) {
  if (!container) return;

  if (isDefaultDesireProfile(profile)) {
    container.innerHTML =
      '<p class="u-muted">プレイスタイル傾向が未設定です。' +
      '<a href="./player/detail.html?id=' +
      encodeURIComponent(homeDashboardState.playerId || "") +
      '">プロフィール</a>で欲求を調整すると、ここに相性の良いシナリオが出ます。</p>';
    return;
  }

  const excluded = collectExperiencedScenarioIds(playerId, runs, profile);

  const recruitingByScenario = new Map();
  for (const recruitment of (Array.isArray(openRecruitments) ? openRecruitments : [])) {
    if (!recruitment?.scenario_id) continue;
    const status = String(recruitment.status || "").toLowerCase();
    if (status && status !== "open" && status !== "recruiting") continue;
    const sid = String(recruitment.scenario_id);
    if (!recruitingByScenario.has(sid)) recruitingByScenario.set(sid, []);
    recruitingByScenario.get(sid).push(recruitment);
  }

  const ranked = (Array.isArray(scenarios) ? scenarios : [])
    .filter(s => s && s.id)
    .filter(s => {
      const sid = String(s.id);
      if (excluded.has(sid)) return false;
      const titleKey = `title:${String(s.title || "").trim().toLowerCase()}`;
      if (titleKey !== "title:" && excluded.has(titleKey)) return false;
      return true;
    })
    .map(scenario => ({
      scenario,
      score: Utils.calculateMatchScore(scenario, profile)
    }))
    .filter(item => item.score >= 1)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aRecruit = recruitingByScenario.has(String(a.scenario.id)) ? 1 : 0;
      const bRecruit = recruitingByScenario.has(String(b.scenario.id)) ? 1 : 0;
      if (bRecruit !== aRecruit) return bRecruit - aRecruit;
      return String(a.scenario.title || "").localeCompare(String(b.scenario.title || ""), "ja");
    })
    .slice(0, 5);

  if (ranked.length === 0) {
    container.innerHTML = '<p class="u-muted">いま一致する未経験のシナリオはありません。</p>';
    return;
  }

  container.innerHTML = `<ul class="dashboard-match-list">${ranked.map(({ scenario, score }) => {
    const presentation = Utils.getMatchPresentation(Math.min(score, 3));
    const sid = String(scenario.id);
    const recruits = recruitingByScenario.get(sid) || [];
    const recruitLink = recruits[0]
      ? `<a class="dashboard-match-recruit" href="./recruit/detail.html?id=${encodeURIComponent(recruits[0].id)}">募集中</a>`
      : "";
    const cover = Utils.getScenarioCoverPath(scenario.id, scenario.image_url);
    const title = Utils.escapeHtml(scenario.title || scenario.id);
    const trends = Utils.getTrendTagsHtml(scenario) || "";
    return `
      <li class="dashboard-match-item ${Utils.escapeHtml(presentation.cardClass || "")}">
        <a class="dashboard-match-main" href="./scenarios/detail.html?id=${encodeURIComponent(sid)}">
          <img src="${Utils.escapeHtml(cover)}" alt="" loading="lazy"
               onerror="this.onerror=null;this.src='${Utils.DEFAULT_SCENARIO_COVER}';">
          <span class="dashboard-match-body">
            <span class="dashboard-match-title">${title}</span>
            ${trends}
          </span>
        </a>
        <span class="dashboard-match-meta">
          ${presentation.badgeHtml || ""}
          ${recruitLink}
        </span>
      </li>
    `;
  }).join("")}</ul>`;
}

async function refreshHomeAvailability() {
  if (!homeDashboardState.playerId) return false;
  const year = homeDashboardState.currentDate.getFullYear();
  const month = homeDashboardState.currentDate.getMonth();
  const token = availabilityRequestToken.issue();
  const rows = await Utils.fetchPlayerAvailabilities(homeDashboardState.playerId, year, month);
  if (!availabilityRequestToken.isLatest(token)) return false;
  homeDashboardState.availabilities = rows;
  renderHomeCalendar();
  return true;
}

function renderHomeCalendar() {
  const calendarEl = document.getElementById("home-calendar-grid");
  const monthEl = document.getElementById("home-calendar-month");
  if (!calendarEl || !homeDashboardState.playerId) return;

  const year = homeDashboardState.currentDate.getFullYear();
  const month = homeDashboardState.currentDate.getMonth();
  if (monthEl) monthEl.textContent = `${year}年 ${month + 1}月`;

  Utils.renderCalendar(calendarEl, year, month, {
    events: homeDashboardState.sessions,
    availabilities: homeDashboardState.availabilities,
    compact: true,
    highlightMissingAvailability: true,
    getEventTitle: session => {
      const run = homeDashboardState.runs.find(item => String(item.id) === String(session.run_id));
      return run?.title || session.title || "名称未設定";
    },
    getEventHref: session => `./sessions/detail.html?id=${encodeURIComponent(session.run_id || session.id)}`,
    onDateClick: dateStr => openHomeAvailabilityModal(dateStr)
  });
}

async function openHomeAvailabilityModal(selectedDate) {
  const modal = document.getElementById("home-availability-modal");
  const container = document.getElementById("home-bulk-input-container");
  const monthLabel = document.getElementById("home-bulk-month-label");
  if (!modal || !container || !homeDashboardState.playerId) return;

  const year = homeDashboardState.currentDate.getFullYear();
  const month = homeDashboardState.currentDate.getMonth();
  if (monthLabel) monthLabel.textContent = `${year}年 ${month + 1}月`;

  try {
    const monthlyData = await Utils.fetchPlayerAvailabilities(homeDashboardState.playerId, year, month);
    Utils.renderAvailabilityGrid(container, year, month, monthlyData);
    modal.showModal();

    requestAnimationFrame(() => {
      const selectedToggle = container.querySelector(`[data-date="${selectedDate}"]`);
      selectedToggle?.closest(".bulk-row")?.scrollIntoView({ block: "center" });
    });
  } catch (err) {
    console.error("予定入力データの取得に失敗しました:", err);
    Utils.showToast("予定データの取得に失敗しました。", "error");
  }
}

async function saveHomeAvailability() {
  const modal = document.getElementById("home-availability-modal");
  const container = document.getElementById("home-bulk-input-container");
  const saveButton = document.getElementById("home-save-availability-btn");
  const payload = Utils.collectAvailabilityChanges(container, homeDashboardState.playerId);

  if (payload.length === 0) {
    Utils.showToast("変更された予定データがありません。", "info");
    modal?.close();
    return;
  }

  try {
    if (saveButton) saveButton.disabled = true;
    await Utils.apiPost("player_availability", payload);
    await refreshHomeAvailability();
    modal?.close();
    Utils.showToast("予定を保存しました。", "success");
  } catch (err) {
    console.error("予定の保存に失敗しました:", err);
    Utils.showToast("予定の保存に失敗しました: " + err.message, "error");
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

function setupDashboardEvents() {
  document.getElementById("home-login-btn")?.addEventListener("click", Utils.loginWithDiscord);
  document.getElementById("home-prev-month-btn")?.addEventListener("click", async () => {
    homeDashboardState.currentDate.setDate(1);
    homeDashboardState.currentDate.setMonth(homeDashboardState.currentDate.getMonth() - 1);
    await refreshHomeAvailability().catch(err => console.error("予定の取得に失敗しました:", err));
  });
  document.getElementById("home-next-month-btn")?.addEventListener("click", async () => {
    homeDashboardState.currentDate.setDate(1);
    homeDashboardState.currentDate.setMonth(homeDashboardState.currentDate.getMonth() + 1);
    await refreshHomeAvailability().catch(err => console.error("予定の取得に失敗しました:", err));
  });
  document.getElementById("home-save-availability-btn")?.addEventListener("click", saveHomeAvailability);
  document.getElementById("home-close-availability-btn")?.addEventListener("click", () => {
    document.getElementById("home-availability-modal")?.close();
  });

  document.getElementById("player-link-copy-id-btn")?.addEventListener("click", async () => {
    const input = document.getElementById("player-link-discord-id-value");
    const value = (input?.value || "").trim();
    if (!value) {
      Utils.showToast("コピーできる Discord ID がありません", "error");
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        input.hidden = false;
        input.select();
        document.execCommand("copy");
      }
      Utils.showToast("Discord IDをコピーしました", "success");
    } catch (err) {
      console.error(err);
      if (input) {
        input.hidden = false;
        input.focus();
        input.select();
      }
      Utils.showToast("自動コピーに失敗しました。表示中のIDを手動で選択してください", "error");
    }
  });

  document.getElementById("player-link-claim-btn")?.addEventListener("click", async () => {
    const select = document.getElementById("player-link-select");
    const playerId = select?.value || "";
    if (!playerId) {
      Utils.showToast("自分のプレイヤー名を選択してください", "error");
      return;
    }
    const btn = document.getElementById("player-link-claim-btn");
    if (btn) btn.disabled = true;
    try {
      await Utils.apiPost("me/link", { player_id: playerId });
      Utils.showToast("プレイヤーと連携しました", "success");
      location.reload();
    } catch (err) {
      console.error(err);
      Utils.showToast("連携に失敗しました: " + (err.message || err), "error");
      if (btn) btn.disabled = false;
    }
  });
}

function populatePlayerLinkClaimSelect(players, meDiscordId) {
  const select = document.getElementById("player-link-select");
  if (!select) return;
  const list = Array.isArray(players) ? players : [];
  const claimable = list
    .filter(p => {
      const userId = p.user_id ? String(p.user_id) : "";
      if (userId) return false;
      const discordId = p.discord_id ? String(p.discord_id).trim() : "";
      if (discordId && meDiscordId && discordId !== String(meDiscordId)) return false;
      return true;
    })
    .sort((a, b) => String(a.player_name || "").localeCompare(String(b.player_name || ""), "ja"));

  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = claimable.length > 0
    ? "-- 自分の名前を選択 --"
    : "-- 連携できる名簿がありません --";
  select.appendChild(placeholder);

  for (const p of claimable) {
    const opt = document.createElement("option");
    opt.value = p.player_id;
    const hasDiscord = p.discord_id ? String(p.discord_id).trim() : "";
    opt.textContent = hasDiscord
      ? `${p.player_name || p.player_id}`
      : `${p.player_name || p.player_id}（Discord未登録）`;
    select.appendChild(opt);
  }
}

async function main() {
  const nextEl = document.getElementById("next-session");
  const ongoingEl = document.getElementById("ongoing-scenarios");
  const guestDashboard = document.getElementById("guest-dashboard");
  const memberDashboard = document.getElementById("member-dashboard");
  if (!nextEl || !ongoingEl || !guestDashboard || !memberDashboard) return;

  const session = await Utils.initAuthAndHeader('common-nav', './');
  setupDashboardEvents();

  nextEl.textContent = "";
  ongoingEl.textContent = "";

  try {
    // ホームは専用巨大JSONではなく、一覧用の列限定APIを並列取得して画面側で組み立てる。
    let playersLoadError = false;
    const [scenarios, runs, sessions, players] = await Promise.all([
      Utils.apiGet("scenarios"),
      Utils.apiGet("runs"),
      Utils.apiGet("sessions"),
      Utils.apiGet("players?select=player_id,player_name,user_id,discord_id", "", { omitAuth: true }).catch((err) => {
        console.warn("players 取得に失敗:", err);
        playersLoadError = true;
        return [];
      }),
    ]);

    const playersById = new Map(
      (Array.isArray(players) ? players : []).map(p => [String(p.player_id), p])
    );

    const scenariosById = new Map(
      (Array.isArray(scenarios) ? scenarios : [])
        .filter(s => s && s.id)
        .map(s => [String(s.id), s])
    );

    const runsById = new Map(
      (Array.isArray(runs) ? runs : [])
        .filter(r => r && r.id)
        .map(r => [String(r.id), r])
    );

    const sessionsByRunId = new Map();
    for (const s of (Array.isArray(sessions) ? sessions : [])) {
      if (!s || !s.run_id) continue;
      const runId = String(s.run_id);
      if (!sessionsByRunId.has(runId)) sessionsByRunId.set(runId, []);
      sessionsByRunId.get(runId).push(s);
    }

    // 本人解決は Worker /api/me（Auth API + Discord 自動連携 + 候補名簿）を正とする。
    let myPlayer = null;
    let meDiscordId = null;
    let claimablePlayers = [];
    let authUserForMatch = session?.user || null;
    if (session && window.supabase?.auth?.getUser) {
      try {
        const { data } = await window.supabase.auth.getUser();
        if (data?.user) authUserForMatch = data.user;
      } catch (err) {
        console.warn("auth.getUser に失敗:", err);
      }
    }
    if (session) {
      try {
        const me = await Utils.apiGet("me");
        meDiscordId = me?.discord_id || null;
        claimablePlayers = Array.isArray(me?.claimable_players) ? me.claimable_players : [];
        if (me?.player?.player_id) {
          myPlayer = me.player;
        }
      } catch (err) {
        console.warn("/api/me の取得に失敗したため名簿照合へフォールバック:", err);
      }
      if (!myPlayer) {
        myPlayer = Utils.findPlayerForAuthUser(Array.isArray(players) ? players : [], authUserForMatch);
      }
      if (!meDiscordId) {
        meDiscordId = Utils.extractDiscordIdFromUser(authUserForMatch);
      }
      if (claimablePlayers.length === 0) {
        claimablePlayers = (Array.isArray(players) ? players : []).filter(p => !p.user_id);
      }
    }

    const linkBanner = document.getElementById("player-link-banner");
    const linkBannerId = document.getElementById("player-link-banner-id");
    const copyIdBtn = document.getElementById("player-link-copy-id-btn");
    const discordIdInput = document.getElementById("player-link-discord-id-value");
    if (linkBanner) {
      const needsLink = Boolean(session && !myPlayer);
      linkBanner.hidden = !needsLink;
      if (needsLink) {
        populatePlayerLinkClaimSelect(claimablePlayers, meDiscordId);
        const discordId = meDiscordId || "";
        if (discordIdInput) {
          discordIdInput.value = discordId;
          // IDが取れないときも欄を出して状況が分かるようにする
          discordIdInput.hidden = false;
          discordIdInput.placeholder = discordId ? "" : "Discord ID を取得できませんでした";
        }
        if (linkBannerId) {
          linkBannerId.hidden = false;
          linkBannerId.textContent = discordId
            ? `検出された Discord ID: ${discordId}`
            : "Discord ID を取得できませんでした。API再デプロイ後に、一度ログアウト→Discord再ログインを試してください。";
        }
        if (copyIdBtn) {
          copyIdBtn.hidden = false;
          copyIdBtn.disabled = !discordId;
        }
      }
    }

    if (!session || !myPlayer) {
      guestDashboard.hidden = false;
      memberDashboard.hidden = true;
      renderNextSession(nextEl, sessions, runsById, scenariosById);
      renderOngoing(ongoingEl, runs, scenariosById, sessionsByRunId, playersById);

      const titleEl = document.getElementById("guest-dashboard-title");
      const leadEl = document.getElementById("guest-dashboard-lead");
      const helpEl = document.getElementById("guest-dashboard-help");
      const loginButton = document.getElementById("home-login-btn");

      if (session && !myPlayer) {
        if (titleEl) titleEl.textContent = "プレイヤー連携が必要です";
        if (leadEl) {
          leadEl.textContent = playersLoadError
            ? "プレイヤー名簿の取得に失敗したため、個人ダッシュボードを表示できません。"
            : "Discordログインは成功していますが、部のプレイヤー名簿（players）にまだ紐づいていません。";
        }
        if (helpEl) {
          helpEl.hidden = false;
          helpEl.innerHTML = playersLoadError
            ? "時間をおいて再読み込みするか、管理者に報告してください。"
            : ("上部の案内で<strong>自分の名前を選んで「この名前で連携する」</strong>を押してください。" +
              (meDiscordId ? ` （検出 Discord ID: <code>${Utils.escapeHtml(meDiscordId)}</code>）` : "") +
              "名簿に自分の名前が無い場合は管理者に追加を依頼してください。");
        }
        if (loginButton) loginButton.hidden = true;
      } else {
        if (titleEl) titleEl.textContent = "TRPG部の活動状況";
        if (leadEl) {
          leadEl.textContent =
            "Discordでログインすると、自分の次回予定・募集状況・予定入力カレンダーを確認できます。";
        }
        if (helpEl) {
          helpEl.hidden = true;
          helpEl.textContent = "";
        }
        if (loginButton) loginButton.hidden = false;
      }
      return;
    }

    guestDashboard.hidden = true;
    memberDashboard.hidden = false;
    homeDashboardState.playerId = myPlayer.player_id;

    const myRuns = (Array.isArray(runs) ? runs : []).filter(run => runIncludesPlayer(run, myPlayer.player_id));
    const myRunIds = new Set(myRuns.map(run => String(run.id)));
    const mySessions = (Array.isArray(sessions) ? sessions : [])
      .filter(item => myRunIds.has(String(item.run_id)));

    const recruitments = await Utils.apiGetWithFallback(
      `recruitment_list?owner_player_id=eq.${encodeURIComponent(myPlayer.player_id)}&order=created_at.desc`,
      async () => {
        const [legacyRecruitments, applicants] = await Promise.all([
          Utils.apiGet(`recruitments?owner_player_id=eq.${encodeURIComponent(myPlayer.player_id)}&order=created_at.desc`),
          Utils.apiGet("recruitment_applicants?select=recruitment_id,player_id")
        ]);
        return (Array.isArray(legacyRecruitments) ? legacyRecruitments : []).map(recruitment => ({
          ...recruitment,
          applicant_count: (Array.isArray(applicants) ? applicants : [])
            .filter(item => String(item.recruitment_id) === String(recruitment.id)).length,
          scenario_title: scenariosById.get(String(recruitment.scenario_id))?.title
        }));
      }
    );

    homeDashboardState.runs = myRuns;
    homeDashboardState.sessions = mySessions;

    const clubNextEl = document.getElementById("club-next-session");
    const clubOngoingEl = document.getElementById("club-ongoing-scenarios");

    document.getElementById("dashboard-player-name").textContent = `${myPlayer.player_name} のダッシュボード`;
    renderNextSession(document.getElementById("my-next-session"), mySessions, runsById, scenariosById);
    renderMyRecruitments(
      document.getElementById("my-recruitments"),
      recruitments,
      [],
      scenariosById
    );

    let profile = null;
    try {
      const profiles = await Utils.apiGet(
        `player_profiles?player_id=eq.${encodeURIComponent(myPlayer.player_id)}&select=*`
      );
      profile = Array.isArray(profiles) && profiles[0] ? profiles[0] : null;
    } catch (err) {
      console.warn("プロフィール取得に失敗:", err);
    }

    let openRecruitments = [];
    try {
      openRecruitments = await Utils.apiGetWithFallback(
        "recruitment_list?status=eq.open&order=created_at.desc",
        () => Utils.apiGet("recruitments?status=eq.open&order=created_at.desc").catch(() => [])
      );
    } catch (_) {
      openRecruitments = [];
    }

    renderStyleMatches(
      document.getElementById("my-style-matches"),
      profile,
      scenarios,
      openRecruitments,
      runs,
      myPlayer.player_id
    );

    // 部全体の直近・進行中もログイン後に表示（観戦・状況把握用）
    if (clubNextEl) renderNextSession(clubNextEl, sessions, runsById, scenariosById);
    if (clubOngoingEl) renderOngoing(clubOngoingEl, runs, scenariosById, sessionsByRunId, playersById);
    await refreshHomeAvailability();

  } catch (err) {
    const msg = Utils.escapeHtml(err?.message || "読み込みエラー");
    nextEl.innerHTML = `<p>直近の予定の読み込みに失敗しました：${msg}</p>`;
    ongoingEl.innerHTML = `<p>進行中情報の読み込みに失敗しました：${msg}</p>`;
    const clubNextEl = document.getElementById("club-next-session");
    const clubOngoingEl = document.getElementById("club-ongoing-scenarios");
    if (clubNextEl) clubNextEl.innerHTML = `<p>直近の予定の読み込みに失敗しました：${msg}</p>`;
    if (clubOngoingEl) clubOngoingEl.innerHTML = `<p>進行中情報の読み込みに失敗しました：${msg}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", main);

})();
