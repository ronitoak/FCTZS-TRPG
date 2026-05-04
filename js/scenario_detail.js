"use strict";

let currentScenarioId = null;

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

  await Utils.initAuthAndHeader('common-nav', '../');

  const id = Utils.getQueryParam("id");
  if (!id) {
    root.innerHTML = "<p>シナリオIDが指定されていません</p>";
    return;
  }

  try {
    const [scenarios, runs, sessions, characters, characterIds] = await Promise.all([
      Utils.apiGet("scenarios"),
      Utils.apiGet("runs"),
      Utils.apiGet("sessions"),
      Utils.apiGet("characters"),
      Utils.apiGet(`character_scenarios?scenario_id=${encodeURIComponent(id)}`).catch(() => []),
    ]);

    const editBtn = `<button id="btn-open-scenario-edit" class="btn-secondary btn-edit-small">📝</button>`;
    const scenario = (Array.isArray(scenarios) ? scenarios : []).find(s => s.id === id);
    if (!scenario) {
      root.innerHTML = "<p>シナリオが見つかりません</p>";
      return;
    }

    currentScenarioId = scenario.id; // IDを保持

    const coverPath = Utils.getScenarioCoverPath(scenario.id);
    const fallback = Utils.DEFAULT_SCENARIO_COVER;

       // プロフィール（columns）
    const infoRows = [
      ["タイトル", scenario.title],
      ["システム", scenario.system],
      ["作者", scenario.author],
      ["基本情報", scenario.notes],
    ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");

    // このシナリオのrunだけ
    const relatedRuns = (Array.isArray(runs) ? runs : []).filter(
      r => r?.scenario_id === id
    );

    const planningRuns = relatedRuns.filter(r => r?.status === "planning");
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

    // 並び替え（元コード完全踏襲）
    activeRuns.sort((a, b) => {
      const an = nextByRunId.get(a.id)?._start?.getTime() ?? Infinity;
      const bn = nextByRunId.get(b.id)?._start?.getTime() ?? Infinity;
      return an - bn;
    });
    planningRuns.sort((a, b) => {
      const an = nextByRunId.get(a.id)?._start?.getTime() ?? Infinity;
      const bn = nextByRunId.get(b.id)?._start?.getTime() ?? Infinity;
      return an - bn;
    });
    doneRuns.sort((a, b) => {
      const an = nextByRunId.get(a.id)?._start?.getTime() ?? Infinity;
      const bn = nextByRunId.get(b.id)?._start?.getTime() ?? Infinity;
      return an - bn;
    });

    // ===== 通過キャラクター（追加部分） =====
    const charactersById = new Map(
      (Array.isArray(characters) ? characters : []).map(c => [c.id, c])
    );

    const passedCharacters = (Array.isArray(characterIds) ? characterIds : [])
    .map(row => {
      // APIから返る行データ(row)から character_id を抽出して Map から検索
      const id = row?.character_id; 
      return charactersById.get(id);
    })
    .filter(Boolean) // Mapに見つからなかった場合(null)を除外
    .sort((a, b) =>
      String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), "ja")
    );

    const passedCharactersHtml = passedCharacters.length
      ? `
        <div class="scenario-detail-characters">
          ${passedCharacters
            .map(c => {
              const name = Utils.escapeHtml(c.name ?? c.id);
              const img = Utils.getCharacterImagePath(c.id);
              const fallbackImg = Utils.DEFAULT_CHARACTER_IMAGE;
              return `
                <a class="character-chip" href="../character/detail.html?id=${encodeURIComponent(c.id)}">
                  <img
                    class="character-chip-icon" 
                    src="${img}"
                    onerror="this.onerror=null;this.src='${fallbackImg}';"
                    alt="${name}"
                    loading="lazy">
                  <span class="character-chip-name">${name}</span>
                </a>
              `;
            })
            .join("")}
        </div>
      `
      : `<p class="scenario-detail-muted"><small>通過キャラクターはまだ登録されていません</small></p>`;

    // ===== 既存HTML（クラス名完全維持） =====
    root.innerHTML = `
      <header class="scenario-detail-header">
        <h1 class="scenario-detail-title">${Utils.escapeHtml(scenario.title ?? scenario.id)}</h1>
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
          <h2 class="scenario-detail-h2">シナリオ情報${editBtn}</h2>
          <div class="scenario-info-meta">
            ${scenario.title ? `<div><strong>タイトル:</strong> ${Utils.escapeHtml(scenario.title)}</div>` : ""}
            ${scenario.system ? `<div><strong>システム:</strong> ${Utils.escapeHtml(scenario.system)}</div>` : ""}
            ${scenario.author ? `<div><strong>作者:</strong> ${Utils.escapeHtml(scenario.author)}</div>` : ""}
          </div>
          <div class="scenario-base-info">
            ${scenario.notes ? `<div><strong>基本情報:</strong><br>${renderMultilineText(scenario.notes)}</div>` : ""}
          </div>
        </div>
      </section>

      <article class="scenario-detail-panel scenario-detail-intro-card">
        <h2 class="scenario-detail-h2">イントロダクション</h2>
        <p class="scenario-detail-desc">
        ${scenario.description ? `${renderMultilineText(scenario.description)}` : ""}
        </p>
      </article>

      <section class="scenario-detail-section">
        <h2 class="scenario-detail-h2">通過キャラクター</h2>
        ${passedCharactersHtml}
      </section>

      <section class="scenario-detail-runs">
        <h2 class="scenario-detail-h2">このシナリオのセッション（卓）</h2>

        <div class="scenario-detail-runs-split">
          <section class="scenario-detail-runs-block">
            <h3 class="scenario-detail-h3">進行中セッション</h3>
            ${activeRuns.length 
              ? `<div class="scenario-detail-runs-grid">
                  ${activeRuns.map(r => renderRunCard(r, "進行中", "active", nextByRunId)).join("")}
                </div>` 
              : `<p class="scenario-detail-muted"><small>進行中の卓はありません</small></p>`}
          </section>

          <section class="scenario-detail-runs-block">
            <h3 class="scenario-detail-h3">計画中セッション</h3>
            ${planningRuns.length 
              ? `<div class="scenario-detail-runs-grid">
                  ${planningRuns.map(r => renderRunCard(r, "計画中", "planning", nextByRunId)).join("")}
                </div>` 
              : `<p class="scenario-detail-muted"><small>計画中の卓はありません</small></p>`}
          </section>

          <section class="scenario-detail-runs-block">
            <h3 class="scenario-detail-h3">終了済セッション</h3>
            ${doneRuns.length 
              ? `<div class="scenario-detail-runs-grid">
                  ${doneRuns.map(r => renderRunCard(r, "終了済", "done", nextByRunId)).join("")}
                </div>` 
              : `<p class="scenario-detail-muted"><small>終了済の卓はありません</small></p>`}
          </section>
        </div>
      </section>
    `;
    document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'btn-open-scenario-edit') {
      const modal = document.getElementById('edit-scenario-modal');
      const form = document.getElementById('edit-scenario-form');
      
      if (!modal || !form) return;

      // フォームに現在の値をセット
      form.title.value = scenario.title || "";
      form.system.value = scenario.system || "";
      form.author.value = scenario.author || "";
      form.description.value = scenario.description || "";
      form.notes.value = scenario.notes || "";

      modal.style.display = 'block';
    }

    // キャンセルボタンまたはモーダル外クリックで閉じる
    if (e.target && e.target.id === 'btn-close-scenario-edit') {
      document.getElementById('edit-scenario-modal').style.display = 'none';
    }
    const modal = document.getElementById('edit-scenario-modal');
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  } catch (e) {
    console.error(e);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

document.getElementById('edit-scenario-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());

    if (!currentScenarioId) return;

    try {
        // Utils.apiPatch を使用して更新
        await Utils.apiPatch("scenarios", payload, `id=eq.${currentScenarioId}`);
        alert("シナリオ情報を更新しました");
        location.reload();
    } catch (err) {
        console.error(err);
        alert("更新に失敗しました: " + err.message);
    }
});

