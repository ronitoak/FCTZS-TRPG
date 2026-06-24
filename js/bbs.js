"use strict";

let characterList = [];
let playerList = [];

// 1. プレイヤーとキャラクターの両方を一度に取得する
async function loadMasterData() {
  try {
    // APIから並行してデータを取得
    [playerList, characterList] = await Promise.all([
      Utils.apiGet("players"),
      Utils.apiGet("characters")
    ]);

    // プレイヤーのセレクトボックスを構築
    const playerSelect = Utils.$("bbs-player");
    if (playerSelect && Array.isArray(playerList)) {
      playerSelect.innerHTML = '<option value="">-- すべてのプレイヤー --</option>' + 
        playerList.map(p => 
          `<option value="${p.player_id}">${Utils.escapeHtml(p.player_name)}</option>`
        ).join('');
    }

    // 初回は絞り込みなしで全キャラクターを描画
    renderCharacterSelect("");

  } catch (e) {
    console.error("マスタデータ取得エラー:", e);
  }
}

// 2. 指定されたプレイヤーIDでキャラクターを絞り込んで描画する
function renderCharacterSelect(playerIdFilter) {
  const select = Utils.$("bbs-character");
  if (!select || !Array.isArray(characterList)) return;

  // プレイヤーIDが指定されていれば絞り込み、指定がなければ全員表示
  const filteredChars = playerIdFilter 
    ? characterList.filter(c => String(c.player_id) === String(playerIdFilter))
    : characterList;

  select.innerHTML = '<option value="">-- キャラクターを選択 --</option>' + 
    filteredChars.map(c => 
      `<option value="${c.id}" data-name="${Utils.escapeHtml(c.name)}">${Utils.escapeHtml(c.name)}</option>`
    ).join('');
}

// 3. タイムライン（投稿一覧）を読み込んで描画する
async function loadPosts() {
  const list = Utils.$("bbs-list");
  try {
    const data = await Utils.apiGet("posts?limit=50");
    
    if (!Array.isArray(data) || data.length === 0) {
      list.innerHTML = `<p style="color: #a0aec0; text-align: center; padding: 20px;">まだ投稿がありません。</p>`;
      return;
    }

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

// 4. メイン処理と送信イベント
async function main() {
  await Utils.initAuthAndHeader('common-nav', '../');
  
  // 初期データの読み込み（ここで連携プルダウンのセットアップが完了します）
  await loadMasterData();
  await loadPosts();

  // ★追加：プレイヤーを選択した瞬間にキャラクターを絞り込むイベント
  const playerSelect = Utils.$("bbs-player");
  if (playerSelect) {
    playerSelect.addEventListener("change", (e) => {
      renderCharacterSelect(e.target.value);
    });
  }

  const form = Utils.$("bbs-form");
  const msg = Utils.$("bbs-msg");
  const btn = Utils.$("bbs-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const charSelect = Utils.$("bbs-character");
    const body = Utils.$("bbs-body").value.trim();
    const charId = charSelect.value;
    
    if (!charId || !body) return;

    const selectedOption = charSelect.options[charSelect.selectedIndex];
    const authorName = selectedOption.getAttribute("data-name");

    btn.disabled = true;
    msg.textContent = "送信中…";
    msg.style.color = "#4a5568";

    const payload = {
      character_id: charId,
      author: authorName,
      body: body,
    };

    try {
      await Utils.apiPost("posts", payload);

      Utils.$("bbs-body").value = "";
      msg.textContent = "投稿しました！";
      msg.style.color = "#38a169";

      await loadPosts(); 
    } catch (err) {
      console.error(err);
      msg.textContent = "投稿に失敗しました";
      msg.style.color = "#e53e3e";
    } finally {
      btn.disabled = false;
      setTimeout(() => { msg.textContent = ""; }, 3000); 
    }
  });
}

Utils.domReady(main);