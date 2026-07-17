"use strict";

// 全画面で共有するDOM・認証・API・表示整形・予定表処理を集約し、画面ごとの契約差を吸収する。
const API_BASE = "https://fctzs-trpg.daruji.workers.dev";
// 画像キーから共通URLを組み立て、未設定時だけローカル既定画像へフォールバックする。
const R2_PUBLIC_URL = "https://pub-b7f067c04745438680b7ed7adebbba6b.r2.dev";

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

  const DEFAULT_CHARACTER_IMAGE = (R2_PUBLIC_URL && R2_PUBLIC_URL !== "https://pub-xxxxxx.r2.dev")
    ? `${R2_PUBLIC_URL.endsWith('/') ? R2_PUBLIC_URL : R2_PUBLIC_URL + '/'}_default/character_default.png` // 後ほどアップロードフォルダ指定
    : assetPath("img/character/default.png");

  function getCharacterImagePath(id, imageUrlFromDb = null) {
    if (id && String(id).startsWith("http")) return id;
    if (imageUrlFromDb) return imageUrlFromDb;

    // キャラクターIDから数値を抽出（c-138 や 138 から 138 を抽出）
    const numMatch = String(id ?? "").match(/\d+/);
    if (numMatch) {
      const num = parseInt(numMatch[0], 10);
      if (num > 137) {
        // 137を超えるID（新しく登録されたキャラクター）で R2 画像がない場合は、最初からデフォルト画像を返す
        return DEFAULT_CHARACTER_IMAGE;
      }
    } else if (id && id !== "default" && id !== "barry" && id !== "kuon_karin1" && id !== "kuon_karin2") {
      // 既知の例外文字列以外で、数値が含まれない未知のIDの場合はデフォルト画像を返す
      return DEFAULT_CHARACTER_IMAGE;
    }

    return assetPath(`img/character/${encodeURIComponent(String(id))}.png`);
  }

  // シナリオの default.png が無いなら、存在している s-000.png を使うのがおすすめ
  const DEFAULT_SCENARIO_COVER = (R2_PUBLIC_URL && R2_PUBLIC_URL !== "https://pub-xxxxxx.r2.dev")
    ? `${R2_PUBLIC_URL.endsWith('/') ? R2_PUBLIC_URL : R2_PUBLIC_URL + '/'}_default/scenario_default.png`
    : assetPath("img/scenario/default.png");

  function getScenarioCoverPath(scenarioId, imageUrlFromDb = null) {
    if (scenarioId && String(scenarioId).startsWith("http")) return scenarioId;
    if (imageUrlFromDb) return imageUrlFromDb;

    // シナリオIDから数値を抽出（s-050 や 50 から 50 を抽出）
    const numMatch = String(scenarioId ?? "").match(/\d+/);
    if (numMatch) {
      const num = parseInt(numMatch[0], 10);
      if (num > 48) {
        // 48を超えるID（新しく登録されたシナリオ）で R2 画像がない場合は、最初からデフォルト画像を返す
        return DEFAULT_SCENARIO_COVER;
      }
    } else if (scenarioId && scenarioId !== "default" && scenarioId !== "unknown") {
      // 数値が含まれない未知のIDの場合もデフォルト画像を返す
      return DEFAULT_SCENARIO_COVER;
    }

    return assetPath(`img/scenario/${encodeURIComponent(String(scenarioId))}.png`);
  }

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

  // URLをリンク化する関数（http/https のみ許可し javascript: 等を拒否する）
  function renderLink(url, label) {
    const u = String(url ?? "").trim();
    if (!u) return "";
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      return escapeHtml(u);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return escapeHtml(u);
    }
    const safe = escapeHtml(parsed.href);
    const text = escapeHtml(label ?? u);
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  }

  /** img/src 等の属性へ入れるURLから危険な文字・スキームを除去する。 */
  function sanitizeUrlForAttr(url) {
    const u = String(url ?? "").trim();
    if (!u) return "";
    if (/["'<>`]/.test(u) || /^javascript:/i.test(u) || /^data:/i.test(u)) {
      return "";
    }
    return u;
  }

  // ---------- Scenario Trends ----------
  const TREND_TAG_DEFINITIONS = [
    ["trend_story_chaos", "story", "trend-story", "物語重視"],
    ["trend_story_chaos", "chaos", "trend-chaos", "混沌歓迎"],
    ["trend_avatar_clear", "avatar", "trend-avatar", "RP・没入"],
    ["trend_avatar_clear", "clear", "trend-clear", "攻略重視"],
    ["trend_harmony_active", "harmony", "trend-harmony", "協調重視"],
    ["trend_harmony_active", "active", "trend-active", "活躍推奨"]
  ];

  /**
   * シナリオ傾向タグを、既存画面と同じインライン余白で生成する。
   * 詳細画面だけ余白が広いため detailed オプションで差を維持する。
   */
  function getTrendTagsHtml(scenario, { detailed = false } = {}) {
    if (!scenario) return "";
    const tags = TREND_TAG_DEFINITIONS
      .filter(([field, value]) => scenario[field] === value)
      .map(([, , className, label]) => `<span class="trend-tag ${className}">${label}</span>`);
    if (tags.length === 0) return "";

    const gap = detailed ? 8 : 4;
    const margin = detailed ? 10 : 8;
    return `<div class="trend-tags-container" style="display: flex; gap: ${gap}px; flex-wrap: wrap; margin-top: ${margin}px; margin-bottom: ${margin}px;">${tags.join("")}</div>`;
  }

  /**
   * プレイヤーの欲求値4以上とシナリオ傾向が一致する軸数を返す。
   */
  function calculateMatchScore(scenario, profile) {
    if (!scenario || !profile) return 0;

    const axes = [
      ["trend_story_chaos", "story", "desire_story"],
      ["trend_story_chaos", "chaos", "desire_chaos"],
      ["trend_avatar_clear", "avatar", "desire_avatar"],
      ["trend_avatar_clear", "clear", "desire_clear"],
      ["trend_harmony_active", "harmony", "desire_harmony"],
      ["trend_harmony_active", "active", "desire_active"]
    ];
    return axes.filter(([trendField, trendValue, desireField]) => (
      scenario[trendField] === trendValue && [4, 5].includes(profile[desireField])
    )).length;
  }

  function getMatchPresentation(score) {
    const presentations = {
      3: { cardClass: "match-high", badgeHtml: '<div class="match-badge match-3">相性抜群！ ★★★</div>' },
      2: { cardClass: "match-medium", badgeHtml: '<div class="match-badge match-2">好相性！ ★★</div>' },
      1: { cardClass: "match-low", badgeHtml: '<div class="match-badge match-1">相性良！ ★</div>' }
    };
    return presentations[score] || { cardClass: "", badgeHtml: "" };
  }

  // ---------- Calendar ----------
  const CALENDAR_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const AVAILABILITY_SLOTS = ["afternoon", "night"];
  const AVAILABILITY_SLOT_LABELS = { afternoon: "昼", night: "夜" };

  function toCalendarDateString(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function getAvailabilityStatusSymbol(status) {
    return { ok: "○", maybe: "△", ng: "×" }[status] || "-";
  }

  function getCalendarEventDate(event) {
    if (!event) return null;
    if (!event.start) return event.date || event.target_date || null;

    const parsed = new Date(event.start);
    if (Number.isNaN(parsed.getTime())) {
      return typeof event.start === "string" ? event.start.slice(0, 10) : null;
    }
    return toCalendarDateString(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  /**
   * 月間カレンダーを共通形式で描画する
   * @param {HTMLElement} targetEl 描画先
   * @param {number} year 年
   * @param {number} month 月（0始まり）
   * @param {object} options events / availabilities / onDateClick など
   */
  function renderCalendar(targetEl, year, month, options = {}) {
    if (!(targetEl instanceof HTMLElement)) return;

    const events = Array.isArray(options.events) ? options.events : [];
    const availabilities = Array.isArray(options.availabilities) ? options.availabilities : [];
    const today = new Date();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startDayOfWeek = new Date(year, month, 1).getDay();
    const eventsByDate = new Map();
    const availabilitiesByDate = new Map();

    events.forEach(event => {
      const date = getCalendarEventDate(event);
      if (!date) return;
      if (!eventsByDate.has(date)) eventsByDate.set(date, []);
      eventsByDate.get(date).push(event);
    });

    availabilities.forEach(availability => {
      if (!availability?.target_date) return;
      if (!availabilitiesByDate.has(availability.target_date)) {
        availabilitiesByDate.set(availability.target_date, []);
      }
      availabilitiesByDate.get(availability.target_date).push(availability);
    });

    eventsByDate.forEach(dayEvents => {
      dayEvents.sort((a, b) => new Date(a.start || a.date) - new Date(b.start || b.date));
    });

    targetEl.classList.add("calendar-grid");
    targetEl.classList.toggle("calendar-grid--compact", Boolean(options.compact));
    targetEl.replaceChildren();

    CALENDAR_WEEKDAYS.forEach((weekday, index) => {
      const header = el("div", "calendar-day-header");
      if (index === 0) header.classList.add("sunday");
      if (index === 6) header.classList.add("saturday");
      header.textContent = weekday;
      targetEl.appendChild(header);
    });

    const appendEmptyCell = () => {
      const cell = el("div", "calendar-cell other-month");
      cell.setAttribute("aria-hidden", "true");
      targetEl.appendChild(cell);
    };

    for (let i = 0; i < startDayOfWeek; i++) appendEmptyCell();

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = toCalendarDateString(year, month, day);
      const dayEvents = eventsByDate.get(dateStr) || [];
      const dayAvailabilities = (availabilitiesByDate.get(dateStr) || [])
        .filter(availability => availability.status !== "none");
      const cell = el("div", "calendar-cell");

      if (
        year === today.getFullYear()
        && month === today.getMonth()
        && day === today.getDate()
      ) {
        cell.classList.add("today");
      }

      if (options.highlightMissingAvailability && dayAvailabilities.length === 0) {
        cell.classList.add("date-needs-input");
      }

      cell.dataset.date = dateStr;

      const numberEl = el("div", "calendar-date-number");
      numberEl.textContent = String(day);
      cell.appendChild(numberEl);

      if (dayAvailabilities.length > 0) {
        const availabilityList = el("div", "calendar-availability-list");
        AVAILABILITY_SLOTS.forEach(slot => {
          const availability = dayAvailabilities.find(item => item.time_slot === slot);
          if (!availability || !["ok", "maybe", "ng"].includes(availability.status)) return;

          const badge = el("span", `calendar-availability-badge status-${availability.status}`);
          badge.textContent = `${AVAILABILITY_SLOT_LABELS[slot]}${getAvailabilityStatusSymbol(availability.status)}`;
          availabilityList.appendChild(badge);
        });
        if (availabilityList.childElementCount > 0) cell.appendChild(availabilityList);
      }

      dayEvents.forEach(event => {
        const href = typeof options.getEventHref === "function"
          ? options.getEventHref(event)
          : null;
        const badge = el(href ? "a" : "div", "calendar-session-badge");
        if (href) badge.href = href;

        const start = new Date(event.start || event.date);
        const timeEl = el("div", "badge-time");
        timeEl.textContent = Number.isNaN(start.getTime())
          ? ""
          : start.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

        const titleEl = el("div", "badge-title");
        titleEl.textContent = typeof options.getEventTitle === "function"
          ? options.getEventTitle(event)
          : event.title || "名称未設定";

        badge.append(timeEl, titleEl);
        cell.appendChild(badge);
      });

      const context = {
        cell,
        year,
        month,
        day,
        dateStr,
        events: dayEvents,
        availabilities: dayAvailabilities
      };

      if (typeof options.onCellRender === "function") {
        options.onCellRender(cell, context);
      }

      if (typeof options.onDateClick === "function") {
        cell.classList.add("calendar-cell--clickable");
        cell.tabIndex = 0;
        cell.setAttribute("role", "button");
        cell.addEventListener("click", event => {
          if (event.target.closest("a, button")) return;
          options.onDateClick(dateStr, context);
        });
        cell.addEventListener("keydown", event => {
          if (event.target !== cell) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          options.onDateClick(dateStr, context);
        });
      }

      targetEl.appendChild(cell);
    }

    const remainingCells = (7 - ((startDayOfWeek + totalDays) % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) appendEmptyCell();
  }

  /**
   * 予定一括入力モーダル内の昼・夜グリッドを描画する
   */
  function renderAvailabilityGrid(targetEl, year, month, availabilities = []) {
    if (!(targetEl instanceof HTMLElement)) return;

    const totalDays = new Date(year, month + 1, 0).getDate();
    const existing = Array.isArray(availabilities) ? availabilities : [];
    targetEl.replaceChildren();

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = toCalendarDateString(year, month, day);
      const dayOfWeek = new Date(year, month, day).getDay();
      const row = el("div", "bulk-row");
      const dateLabel = el("div", "bulk-date");

      if (dayOfWeek === 0) dateLabel.classList.add("sunday");
      if (dayOfWeek === 6) dateLabel.classList.add("saturday");
      dateLabel.textContent = `${day}日(${CALENDAR_WEEKDAYS[dayOfWeek]})`;
      row.appendChild(dateLabel);

      AVAILABILITY_SLOTS.forEach(slot => {
        const wrapper = el("div", "bulk-slot");
        const toggle = el("div", "bulk-slot-toggle");
        const saved = existing.find(item => item.target_date === dateStr && item.time_slot === slot);
        const initialStatus = saved && saved.status !== "none" ? saved.status : "";

        toggle.dataset.date = dateStr;
        toggle.dataset.slot = slot;
        toggle.dataset.status = initialStatus;
        toggle.dataset.initial = initialStatus;
        toggle.textContent = getAvailabilityStatusSymbol(initialStatus);
        if (initialStatus) toggle.classList.add(`select-${initialStatus}`);

        toggle.addEventListener("click", () => {
          const statusOrder = ["", "ok", "maybe", "ng"];
          const currentIndex = statusOrder.indexOf(toggle.dataset.status);
          const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
          toggle.dataset.status = nextStatus;
          toggle.textContent = getAvailabilityStatusSymbol(nextStatus);
          toggle.className = "bulk-slot-toggle";
          if (nextStatus) toggle.classList.add(`select-${nextStatus}`);
        });

        wrapper.appendChild(toggle);
        row.appendChild(wrapper);
      });

      targetEl.appendChild(row);
    }
  }

  function collectAvailabilityChanges(targetEl, playerId) {
    if (!(targetEl instanceof HTMLElement) || !playerId) return [];

    return Array.from(targetEl.querySelectorAll(".bulk-slot-toggle"))
      .filter(toggle => toggle.dataset.status !== toggle.dataset.initial)
      .map(toggle => ({
        player_id: playerId,
        target_date: toggle.dataset.date,
        time_slot: toggle.dataset.slot,
        status: toggle.dataset.status || "none"
      }));
  }

  function getMonthDateRange(year, month) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
      start: toCalendarDateString(year, month, 1),
      end: toCalendarDateString(year, month, lastDay)
    };
  }

  async function fetchPlayerAvailabilities(playerId, year, month) {
    if (!playerId) return [];
    // 全期間取得を禁止し、カレンダー表示月だけを読み込む。
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      throw new Error("player_availabilityの取得にはyearとmonthが必要です");
    }
    const { start, end } = getMonthDateRange(year, month);
    const query = [
      "select=*",
      `player_id=eq.${encodeURIComponent(playerId)}`,
      `target_date=gte.${start}`,
      `target_date=lte.${end}`
    ].join("&");
    const data = await apiGet("player_availability", query);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Supabaseのログインユーザーとplayers/player_profilesを一度だけ紐付ける。
   */
  async function getCurrentUserPlayerContext({ players = null, loadProfile = true } = {}) {
    if (!window.supabase?.auth) return { session: null, player: null, profile: null };
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) return { session: null, player: null, profile: null };

    const playerList = Array.isArray(players) ? players : await getPlayers();
    const player = playerList.find(item => item.user_id === session.user.id) || null;
    if (!player || !loadProfile) return { session, player, profile: null };

    const profiles = await apiGet(
      "player_profiles",
      `player_id=eq.${encodeURIComponent(player.player_id)}`
    );
    const profile = (Array.isArray(profiles) ? profiles : [])
      .find(item => String(item.player_id) === String(player.player_id)) || null;
    return { session, player, profile };
  }

  // ---------- render ----------
  /**
   * 認証初期化と共通ナビゲーションの描画
   */
  async function initAuthAndHeader(targetId = 'common-nav', relativePath = '../') {
    const nav = document.getElementById(targetId);
    if (!nav) return;

    if (!window.supabase?.auth) {
      renderHeader(targetId, relativePath, null);
      return null;
    }

    let session = null;
    try {
      const result = await window.supabase.auth.getSession();
      session = result?.data?.session || null;
    } catch (err) {
      console.warn("ログイン状態の取得に失敗しました:", err);
    }
    renderHeader(targetId, relativePath, session);

    // Supabaseのセッション状態を監視
    window.supabase.auth.onAuthStateChange((event, session) => {
      renderHeader(targetId, relativePath, session);
    });

    return session;
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
    let html = links.map(link =>
      `<a href="${relativePath}${link.href}">${link.label}</a>`
    ).join(' | ');

    // ログイン・ユーザー情報の出し分け
    if (session) {
      const user = session.user.user_metadata;
      const avatar = user.avatar_url || "";
      const name = user.full_name || user.name || "User";

      html += ` <span class="user-nav-info" style="display: inline-flex; align-items: center; gap: 8px; margin-left: auto;">
        <img src="${escapeHtml(avatar)}" class="nav-avatar" title="${escapeHtml(name)}" style="margin: 0;">
        <button id="logout-btn" class="btn-small btn-secondary" style="font-size: 12px; padding: 4px 10px;">Logout</button>
      </span>`;
    } else {
      html += ` <button id="login-btn" class="btn-small btn-primary" style="margin-left: auto; font-size: 12px; padding: 6px 12px; border-radius: 20px;">Discord Login</button>`;
    }

    nav.innerHTML = html;

    // イベントリスナーの登録
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.onclick = loginWithDiscord;

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = logout;
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
  async function getSupabaseSession() {
    if (!window.supabase?.auth) return null;
    const result = await window.supabase.auth.getSession();
    return result?.data?.session || null;
  }

  async function requireAuthenticatedSession() {
    const session = await getSupabaseSession();
    if (!session?.access_token) {
      throw new Error("この操作にはDiscordログインが必要です。");
    }
    return session;
  }

  async function apiFetchJson(path, options = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
    const method = String(options.method || "GET").toUpperCase();
    const session = ["GET", "HEAD"].includes(method)
      ? await getSupabaseSession()
      : await requireAuthenticatedSession();

    // Workerが利用者単位の認可を引き継げるよう、取得済みトークンだけをAuthorizationへ加える。
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

  /**
   * 新APIが非2xxの時だけ旧APIへ切り替える。fallbackにはresource文字列または取得関数を渡せる。
   */
  async function apiGetWithFallback(primaryResource, ...fallbackResources) {
    try {
      return await (typeof primaryResource === "function"
        ? primaryResource()
        : apiGet(primaryResource));
    } catch (primaryError) {
      console.warn(`新API取得失敗のため旧APIへ切り替えます: ${String(primaryResource)}`, primaryError);
      let lastError = primaryError;
      for (const fallback of fallbackResources) {
        try {
          return await (typeof fallback === "function" ? fallback() : apiGet(fallback));
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    }
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

  async function apiUpload(formData) {
    const session = await requireAuthenticatedSession();
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: formData
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
  }

  function createLatestRequestToken() {
    let latest = 0;
    return Object.freeze({
      issue() {
        latest += 1;
        return latest;
      },
      isLatest(token) {
        return token === latest;
      }
    });
  }

  function aggregateScheduleMatches(rawRows, playerIds, year, month) {
    const ids = ensureArray(playerIds).map(String);
    const grouped = {};
    for (const row of ensureArray(rawRows)) {
      const key = `${row.target_date}_${row.time_slot}`;
      if (!grouped[key]) grouped[key] = {};
      grouped[key][String(row.player_id)] = {
        status: row.status,
        name: row.players?.player_name || row.player_id
      };
    }

    const results = {};
    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= lastDay; day++) {
      const date = toCalendarDateString(year, month, day);
      for (const slot of AVAILABILITY_SLOTS) {
        const key = `${date}_${slot}`;
        const players = Object.values(grouped[key] || {});
        const statuses = players.map(player => player.status);
        const missingCount = ids.length - players.length;
        if (statuses.includes("ng") || statuses.includes("none")) {
          results[key] = { color: "red", symbol: "×", label: "不可あり" };
        } else if (missingCount > 0) {
          results[key] = { color: "yellow", symbol: "△", label: `未入力: ${missingCount}人` };
        } else if (statuses.includes("maybe")) {
          const names = players.filter(player => player.status === "maybe").map(player => player.name);
          results[key] = { color: "yellow", symbol: "△", label: `△: ${names.join(", ")}` };
        } else if (statuses.length === ids.length && statuses.every(status => status === "ok")) {
          results[key] = { color: "green", symbol: "○", label: "全員空き" };
        } else {
          results[key] = { color: "red", symbol: "×", label: "不可" };
        }
      }
    }
    return results;
  }

  // プレイヤー本体と任意プロフィールの結合規則を各画面で重複させないための共通処理。

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
   * Worker経由で卓メンバー検証後に更新する。Supabase直書きは行わない。
   * @param {string|Date} sessionDate - セッションの開始日
   * @param {string[]} playerIds - 参加者のplayer_id配列
   * @param {string} runId - 対象卓ID
   */
  async function syncSchedulesForFullDay(sessionDate, playerIds, runId) {
    if (!playerIds || playerIds.length === 0) return;
    if (!runId) throw new Error("run_id が必要です");

    await apiPost("player_availability/session_block", {
      run_id: runId,
      session_date: sessionDate,
      player_ids: playerIds
    });
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

  // ---------- Toast Notification ----------
  function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // 強制リフロー
    toast.offsetHeight;

    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => {
        toast.remove();
        if (container.children.length === 0) {
          container.remove();
        }
      });
    }, 3000);
  }

  /**
   * 画像ファイルを長辺1000px程度にリサイズし、WebP形式に圧縮する
   * @param {File} file - 元の画像ファイル
   * @param {number} maxSide - 長辺の最大ピクセル数（デフォルト1000）
   * @param {number} quality - 圧縮品質 0.0 〜 1.0（デフォルト0.8）
   * @returns {Promise<Blob|File>} - 圧縮後のBlob、またはエラー時や画像以外は元のFile
   */
  function compressAndResizeImage(file, maxSide = 1000, quality = 0.8) {
    return new Promise((resolve) => {
      // 画像ファイル以外はそのまま返す
      if (!file || !file.type.startsWith("image/")) {
        resolve(file);
        return;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        let width = img.width;
        let height = img.height;

        // 長辺がmaxSideを超えている場合にアスペクト比を維持して縮小
        if (width > maxSide || height > maxSide) {
          if (width > height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // WebP形式で圧縮。対応していない場合はブラウザのデフォルト形式にフォールバックされる
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          "image/webp",
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };

      img.src = objectUrl;
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
    escapeHtml, renderMultilineText, renderLink, sanitizeUrlForAttr,
    // Scenario trends
    getTrendTagsHtml, calculateMatchScore, getMatchPresentation,
    // Render
    renderHeader, initAuthAndHeader, loginWithDiscord, logout,
    renderCalendar, renderAvailabilityGrid, collectAvailabilityChanges, getAvailabilityStatusSymbol,
    getMonthDateRange, fetchPlayerAvailabilities,
    // Fetch
    apiGet, apiGetWithFallback, apiPost, apiPatch, apiDelete, apiUpload,
    requireAuthenticatedSession, createLatestRequestToken,
    aggregateScheduleMatches,
    // Players (NEW)
    getPlayers, getPlayerName, setupPlayerSelect, getCurrentUserPlayerContext,
    // Date
    toDate, formatDateTime, formatDate,
    // Collections
    ensureArray, indexById, groupBy,
    // Sessions
    buildNextAndLastByRunId, getRunScheduleLabel, syncSchedulesForFullDay,
    // Charts
    renderRadarChart,
    // Toast
    showToast,
    // Image Upload helper
    compressAndResizeImage,
  });
})();
