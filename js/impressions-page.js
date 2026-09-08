// 感想一覧ページ。フィードAPI＋シナリオ／投稿者フィルタ、投稿フォーム。
"use strict";

(function () {
  const params = new URLSearchParams(location.search);
  let scenarios = [];
  let players = [];
  let keepPostFormOpen = false;

  function formatBodyHtml(body, isSpoiler) {
    return Impressions.formatBodyHtml(body, isSpoiler);
  }

  function bindSpoilerButtons(root) {
    Impressions.bindSpoilerButtons(root);
  }

  function loginPromptHtml() {
    return Impressions.loginPromptHtml();
  }

  function syncPostDetailsOpen(forceOpen) {
    const details = document.getElementById("impressions-post-details");
    if (!details) return;
    if (forceOpen === true) {
      details.open = true;
      keepPostFormOpen = true;
      return;
    }
    details.open = keepPostFormOpen;
  }

  function rememberPostDetailsOpen() {
    const details = document.getElementById("impressions-post-details");
    keepPostFormOpen = Boolean(details?.open);
  }

  function readFilters() {
    return {
      scenario_id: document.getElementById("filter-scenario")?.value || "",
      author_player_id: document.getElementById("filter-author")?.value || ""
    };
  }

  function buildFeedQuery(filters) {
    const parts = ["limit=50"];
    if (filters.scenario_id) {
      parts.push(`scenario_id=${encodeURIComponent(filters.scenario_id)}`);
    }
    if (filters.author_player_id) {
      parts.push(`author_player_id=${encodeURIComponent(filters.author_player_id)}`);
    }
    return parts.join("&");
  }

  function fillSelect(selectEl, items, valueKey, labelKey, selectedValue) {
    if (!selectEl) return;
    const current = selectedValue != null ? String(selectedValue) : selectEl.value;
    const options = [`<option value="">すべて</option>`];
    for (const item of items) {
      const value = String(item[valueKey] ?? "");
      const label = String(item[labelKey] ?? value);
      options.push(
        `<option value="${Utils.escapeHtml(value)}">${Utils.escapeHtml(label)}</option>`
      );
    }
    selectEl.innerHTML = options.join("");
    if (current) selectEl.value = current;
  }

  async function loadFilterOptions() {
    const [scenarioRows, playerRows] = await Promise.all([
      Utils.apiGet("scenario_summary").catch(() =>
        Utils.apiGet("scenarios", "select=id,title&order=title.asc")
      ),
      Utils.apiGet("players", "select=player_id,player_name&order=player_name.asc")
    ]);
    scenarios = (Array.isArray(scenarioRows) ? scenarioRows : [])
      .slice()
      .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ja"));
    players = Array.isArray(playerRows) ? playerRows : [];

    fillSelect(
      document.getElementById("filter-scenario"),
      scenarios,
      "id",
      "title",
      params.get("scenario_id") || ""
    );
    fillSelect(
      document.getElementById("filter-author"),
      players,
      "player_id",
      "player_name",
      params.get("author_player_id") || ""
    );
  }

  async function loadRunsForScenario(scenarioId) {
    if (!scenarioId) return [];
    const rows = await Utils.apiGet(
      "runs",
      `scenario_id=${encodeURIComponent(scenarioId)}&select=id,title,status&order=updated_at.desc`
    );
    return Array.isArray(rows) ? rows : [];
  }

  function renderPostForm() {
    const root = document.getElementById("impressions-form-root");
    const msg = document.getElementById("impressions-form-msg");
    if (!root) return;

    const scenarioOptions = scenarios.map((s) =>
      `<option value="${Utils.escapeHtml(String(s.id))}">${Utils.escapeHtml(String(s.title || s.id))}</option>`
    ).join("");

    root.innerHTML = `
      <form class="impressions__form" id="impressions-page-form">
        <div class="impressions__row">
          <label for="post-scenario">シナリオ</label>
          <select id="post-scenario" name="scenario_id" required>
            <option value="">選択してください</option>
            ${scenarioOptions}
          </select>
        </div>
        <div class="impressions__row">
          <label for="post-run">対象の卓</label>
          <select id="post-run" name="run_id">
            <option value="">卓なし（部活外・シナリオ全体）</option>
          </select>
        </div>
        <div class="impressions__row">
          <label for="post-body">本文</label>
          <textarea id="post-body" name="body" maxlength="4000" rows="4" required placeholder="プレイの感想など"></textarea>
        </div>
        <label class="impressions__check">
          <input type="checkbox" name="is_spoiler" checked>
          <span>ネタバレを含む（クリックするまで本文を隠す）</span>
        </label>
        <button type="submit" class="btn-primary">感想を投稿</button>
      </form>`;

    const form = root.querySelector("form");
    const scenarioSelect = form.querySelector("#post-scenario");
    const runSelect = form.querySelector("#post-run");

    const preferredScenario = params.get("scenario_id") || "";
    if (preferredScenario) scenarioSelect.value = preferredScenario;

    async function refreshRuns() {
      const sid = scenarioSelect.value.trim();
      runSelect.innerHTML = `<option value="">卓なし（部活外・シナリオ全体）</option>`;
      if (!sid) return;
      try {
        const runs = await loadRunsForScenario(sid);
        for (const run of runs) {
          const opt = document.createElement("option");
          opt.value = run.id;
          opt.textContent = run.title || run.id;
          runSelect.appendChild(opt);
        }
      } catch (err) {
        console.warn("卓一覧の取得に失敗:", err);
      }
    }

    scenarioSelect.addEventListener("change", () => {
      refreshRuns();
    });
    refreshRuns();

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const scenarioId = form.scenario_id.value.trim();
      const runId = form.run_id.value.trim();
      const body = form.body.value.trim();
      if (!scenarioId) {
        msg.textContent = "シナリオを選んでください";
        return;
      }
      if (!body) {
        msg.textContent = "本文は必須です";
        return;
      }
      if (!form.is_spoiler.checked) {
        if (!confirm("ネタバレ無しとして投稿します。本当によろしいですか？")) return;
      }
      msg.textContent = "投稿中…";
      try {
        const payload = {
          body,
          is_spoiler: form.is_spoiler.checked
        };
        if (runId) {
          payload.run_id = runId;
        } else {
          payload.scenario_id = scenarioId;
        }
        await Utils.apiPost("impressions", payload);
        form.body.value = "";
        form.is_spoiler.checked = true;
        msg.textContent = "投稿しました";
        document.getElementById("filter-scenario").value = scenarioId;
        keepPostFormOpen = true;
        await refreshList();
      } catch (e) {
        msg.textContent = `投稿に失敗しました: ${e.message}`;
      }
    });
  }

  async function refreshList() {
    const list = document.getElementById("impressions-list");
    const msg = document.getElementById("impressions-list-msg");
    const formMsg = document.getElementById("impressions-form-msg");
    const formRoot = document.getElementById("impressions-form-root");
    if (!list || !msg) return;

    rememberPostDetailsOpen();
    msg.textContent = "読み込み中…";
    try {
      const session = (await window.supabase?.auth?.getSession())?.data?.session;
      if (!session) {
        formRoot.innerHTML = loginPromptHtml();
        list.innerHTML = "";
        msg.textContent = "";
        if (formMsg) formMsg.textContent = "";
        syncPostDetailsOpen();
        return;
      }

      const filters = readFilters();
      const data = await Utils.apiGet("impressions/feed", buildFeedQuery(filters));
      const items = Array.isArray(data?.items) ? data.items : [];

      renderPostForm();
      syncPostDetailsOpen();
      msg.textContent = items.length === 0
        ? "表示できる感想はありません（未通過シナリオの他者投稿は見えません）。"
        : "";

      list.innerHTML = "";
      if (items.length === 0) {
        list.innerHTML = `<li class="impressions__empty u-muted">まだ感想はありません</li>`;
        return;
      }

      for (const item of items) {
        const li = document.createElement("li");
        const when = item.created_at ? new Date(item.created_at).toLocaleString("ja-JP") : "";
        const scenarioLabel = item.scenario_title || item.scenario_id || "（シナリオ不明）";
        let scopeLabel = "";
        if (item.run_title) {
          scopeLabel = ` / 卓: ${item.run_title}`;
        } else if (!item.run_id) {
          scopeLabel = " / 卓なし";
        }
        const scenarioHref = item.scenario_id
          ? `../scenarios/detail.html?id=${encodeURIComponent(item.scenario_id)}`
          : null;
        const runHref = item.run_id
          ? `../sessions/detail.html?id=${encodeURIComponent(item.run_id)}`
          : null;

        li.innerHTML = `
          <div class="impressions__meta">
            <strong>${Utils.escapeHtml(String(item.author || ""))}</strong>
            <span>${Utils.escapeHtml(when)}</span>
            ${item.is_spoiler ? '<span class="impressions__badge">ネタバレ</span>' : ""}
          </div>
          <div class="impressions__links u-muted" style="margin-bottom: 6px; font-size: 0.9em;">
            ${scenarioHref
              ? `<a href="${scenarioHref}">${Utils.escapeHtml(scenarioLabel)}</a>`
              : Utils.escapeHtml(scenarioLabel)}
            ${runHref
              ? ` · <a href="${runHref}">${Utils.escapeHtml(item.run_title || item.run_id)}</a>`
              : Utils.escapeHtml(scopeLabel)}
          </div>
          ${formatBodyHtml(item.body, item.is_spoiler)}`;
        list.appendChild(li);
      }
      bindSpoilerButtons(list);
    } catch (e) {
      const statusMatch = String(e.message || "").match(/^(\d+)/);
      const status = statusMatch ? Number(statusMatch[1]) : 0;
      if (status === 403) {
        formRoot.innerHTML = loginPromptHtml();
        list.innerHTML = "";
        msg.textContent = "名簿連携が必要です。ホームの案内から自分のプレイヤーを連携してください。";
      } else {
        msg.textContent = `読み込み失敗: ${e.message}`;
      }
    }
  }

  async function init() {
    Utils.initAuthAndHeader("common-nav", "../");
    try {
      await loadFilterOptions();
    } catch (err) {
      console.warn("フィルタ候補の取得に失敗:", err);
    }

    document.getElementById("filter-scenario")?.addEventListener("change", refreshList);
    document.getElementById("filter-author")?.addEventListener("change", refreshList);
    document.getElementById("impressions-post-details")?.addEventListener("toggle", rememberPostDetailsOpen);
    await refreshList();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
