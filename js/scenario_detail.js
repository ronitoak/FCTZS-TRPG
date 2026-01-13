"use strict";

async function main() {
  const root = document.getElementById("scenario-detail");
  if (!root) return;

  const id = Utils.getQueryParam("id");
  if (!id) {
    root.innerHTML = "<p>シナリオIDが指定されていません</p>";
    return;
  }

  try {
    const [scenarios, runs, sessions] = await Promise.all([
      Utils.apiGet("scenarios"),
      Utils.apiGet("runs"),
      Utils.apiGet("sessions"),
    ]);

    const scenario = (Array.isArray(scenarios) ? scenarios : []).find(s => s.id === id);
    if (!scenario) {
      root.innerHTML = "<p>シナリオが見つかりません</p>";
      return;
    }

    const coverPath = Utils.getScenarioCoverPath(scenario.id);
    const fallback = Utils.DEFAULT_SCENARIO_COVER;

    // このシナリオのrunだけ
    const relatedRuns = (Array.isArray(runs) ? runs : [])
      .filter(r => r?.scenario_id === id)
    ;

    const activeRuns = relatedRuns.filter(r => r?.status === "active");
    const doneRuns = relatedRuns.filter(r => r?.status === "done");

    // run_id -> 次回予定（最も近い scheduled&未来）
    const now = new Date();
    const nextByRunId = new Map();
    for (const s of (Array.isArray(sessions) ? sessions : [])) {
      if (!s?.run_id) continue;
      if (s.status !== "scheduled") continue;
      const d = Utils.toDate(s.start);
      if (!d || d <= now) continue;

      const cur = nextByRunId.get(s.run_id);
      if (!cur || d < cur._start) nextByRunId.set(s.run_id, { ...s, _start: d });
    }

    // 表示順：進行中→終了、次回予定が近い順
    activeRuns.sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      const an = nextByRunId.get(a.id)?._start?.getTime() ?? Number.POSITIVE_INFINITY;
      const bn = nextByRunId.get(b.id)?._start?.getTime() ?? Number.POSITIVE_INFINITY;
      return an - bn;
    });

    doneRuns.sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      const an = nextByRunId.get(a.id)?._start?.getTime() ?? Number.POSITIVE_INFINITY;
      const bn = nextByRunId.get(b.id)?._start?.getTime() ?? Number.POSITIVE_INFINITY;
      return an - bn;
    });

    root.innerHTML = `
      <header class="scenario-detail-header">
        <h1 class="scenario-detail-title">${Utils.escapeHtml(scenario.title ?? scenario.id)}</h1>
        ${scenario.system ? `<span class="scenario-detail-system">${Utils.escapeHtml(scenario.system)}</span>` : ""}
      </header>

      <section class="scenario-detail-top">
        <div class="scenario-detail-imagewrap">
          <img class="scenario-detail-cover"
            src="${coverPath}"
            onerror="this.onerror=null; this.src='${fallback}';"
            alt="${Utils.escapeHtml(scenario.title ?? scenario.id)}"
            loading="lazy">
        </div>

        <div class="scenario-detail-info">
          <h2 class="scenario-detail-h2">概要</h2>
          <p class="scenario-detail-desc">${Utils.escapeHtml(scenario.description ?? "（未登録）")}</p>
        </div>
      </section>

      <section class="scenario-detail-runs">
  <h2 class="scenario-detail-h2">このシナリオのセッション（卓）</h2>

  <div class="scenario-detail-runs-split">
    <section class="scenario-detail-runs-block">
      <h3 class="scenario-detail-h3">進行中セッション</h3>
      ${
        activeRuns.length
          ? `<div class="scenario-detail-runs-grid">
              ${activeRuns.map(r => {
                const next = nextByRunId.get(r.id);
                const nextText = next?._start
                  ? `${next._start.toLocaleDateString("ja-JP")} ${next._start.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
                  : "次回未定";

                return `
                  <article class="scenario-detail-run-card active">
                    <h3 class="scenario-detail-run-title">
                      ${Utils.escapeHtml(r.title ?? r.id)}
                      <small>（進行中）</small>
                    </h3>
                    <div class="scenario-detail-run-meta">
                      <div>GM: ${Utils.escapeHtml(r.gm ?? "—")}</div>
                      <div>PL: ${Utils.escapeHtml((r.players ?? []).join(" / ") || "—")}</div>
                      <div>次回: ${Utils.escapeHtml(nextText)}</div>
                    </div>
                    <a class="scenario-detail-link"
                      href="../sessions/detail.html?id=${encodeURIComponent(r.id)}">
                      セッション詳細へ
                    </a>
                  </article>
                `;
              }).join("")}
            </div>`
          : `<p class="scenario-detail-muted"><small>進行中の卓はありません</small></p>`
      }
    </section>

    <section class="scenario-detail-runs-block">
          <h3 class="scenario-detail-h3">終了済セッション</h3>
          ${
            doneRuns.length
              ? `<div class="scenario-detail-runs-grid">
                  ${doneRuns.map(r => {
                    return `
                      <article class="scenario-detail-run-card done">
                        <h3 class="scenario-detail-run-title">
                          ${Utils.escapeHtml(r.title ?? r.id)}
                          <small>（終了済み）</small>
                        </h3>
                        <div class="scenario-detail-run-meta">
                          <div>GM: ${Utils.escapeHtml(r.gm ?? "—")}</div>
                          <div>PL: ${Utils.escapeHtml((r.players ?? []).join(" / ") || "—")}</div>
                          <div><small>完結済</small></div>
                        </div>
                        <a class="scenario-detail-link" href="../sessions/detail.html?id=${encodeURIComponent(r.id)}">セッション詳細へ</a>
                      </article>
                    `;
                  }).join("")}
                </div>`
              : `<p class="scenario-detail-muted"><small>終了済の卓はありません</small></p>`
          }
        </section>
      </div>
    </section>
    `;
  } catch (e) {
    console.error(e);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

Utils.domReady(main);
