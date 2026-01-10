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

  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, { cache: "no-store", ...options });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
  }

  async function loadComments(targetType, targetId) {
    const url = `${API_BASE}/api/comments?type=${encodeURIComponent(targetType)}&id=${encodeURIComponent(targetId)}`;
    return fetchJson(url);
  }

  async function postComment(payload) {
    const url = `${API_BASE}/api/comments`;
    return fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  // containerId: どこに差し込むか
  // targetType: character|scenario|session
  // targetId: URLパラメータid
  
  async function mount(containerId, targetType, fixedTargetId) {
    const root = document.getElementById(containerId);
    if (!root) return;
  
    const targetId = fixedTargetId ?? getParam("id");
    if (!targetId) {
      root.innerHTML = "<p class='comments-muted'>コメント対象がありません</p>";
      return;
    }
  }


    root.innerHTML = `
      <section class="comments">
        <h2>コメント</h2>
        <div class="comments__msg" aria-live="polite"></div>

        <form class="comments__form">
          <div class="comments__row">
            <label>名前</label>
            <input name="author" maxlength="50" required />
          </div>
          <div class="comments__row">
            <label>本文</label>
            <textarea name="body" maxlength="4000" rows="4" required></textarea>
          </div>
          <button type="submit">投稿</button>
        </form>

        <ul class="comments__list"></ul>
      </section>
    `;

    const msg = root.querySelector(".comments__msg");
    const form = root.querySelector(".comments__form");
    const list = root.querySelector(".comments__list");

    function render(items) {
      list.innerHTML = "";
      for (const c of items) {
        const li = document.createElement("li");
        const when = c.created_at ? new Date(c.created_at).toLocaleString() : "";
        li.innerHTML = `
          <div class="comments__meta">
            <strong>${esc(c.author)}</strong>
            <span>${esc(when)}</span>
          </div>
          <div class="comments__body">${esc(c.body).replaceAll("\n", "<br>")}</div>
        `;
        list.appendChild(li);
      }
    }

    async function refresh() {
      msg.textContent = "読み込み中…";
      try {
        const items = await loadComments(targetType, targetId);
        render(items || []);
        msg.textContent = "";
      } catch (e) {
        msg.textContent = `読み込み失敗: ${e.message}`;
      }
    }

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      msg.textContent = "投稿中…";

      const author = form.author.value.trim();
      const body = form.body.value.trim();

      if (!author || !body) {
        msg.textContent = "名前と本文は必須です";
        return;
      }

      try {
        await postComment({
          target_type: targetType,
          target_id: targetId,
          author,
          body,
        });
        form.body.value = "";
        await refresh();
        msg.textContent = "投稿しました";
      } catch (e) {
        msg.textContent = `投稿に失敗しました: ${e.message}`;
      }
    });

    await refresh();
  }

  window.Comments = { mount };
})();
