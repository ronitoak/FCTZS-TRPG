"use strict";

// ★あなたのWorkersのURLに置き換え
//const API_BASE = "https://fctzs-trpg.daruji65.workers.dev";

function nl2brSafe(text) {
  // escapeしてから <br> にする（XSS防止）
  return Utils.escapeHtml(text).replaceAll("\n", "<br>");
}

async function loadPosts() {
  const list = Utils.$("bbs-list");
  list.textContent = "読み込み中…";

  try {
    const res = await fetch(`${Utils.API_BASE}/api/posts`, { cache: "no-store" });
    if (!res.ok) {
      list.innerHTML = `<p>読み込みに失敗しました（${Utils.escapeHtml(res.status)}）</p>`;
      return;
    }

    const data = await res.json();

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
              <div class="bbs-post-body">${Utils.escapeHtml(p.body).replaceAll("\n", "<br>")}</div>
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
      const res = await fetch(`${Utils.API_BASE}/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, body }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        msg.textContent = `投稿に失敗しました（${res.status}）`;
        console.warn("post failed:", t);
        return;
      }

      // 成功
      Utils.$("bbs-body").value = "";
      msg.textContent = "投稿しました";

      await loadPosts();
    } catch (err) {
      console.error(err);
      msg.textContent = "投稿に失敗しました";
    } finally {
      btn.disabled = false;
      // メッセージは少し残してOK。消したいならsetTimeoutで消す
    }
  });
}

Utils.domReady(async () => {
  setupForm();
  await loadPosts();
});








