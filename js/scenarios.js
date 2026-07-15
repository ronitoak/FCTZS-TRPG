"use strict";

function getTrendTagsHtml(scenario) {
  const tags = [];
  if (scenario.trend_story_chaos === 'story') tags.push('<span class="trend-tag trend-story">物語重視</span>');
  if (scenario.trend_story_chaos === 'chaos') tags.push('<span class="trend-tag trend-chaos">混沌歓迎</span>');
  if (scenario.trend_avatar_clear === 'avatar') tags.push('<span class="trend-tag trend-avatar">化身・没入</span>');
  if (scenario.trend_avatar_clear === 'clear') tags.push('<span class="trend-tag trend-clear">攻略重視</span>');
  if (scenario.trend_harmony_active === 'harmony') tags.push('<span class="trend-tag trend-harmony">協調重視</span>');
  if (scenario.trend_harmony_active === 'active') tags.push('<span class="trend-tag trend-active">活躍推奨</span>');
  
  if (tags.length === 0) return '';
  return `<div class="trend-tags-container" style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; margin-bottom: 8px;">${tags.join('')}</div>`;
}

async function main() {
  const root = document.getElementById("scenarios-list");
  if (!root) return;
  root.innerHTML = "";

  await Utils.initAuthAndHeader('common-nav', '../');

  try {
    const [scenarios, runs] = await Promise.all([
      Utils.apiGet("scenario_list"),
      Utils.apiGet("runs"),
    ]);

    if (!Array.isArray(scenarios) || scenarios.length === 0) {
      root.innerHTML = "<p>シナリオがありません</p>";
      return;
    }

    // scenario_id -> run数
    const runCountByScenarioId = new Map();
    for (const r of (Array.isArray(runs) ? runs : [])) {
      if (!r?.scenario_id) continue;
      runCountByScenarioId.set(
        r.scenario_id,
        (runCountByScenarioId.get(r.scenario_id) ?? 0) + 1
      );
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
          <div>Runs: ${runsCount}</div>
        </div>
      `;

      // ★これが無いと表示されない
      grid.appendChild(card);
    }
  } catch (err) {
    console.error(err);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}


document.addEventListener("DOMContentLoaded", main);
