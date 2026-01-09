"use strict";
console.log("bbs.js loaded");
// ★あなたのWorkersのURLに置き換え
const API_BASE = "https://fctzs-trpg.daruji65.workers.dev";

function nl2brSafe(text) {
  // escapeしてから <br> にする（XSS防止）
  return Utils.escapeHtml(text).replaceAll("\n", "<br>");
}

async function loadPosts() {
  const list = Utils.$("bbs-list");
  list.textContent = "読み込み中…";

  try {
    const res = await fetch(`${API_BASE}/api/posts`, { cache: "no-store" });
    const text = await res.text();

    list.innerHTML = `
      <p><small>status: ${Utils.escapeHtml(res.status)}</small></p>
      <pre style="white-space:pre-wrap">${Utils.escapeHtml(text)}</pre>
    `;
  } catch (e) {
    list.innerHTML = `<p>fetch失敗: ${Utils.escapeHtml(e?.message || e)}</p>`;
  }
}


function setupForm() {
  const form = Utils.$("bbs-form");
  const msg = Utils.$("bbs-msg");
  const btn = Utils.$("bbs-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const author = Utils.$("bbs-author").value.trim();
    const title = Utils.$("bbs-title").value.trim();
    const body = Utils.$("bbs-body").value.trim();

    if (!author || !title || !body) return;

    btn.disabled = true;
    msg.textContent = "送信中…";

    try {
      const res = await fetch(`${API_BASE}/api/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, title, body }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        msg.textContent = `投稿に失敗しました（${res.status}）`;
        console.warn("post failed:", t);
        return;
      }

      // 成功
      Utils.$("bbs-title").value = "";
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



