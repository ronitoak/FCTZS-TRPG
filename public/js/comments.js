// 各詳細画面で共通利用するコメント欄を組み立て、対象識別子付きの取得・投稿を同じ契約に揃える。
(function () {

    async function loadComments(targetType, targetId) {
      return Utils.apiGet(
        "comments",
        `target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(targetId)}`
      );
    }

    async function postComment(payload) {
      return Utils.apiPost("comments", payload);
    }


  // 対象種別とIDを明示して渡し、異なる詳細画面のコメントが混在しないようにする。
  // fixedTargetId未指定時だけURLのidへフォールバックし、埋め込み側からも再利用可能にする。
  async function mount(containerId, targetType, fixedTargetId) {
    const root = document.getElementById(containerId);
    if (!root) return;

    const targetId = fixedTargetId ?? Utils.getQueryParam("id");
    if (!targetId) {
      root.innerHTML = "<p class='comments-muted'>コメント対象がありません</p>";
      return;
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
            <strong>${Utils.escapeHtml(String(c.author))}</strong>
            <span>${Utils.escapeHtml(when)}</span>
          </div>
          <div class="comments__body">${Utils.escapeHtml(String(c.body)).replaceAll("\n", "<br>")}</div>
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
