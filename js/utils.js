"use strict";

const API_BASE = "https://fctzs-trpg.daruji.workers.dev";

const statusMap = {
  active: "進行中",
  planning: "計画中",
  done: "終了済み",
};

const emotions = ["自己顕示(欲望)", "所有(欲望)", "本能(欲望)", "破壊(欲望)", "優越感(欲望)", "怠惰(欲望)", "逃避(欲望)", "好奇心(欲望)", "スリル(欲望)",
  "喜び(情念)", "怒り(情念)", "哀しみ(情念)", "幸福(情念)", "不安(情念)", "嫌悪(情念)", "恐怖(情念)", "嫉妬(情念)", "恨み(情念)",
  "正義(理想)", "崇拝(理想)", "善悪(理想)", "希望(理想)", "向上(理想)", "理性(理想)", "勝利(理想)", "秩序(理想)", "憧憬(理想)", "無我(理想)",
  "友情(関係)", "愛(関係)", "恋(関係)", "依存(関係)", "尊敬(関係)", "軽蔑(関係)", "庇護(関係)", "支配(関係)", "奉仕(関係)", "甘え(関係)",
  "後悔(傷)", "孤独(傷)", "諦観(傷)", "絶望(傷)", "否定(傷)", "疑念(傷)", "罪悪感(傷)", "狂気(傷)", "劣等感(傷)"];

