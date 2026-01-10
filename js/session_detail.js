"use strict";

async function main() {
  const root = document.getElementById("session-detail");
  if (!root) return;

  const runId = Utils.getQueryParam("id");
  if (!runId) {
    root.innerHTML = "<p>run ID が指定されていません</p>";
    return;
  }

  const DEFAULT_COVER = "/img/session/default.png";

  try {
    const [runs, scenarios, sessions, characters] = await Promise.all([
      Utils.fetchJson("../data/runs.json"),
      Utils.fetchJson("../data/scenarios.json"),
      Utils.fetchJson("../data/sessions.json"),
      // characters は無くても動くようにしておく（ファイルが無いなら catch で握る設計でもOK）
      Utils.fetchJson("../data/characters.json").catch(() => []),
    ]);

    const run = (Array.isArray(runs) ? runs : []).find(r => r.id === runId);
    if (!run) {
      root.innerHTML = "<p>卓が見つかりません</p>";
      return;
    }

    const scenario = (Array.isArray(scenarios) ? scenarios : []).find(s => s.id === run.scenarioId) ?? null;

    // カバー：run.cover → なければ scenario.cover → なければ default
    const coverPath =
      (typeof run.cover === "string" && run.cover.trim() !== "")
        ? run.cover
        : ((typeof scenario?.cover === "string" && scenario.cover.trim() !== "")
            ? scenario.cover
            : DEFAULT_COVER);

    // このrunの全セッション（過去も未来も）
    const runSessions = (Array.isArray(sessions) ? sessions : [])
      .filter(s => s?.runId === run.id)
      .map(s => ({ ...s, _start: Utils.toDate(s.start) }))
      .filter(s => s._start) // start不正は除外
      .sort((a, b) => a._start.getTime() - b._start.getTime());

    const now = new Date();
    const upcoming = runSessions.filter(s => s.status === "scheduled" && s._start > now);
    const lastDone = [...runSessions].reverse().find(s => s.status === "done") ?? null;

    const statusJa = run.status === "active" ? "進行中" : "終了済み";
    const statusClass = run.status === "active" ? "active" : "done";

    // 参加キャラ（任意）
    const charsById = new Map((Array.isArray(characters) ? characters : []).map(c => [c.id, c]));
    const runCharIds = Array.isArray(run.characters) ? run.characters : [];
    const runChars = runCharIds.map(id => charsById.get(id)).filter(Boolean);

    root.innerHTML = `
      <header class="session-detail-header">
        <h1 class="session-detail-title">${Utils.escapeHtml(run.title ?? run.id)}</h1>
        <span class="session-detail-badge ${statusClass}">${Utils.escapeHtml(statusJa)}</span>
      </header>

      <section class="session-detail-top">

        <div class="session-detail-imagewrap">
          <img
            class="session-detail-cover"
            src="..${coverPath}"
            alt="${Utils.escapeHtml(scenario?.title ?? run.title ?? run.id)}"
            loading="lazy"
            onerror="this.onerror=null; this.src='../${DEFAULT_COVER}'"
          >
        </div>
        
        <div class="session-detail-profile">
          <h2 class="session-detail-h2">卓情報</h2>

          <table class="session-detail-table">
            <tbody>
              <tr><th>シナリオ</th><td>${
                scenario
                  ? `<a class="session-detail-link" href="../scenarios/detail.html?id=${encodeURIComponent(scenario.id)}">${Utils.escapeHtml(scenario.title ?? scenario.id)}</a>`
                  : "（不明）"
              }</td></tr>
              <tr><th>GM</th><td>${Utils.escapeHtml(run.gm ?? "—")}</td></tr>
              <tr><th>PL</th><td>${Utils.escapeHtml((run.players ?? []).join(" / ") || "—")}</td></tr>
              <tr><th>次回</th><td>${
                run.status === "active"
                  ? (upcoming[0]?._start ? Utils.escapeHtml(Utils.formatDateTime(upcoming[0]._start)) : "未定")
                  : "—"
              }</td></tr>
              <tr><th>最終</th><td>${
                lastDone?._start ? Utils.escapeHtml(lastDone._start.toLocaleDateString("ja-JP")) : (run.status === "done" ? "未記録" : "—")
              }</td></tr>
            </tbody>
          </table>

          ${
            runChars.length
              ? `<h3 class="session-detail-h3">参加キャラクター</h3>
                 <div class="session-detail-chips">
                   ${runChars.map(c => `
                     <a class="session-detail-chiplink" href="../character/detail.html?id=${encodeURIComponent(c.id)}">
                       ${Utils.escapeHtml(c.name ?? c.id)}
                     </a>
                   `).join("")}
                 </div>`
              : ""
          }
        </div>

      </section>

      <section class="session-detail-log">
        <h2 class="session-detail-h2">セッション履歴</h2>
        ${
          runSessions.length
            ? `<ul class="session-detail-list">
                ${runSessions.map(s => {
                  const stateJa = s.status === "scheduled" ? "予定" : "終了";
                  const dateText = s._start ? Utils.formatDateTime(s._start) : "日付不明";
                  return `<li class="session-detail-item">
                    <span class="session-detail-item-date">${Utils.escapeHtml(dateText)}</span>
                    <span class="session-detail-item-title">${Utils.escapeHtml(s.title ?? "")}</span>
                    <span class="session-detail-item-state ${Utils.escapeHtml(s.status)}">${Utils.escapeHtml(stateJa)}</span>
                  </li>`;
                }).join("")}
              </ul>`
            : `<p class="session-detail-muted">この卓のセッションがありません</p>`
        }
      </section>
    `;
      Comments.mount("comments-root", "session", runId);
  } catch (e) {
    console.error(e);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

main();



