"use strict";

const API_BASE = "https://fctzs-trpg.daruji65.workers.dev";

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
    // DOM
    domReady, $, el,
    // URL
    getQueryParam, getBasePath, assetPath, getCharacterImagePath, getScenarioCoverPath,
    DEFAULT_CHARACTER_IMAGE, DEFAULT_SCENARIO_COVER,
    // String
    escapeHtml,
    // Fetch
    apiGet,
    // Date
    toDate, formatDateTime, formatDate,
    // Collections
    ensureArray, indexById, groupBy,
    // Sessions
    buildNextAndLastByRunId, getRunScheduleLabel,
  });
})();

