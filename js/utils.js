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

  // ---------- String / HTML ----------
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // ---------- Fetch ----------
  async function fetchJson(path) {
    let url = path;
  
    // data/*.json を Workers API に変換
    // 例: ../data/characters.json -> https://.../api/characters
    const m = String(path).match(/(?:^|\/)data\/([^\/]+)\.json$/);
    if (m) {
      const name = m[1]; // characters / scenarios / runs / sessions
      url = `${API_BASE}/api/${name}`;
    }
  
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed to fetch ${url} (${res.status}) ${text}`);
    }
    return res.json();
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
  // sessionsから runId ごとに「次回（未来scheduled最短）」と「最終（過去最新）」を作る
  function buildNextAndLastByRunId(sessions, now = new Date()) {
    const nextByRunId = new Map();
    const lastByRunId = new Map();

    for (const s of ensureArray(sessions)) {
      if (!s?.runId) continue;
      const d = toDate(s.start);
      if (!d) continue;

      // 最終：過去の最新
      if (d <= now) {
        const cur = lastByRunId.get(s.runId);
        if (!cur || d > cur._start) lastByRunId.set(s.runId, { ...s, _start: d });
      }

      // 次回：未来 scheduled の最短
      if (s.status === "scheduled" && d > now) {
        const cur = nextByRunId.get(s.runId);
        if (!cur || d < cur._start) nextByRunId.set(s.runId, { ...s, _start: d });
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
    getQueryParam,
    // String
    escapeHtml,
    // Fetch
    fetchJson,
    // Date
    toDate, formatDateTime, formatDate,
    // Collections
    ensureArray, indexById, groupBy,
    // Sessions
    buildNextAndLastByRunId, getRunScheduleLabel,
  });
})();

