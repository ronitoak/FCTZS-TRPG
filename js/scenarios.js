"use strict";

async function main() {
  const root = document.getElementById("scenarios-list");
  if (!root) return;
  root.innerHTML = "";

  const DEFAULT_COVER = "/img/scenario/default.png";

  try {
    const [scenarios, runs] = await Promise.all([
      Utils.fetchJson("../data/scenarios.json"),
      Utils.fetchJson("../data/runs.json"),
    ]);

    if (!Array.isArray(scenarios) || scenarios.length === 0) {
      root.innerHTML = "<p>シナリオがありません</p>";
      return;
    }

    // scenarioId -> run数
    const runCountByScenarioId = new Map();
    for (const r of (Array.isArray(runs) ? runs : [])) {
      if (!r?.scenarioId) continue;
      runCountByScenarioId.set(
        r.scenarioId,
        (runCountByScenarioId.get(r.scenarioId) ?? 0) + 1
      );
    }

    const grid = document.createElement("div");
    grid.className = "scenarios-grid";
    root.appendChild(grid);

    for (const s of scenarios) {
      const coverPath =
        typeof s.cover === "string" && s.cover.trim() !== ""
          ? s.cover
          : DEFAULT_COVER;

      const title = Utils.escapeHtml(s.title ?? s.id ?? "（無題）");
      const system = Utils.escapeHtml(s.system ?? "");
      const runsCount = runCountByScenarioId.get(s.id) ?? 0;

      const card = document.createElement("article");
      card.className = "scenarios-card";

      card.innerHTML = `
        <img
          class="scenarios-cover"
          src="..${coverPath}"
          alt="${title}"
          loading="lazy"
          onerror="this.onerror=null; this.src='../${DEFAULT_COVER}'"
        >
        <h2 class="scenarios-title">
          <a class="scenarios-link" href="./detail.html?id=${encodeURIComponent(s.id)}">
            ${title}
          </a>
        </h2>
        <div class="scenarios-meta">
          ${system ? `<div>System: ${system}</div>` : ""}
          <div>Runs: ${Utils.escapeHtml(runsCount)}</div>
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
