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

  function labelFor(type) {
    if (type === "character") return "キャラクター";
    if (type === "scenario") return "シナリオ";
    if (type === "session") return "セッション";
    return "";
  }

  // ★ session は runId を持つ前提なので、リンクも run 詳細（= 今の sessions/detail）へ
  function linkFor(c) {
    switch (c.target_type) {
      case "character":
        return `./character/detail.html?id=${encodeURIComponent(c.target_id)}`;
      case "scenario":
        return `./scenarios/detail.html?id=${encodeURIComponent(c.target_id)}`;
      case "session":
        return `./sessions/detail.html?id=${encodeURIComponent(c.target_id)}`; // target_id = runId
      default:
        return "#";
    }
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed: ${url} (${res.status}) ${text}`);
    }
    return res.json();
  }

  async function fetchRecent(limit = 10) {
    return fetchJson(`${API_BASE}/api/comments/recent?limit=${limit}`);
  }

  // ★ 追加：id→名前辞書を作る
  async function fetchNameMaps() {
    const [characters, scenarios, runs] = await Promise.all([
      fetchJson(`${API_BASE}/api/characters`),
      fetchJson(`${API_BASE}/api/scenarios`),
      fetchJson(`${API_BASE}/api/runs`),
    ]);

    const charMap = new Map();
    for (const c of characters || []) {
      if (c?.id) charMap.set(String(c.id), String(c.name ?? c.id));
    }

    const scenarioMap = new Map();
    for (const s of scenarios || []) {
      if (s?.id) scenarioMap.set(String(s.id), String(s.title ?? s.name ?? s.id));
    }

    const runMap = new Map();
    for (const r of runs || []) {
      if (r?.id) runMap.set(String(r.id), String(r.title ?? r.id));
    }

    return { charMap, scenarioMap, runMap };
  }

  function resolveTargetName(c, maps) {
    const id = String(c.target_id ?? "");
    if (!id) return "";

    if (c.target_type === "character") return maps.charMap.get(id) || id;
    if (c.target_type === "scenario") return maps.scenarioMap.get(id) || id;

    // ★ session の target_id は runId
    if (c.target_type === "session") return maps.runMap.get(id) || id;

    return id;
  }

  async function mount(containerId) {
    const root = document.getElementById(containerId);
    if (!root) return;

    root.innerHTML = `<p>読み込み中…</p>`;

    try {
      // ★ コメントと辞書を並列取得
      const [items, maps] = await Promise.all([
        fetchRecent(10),
        fetchNameMaps(),
      ]);

      if (!items?.length) {
        root.innerHTML = `<p class="muted">まだコメントはありません</p>`;
        return;
      }

      root.innerHTML = `
        <ul class="top-comments">
          ${items
            .map((c) => {
              const targetName = resolveTargetName(c, maps) || labelFor(c.target_type);
              const when = c.created_at ? new Date(c.created_at).toLocaleString() : "";

              return `
                <li class="top-comments-item">
                  <div class="top-comments-meta">
                    <a href="${linkFor(c)}" class="top-comments-target">
                      ${esc(targetName)}
                    </a>
                    <a href="${linkFor(c)}"  class="top-comments-author">${esc(c.author)}</a>
                    <time>${esc(when)}</time>
                  </div>
                  <div class="top-comments-body">
                    ${esc(c.body).replaceAll("\n", "<br>")}
                  </div>
                </li>
              `;
            })
            .join("")}
        </ul>
      `;
    } catch (e) {
      root.innerHTML = `<p class="error">読み込みに失敗しました</p>`;
      console.error(e);
    }
  }

  window.TopComments = { mount };
})();
