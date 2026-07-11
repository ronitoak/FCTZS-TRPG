(function () {

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
    if (type === "recruitment") return "募集";
    if (type === "player") return "プレイヤー";
    return "";
  }

  // ★ session は run_id を持つ前提なので、リンクも run 詳細（= 今の sessions/detail）へ
  function linkFor(c) {
    switch (c.target_type) {
      case "character":
        return `./character/detail.html?id=${encodeURIComponent(c.target_id)}`;
      case "scenario":
        return `./scenarios/detail.html?id=${encodeURIComponent(c.target_id)}`;
      case "session":
        return `./sessions/detail.html?id=${encodeURIComponent(c.target_id)}`; // target_id = run_id
      case "recruitment":
        return `./recruit/detail.html?id=${encodeURIComponent(c.target_id)}`;
      case "player":
        return `./player/detail.html?id=${encodeURIComponent(c.target_id)}`;
      default:
        return "#";
    }
  }

  async function fetchRecent(limit = 10) {
    return Utils.apiGet("comments/recent", `limit=${encodeURIComponent(limit)}`);
  }

  // ★ 追加：id→名前辞書を作る
async function fetchNameMaps() {
  const [characters, scenarios, runs, recruitments, players] = await Promise.all([
    Utils.apiGet("characters"),
    Utils.apiGet("scenarios"),
    Utils.apiGet("runs"),
    Utils.apiGet("recruitments").catch(() => []),
    Utils.apiGet("players").catch(() => []),
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

  const recruitmentMap = new Map();
  for (const r of recruitments || []) {
    if (r?.id) {
      const roleLabel = r.recruit_role === "GM" ? "GM募集" : "PL募集";
      const scenTitle = r.scenario_id ? (scenarioMap.get(String(r.scenario_id)) || "シナリオ") : "オリジナル";
      recruitmentMap.set(String(r.id), `${scenTitle}（${roleLabel}）`);
    }
  }

  const playerMap = new Map();
  for (const p of players || []) {
    if (p?.player_id) playerMap.set(String(p.player_id), String(p.player_name ?? p.player_id));
  }

  return { charMap, scenarioMap, runMap, recruitmentMap, playerMap };
}

  function resolveTargetName(c, maps) {
    const id = String(c.target_id ?? "");
    if (!id) return "";

    if (c.target_type === "character") return maps.charMap.get(id) || id;
    if (c.target_type === "scenario") return maps.scenarioMap.get(id) || id;

    // ★ session の target_id は run_id
    if (c.target_type === "session") return maps.runMap.get(id) || id;

    if (c.target_type === "recruitment") return maps.recruitmentMap.get(id) || id;
    if (c.target_type === "player") return maps.playerMap.get(id) || id;

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
