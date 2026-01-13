"use strict";

async function main() {
  const now = new Date();

  const DEFAULT_SESSION_COVER = "/img/session/default.png";

  try {
    const [scenarios, runs, sessions] = await Promise.all([
      Utils.apiGet("scenarios"),
      Utils.apiGet("runs"),
      Utils.apiGet("sessions"),
    ]);

    // lookup 用 Map
    const scenariosById = new Map(scenarios.map(s => [s.id, s]));
    const sessionsByRunId = new Map();

    for (const s of sessions) {
      if (!sessionsByRunId.has(s.run_id)) {
        sessionsByRunId.set(s.run_id, []);
      }
      sessionsByRunId.get(s.run_id).push(s);
    }

  // ループの前に一度だけ
  const listRoot = document.getElementById("sessions-list");
  listRoot.innerHTML = "";

  // セクションを2つ作る
  const activeSection = document.createElement("section");
  activeSection.className = "sessions-section";
  activeSection.innerHTML = `<h2 class="sessions-section-title">進行中セッション</h2>`;

  const doneSection = document.createElement("section");
  doneSection.className = "sessions-section";
  doneSection.innerHTML = `<h2 class="sessions-section-title">終了済セッション</h2>`;

  const activeGrid = document.createElement("div");
  activeGrid.className = "sessions-grid";

  const doneGrid = document.createElement("div");
  doneGrid.className = "sessions-grid";

  activeSection.appendChild(activeGrid);
  doneSection.appendChild(doneGrid);

  listRoot.appendChild(activeSection);
  listRoot.appendChild(doneSection);

  // ループ用カウンタ
  let activeCount = 0;
  let doneCount = 0;

  // run ごとに表示（予定のみ）
  for (const run of runs) {

    const scenario = scenariosById.get(run.scenario_id);

    const runSessionsRaw = sessionsByRunId.get(run.id) ?? [];

    // 予定（scheduled）かつ未来のみ
    const upcoming = runSessionsRaw
      .map(s => ({ ...s, _start: Utils.toDate(s.start) }))
      .filter(s =>
        s &&
        s.status === "scheduled" &&
        s._start &&
        s._start > now
      )
      // 近い順（次回が先頭）
      .sort((a, b) => a._start - b._start);

    const stateJa = run.status === "active" ? "進行中" : "終了済み";
    const badgeClass = run.status === "active" ? "active" : "done";
    const badgeText = run.status === "active" ? "Active" : "Done";
    const coverPath =
    typeof run.cover === "string" && run.cover.trim() !== ""
      ? run.cover
      : DEFAULT_SESSION_COVER;

    const card = document.createElement("article");
    card.className = "sessions-card";

    card.innerHTML = `
      <img
        class="sessions-cover"
        src="..${coverPath}"
        alt="${Utils.escapeHtml(run.title)}"
        loading="lazy"
        onerror="this.onerror=null; this.src='../${DEFAULT_SESSION_COVER}'"
      >

      <h2 class="sessions-title">
        <a class="scenarios-link" href="./detail.html?id=${encodeURIComponent(run.id)}">
          ${Utils.escapeHtml(run.title)}
           - <small>${stateJa}</small>
        </a>
        <span class="sessions-badge ${badgeClass}">${badgeText}</span>
      </h2>

      <div class="sessions-meta">
        <div>シナリオ: ${Utils.escapeHtml(scenario?.title ?? "（不明なシナリオ）")}</div>
        <div>参加者: ${Utils.escapeHtml(run.gm ?? "")} (GM) / ${Utils.escapeHtml((run.players ?? []).join(" / "))}</div>
      </div>

      <ul class="sessions-list">
          ${
            run.status === "active"
              ? (
                  upcoming.length
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
                        return `<li>${Utils.escapeHtml(dateStr)} ${Utils.escapeHtml(timeStr)} ${Utils.escapeHtml(s.title)}</li>`;
                      }).join("")
                    : `<li><small>次回未定</small></li>`
                )
              : ``
          }
        </ul>
      `;

    if (run.status === "active") {
      activeGrid.appendChild(card);
      activeCount++;
    } else {
      doneGrid.appendChild(card);
      doneCount++;
    }
  }

    if (activeGrid.children.length === 0) {
      activeGrid.innerHTML = "<p><small>進行中の卓はありません</small></p>";
    }
    if (doneGrid.children.length === 0) {
        doneGrid.innerHTML = "<p><small>終了済の卓はありません</small></p>";

      }

    } catch (err) {
      listRoot.innerHTML = `<p>読み込みに失敗しました</p>`;
      console.error(err);
    }
}

document.addEventListener("DOMContentLoaded", main);
