"use strict";

let characterList = [];

// 1. キャラクターリストを取得してセレクトボックスを作る
async function loadCharacters() {
  try {
    characterList = await Utils.apiGet("characters");
    const select = document.getElementById("bbs-character");
    if (!select) return;

    select.innerHTML = '<option value="">-- キャラクターを選択 --</option>' + 
      characterList.map(c => 
        `<option value="${c.id}" data-name="${Utils.escapeHtml(c.name)}">${Utils.escapeHtml(c.name)}</option>`
      ).join('');
  } catch (e) {
    console.error("キャラクター取得エラー:", e);
  }
}

// 2. タイムライン（投稿一覧）を読み込んで描画する
async function loadPosts() {
  const list = Utils.$("bbs-list");
  try {
    const data = await Utils.apiGet("posts?limit=50");
    
    if (!Array.isArray(data) || data.length === 0) {
      list.innerHTML = `<p style="color: #a0aec0; text-align: center; padding: 20px;">まだ投稿がありません。</p>`;
      return;
    }

    // チャット風のカードUIで描画
    list.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 15px;">
        ${data.map(p => {
          const dt = new Date(p.created_at);
          const dtText = Number.isNaN(dt.getTime()) ? "" : dt.toLocaleString("ja-JP");
          const avatarSrc = p.character_id ? Utils.getCharacterImagePath(p.character_id) : Utils.DEFAULT_CHARACTER_IMAGE;
          
          return `
            <div class="card" style="display: flex; gap: 15px; padding: 15px; background: #fff;">
              <img src="${avatarSrc}" onerror="this.onerror=null; this.src='${Utils.DEFAULT_CHARACTER_IMAGE}';" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 2px solid #e2e8f0;">
              <div style="flex-grow: 1;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px;">
                  <span style="font-weight: bold; color: #2d3748; font-size: 1.1rem;">${Utils.escapeHtml(p.author)}</span>
                  <span style="font-size: 0.8rem; color: #a0aec0;">${Utils.escapeHtml(dtText)}</span>
                </div>
                <div style="color: #4a5568; line-height: 1.6; white-space: pre-wrap; word-break: break-word;">${Utils.escapeHtml(p.body)}</div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  } catch (e) {
    console.error(e);
    list.innerHTML = `<p>読み込みに失敗しました</p>`;
  }
}

// 3. メイン処理と送信イベント
async function main() {
  await Utils.initAuthAndHeader('common-nav', '../');
  
  // 初期データの読み込み
  await loadCharacters();
  await loadPosts();

  const form = Utils.$("bbs-form");
  const msg = Utils.$("bbs-msg");
  const btn = Utils.$("bbs-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const charSelect = Utils.$("bbs-character");
    const body = Utils.$("bbs-body").value.trim();
    const charId = charSelect.value;
    
    if (!charId || !body) return;

    // 選択されたキャラクターの名前を data-name 属性から取得
    const selectedOption = charSelect.options[charSelect.selectedIndex];
    const authorName = selectedOption.getAttribute("data-name");

    btn.disabled = true;
    msg.textContent = "送信中…";
    msg.style.color = "#4a5568";

    const payload = {
      character_id: charId,
      author: authorName, // DBにはキャラクター名をそのまま保存
      body: body,
    };

    try {
      await Utils.apiPost("posts", payload);

      // 送信成功時の処理
      Utils.$("bbs-body").value = "";
      msg.textContent = "投稿しました！";
      msg.style.color = "#38a169";

      await loadPosts(); // リストを再読み込みして最新を表示
    } catch (err) {
      console.error(err);
      msg.textContent = "投稿に失敗しました";
      msg.style.color = "#e53e3e";
    } finally {
      btn.disabled = false;
      setTimeout(() => { msg.textContent = ""; }, 3000); // 3秒後にメッセージを消す
    }
  });
}

Utils.domReady(main);