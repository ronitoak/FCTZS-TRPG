"use strict";

// 共有の変更履歴データを、トップの最新件数表示と専用ページの全履歴表示へ描き分ける。
(() => {
  const TYPE_META = {
    release: { label: "リリース", className: "release" },
    feature: { label: "機能追加", className: "feature" },
    improvement: { label: "改善", className: "improvement" },
    fix: { label: "不具合修正", className: "fix" }
  };

  function getNotes() {
    return Array.isArray(window.PATCH_NOTES) ? window.PATCH_NOTES : [];
  }

  function formatDate(date) {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(parsed);
  }

  function createTypeBadge(type) {
    const meta = TYPE_META[type] || TYPE_META.improvement;
    const badge = document.createElement("span");
    badge.className = `patch-note-type patch-note-type--${meta.className}`;
    badge.textContent = meta.label;
    return badge;
  }

  function createDateElement(date, className) {
    const time = document.createElement("time");
    time.className = className;
    time.dateTime = date;
    time.textContent = formatDate(date);
    return time;
  }

  function renderSummary(root, notes) {
    const limit = Number.parseInt(root.dataset.limit || "5", 10);
    const list = document.createElement("ul");
    list.className = "patch-notes-summary";

    notes.slice(0, Number.isFinite(limit) ? limit : 5).forEach(note => {
      const item = document.createElement("li");
      item.className = "patch-note-summary-item";

      const meta = document.createElement("div");
      meta.className = "patch-note-summary-meta";
      meta.append(createTypeBadge(note.type), createDateElement(note.date, "patch-note-date"));

      const title = document.createElement("strong");
      title.className = "patch-note-title";
      title.textContent = note.title;

      const detail = document.createElement("small");
      detail.className = "patch-note-detail";
      detail.textContent = note.detail;

      item.append(meta, title, detail);
      list.appendChild(item);
    });

    root.replaceChildren(list);
  }

  function renderFullHistory(root, notes) {
    const groups = new Map();
    notes.forEach(note => {
      if (!groups.has(note.date)) groups.set(note.date, []);
      groups.get(note.date).push(note);
    });

    const fragment = document.createDocumentFragment();
    groups.forEach((dailyNotes, date) => {
      const section = document.createElement("section");
      section.className = "patch-notes-day";
      section.setAttribute("aria-labelledby", `patch-notes-${date}`);

      const heading = document.createElement("h2");
      heading.id = `patch-notes-${date}`;
      heading.className = "patch-notes-day-title";
      heading.appendChild(createDateElement(date, "patch-notes-day-date"));

      const list = document.createElement("div");
      list.className = "patch-notes-list";

      dailyNotes.forEach(note => {
        const article = document.createElement("article");
        article.className = `patch-note-card patch-note-card--${TYPE_META[note.type]?.className || "improvement"}`;

        const header = document.createElement("div");
        header.className = "patch-note-card-header";

        const title = document.createElement("h3");
        title.className = "patch-note-card-title";
        title.textContent = note.title;

        const detail = document.createElement("p");
        detail.className = "patch-note-card-detail";
        detail.textContent = note.detail;

        header.append(createTypeBadge(note.type), title);
        article.append(header, detail);
        list.appendChild(article);
      });

      section.append(heading, list);
      fragment.appendChild(section);
    });

    root.replaceChildren(fragment);
  }

  async function init() {
    const roots = document.querySelectorAll("[data-patch-notes-view]");
    if (roots.length === 0) return;

    const fullPageRoot = document.querySelector('[data-patch-notes-view="full"]');
    if (fullPageRoot && window.Utils) {
      try {
        await Utils.initAuthAndHeader("common-nav", "../");
      } catch (err) {
        console.warn("共通ナビゲーションの初期化に失敗しました:", err);
      }
    }

    const notes = getNotes();
    roots.forEach(root => {
      if (notes.length === 0) {
        root.innerHTML = '<p class="u-muted">パッチノートはまだありません。</p>';
        return;
      }

      if (root.dataset.patchNotesView === "full") {
        renderFullHistory(root, notes);
      } else {
        renderSummary(root, notes);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