(function () {
  // キャッシュ用変数
  let _playerCache = null;

  // ---------- DOM ----------
  function domReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  // ---------- URL ----------
  function getQueryParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function getBasePath() {
    // 例: /FCTZS-TRPG/character/index.html -> /FCTZS-TRPG
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.length > 0 ? `/${parts[0]}` : "";
  }

  function assetPath(rel) {
    const base = getBasePath();
    return `${base}/${rel}`.replace(/\/+/g, "/");
  }

  function getCharacterImagePath(id) {
    return assetPath(`img/character/${encodeURIComponent(String(id))}.png`);
  }

  const DEFAULT_CHARACTER_IMAGE = assetPath("img/character/default.png");

  function getScenarioCoverPath(scenarioId) {
    return assetPath(`img/scenario/${encodeURIComponent(String(scenarioId))}.png`);
  }

  // シナリオの default.png が無いなら、存在している s-000.png を使うのがおすすめ
  const DEFAULT_SCENARIO_COVER = assetPath("img/scenario/default.png");

  // ---------- String / HTML ----------
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // 改行を <br> に変換する関数
  function renderMultilineText(text) {
    const normalized = String(text ?? "")
      .replaceAll("\r\n", "\n")
      .replaceAll("\\n", "\n");
    const escaped = escapeHtml(normalized);
    return escaped.replaceAll("\n", "<br>");
  }

  // URLをリンク化する関数
  function renderLink(url, label) {
    const u = String(url ?? "").trim();
    if (!u) return "";
    const safe = escapeHtml(u);
    const text = escapeHtml(label ?? u);
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  }

  // ---------- render ----------
  /**
   * 認証初期化と共通ナビゲーションの描画
   */
  async function initAuthAndHeader(targetId = 'common-nav', relativePath = '../') {
    const nav = document.getElementById(targetId);
    if (!nav) return;

    // Supabaseのセッション状態を監視
    window.supabase.auth.onAuthStateChange((event, session) => {
      this.renderHeader(targetId, relativePath, session);
    });
  }

  /**
   * ヘッダーの描画（認証状態を反映）
   */
   function renderHeader(targetId, relativePath, session) {
    const nav = document.getElementById(targetId);
    if (!nav) return;

    const links = [
      { href: 'index.html', label: 'Home' },
      { href: 'character/index.html', label: 'Characters' },
      { href: 'sessions/index.html', label: 'Sessions' },
      { href: 'scenarios/index.html', label: 'Scenarios' },
      { href: 'schedule/index.html', label: 'Schedule' },
      { href: 'recruit/index.html', label: 'Recruit' },
      { href: 'player/index.html', label: 'Players' },
      { href: 'bbs/index.html', label: 'なりチャ' }
    ];

    const currentPath = window.location.pathname;
    let html = links.map(link => {
      const linkCategory = link.href.split('/')[0];
      let isActive = false;

      if (linkCategory === 'index.html') {
        // トップページ
        isActive = currentPath.endsWith('/') || currentPath.endsWith('/index.html') || currentPath === '';
      } else {
        // サブディレクトリ
        isActive = currentPath.includes(`/${linkCategory}/`);
      }

      const activeClass = isActive ? ' class="active"' : '';
      return `<a href="${relativePath}${link.href}"${activeClass}>${link.label}</a>`;
    }).join(' ');

    // ログイン・ユーザー情報の出し分け
    if (session) {
      const user = session.user.user_metadata;
      const avatar = user.avatar_url || "";
      const name = user.full_name || user.name || "User";
      
      html += ` <span class="user-nav-info" style="display: inline-flex; align-items: center; gap: 8px; margin-left: auto;">
        <img src="${avatar}" class="nav-avatar" title="${this.escapeHtml(name)}" style="margin: 0;">
        <button id="logout-btn" class="btn-small btn-secondary" style="font-size: 12px; padding: 4px 10px;">Logout</button>
      </span>`;
    } else {
      html += ` <button id="login-btn" class="btn-small btn-primary" style="margin-left: auto; font-size: 12px; padding: 6px 12px; border-radius: 20px;">Discord Login</button>`;
    }

    nav.innerHTML = html;

    // イベントリスナーの登録
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.onclick = () => this.loginWithDiscord();

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = () => this.logout();
  }

  /**
   * Discordログイン実行[cite: 12]
   */
   function loginWithDiscord() {
    const REDIRECT_URL = 'https://ronitoak.github.io/FCTZS-TRPG/';
    const projectID = 'bcmxaqrjpelpfxafrtqu';
    const authUrl = `https://${projectID}.supabase.co/auth/v1/authorize?provider=discord&redirect_to=${encodeURIComponent(REDIRECT_URL)}`;
    window.location.href = authUrl;
  }

  /**
   * ログアウト実行[cite: 12]
   */
  async function logout() {
    await window.supabase.auth.signOut();
    location.reload(); // 状態をリセットするためにリロード
  }

  // ---------- api ----------
  async function apiFetchJson(path, options = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

    // --- 修正：window.supabase から取得するように明示 ---
    if (!window.supabase) {
      console.error("Supabase client is not initialized.");
      // 未ログイン状態として処理を続行するか、エラーを投げる
    }
    
    const { data: { session } } = await window.supabase.auth.getSession();
    
    // 既存のヘッダー設定を維持しつつ、Authorizationを追加
    const headers = {
      ...options.headers,
      "Content-Type": "application/json",
    };

    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    // ----------------------------------------------

    const res = await fetch(url, { 
      cache: "no-store", 
      ...options,
      headers: headers // 組み立てたヘッダーを適用
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
  }

  async function apiGet(resource, query = "") {
    const q = query ? `?${query}` : "";
    return apiFetchJson(`/api/${resource}${q}`);
  }

  async function apiPost(resource, payload) {
    return apiFetchJson(`/api/${resource}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async function apiPatch(resource, payload, query = "") {
    const q = query ? `?${query}` : "";
    return apiFetchJson(`/api/${resource}${q}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async function apiDelete(resource, query = "") {
    const q = query ? `?${query}` : "";
    return apiFetchJson(`/api/${resource}${q}`, {
      method: "DELETE",
    });
  }

  // ---------- Players Helpers (新規追加) ----------
  
  /**
   * プレイヤー名簿をAPIから取得（キャッシュ付き）
   */
  async function getPlayers() {
    if (_playerCache) return _playerCache;
    try {
      const players = await apiGet("players");
      _playerCache = Array.isArray(players) ? players : [];
      return _playerCache;
    } catch (err) {
      console.error("名簿の取得に失敗しました:", err);
      return [];
    }
  }

  /**
   * プレイヤーIDから名前を引く
   */
  async function getPlayerName(id) {
    const players = await getPlayers();
    const p = players.find(it => it.player_id === id);
    return p ? p.player_name : "不明なPL";
  }

  /**
   * プレイヤー選択用の <select> 要素の中身（<option>群）を生成して流し込む
   * @param {HTMLSelectElement} selectEl - 対象のselect要素
   * @param {string} selectedId - 初期選択状態にするID（任意）
   */
  async function setupPlayerSelect(selectEl, selectedId = "") {
    if (!selectEl) return;
    const players = await getPlayers();
    
    selectEl.innerHTML = '<option value="">選択してください</option>';
    players.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.player_id;
      opt.textContent = p.player_name;
      if (p.player_id === selectedId) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  // ---------- Date / Collections / Sessions ----------
  // ---------- Date ----------
  function toDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDateTime(d) {
    return `${d.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    })} ${d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`;
  }

  function formatDate(d) {
    return d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  // ---------- Collections ----------
  function ensureArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function indexById(items) {
    const map = new Map();
    for (const it of ensureArray(items)) {
      if (it?.id) map.set(it.id, it);
    }
    return map;
  }

  function groupBy(items, keyFn) {
    const map = new Map();
    for (const it of ensureArray(items)) {
      const k = keyFn(it);
      if (k == null) continue;
      const arr = map.get(k) ?? [];
      arr.push(it);
      map.set(k, arr);
    }
    return map;
  }

  // ---------- Sessions helpers ----------
  // sessionsから run_id ごとに「次回（未来scheduled最短）」と「最終（過去最新）」を作る
  function buildNextAndLastByRunId(sessions, now = new Date()) {
    const nextByRunId = new Map();
    const lastByRunId = new Map();

    for (const s of ensureArray(sessions)) {
      if (!s?.run_id) continue;
      const d = toDate(s.start);
      if (!d) continue;

      // 最終：過去の最新
      if (d <= now) {
        const cur = lastByRunId.get(s.run_id);
        if (!cur || d > cur._start) lastByRunId.set(s.run_id, { ...s, _start: d });
      }

      // 次回：未来 scheduled の最短
      if (s.status === "scheduled" && d > now) {
        const cur = nextByRunId.get(s.run_id);
        if (!cur || d < cur._start) nextByRunId.set(s.run_id, { ...s, _start: d });
      }
    }

    return { nextByRunId, lastByRunId };
  }

  // run.status が active/done の前提
  function getRunScheduleLabel(run, nextByRunId, lastByRunId) {
    if (run?.status === "active") {
      const next = nextByRunId.get(run.id);
      return next?._start ? `次回: ${formatDateTime(next._start)}` : "次回未定";
    }
    const last = lastByRunId.get(run.id);
    return last?._start ? `最終: ${formatDate(last._start)}` : "最終未記録";
  }

  /**
   * 指定した日の全時間帯スロットを 'ng' に更新する (TRPG用の一日占有処理)
   * @param {string|Date} sessionDate - セッションの開始日
   * @param {string[]} playerIds - 参加者のplayer_id配列
   */
  async function syncSchedulesForFullDay(sessionDate, playerIds) {
    if (!playerIds || playerIds.length === 0) return;

    const d = new Date(sessionDate);
    const targetDate = d.toLocaleDateString('sv-SE'); // YYYY-MM-DD形式
    
    const allSlots = ['afternoon', 'night']; //
    const updates = [];

    playerIds.forEach(pid => {
      allSlots.forEach(slot => {
        updates.push({
          player_id: pid,
          target_date: targetDate,
          time_slot: slot,
          status: 'ng', //
          raw_text: "System: Session Booked (Full Day)"
        });
      });
    });

    const { error } = await window.supabase
      .from('player_availability')
      .upsert(updates, { onConflict: 'player_id,target_date,time_slot' }); //

    if (error) throw error;
  }

  // ---------- Charts (NEW) ----------
  function renderRadarChart(playerData, canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const data = [
      playerData.desire_story || 3,
      playerData.desire_avatar || 3,
      playerData.desire_harmony || 3,
      playerData.desire_chaos || 3,
      playerData.desire_clear || 3,
      playerData.desire_active || 3
    ];

    // ※ Chart.js が読み込まれているかチェック
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js is not loaded.");
        return;
    }

    new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['📖 物語欲', '🎭 化身欲', '🤝 協調欲', '🌪 混沌欲', '🧩 攻略欲', '✨ 活躍欲'],
        datasets: [{
          label: 'プレイスタイル傾向',
          data: data,
          backgroundColor: 'rgba(66, 153, 225, 0.2)',
          borderColor: 'rgba(66, 153, 225, 1)',
          pointBackgroundColor: 'rgba(66, 153, 225, 1)',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgba(66, 153, 225, 1)'
        }]
      },
      options: {
        scales: {
          r: { min: 0, max: 5, ticks: { stepSize: 1, display: false }, pointLabels: { font: { size: 11, weight: 'bold' } } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // ---------- Export ----------
  window.Utils = Object.freeze({
    // Constants
    statusMap, emotions,
    // DOM
    domReady, $, el,
    // URL
    getQueryParam, getBasePath, assetPath, getCharacterImagePath, getScenarioCoverPath,
    DEFAULT_CHARACTER_IMAGE, DEFAULT_SCENARIO_COVER,
    // String 
    escapeHtml, renderMultilineText, renderLink,
    // Render
    renderHeader, initAuthAndHeader, loginWithDiscord, logout,
    // Fetch
    apiGet, apiPost, apiPatch, apiDelete,
    // Players (NEW)
    getPlayers, getPlayerName, setupPlayerSelect,
    // Date
    toDate, formatDateTime, formatDate,
    // Collections
    ensureArray, indexById, groupBy,
    // Sessions
    buildNextAndLastByRunId, getRunScheduleLabel, syncSchedulesForFullDay,
    // Charts
    renderRadarChart,
  });
})();