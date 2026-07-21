"use strict";

// プレイヤー名簿（カード一覧＋検索）と詳細へのジャンプ導線を提供する。
(() => {

let allRosterPlayers = [];

function hasCustomPlayStyle(profile) {
  if (!profile) return false;
  const keys = [
    "desire_avatar",
    "desire_active",
    "desire_chaos",
    "desire_story",
    "desire_harmony",
    "desire_clear"
  ];
  return keys.some(k => profile[k] != null && profile[k] !== 3);
}

function styleSummary(profile) {
  if (!hasCustomPlayStyle(profile)) return "プレイスタイル未設定";
  const labels = [
    ["desire_avatar", "没入"],
    ["desire_active", "主体"],
    ["desire_chaos", "混沌"],
    ["desire_story", "物語"],
    ["desire_harmony", "調和"],
    ["desire_clear", "攻略"]
  ];
  const highs = labels
    .filter(([key]) => Number(profile[key]) >= 4)
    .map(([, label]) => label);
  if (highs.length === 0) return "バランス型";
  return `強み: ${highs.join("・")}`;
}

async function initPlayerOptions() {
  try {
    const [players, playerProfiles, characters] = await Promise.all([
      Utils.apiGet("players"),
      Utils.apiGet("player_profiles"),
      Utils.apiGet("characters").catch(() => [])
    ]);

    const charactersMap = new Map(
      (Array.isArray(characters) ? characters : []).map(c => [String(c.id), c])
    );
    const profilesById = new Map(
      (Array.isArray(playerProfiles) ? playerProfiles : []).map(p => [String(p.player_id), p])
    );

    const sortedPlayers = [...(Array.isArray(players) ? players : [])].sort((a, b) =>
      String(a.player_name || "").localeCompare(String(b.player_name || ""), "ja")
    );

    allRosterPlayers = sortedPlayers.map(player => {
      const profile = profilesById.get(String(player.player_id)) || {};
      const charObj = profile.icon_url
        ? charactersMap.get(String(profile.icon_url))
        : null;
      return {
        ...profile,
        ...player,
        icon_image_url: charObj ? charObj.image_url : null,
        _hasStyle: hasCustomPlayStyle(profile),
        _styleSummary: styleSummary(profile)
      };
    });

    const filterPlayer = document.getElementById("select-player");
    if (filterPlayer) {
      filterPlayer.innerHTML = '<option value="">ジャンプ（一覧から選択）</option>';
      allRosterPlayers.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.player_id;
        opt.textContent = p.player_name;
        filterPlayer.appendChild(opt);
      });
    }

    applyPlayerFilter();
  } catch (e) {
    console.error("プレイヤー名簿の読み込みに失敗しました", e);
    const root = document.getElementById("player-list");
    if (root) root.innerHTML = "<p>プレイヤー一覧の読み込みに失敗しました。</p>";
  }
}

function applyPlayerFilter() {
  const keyword = (document.getElementById("filter-player-keyword")?.value || "")
    .trim()
    .toLowerCase();
  const filtered = !keyword
    ? allRosterPlayers
    : allRosterPlayers.filter(p =>
        String(p.player_name || "").toLowerCase().includes(keyword)
      );
  renderPlayers(filtered);
}

function renderPlayers(players) {
  const root = document.getElementById("player-list");
  if (!root) return;

  root.innerHTML = "";
  const list = Array.isArray(players) ? players : [];

  if (list.length === 0) {
    root.innerHTML = "<p class=\"u-muted\">該当するプレイヤーがいません。</p>";
    return;
  }

  const grid = document.createElement("div");
  grid.className = "card-grid";
  root.appendChild(grid);

  for (const c of list) {
    const name = Utils.escapeHtml(c.player_name ?? "");
    const summary = Utils.escapeHtml(c._styleSummary || "プレイスタイル未設定");
    const imagePath = Utils.getCharacterImagePath(c.icon_url, c.icon_image_url);

    const cardLink = document.createElement("a");
    cardLink.href = `./detail.html?id=${encodeURIComponent(c.player_id)}`;
    cardLink.className = "player-card-wrapper";

    const card = document.createElement("article");
    card.className = "card player-roster-card";

    const canvasId = `radar-${c.player_id}`;
    card.innerHTML = `
      <div class="player-roster-card-inner">
        <img src="${imagePath}"
             onerror="this.onerror=null; this.src='${Utils.DEFAULT_CHARACTER_IMAGE}';"
             alt="${name}"
             class="player-roster-avatar">
        <h2 class="player-roster-name">${name}</h2>
        <p class="player-roster-summary u-muted">${summary}</p>
        ${c._hasStyle
          ? `<div class="player-roster-radar"><canvas id="${canvasId}"></canvas></div>`
          : `<p class="player-roster-placeholder u-muted">レーダー未設定</p>`}
      </div>
    `;

    cardLink.appendChild(card);
    grid.appendChild(cardLink);

    if (c._hasStyle) {
      Utils.renderRadarChart(c, canvasId);
    }
  }
}

async function getPlayerPage() {
  try {
    const playerVal = document.getElementById("select-player")?.value || "";
    if (!playerVal) {
      Utils.showToast("プレイヤーを選択してください", "error");
      return;
    }
    window.location.href = `./detail.html?id=${encodeURIComponent(playerVal)}`;
  } catch (err) {
    console.error(err);
  }
}

async function main() {
  await Utils.initAuthAndHeader("common-nav", "../");
  await initPlayerOptions();

  document.getElementById("select-button")?.addEventListener("click", getPlayerPage);
  document.getElementById("filter-player-keyword")?.addEventListener("input", applyPlayerFilter);
}

main();
})();
