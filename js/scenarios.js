"use strict";

let allScenarios = [];
let runCountByScenarioId = new Map();

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

function renderScenarios(scenarios) {
  const root = document.getElementById("scenarios-list");
  if (!root) return;
  root.innerHTML = "";

  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    root.innerHTML = "<p>該当するシナリオがありません</p>";
    return;
  }

  const grid = document.createElement("div");
  grid.className = "scenarios-grid";
  root.appendChild(grid);

  for (const s of scenarios) {
    const coverPath = Utils.getScenarioCoverPath(s.id, s.image_url);
    const fallback = Utils.DEFAULT_SCENARIO_COVER;
    const title = Utils.escapeHtml(s.title ?? s.id ?? "（無題）");
    const system = Utils.escapeHtml(s.system ?? "");
    const runsCount = runCountByScenarioId.get(s.id) ?? 0;

    // プレイ人数
    const minPlayers = s.min_players ?? 1;
    const maxPlayers = s.max_players ?? 4;
    // プレイ時間
    const playTimeStr = s.play_time_minutes ? `${s.play_time_minutes}分 (約${Math.round(s.play_time_minutes / 60 * 10) / 10}時間)` : "未設定";
    // ロスト率
    const lostRateLabel = s.lost_rate === 'high' ? '高' : (s.lost_rate === 'mid' ? '中' : '低');

    const card = document.createElement("article");
    card.className = "scenarios-card";

    card.innerHTML = `
      <img class="scenarios-cover"
        src="${coverPath}"
        onerror="this.onerror=null; this.src='${fallback}';"
        alt="${title}"
        loading="lazy"
      >
      <h2 class="scenarios-title">
        <a class="scenarios-link" href="./detail.html?id=${encodeURIComponent(s.id)}">
          ${title}
        </a>
      </h2>
      ${getTrendTagsHtml(s)}
      <div class="scenarios-meta">
        ${system ? `<div>System: ${system}</div>` : ""}
        <div>Players: ${minPlayers}〜${maxPlayers}人</div>
        <div>Time: ${playTimeStr}</div>
        <div>Lost: ${lostRateLabel}</div>
        <div>Runs: ${runsCount}</div>
      </div>
    `;

    grid.appendChild(card);
  }
}

function applyFilters() {
  const minPlayersVal = document.getElementById("filter-min-players").value;
  const maxPlayersVal = document.getElementById("filter-max-players").value;
  const playTimeVal = document.getElementById("filter-play-time").value;
  const lostRateVal = document.getElementById("filter-lost-rate").value;

  const minPlayers = minPlayersVal ? parseInt(minPlayersVal, 10) : null;
  const maxPlayers = maxPlayersVal ? parseInt(maxPlayersVal, 10) : null;
  const maxPlayTime = playTimeVal ? parseInt(playTimeVal, 10) : null;

  const filtered = allScenarios.filter(s => {
    // プレイ人数フィルタ
    // 1. ユーザーが「最小人数」を指定している場合：
    //    シナリオの max_players が minPlayers 以上である必要がある
    if (minPlayers !== null) {
      const sMax = s.max_players ?? 4;
      if (sMax < minPlayers) return false;
    }
    // 2. ユーザーが「最大人数」を指定している場合：
    //    シナリオの min_players が maxPlayers 以下である必要がある
    if (maxPlayers !== null) {
      const sMin = s.min_players ?? 1;
      if (sMin > maxPlayers) return false;
    }

    // プレイ時間フィルタ
    if (maxPlayTime !== null) {
      const sTime = s.play_time_minutes ?? 180;
      if (sTime > maxPlayTime) return false;
    }

    // ロスト率フィルタ
    if (lostRateVal) {
      const sLost = s.lost_rate || 'low';
      if (sLost !== lostRateVal) return false;
    }

    return true;
  });

  renderScenarios(filtered);
}

async function main() {
  await Utils.initAuthAndHeader('common-nav', '../');

  try {
    const [scenarios, runs] = await Promise.all([
      Utils.apiGet("scenario_list"),
      Utils.apiGet("runs"),
    ]);

    allScenarios = Array.isArray(scenarios) ? scenarios : [];

    // scenario_id -> run数
    runCountByScenarioId.clear();
    for (const r of (Array.isArray(runs) ? runs : [])) {
      if (!r?.scenario_id) continue;
      runCountByScenarioId.set(
        r.scenario_id,
        (runCountByScenarioId.get(r.scenario_id) ?? 0) + 1
      );
    }

    // フィルタイベントリスナーの設定
    const minPlayersInput = document.getElementById("filter-min-players");
    const maxPlayersInput = document.getElementById("filter-max-players");
    const playTimeSelect = document.getElementById("filter-play-time");
    const lostRateSelect = document.getElementById("filter-lost-rate");

    if (minPlayersInput) minPlayersInput.addEventListener("input", applyFilters);
    if (maxPlayersInput) maxPlayersInput.addEventListener("input", applyFilters);
    if (playTimeSelect) playTimeSelect.addEventListener("change", applyFilters);
    if (lostRateSelect) lostRateSelect.addEventListener("change", applyFilters);

    renderScenarios(allScenarios);

  } catch (err) {
    console.error(err);
    const root = document.getElementById("scenarios-list");
    if (root) root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

document.addEventListener("DOMContentLoaded", main);
