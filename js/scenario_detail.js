"use strict";

function renderMultilineText(text) {
  const normalized = String(text ?? "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\\n", "\n");
  const escaped = Utils.escapeHtml(normalized);
  return escaped.replaceAll("\n", "<br>");
}

async function main() {
  const root = document.getElementById("scenario-detail");
  if (!root) return;

  const id = Utils.getQueryParam("id");
  if (!id) {
    root.innerHTML = "<p>シナリオIDが指定されていません</p>";
    return;
  }

  const now = new Date();

  try {
    const [scenarios, runs, sessions, characters, characterIds] = await Promise.all([
      Utils.apiGet("scenarios"),
      Utils.apiGet("runs"),
      Utils.apiGet("sessions"),
      Utils.apiGet("characters"),
      Utils.apiGet(`scenario_characters?scenario_id=${encodeURIComponent(id)}`).catch(() => []),
    ]);

    const scenariosSafe = Array.isArray(scenarios) ? scenarios : [];
    const runsSafe = Array.isArray(runs) ? runs : [];
    const sessionsSafe = Array.isArray(sessions) ? sessions : [];
    const charactersSafe = Array.isArray(characters) ? characters : [];
    const characterIdsSafe = Array.isArray(characterIds) ? characterIds : [];

    const scenario = scenariosSafe.find(s => s?.id === id);
    if (!scenario) {
      root.innerHTML = "<p>シナリオが見つかりません</p>";
      return;
    }

    // カバー（規約生成）
    const coverPath = Utils.getScenarioCoverPath(scenario.id);
    const fallbackCover = Utils.DEFAULT_SCENARIO_COVER;

    // runs / sessions の引き当て
    const scenarioRuns = runsSafe
      .filter(r => r && r.scenario_id === id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const sessionsByRunId = new Map();
    for (const s of sessionsSafe) {
      if (!s?.run_id) continue;
      if (!sessionsByRunId.has(s.run_id)) sessionsByRunId.set(s.run_id, []);
      sessionsByRunId.get(s.run_id).push(s);
    }

    // 次回予定（scheduled & future の最短）を run ごとに作る
    const nextByRunId = new Map();
    for (const s of sessionsSafe) {
      if (!s?.run_id) continue;
      if (s.status !== "scheduled") continue;
      const d = Utils.toDate(s.start);
      if (!d || d <= now) continue;

      const cur = nextByRunId.get(s.run_id);
      if (!cur || d < cur._start) nextByRunId.set(s.run_id, { ...s, _start: d });
    }

    // 表示順：進行中→終了、次回予定が近い順
    const activeRuns = scenarioRuns.filter(r => r.status === "active");
    const doneRuns = scenarioRuns.filter(r => r.status !== "active");

    const sortByNext = (a, b) => {
      const an = nextByRunId.get(a.id)?._start?.getTime() ?? Number.POSITIVE_INFINITY;
      const bn = nextByRunId.get(b.id)?._start?.getTime() ?? Number.POSITIVE_INFINITY;
      return an - bn;
    };
    activeRuns.sort(sortByNext);
    doneRuns.sort(sortByNext);

    // 通過キャラ一覧（中間テーブル優先）
    const charactersById = new Map(charactersSafe.map(c => [c.id, c]));
    const passedChars = characterIdsSafe
      .map(cid => charactersById.get(cid) ?? { id: cid, name: cid })
      .sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), "ja"));

    const passedCharsHtml = passedChars.length
      ? `<div class="scenario-detail-characters">
          ${passedChars.map(c => {
            const name = Utils.escapeHtml(String(c.name ?? c.id));
            const img = Utils.getCharacterImagePath(c.id);
            const fallback = Utils.DEFAULT_CHARACTER_IMAGE;
            return `
              <a class="scenario-detail-character" href="../character/detail.html?id=${encodeURIComponent(c.id)}">
                <img class="scenario-detail-character-img"
                     src="${img}"
                     onerror="this.onerror=null; this.src='${fallback}';"
                     alt="${name}"
                     loading="lazy">
                <span class="scenario-detail-character-name">${name}</span>
              </a>
            `;
          }).join("")}
        </div>`
      : `<p class="scenario-detail-muted">まだ登録がありません</p>`;

    // runs 表示用
    function renderRunCard(r) {
      const title = Utils.escapeHtml(String(r.title ?? r.id));
      const statusJa = r.status === "active" ? "進行中" : "終了済";
      const badgeClass = r.status === "active" ? "active" : "done";

      const next = nextByRunId.get(r.id);
      const nextLine = next
        ? (() => {
            const d = next._start;
            const dateStr = d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
            const timeStr = d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
            const st = Utils.escapeHtml(String(next.title ?? ""));
            return `<div class="scenario-detail-next">次回: ${Utils.escapeHtml(dateStr)} ${Utils.escapeHtml(timeStr)} ${st}</div>`;
          })()
        : `<div class="scenario-detail-next"><small>次回未定</small></div>`;

      return `
        <article class="scenario-detail-run">
          <h3 class="scenario-detail-run-title">
            <a class="scenario-detail-link" href="../sessions/detail.html?id=${encodeURIComponent(r.id)}">${title}</a>
            <span class="scenario-detail-badge ${badgeClass}">${statusJa}</span>
          </h3>
          ${nextLine}
        </article>
      `;
    }

    root.innerHTML = `
      <header class="scenario-detail-header">
        <h1 class="scenario-detail-title">${Utils.escapeHtml(String(scenario.title ?? scenario.id))}</h1>
        <div class="scenario-detail-sub">
          <span>${Utils.escapeHtml(String(scenario.system ?? ""))}</span>
        </div>
      </header>

      <section class="scenario-detail-top">
        <div class="scenario-detail-coverwrap">
          <img class="scenario-detail-cover"
               src="${coverPath}"
               onerror="this.onerror=null; this.src='${fallbackCover}';"
               alt="${Utils.escapeHtml(String(scenario.title ?? scenario.id))}"
               loading="lazy">
        </div>

        <div class="scenario-detail-body">
          ${scenario.tags && Array.isArray(scenario.tags) && scenario.tags.length
            ? `<div class="scenario-detail-tags">
                ${scenario.tags.map(t => `<span class="scenario-detail-tag">${Utils.escapeHtml(String(t))}</span>`).join("")}
              </div>`
            : ""
          }

          <h2 class="scenario-detail-h2">概要</h2>
          ${scenario.description
            ? `<p class="scenario-detail-desc">${renderMultilineText(scenario.description)}</p>`
            : `<p class="scenario-detail-muted">未登録</p>`
          }

          <h2 class="scenario-detail-h2">メモ</h2>
          ${scenario.notes
            ? `<p class="scenario-detail-notes">${renderMultilineText(scenario.notes)}</p>`
            : `<p class="scenario-detail-muted">未登録</p>`
          }
        </div>
      </section>

      <section class="scenario-detail-section">
        <h2 class="scenario-detail-h2">通過キャラクター</h2>
        ${passedCharsHtml}
      </section>

      <section class="scenario-detail-section">
        <h2 class="scenario-detail-h2">進行中の卓</h2>
        ${activeRuns.length ? activeRuns.map(renderRunCard).join("") : `<p class="scenario-detail-muted">ありません</p>`}
      </section>

      <section class="scenario-detail-section">
        <h2 class="scenario-detail-h2">終了済みの卓</h2>
        ${doneRuns.length ? doneRuns.map(renderRunCard).join("") : `<p class="scenario-detail-muted">ありません</p>`}
      </section>
    `;
  } catch (e) {
    console.error(e);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

main();