/**
 * セッション（卓）のカードを生成するヘルパー関数
 */
function renderRunCard(r, statusLabel, statusClass, nextByRunId) {
  const title = Utils.escapeHtml(r.title ?? r.id);
  const gm = Utils.escapeHtml(r.gm ?? "—");
  const players = Utils.escapeHtml((r.players ?? []).join(" / ") || "—");
  
  // 次回予定の取得と整形
  const next = nextByRunId.get(r.id);
  const nextText = next?._start
    ? `${next._start.toLocaleDateString("ja-JP")} ${next._start.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
    : null;

  return `
    <a href="../sessions/detail.html?id=${encodeURIComponent(r.id)}" class="scenario-detail-run-card-link">
      <article class="scenario-detail-run-card ${statusClass}">
        <div class="run-card-header">
          <h3 class="run-card-title">${title}</h3>
          <span class="run-status-badge">${statusLabel}</span>
        </div>
        <div class="run-card-body">
          <div class="run-meta-item"><strong>GM:</strong> ${gm}</div>
          <div class="run-meta-item"><strong>PL:</strong> ${players}</div>
          ${nextText ? `<div class="run-meta-item next"><strong>次回:</strong> ${Utils.escapeHtml(nextText)}</div>` : ""}
        </div>
        <div class="run-card-footer-info">
          <span>詳細を見る →</span>
        </div>
      </article>
    </a>
  `;
}

Utils.domReady(main);
