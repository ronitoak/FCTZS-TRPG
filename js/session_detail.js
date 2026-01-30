"use strict";

function renderLink(url, label) {
  const u = String(url ?? "").trim();
  if (!u) return "";
  const safe = Utils.escapeHtml(u);
  const text = Utils.escapeHtml(label ?? u);
  return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

async function main() {
  const root = document.getElementById("session-detail");
  if (!root) return;

  const run_id = Utils.getQueryParam("id");
  if (!run_id) {
    root.innerHTML = "<p>run ID が指定されていません</p>";
    return;
  }

  try {
    const [runs, scenarios, sessions, characters] = await Promise.all([
      Utils.apiGet("runs"),
      Utils.apiGet("scenarios"),
      Utils.apiGet("sessions"),
      // characters は無くても動くようにしておく（ファイルが無いなら catch で握る設計でもOK）
      Utils.apiGet("characters").catch(() => []),
    ]);

    const run = (Array.isArray(runs) ? runs : []).find(r => r.id === run_id);
    if (!run) {
      root.innerHTML = "<p>卓が見つかりません</p>";
      return;
    }

    const scenarioId = run?.scenario_id;
    const coverPath = Utils.getScenarioCoverPath(scenarioId ?? "unknown");
    const fallback = Utils.DEFAULT_SCENARIO_COVER;
    const scenario = (Array.isArray(scenarios) ? scenarios : []).find(s => s.id === run.scenario_id) ?? null;

    // このrunの全セッション（過去も未来も）
    const runSessions = (Array.isArray(sessions) ? sessions : [])
      .filter(s => s?.run_id === run.id)
      .map(s => ({ ...s, _start: Utils.toDate(s.start) }))
      .filter(s => s._start) // start不正は除外
      .sort((a, b) => a._start.getTime() - b._start.getTime());

    const now = new Date();
    const upcoming = runSessions.filter(s => s.status === "scheduled" && s._start > now);
    const lastDone = [...runSessions].reverse().find(s => s.status === "done") ?? null;

    const statusJa = Utils.statusMap[run.status] || "不明";
    const statusClass = run.status === "active" ? "active" : run.status === "planning" ? "planning" : "done";

    // 参加キャラ（任意）
    const charsById = new Map((Array.isArray(characters) ? characters : []).map(c => [c.id, c]));
    const runCharIds = Array.isArray(run.characters) ? run.characters : [];
    const runChars = runCharIds.map(id => charsById.get(id)).filter(Boolean);

    const linksHtml = (s.replay_url || s.stream_url) ? `
      <div class="session-links">
        ${s.replay_url ? `🎬 ${renderLink(s.replay_url, "リプレイ")}` : ""}
        ${s.stream_url ? `📡 ${renderLink(s.stream_url, "リプレイ")}` : ""}
      </div>
    ` : "";

    root.innerHTML = `
      <header class="session-detail-header">
        <h1 class="session-detail-title">${Utils.escapeHtml(run.title ?? run.id)}</h1>
        <span class="session-detail-badge ${statusClass}">${Utils.escapeHtml(statusJa)}</span>
      </header>

      <section class="session-detail-top">

        <div class="session-detail-imagewrap">
          <img
            class="session-detail-cover"
            src="${coverPath}"
            onerror="this.onerror=null; this.src='${fallback}';"
            alt="${Utils.escapeHtml(scenario?.title ?? run.title ?? run.id)}"
            loading="lazy"
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
                   ${runChars.map(c => {
                      const name = Utils.escapeHtml(c.name ?? c.id);
                      const img = Utils.getCharacterImagePath(c.id);
                      const fallbackImg = Utils.DEFAULT_CHARACTER_IMAGE;
                      return `
                        <a class="session-detail-chiplink" href="../character/detail.html?id=${encodeURIComponent(c.id)}">
                          <img
                            class="session-detail-character-img"
                            src="${img}"
                            onerror="this.onerror=null; this.src='${fallbackImg}';"
                            alt="${name}"
                            loading="lazy"
                          >
                          <span class="session-detail-character-name">${name}</span>
                        </a>
                      `;
                    }).join("")}

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
                    <span class="session-detail-item-url"> ${Utils.escapeHtml(linksHtml) ?? ""} </span>
                    <span class="session-detail-item-state ${Utils.escapeHtml(s.status)}">${Utils.escapeHtml(stateJa)}</span>
                  </li>`;
                }).join("")}
              </ul>`
            : `<p class="session-detail-muted">この卓のセッションがありません</p>`
        }
      </section>
    `;
      Comments.mount("comments-root", "session", run_id);
  } catch (e) {
    console.error(e);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

main();



