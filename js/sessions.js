"use strict";

// 卓と開催記録を結合し、次回予定・参加者・シナリオ画像を一覧カードへまとめる。
// 検索条件はクライアント側で即時反映する。
(() => {

let allRuns = [];
let scenariosById = new Map();
let sessionsByRunId = new Map();
let playersById = new Map();

function resolveGmName(run) {
  let gmName = run.gm_name ?? "";
  if (!gmName && run.gm_id && playersById.has(run.gm_id)) {
    gmName = playersById.get(run.gm_id).player_name;
  }
  return gmName || "";
}

function resolvePlNames(run) {
  let plNames = Array.isArray(run.player_names) ? run.player_names : [];
  if (plNames.length === 0 && Array.isArray(run.player_ids) && run.player_ids.length > 0) {
    plNames = run.player_ids.map(id => playersById.get(id)?.player_name || id);
  }
  return plNames;
}

function createRunCard(run, now) {
  const scenario = scenariosById.get(run.scenario_id);

  // 開催回には画像参照がないため、親卓のscenario_idからカード画像を解決する。
  // 卓自身の画像URL(R2)があればそれを使い、なければシナリオの画像URLを使う
  const coverPath = run.image_url
    ? run.image_url
    : Utils.getScenarioCoverPath(scenario?.id ?? run.scenario_id ?? "unknown", scenario?.image_url);
  const fallback = Utils.DEFAULT_SCENARIO_COVER;

  const runSessionsRaw = sessionsByRunId.get(run.id) ?? [];

  // 予定（scheduled）かつ未来のみ
  const upcoming = runSessionsRaw
    .map(s => ({ ...s, _start: Utils.toDate(s.start) }))
    .filter(s => s && s.status === "scheduled" && s._start && s._start > now)
    .sort((a, b) => a._start - b._start);

  const stateJa = Utils.statusMap[run.status] || "不明";
  const badgeClass = run.status === "active" ? "active" : run.status === "planning" ? "planning" : "done";
  const badgeText = Utils.statusMap[run.status] || "不明";

  const gmName = resolveGmName(run);
  const plNames = resolvePlNames(run);

  const card = document.createElement("article");
  card.className = "sessions-card";

  card.innerHTML = `
    <img
      class="sessions-cover"
      src="${coverPath}"
      onerror="this.onerror=null; this.src='${fallback}';"
      alt="${Utils.escapeHtml(run.title ?? run.id)}"
      loading="lazy"
    >

    <h2 class="sessions-title">
      <a class="scenarios-link" href="./detail.html?id=${encodeURIComponent(run.id)}">
        ${Utils.escapeHtml(run.title ?? run.id)}
         - <small>${stateJa}</small>
      </a>
      <span class="sessions-badge ${badgeClass}">${badgeText}</span>
    </h2>

    <div class="sessions-meta">
      <div>シナリオ: ${Utils.escapeHtml(scenario?.title ?? "（不明なシナリオ）")}</div>
      <div>参加者: ${Utils.escapeHtml(gmName)} (GM) / ${Utils.escapeHtml(plNames.join(" / "))}</div>
    </div>

    <ul class="sessions-list">
      ${
        run.status === "active"
          ? (upcoming.length
              ? upcoming.map(s => {
                  const dateStr = s._start.toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    weekday: "short",
                  });
                  const timeStr = s._start.toLocaleTimeString("ja-JP", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return `<li>${Utils.escapeHtml(dateStr)} ${Utils.escapeHtml(timeStr)} ${Utils.escapeHtml(s.title ?? "")}</li>`;
                }).join("")
              : `<li><small>次回未定</small></li>`)
          : ``
      }
    </ul>
  `;

  return card;
}

function renderSessions(runs) {
  const listRoot = document.getElementById("sessions-list");
  if (!listRoot) return;

  listRoot.innerHTML = "";
  const now = new Date();

  const activeSection = document.createElement("section");
  activeSection.className = "sessions-section";
  activeSection.innerHTML = `<h2 class="sessions-section-title">進行中の卓</h2>`;

  const planningSection = document.createElement("section");
  planningSection.className = "sessions-section";
  planningSection.innerHTML = `<h2 class="sessions-section-title">計画中の卓</h2>`;

  const doneSection = document.createElement("section");
  doneSection.className = "sessions-section";
  doneSection.innerHTML = `<h2 class="sessions-section-title">終了済みの卓</h2>`;

  const activeGrid = document.createElement("div");
  activeGrid.className = "sessions-grid";

  const planningGrid = document.createElement("div");
  planningGrid.className = "sessions-grid";

  const doneGrid = document.createElement("div");
  doneGrid.className = "sessions-grid";

  activeSection.appendChild(activeGrid);
  planningSection.appendChild(planningGrid);
  doneSection.appendChild(doneGrid);

  listRoot.appendChild(activeSection);
  listRoot.appendChild(planningSection);
  listRoot.appendChild(doneSection);

  for (const run of runs) {
    if (!run?.id) continue;
    const card = createRunCard(run, now);

    if (run.status === "active") {
      activeGrid.appendChild(card);
    } else if (run.status === "planning") {
      planningGrid.appendChild(card);
    } else {
      doneGrid.appendChild(card);
    }
  }

  if (activeGrid.children.length === 0) {
    activeGrid.innerHTML = "<p><small>進行中の卓はありません</small></p>";
  }
  if (planningGrid.children.length === 0) {
    planningGrid.innerHTML = "<p><small>計画中の卓はありません</small></p>";
  }
  if (doneGrid.children.length === 0) {
    doneGrid.innerHTML = "<p><small>終了済の卓はありません</small></p>";
  }
}

function applyFilters() {
  const keywordEl = document.getElementById("filter-keyword");
  const statusEl = document.getElementById("filter-status");
  const systemEl = document.getElementById("filter-system");

  const keyword = (keywordEl?.value ?? "").trim().toLowerCase();
  const statusVal = statusEl?.value ?? "";
  const systemVal = systemEl?.value ?? "";

  const filtered = allRuns.filter(run => {
    if (!run?.id) return false;

    if (statusVal) {
      if (statusVal === "done") {
        if (run.status === "active" || run.status === "planning") return false;
      } else if (run.status !== statusVal) {
        return false;
      }
    }

    const scenario = scenariosById.get(run.scenario_id);
    if (systemVal && (scenario?.system ?? "") !== systemVal) {
      return false;
    }

    if (keyword) {
      const title = (run.title ?? "").toLowerCase();
      const scenarioTitle = (scenario?.title ?? "").toLowerCase();
      const gmName = resolveGmName(run).toLowerCase();
      const plNames = resolvePlNames(run).map(n => String(n).toLowerCase());
      const hit =
        title.includes(keyword) ||
        scenarioTitle.includes(keyword) ||
        gmName.includes(keyword) ||
        plNames.some(n => n.includes(keyword));
      if (!hit) return false;
    }

    return true;
  });

  renderSessions(filtered);
}

async function main() {
  const listRoot = document.getElementById("sessions-list");
  if (!listRoot) return;

  await Utils.initAuthAndHeader('common-nav', '../');

  try {
    const [scenarios, runs, sessions, players] = await Promise.all([
      Utils.apiGet("scenarios"),
      Utils.apiGet("runs"),
      Utils.apiGet("session_list"),
      Utils.apiGet("players").catch(() => [])
    ]);

    const scenariosSafe = Array.isArray(scenarios) ? scenarios : [];
    const runsSafe = Array.isArray(runs) ? runs : [];
    const sessionsSafe = Array.isArray(sessions) ? sessions : [];
    playersById = new Map((Array.isArray(players) ? players : []).map(p => [p.player_id, p]));
    scenariosById = new Map(scenariosSafe.map(s => [s.id, s]));
    sessionsByRunId = new Map();

    for (const s of sessionsSafe) {
      if (!s?.run_id) continue;
      if (!sessionsByRunId.has(s.run_id)) sessionsByRunId.set(s.run_id, []);
      sessionsByRunId.get(s.run_id).push(s);
    }

    allRuns = runsSafe.filter(r => r?.id);

    // システム絞り込み用セレクトの選択肢を、紐づくシナリオから動的生成
    const systemSelect = document.getElementById("filter-system");
    if (systemSelect) {
      const systems = new Set();
      for (const run of allRuns) {
        const sys = scenariosById.get(run.scenario_id)?.system;
        if (sys) systems.add(sys);
      }
      [...systems].sort().forEach(sys => {
        const option = document.createElement("option");
        option.value = sys;
        option.textContent = sys;
        systemSelect.appendChild(option);
      });
    }

    const filterKeyword = document.getElementById("filter-keyword");
    const filterStatus = document.getElementById("filter-status");
    const filterSystem = document.getElementById("filter-system");
    if (filterKeyword) filterKeyword.addEventListener("input", applyFilters);
    if (filterStatus) filterStatus.addEventListener("change", applyFilters);
    if (filterSystem) filterSystem.addEventListener("change", applyFilters);

    renderSessions(allRuns);
  } catch (err) {
    console.error(err);
    listRoot.innerHTML = `<p>読み込みに失敗しました</p>`;
  }
}

document.addEventListener("DOMContentLoaded", main);
})();
