"use strict";

let currentScenarioId = null;

function getTrendTagsHtml(scenario) {
  const tags = [];
  if (scenario.trend_story_chaos === 'story') tags.push('<span class="trend-tag trend-story">物語重視</span>');
  if (scenario.trend_story_chaos === 'chaos') tags.push('<span class="trend-tag trend-chaos">混沌歓迎</span>');
  if (scenario.trend_avatar_clear === 'avatar') tags.push('<span class="trend-tag trend-avatar">化身・没入</span>');
  if (scenario.trend_avatar_clear === 'clear') tags.push('<span class="trend-tag trend-clear">攻略重視</span>');
  if (scenario.trend_harmony_active === 'harmony') tags.push('<span class="trend-tag trend-harmony">協調重視</span>');
  if (scenario.trend_harmony_active === 'active') tags.push('<span class="trend-tag trend-active">活躍推奨</span>');
  
  if (tags.length === 0) return '';
  return `<div class="trend-tags-container" style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; margin-bottom: 10px;">${tags.join('')}</div>`;
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
    // ★修正: players（プレイヤーマスタ）も取得して名前解決に使う
    const [scenarios, runs, sessions, characters, characterIds, playersData] = await Promise.all([
      Utils.apiGet("scenarios"),
      Utils.apiGet("runs"),
      Utils.apiGet("sessions"),
      Utils.apiGet("characters").catch(() => []),
      Utils.apiGet(`character_scenarios?scenario_id=${encodeURIComponent(id)}`).catch(() => []),
      Utils.apiGet("players").catch(() => []) 
    ]);

    // ★修正: プレイヤー情報のID/名前解決用マップを作成
    const playerMapById = new Map();
    const playerMapByName = new Map();
    if (Array.isArray(playersData)) {
        playersData.forEach(p => {
            playerMapById.set(p.player_id, p);
            playerMapByName.set(p.player_name, p);
        });
    }

    const editBtn = `<button id="btn-open-scenario-edit" class="btn-secondary btn-edit-small">📝</button>`;
    // 厳密な型比較(===)による不一致を防ぐため、文字列にキャストして比較
    const scenario = (Array.isArray(scenarios) ? scenarios : []).find(s => String(s.id) === String(id));
    if (!scenario) {
      root.innerHTML = "<p>シナリオが見つかりません</p>";
      return;
    }

    currentScenarioId = scenario.id; 

    const coverPath = Utils.getScenarioCoverPath(scenario.id, scenario.image_url);
    const fallback = Utils.DEFAULT_SCENARIO_COVER;

    const infoRows = [
      ["タイトル", scenario.title],
      ["システム", scenario.system],
      ["作者", scenario.author],
      ["基本情報", scenario.notes],
    ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");

    const relatedRuns = (Array.isArray(runs) ? runs : []).filter(
      r => r?.scenario_id === id
    );

    const planningRuns = relatedRuns.filter(r => r?.status === "planning");
    const activeRuns = relatedRuns.filter(r => r?.status === "active");
    const doneRuns = relatedRuns.filter(r => r?.status === "done");

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

    // ===== 通過キャラクター =====
    const charactersById = new Map(
      (Array.isArray(characters) ? characters : []).map(c => [c.id, c])
    );

    // 一元化により自動生成された character_scenarios から取得
    let passedCharIds = (Array.isArray(characterIds) ? characterIds : [])
      .map(row => row?.character_id)
      .filter(Boolean);
    
    // ★追加: もし未同期の古いデータがあれば、「終了済(done)」の卓情報から自動でかき集めるフォールバック処理
    if (passedCharIds.length === 0) {
        const doneRunCharIds = doneRuns.flatMap(r => Array.isArray(r.characters) ? r.characters : []);
        passedCharIds = [...new Set(doneRunCharIds)];
    }

    const passedCharacters = passedCharIds
      .map(id => charactersById.get(id))
      .filter(Boolean)
      .sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), "ja"));

    const passedCharactersHtml = passedCharacters.length
      ? `
        <div class="scenario-detail-characters">
          ${passedCharacters
            .map(c => {
              const name = Utils.escapeHtml(c.name ?? c.id);
              const img = Utils.getCharacterImagePath(c.id, c.image_url);
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

    // ★修正: renderRunCardにプレイヤーマップを渡す
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
          ${getTrendTagsHtml(scenario)}
          <div class="scenario-base-info">
            ${scenario.notes ? `<div><strong>基本情報:</strong><br>${Utils.renderMultilineText(scenario.notes)}</div>` : ""}
          </div>
        </div>
      </section>

      <article class="scenario-detail-panel scenario-detail-intro-card">
        <h2 class="scenario-detail-h2">イントロダクション</h2>
        <p class="scenario-detail-desc">
        ${scenario.description ? `${Utils.renderMultilineText(scenario.description)}` : ""}
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
                  ${activeRuns.map(r => renderRunCard(r, "進行中", "active", nextByRunId, playerMapById, playerMapByName)).join("")}
                </div>` 
              : `<p class="scenario-detail-muted"><small>進行中の卓はありません</small></p>`}
          </section>

          <section class="scenario-detail-runs-block">
            <h3 class="scenario-detail-h3">計画中セッション</h3>
            ${planningRuns.length 
              ? `<div class="scenario-detail-runs-grid">
                  ${planningRuns.map(r => renderRunCard(r, "計画中", "planning", nextByRunId, playerMapById, playerMapByName)).join("")}
                </div>` 
              : `<p class="scenario-detail-muted"><small>計画中の卓はありません</small></p>`}
          </section>

          <section class="scenario-detail-runs-block">
            <h3 class="scenario-detail-h3">終了済セッション</h3>
            ${doneRuns.length 
              ? `<div class="scenario-detail-runs-grid">
                  ${doneRuns.map(r => renderRunCard(r, "終了済", "done", nextByRunId, playerMapById, playerMapByName)).join("")}
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

        form.title.value = scenario.title || "";
        form.system.value = scenario.system || "";
        form.author.value = scenario.author || "";
        form.description.value = scenario.description || "";
        form.notes.value = scenario.notes || "";

        const setRadioValue = (name, val) => {
          const radios = form.querySelectorAll(`input[name="${name}"]`);
          radios.forEach(r => {
            r.checked = (r.value === (val || ""));
          });
        };
        setRadioValue("trend_story_chaos", scenario.trend_story_chaos);
        setRadioValue("trend_avatar_clear", scenario.trend_avatar_clear);
        setRadioValue("trend_harmony_active", scenario.trend_harmony_active);

        modal?.showModal();
      }

      if (e.target && e.target.id === 'btn-close-scenario-edit') {
        document.getElementById('edit-scenario-modal')?.close();
      }
      const modal = document.getElementById('edit-scenario-modal');
      if (e.target === modal) {
        modal?.close();
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
    
    const payload = {
        title: fd.get("title"),
        system: fd.get("system"),
        author: fd.get("author") || null,
        description: fd.get("description") || null,
        notes: fd.get("notes") || null,
        trend_story_chaos: fd.get("trend_story_chaos") || null,
        trend_avatar_clear: fd.get("trend_avatar_clear") || null,
        trend_harmony_active: fd.get("trend_harmony_active") || null
    };

    const fileInput = e.target.querySelector('input[name="image_file"]');
    if (fileInput && fileInput.files[0]) {
        try {
            const originalFile = fileInput.files[0];
            const compressedBlob = await Utils.compressAndResizeImage(originalFile);

            const formData = new FormData();
            const fileBaseName = originalFile.name.includes('.') 
                ? originalFile.name.substring(0, originalFile.name.lastIndexOf('.')) 
                : originalFile.name;
            const fileName = `${fileBaseName}.webp`;

            formData.append("file", compressedBlob, fileName);
            formData.append("type", "scenario");
            
            const uploadRes = await fetch(`${API_BASE}/api/upload`, {
                method: "POST",
                body: formData
            });
            if (uploadRes.ok) {
                const uploadResult = await uploadRes.json();
                payload.image_url = uploadResult.url;
            } else {
                console.error("画像アップロード失敗:", await uploadRes.text());
            }
        } catch (err) {
            console.error("画像アップロードエラー:", err);
        }
    }

    if (!currentScenarioId) return;

    try {
        await Utils.apiPatch("scenarios", payload, `id=eq.${currentScenarioId}`);
        alert("シナリオ情報を更新しました");
        location.reload();
    } catch (err) {
        console.error(err);
        alert("更新に失敗しました: " + err.message);
    }
});

// ★修正: playerMapを引数で受け取り、名前解決を行う
function renderRunCard(r, statusLabel, statusClass, nextByRunId, playerMapById, playerMapByName) {
  const title = Utils.escapeHtml(r.title ?? r.id);
  
  // ★GMの解決
  const gmObj = playerMapById.get(r.gm_id) || playerMapByName.get(r.gm);
  const gmName = gmObj ? gmObj.player_name : (r.gm || '—');
  const gm = Utils.escapeHtml(gmName);
  
  // ★PLの解決
  const targetPlayers = (Array.isArray(r.player_ids) && r.player_ids.length > 0) ? r.player_ids : (Array.isArray(r.players) ? r.players : []);
  const resolvedPlayers = targetPlayers.map(identifier => {
      const pObj = playerMapById.get(identifier) || playerMapByName.get(identifier);
      return pObj ? pObj.player_name : identifier;
  });
  const players = Utils.escapeHtml(resolvedPlayers.length > 0 ? resolvedPlayers.join(" / ") : "—");
  
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