"use strict";

const API_BASE = "https://fctzs-trpg.daruji65.workers.dev";

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
  const DEFAULT_SCENARIO_COVER = assetPath("img/scenario/s-000.png");

  // ---------- String / HTML ----------
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // ---------- api ----------
  async function apiFetchJson(path, options = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

    const res = await fetch(url, { cache: "no-store", ...options });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`${res.status} ${text}`);
    return text ? JSON.parse(text) : null; // comments.jsの挙動互換
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

  // js/Utils.js
  async function apiPatch(resource, payload, query = "") {
    const q = query ? `?${query}` : "";
    // /api/sessions?id=eq.xxx のような形で fetch される
    return apiFetchJson(`/api/${resource}${q}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

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

  // ---------- Export ----------
  window.Utils = Object.freeze({
    // Constants
    statusMap,
    // DOM
    domReady, $, el,
    // URL
    getQueryParam, getBasePath, assetPath, getCharacterImagePath, getScenarioCoverPath,
    DEFAULT_CHARACTER_IMAGE, DEFAULT_SCENARIO_COVER,
    // String
    escapeHtml,
    // Fetch
    apiGet, apiPost, apiPatch,
    // Date
    toDate, formatDateTime, formatDate,
    // Collections
    ensureArray, indexById, groupBy,
    // Sessions
    buildNextAndLastByRunId, getRunScheduleLabel,
  });
})();

