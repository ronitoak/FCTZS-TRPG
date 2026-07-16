// /js/home.js
"use strict";

const homeDashboardState = {
  playerId: null,
  currentDate: new Date(),
  sessions: [],
  runs: [],
  availabilities: []
};

function toValidDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Next Session
 * - sessions.json から status==="scheduled" かつ未来のうち最短1件
 * - run_id -> runs 参照（卓名）
 * - scenario_id -> scenarios 参照（シナリオ名）
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
    } else {
        const players = Array.isArray(r.players) ? r.players : [];
        playersText = players.length ? players.map(Utils.escapeHtml).join(" / ") : "";
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
    const currentCount = (Array.isArray(applicants) ? applicants : [])
      .filter(item => String(item.recruitment_id) === String(recruitment.id)).length;
    const status = statusLabels[recruitment.status] || recruitment.status || "不明";
    const title = Utils.escapeHtml(scenario?.title || "シナリオ未定");
    return `
      <li>
        <a href="./recruit/detail.html?id=${encodeURIComponent(recruitment.id)}">${title}</a>
        <span class="dashboard-status dashboard-status--${Utils.escapeHtml(recruitment.status || "unknown")}">${Utils.escapeHtml(status)}</span>
        <small>${currentCount} / ${Number(recruitment.target_count) || 0}人</small>
      </li>
    `;
  }).join("")}</ul>`;
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

async function fetchPlayerAvailabilities(playerId, year = null, month = null) {
  let query = `player_availability?select=*&player_id=eq.${encodeURIComponent(playerId)}`;
  if (Number.isInteger(year) && Number.isInteger(month)) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    query += `&target_date=gte.${start}&target_date=lte.${end}`;
  }
  const data = await Utils.apiGet(query);
  return Array.isArray(data) ? data : [];
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
    const monthlyData = await fetchPlayerAvailabilities(homeDashboardState.playerId, year, month);
    Utils.renderAvailabilityGrid(container, year, month, monthlyData);
    modal.showModal();

    requestAnimationFrame(() => {
      const selectedToggle = container.querySelector(`[data-date="${selectedDate}"]`);
      selectedToggle?.closest(".bulk-row")?.scrollIntoView({ block: "center" });
    });
  } catch (err) {
    console.error("予定入力データの取得に失敗しました:", err);
    alert("予定データの取得に失敗しました。");
  }
}

async function saveHomeAvailability() {
  const modal = document.getElementById("home-availability-modal");
  const container = document.getElementById("home-bulk-input-container");
  const saveButton = document.getElementById("home-save-availability-btn");
  const payload = Utils.collectAvailabilityChanges(container, homeDashboardState.playerId);

  if (payload.length === 0) {
    alert("変更された予定データがありません。");
    modal?.close();
    return;
  }

  try {
    if (saveButton) saveButton.disabled = true;
    await Utils.apiPost("player_availability", payload);
    homeDashboardState.availabilities = await fetchPlayerAvailabilities(homeDashboardState.playerId);
    modal?.close();
    renderHomeCalendar();
    alert("予定を保存しました。");
  } catch (err) {
    console.error("予定の保存に失敗しました:", err);
    alert("予定の保存に失敗しました。");
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

function setupDashboardEvents() {
  document.getElementById("home-login-btn")?.addEventListener("click", Utils.loginWithDiscord);
  document.getElementById("home-prev-month-btn")?.addEventListener("click", () => {
    homeDashboardState.currentDate.setDate(1);
    homeDashboardState.currentDate.setMonth(homeDashboardState.currentDate.getMonth() - 1);
    renderHomeCalendar();
  });
  document.getElementById("home-next-month-btn")?.addEventListener("click", () => {
    homeDashboardState.currentDate.setDate(1);
    homeDashboardState.currentDate.setMonth(homeDashboardState.currentDate.getMonth() + 1);
    renderHomeCalendar();
  });
  document.getElementById("home-save-availability-btn")?.addEventListener("click", saveHomeAvailability);
  document.getElementById("home-close-availability-btn")?.addEventListener("click", () => {
    document.getElementById("home-availability-modal")?.close();
  });
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
    const [scenarios, runs, sessions, players] = await Promise.all([
      Utils.apiGet("scenarios"),
      Utils.apiGet("runs"),
      Utils.apiGet("sessions"),
      Utils.apiGet("players").catch(() => []), // エラー時は空配列として続行
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

    const myPlayer = session
      ? (Array.isArray(players) ? players : []).find(player => player.user_id === session.user.id)
      : null;

    if (!session || !myPlayer) {
      guestDashboard.hidden = false;
      memberDashboard.hidden = true;
      renderNextSession(nextEl, sessions, runsById, scenariosById);
      renderOngoing(ongoingEl, runs, scenariosById, sessionsByRunId, playersById);

      if (session && !myPlayer) {
        document.getElementById("guest-dashboard-title").textContent = "プレイヤー連携が必要です";
        const loginButton = document.getElementById("home-login-btn");
        if (loginButton) loginButton.hidden = true;
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

    const [recruitments, applicants, availabilities] = await Promise.all([
      Utils.apiGet("recruitments?order=created_at.desc").catch(() => []),
      Utils.apiGet("recruitment_applicants").catch(() => []),
      fetchPlayerAvailabilities(myPlayer.player_id).catch(() => [])
    ]);

    homeDashboardState.runs = myRuns;
    homeDashboardState.sessions = mySessions;
    homeDashboardState.availabilities = availabilities;

    document.getElementById("dashboard-player-name").textContent = `${myPlayer.player_name} のダッシュボード`;
    renderNextSession(document.getElementById("my-next-session"), mySessions, runsById, scenariosById);
    renderMyRecruitments(
      document.getElementById("my-recruitments"),
      recruitments,
      applicants,
      scenariosById
    );
    renderHomeCalendar();

  } catch (err) {
    const msg = Utils.escapeHtml(err?.message || "読み込みエラー");
    nextEl.innerHTML = `<p>Next Sessionの読み込みに失敗しました：${msg}</p>`;
    ongoingEl.innerHTML = `<p>進行中情報の読み込みに失敗しました：${msg}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", main);

