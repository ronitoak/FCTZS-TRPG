"use strict";

let allScenarios = [];
let runCountByScenarioId = new Map();
let currentUserProfile = null;

function getTrendTagsHtml(scenario) {
  const tags = [];
  if (scenario.trend_story_chaos === 'story') tags.push('<span class="trend-tag trend-story">物語重視</span>');
  if (scenario.trend_story_chaos === 'chaos') tags.push('<span class="trend-tag trend-chaos">混沌歓迎</span>');
  if (scenario.trend_avatar_clear === 'avatar') tags.push('<span class="trend-tag trend-avatar">RP・没入</span>');
  if (scenario.trend_avatar_clear === 'clear') tags.push('<span class="trend-tag trend-clear">攻略重視</span>');
  if (scenario.trend_harmony_active === 'harmony') tags.push('<span class="trend-tag trend-harmony">協調重視</span>');
  if (scenario.trend_harmony_active === 'active') tags.push('<span class="trend-tag trend-active">活躍推奨</span>');
  
  if (tags.length === 0) return '';
  return `<div class="trend-tags-container" style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; margin-bottom: 8px;">${tags.join('')}</div>`;
}

// マッチ度（相性）スコアの計算 (0〜3)
function calculateMatchScore(scenario, profile) {
  if (!profile) return 0;
  let score = 0;

  // 物語(story) / 混沌(chaos)
  if (scenario.trend_story_chaos === 'story' && (profile.desire_story === 4 || profile.desire_story === 5)) score++;
  if (scenario.trend_story_chaos === 'chaos' && (profile.desire_chaos === 4 || profile.desire_chaos === 5)) score++;

  // RP・没入(avatar) / 攻略(clear)
  if (scenario.trend_avatar_clear === 'avatar' && (profile.desire_avatar === 4 || profile.desire_avatar === 5)) score++;
  if (scenario.trend_avatar_clear === 'clear' && (profile.desire_clear === 4 || profile.desire_clear === 5)) score++;

  // 協調(harmony) / 活躍(active)
  if (scenario.trend_harmony_active === 'harmony' && (profile.desire_harmony === 4 || profile.desire_harmony === 5)) score++;
  if (scenario.trend_harmony_active === 'active' && (profile.desire_active === 4 || profile.desire_active === 5)) score++;

  return score;
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
      const scoreA = calculateMatchScore(a, currentUserProfile);
      const scoreB = calculateMatchScore(b, currentUserProfile);
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
    let matchBadgeHtml = "";
    if (currentUserProfile) {
      const score = calculateMatchScore(s, currentUserProfile);
      if (score === 3) {
        card.classList.add("match-high");
        matchBadgeHtml = `<div class="match-badge match-3">相性抜群！ ★★★</div>`;
      } else if (score === 2) {
        card.classList.add("match-medium");
        matchBadgeHtml = `<div class="match-badge match-2">好相性！ ★★</div>`;
      } else if (score === 1) {
        card.classList.add("match-low");
        matchBadgeHtml = `<div class="match-badge match-1">相性良！ ★</div>`;
      }
    }

    card.innerHTML = `
      ${matchBadgeHtml}
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
      ${getTrendTagsHtml(s)}
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

  try {
    const [scenarios, runs] = await Promise.all([
      Utils.apiGet("scenario_list"),
      Utils.apiGet("runs"),
    ]);

    allScenarios = Array.isArray(scenarios) ? scenarios : [];

    // ログイン中のユーザー情報を取得し、対応するプレイヤープロフィールを取得
    if (window.supabase) {
      const { data: { session } } = await window.supabase.auth.getSession();
      if (session) {
        const uid = session.user.id;
        const [players, profiles] = await Promise.all([
          Utils.apiGet("players").catch(() => []),
          Utils.apiGet("player_profiles").catch(() => [])
        ]);

        const myPlayer = players.find(p => p.user_id === uid);
        if (myPlayer) {
          const profile = profiles.find(p => p.player_id === myPlayer.player_id);
          if (profile) {
            currentUserProfile = profile;
          }
        }
      }
    }

    // scenario_id -> run数
    runCountByScenarioId.clear();
    for (const r of (Array.isArray(runs) ? runs : [])) {
      if (!r?.scenario_id) continue;
      runCountByScenarioId.set(
        r.scenario_id,
        (runCountByScenarioId.get(r.scenario_id) ?? 0) + 1
      );
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