"use strict";

async function main() {
  const root = document.getElementById("schedule-list");
  root.innerHTML = "";

  try {
    const [scenarios, runs, sessions] = await Promise.all([
      Utils.apiGet("scenarios"),
      Utils.apiGet("runs"),
      Utils.apiGet("sessions"),
    ]);

    const scenariosById = new Map((scenarios ?? []).map(s => [s.id, s]));
    const runsById = new Map((runs ?? []).map(r => [r.id, r]));

    const now = new Date();
    const upcoming = (Array.isArray(sessions) ? sessions : [])
      .map(s => ({ ...s, _start: Utils.toDate(s.start) }))
      .filter(s => s && s.status === "scheduled" && s._start && s._start > now)
      .sort((a, b) => a._start - b._start);

    if (upcoming.length === 0) {
      root.innerHTML = "<p>予定はありません</p>";
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "schedule-wrap";
    root.appendChild(wrap);

    const ul = document.createElement("ul");
    ul.className = "schedule-list";
    wrap.appendChild(ul);

    for (const s of upcoming) {
      const run = runsById.get(s.run_id);
      const scenario = run ? scenariosById.get(run.scenario_id) : null;

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

      const scenarioTitle = Utils.escapeHtml(scenario?.title ?? "（不明なシナリオ）");
      const runTitle = Utils.escapeHtml(run?.title ?? s.run_id ?? "（不明な卓）");
      const sessionTitle = Utils.escapeHtml(s.title ?? "");

      const li = document.createElement("li");
      li.className = "schedule-item";
      li.innerHTML = `
        <div class="schedule-when"><strong>${Utils.escapeHtml(dateStr)} ${Utils.escapeHtml(timeStr)}</strong></div>
        <div class="schedule-what">
          <div>${scenarioTitle} <small>— ${runTitle}</small></div>
          ${sessionTitle ? `<div><small>${sessionTitle}</small></div>` : ""}
        </div>
      `;
      ul.appendChild(li);
    }

  } catch (err) {
    console.error(err);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

document.addEventListener("DOMContentLoaded", main);
