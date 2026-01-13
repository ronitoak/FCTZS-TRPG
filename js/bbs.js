"use strict";

function nl2brSafe(text) {
  return Utils.escapeHtml(text).replaceAll("\n", "<br>");
}

async function loadPosts() {
  const list = Utils.$("bbs-list");
  list.textContent = "読み込み中…";

  try {
    const data = await Utils.apiGet("posts"); // ★統一

    if (!Array.isArray(data) || data.length === 0) {
      list.innerHTML = `<p><small>投稿がありません</small></p>`;
      return;
    }

    list.innerHTML = `
      <ul class="bbs-posts">
        ${data.map(p => {
          const dt = new Date(p.created_at);
          const dtText = Number.isNaN(dt.getTime()) ? "" : dt.toLocaleString("ja-JP");
          return `
            <li class="bbs-post">
              <div class="bbs-post-meta"><small>${Utils.escapeHtml(p.author)} / ${Utils.escapeHtml(dtText)}</small></div>
              <div class="bbs-post-body">${nl2brSafe(p.body)}</div>
            </li>
          `;
        }).join("")}
      </ul>
    `;
  } catch (e) {
    console.error(e);
    list.innerHTML = `<p>読み込みに失敗しました</p>`;
  }
}

function setupForm() {
  const form = Utils.$("bbs-form");
  const msg = Utils.$("bbs-msg");
  const btn = Utils.$("bbs-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const author = Utils.$("bbs-author").value.trim();
    const body = Utils.$("bbs-body").value.trim();
    if (!author || !body) return;

    btn.disabled = true;
    msg.textContent = "送信中…";

    try {
      await Utils.apiPost("posts", { author, body }); // ★統一（失敗時はthrowされる想定）

      Utils.$("bbs-body").value = "";
      msg.textContent = "投稿しました";
      await loadPosts();
    } catch (err) {
      console.error(err);
      msg.textContent = "投稿に失敗しました";
    } finally {
      btn.disabled = false;
    }
  });
}

Utils.domReady(async () => {
  setupForm();
  await loadPosts();
});
