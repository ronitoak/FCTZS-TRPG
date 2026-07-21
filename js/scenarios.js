"use strict";

// シナリオ一覧の複合検索と利用者傾向との相性計算を行い、発見しやすい順でカード表示する。
(() => {

let allScenarios = [];
let runCountByScenarioId = new Map();
let currentUserProfile = null;

function normalizeExternalScenarios(raw) {
  let rows = raw;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map(item => {
      if (!item || typeof item !== "object") return null;
      const title = String(item.title || "").trim();
      if (!title) return null;
      return {
        title,
        system: String(item.system || "").trim(),
        note: String(item.note || "").trim()
      };
    })
    .filter(Boolean);
}

function buildExternalScenariosHtml(profiles, players) {
  const playerNameById = new Map(
    (Array.isArray(players) ? players : []).map(player => [
      String(player.player_id),
      String(player.player_name || player.player_id)
    ])
  );
  const rows = (Array.isArray(profiles) ? profiles : []).flatMap(profile => {
    const playerId = String(profile.player_id || "");
    const playerName = playerNameById.get(playerId) || playerId || "名前不明";
    return normalizeExternalScenarios(profile.external_passed_scenarios).map(scenario => ({
      ...scenario,
      playerName
    }));
  });

  rows.sort((a, b) => {
    const playerOrder = a.playerName.localeCompare(b.playerName, "ja");
    return playerOrder !== 0 ? playerOrder : a.title.localeCompare(b.title, "ja");
  });

  if (rows.length === 0) {
    return `<p class="u-muted" style="text-align: center;">部活外シナリオの登録はまだありません。</p>`;
  }

  return `
    <p class="u-muted" style="margin: 0 0 10px; font-size: 0.85rem;">全 ${rows.length} 件</p>
    <ul style="margin: 0; padding: 0; list-style: none;">
      ${rows.map(row => `
        <li style="padding: 8px 0; border-bottom: 1px solid #edf2f7;">
          <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px;">
            <span class="external-passed-badge">部活外</span>
            <strong>${Utils.escapeHtml(row.title)}</strong>
            ${row.system ? `<span style="font-size: 0.75rem; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${Utils.escapeHtml(row.system)}</span>` : ""}
          </div>
          <small class="u-muted" style="display: block; margin-top: 3px;">
            ${Utils.escapeHtml(row.playerName)}${row.note ? ` ／ ${Utils.escapeHtml(row.note)}` : ""}
          </small>
        </li>
      `).join("")}
    </ul>
  `;
}

function setupExternalScenariosModal() {
  const openButton = document.getElementById("btn-open-external-scenarios-modal");
  const closeButton = document.getElementById("close-external-scenarios-modal");
  const modal = document.getElementById("external-scenarios-modal");
  const list = document.getElementById("external-scenarios-list");
  if (!openButton || !modal || !list) return;

  openButton.addEventListener("click", async () => {
    list.innerHTML = "<p>読み込み中…</p>";
    modal.showModal();
    try {
      const [profiles, players] = await Promise.all([
        Utils.apiGet("player_profiles", "select=player_id,external_passed_scenarios"),
        Utils.apiGet("players", "select=player_id,player_name")
      ]);
      list.innerHTML = buildExternalScenariosHtml(profiles, players);
    } catch (error) {
      console.error("部活外シナリオ一覧の取得に失敗しました", error);
      list.innerHTML = `<p class="u-muted" style="text-align: center;">部活外シナリオの読み込みに失敗しました。</p>`;
    }
  });

  closeButton?.addEventListener("click", () => modal.close());
  modal.addEventListener("click", event => {
    if (event.target === modal) modal.close();
  });
}

function renderScenarios(scenarios) {
  const root = document.getElementById("scenarios-list");
  if (!root) return;
  root.innerHTML = "";

  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    root.innerHTML = "<p>該当するシナリオがありません</p>";
    return;
  }

  const grid = document.createElement("div");
  grid.className = "scenarios-grid";
  root.appendChild(grid);

  // マッチ度の高い順（相性スコア降順）にソートして並べることで、自分との相性が良いシナリオを見つけやすくする
  // 同スコアの場合はID順
  const displayScenarios = [...scenarios];
  if (currentUserProfile) {
    displayScenarios.sort((a, b) => {
      const scoreA = Utils.calculateMatchScore(a, currentUserProfile);
      const scoreB = Utils.calculateMatchScore(b, currentUserProfile);
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return String(a.id).localeCompare(String(b.id));
    });
  }

  for (const s of displayScenarios) {
    const coverPath = Utils.getScenarioCoverPath(s.id, s.image_url);
    const fallback = Utils.DEFAULT_SCENARIO_COVER;
    const title = Utils.escapeHtml(s.title ?? s.id ?? "（無題）");
    const system = Utils.escapeHtml(s.system ?? "");
    const runsCount = runCountByScenarioId.get(s.id) ?? 0;

    // プレイ人数
    const minPlayers = s.min_players ?? 1;
    const maxPlayers = s.max_players ?? 4;
    // プレイ時間
    const playTimeStr = s.play_time_minutes ? `${s.play_time_minutes}分 (約${Math.round(s.play_time_minutes / 60 * 10) / 10}時間)` : "未設定";
    // ロスト率
    const lostRateLabel = s.lost_rate === 'high' ? '高' : (s.lost_rate === 'mid' ? '中' : '低');

    const card = document.createElement("article");
    card.className = "scenarios-card";

    // マッチ判定とクラス付与
    const match = Utils.getMatchPresentation(
      Utils.calculateMatchScore(s, currentUserProfile)
    );
    if (match.cardClass) card.classList.add(match.cardClass);

    card.innerHTML = `
      ${match.badgeHtml}
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
      ${Utils.getTrendTagsHtml(s)}
      <div class="scenarios-meta">
        ${system ? `<div>System: ${system}</div>` : ""}
        <div>Players: ${minPlayers}〜${maxPlayers}人</div>
        <div>Time: ${playTimeStr}</div>
        <div>Lost: ${lostRateLabel}</div>
        <div>Runs: ${runsCount}</div>
      </div>
    `;

    grid.appendChild(card);
  }
}

function applyFilters() {
  const keyword = document.getElementById("filter-keyword").value.trim().toLowerCase();
  const systemVal = document.getElementById("filter-system").value;

  const targetPlayersVal = document.getElementById("filter-target-players").value;
  const playTimeVal = document.getElementById("filter-play-time").value;

  const targetPlayers = targetPlayersVal ? parseInt(targetPlayersVal, 10) : null;
  const maxPlayTime = playTimeVal ? parseInt(playTimeVal, 10) : null;

  // ロスト率（複数選択チェックボックス）
  const lostRateCheckboxes = document.querySelectorAll('input[name="filter-lost-rate"]:checked');
  const selectedLostRates = Array.from(lostRateCheckboxes).map(cb => cb.value);

  // トレンド（複数選択チェックボックス）
  const trendCheckboxes = document.querySelectorAll('input[name="filter-trend"]:checked');
  const selectedTrends = Array.from(trendCheckboxes).map(cb => cb.value);

  const filtered = allScenarios.filter(s => {
    // 1. キーワードフィルタ (タイトル、作者)
    if (keyword) {
      const title = (s.title ?? "").toLowerCase();
      const author = (s.author ?? "").toLowerCase();
      if (!title.includes(keyword) && !author.includes(keyword)) {
        return false;
      }
    }

    // 2. システムフィルタ
    if (systemVal && s.system !== systemVal) {
      return false;
    }

    // 3. プレイ人数フィルタ (指定された人数が min_players 〜 max_players の範囲内にあるか)
    if (targetPlayers !== null) {
      const sMin = s.min_players ?? 1;
      const sMax = s.max_players ?? 4;
      if (targetPlayers < sMin || targetPlayers > sMax) {
        return false;
      }
    }

    // 4. プレイ時間フィルタ (指定時間以下であるか)
    if (maxPlayTime !== null) {
      const sTime = s.play_time_minutes ?? 180;
      if (sTime > maxPlayTime) {
        return false;
      }
    }

    // 5. ロスト率フィルタ (選択されているロスト率のいずれかと一致。チェックなしなら全て表示)
    if (selectedLostRates.length > 0) {
      const sLost = s.lost_rate || 'low';
      if (!selectedLostRates.includes(sLost)) {
        return false;
      }
    }

    // 6. プレイスタイル傾向 (いずれかを含むOR検索、チェックなしなら全て表示)
    if (selectedTrends.length > 0) {
      const trendsOfScenario = [];
      if (s.trend_story_chaos) trendsOfScenario.push(s.trend_story_chaos);
      if (s.trend_avatar_clear) trendsOfScenario.push(s.trend_avatar_clear);
      if (s.trend_harmony_active) trendsOfScenario.push(s.trend_harmony_active);

      // 1つでも合致しているか確認
      const hasMatch = selectedTrends.some(t => trendsOfScenario.includes(t));
      if (!hasMatch) {
        return false;
      }
    }

    return true;
  });

  renderScenarios(filtered);
}

async function main() {
  await Utils.initAuthAndHeader('common-nav', '../');
  setupExternalScenariosModal();

  try {
    const result = await Utils.apiGet("scenario_summary");

    allScenarios = Array.isArray(result) ? result : [];

    // ログイン中のユーザー情報を取得し、対応するプレイヤープロフィールを取得
    const { profile } = await Utils.getCurrentUserPlayerContext().catch(() => ({ profile: null }));
    currentUserProfile = profile;

    // scenario_summary の run_count を表示用Mapへ移す。
    runCountByScenarioId.clear();
    for (const scenario of allScenarios) {
      runCountByScenarioId.set(scenario.id, Number(scenario.run_count) || 0);
    }

    // システム絞り込み用セレクトボックスの選択肢を動的に生成
    const systemSelect = document.getElementById("filter-system");
    if (systemSelect) {
      const uniqueSystems = [...new Set(allScenarios.map(s => s.system).filter(Boolean))].sort();
      uniqueSystems.forEach(sys => {
        const option = document.createElement("option");
        option.value = sys;
        option.textContent = sys;
        systemSelect.appendChild(option);
      });
    }

    // フィルタイベントリスナーの設定
    const filterKeyword = document.getElementById("filter-keyword");
    const filterSystem = document.getElementById("filter-system");
    const filterTargetPlayers = document.getElementById("filter-target-players");
    const filterPlayTime = document.getElementById("filter-play-time");

    if (filterKeyword) filterKeyword.addEventListener("input", applyFilters);
    if (filterSystem) filterSystem.addEventListener("change", applyFilters);
    if (filterTargetPlayers) filterTargetPlayers.addEventListener("input", applyFilters);
    if (filterPlayTime) filterPlayTime.addEventListener("change", applyFilters);

    // チェックボックス群のイベントリスナー設定
    document.querySelectorAll('input[name="filter-lost-rate"]').forEach(cb => {
      cb.addEventListener("change", applyFilters);
    });
    document.querySelectorAll('input[name="filter-trend"]').forEach(cb => {
      cb.addEventListener("change", applyFilters);
    });

    renderScenarios(allScenarios);

  } catch (err) {
    console.error(err);
    const root = document.getElementById("scenarios-list");
    if (root) root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

document.addEventListener("DOMContentLoaded", main);
})();