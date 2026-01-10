(function () {
  const API_BASE = "https://fctzs-trpg.daruji65.workers.dev";

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function linkFor(c) {
    switch (c.target_type) {
      case "character":
        return `./character/detail.html?id=${encodeURIComponent(c.target_id)}`;
      case "scenario":
        return `./scenarios/detail.html?id=${encodeURIComponent(c.target_id)}`;
      case "session":
        return `./sessions/detail.html?id=${encodeURIComponent(c.target_id)}`;
      default:
        return "#";
    }
  }

  function labelFor(type) {
    if (type === "character") return "キャラクター";
    if (type === "scenario") return "シナリオ";
    if (type === "session") return "セッション";
    return "";
  }

  async function fetchRecent(limit = 10) {
    const res = await fetch(
      `${API_BASE}/api/comments/recent?limit=${limit}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("failed to load comments");
    return res.json();
  }

  async function mount(containerId) {
    const root = document.getElementById(containerId);
    if (!root) return;

    root.innerHTML = `<p>読み込み中…</p>`;

    try {
      const items = await fetchRecent(10);

      if (!items.length) {
        root.innerHTML = `<p class="muted">まだコメントはありません</p>`;
        return;
      }

      root.innerHTML = `
        <ul class="top-comments">
          ${items.map(c => `
            <li class="top-comments-item">
              <div class="top-comments-meta">
                <span class="top-comments-type">${labelFor(c.target_type)}</span>
                <a href="${linkFor(c)}" class="top-comments-link">
                  ${esc(c.author)}
                </a>
                <time>${new Date(c.created_at).toLocaleString()}</time>
              </div>
              <div class="top-comments-body">
                ${esc(c.body).replaceAll("\n", "<br>")}
              </div>
            </li>
          `).join("")}
        </ul>
      `;
    } catch (e) {
      root.innerHTML = `<p class="error">読み込みに失敗しました</p>`;
      console.error(e);
    }
  }

  window.TopComments = { mount };
})();
