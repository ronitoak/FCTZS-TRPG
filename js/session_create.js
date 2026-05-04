"use strict";

Utils.domReady(async () => {
    await Utils.initAuthAndHeader('common-nav', '../');
    
    const scenarioSelect = document.getElementById("scenario-select");
    const charGrid = document.getElementById("character-selection-grid");
    const form = document.getElementById("session-form");

    let allCharacters = [];

    // 1. マスターデータの取得
    try {
        const [scenarios, characters] = await Promise.all([
            Utils.apiGet("scenarios"),
            Utils.apiGet("characters")
        ]);
        allCharacters = characters;

        // シナリオ選択肢
        scenarioSelect.innerHTML = '<option value="">選択してください</option>' +
            scenarios.map(s => `<option value="${s.id}">${Utils.escapeHtml(s.title)}</option>`).join('');

        // キャラクター選択（カード形式）
        charGrid.innerHTML = characters.map(c => `
            <label class="skill-input-item" style="cursor:pointer; display:flex; gap:10px; align-items:center;">
                <input type="checkbox" name="char_id" value="${c.id}" data-player="${Utils.escapeHtml(c.player || '')}">
                <div>
                    <div style="font-weight:bold;">${Utils.escapeHtml(c.name)}</div>
                    <small style="color:#666;">PL: ${Utils.escapeHtml(c.player || '未設定')}</small>
                </div>
            </label>
        `).join('');
    } catch (err) {
        console.error(err);
        charGrid.innerHTML = "<p>データの取得に失敗しました</p>";
    }

    // 2. 送信処理
    // --- js/session_create.js の送信処理部分 ---

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type=submit]");
        
        // 1. チェックされたキャラクターからPL名を取得
        const selectedChecks = Array.from(form.querySelectorAll('input[name="char_id"]:checked'));
        const charIds = selectedChecks.map(el => el.value);
        const autoPlayers = selectedChecks.map(el => el.dataset.player).filter(p => p && p.trim() !== "");

        // 2. 手動入力欄からPL名を取得
        const extraPlayersRaw = form.extra_players.value;
        const extraPlayers = extraPlayersRaw ? extraPlayersRaw.split(',').map(p => p.trim()).filter(p => p !== "") : [];

        // 3. 両方を結合して重複を排除 (Setを使用)
        const allPlayers = Array.from(new Set([...autoPlayers, ...extraPlayers]));

        if (charIds.length === 0 && allPlayers.length === 0) {
            alert("キャラクターまたはプレイヤーを登録してください");
            return;
        }

        submitBtn.disabled = true;

        const payload = {
            // IDはDB側のトリガー r-XXX_Y で自動生成されるため不要
            title: form.title.value,
            scenario_id: form.scenario_id.value,
            gm: form.gm.value || null,
            characters: charIds, // text[]
            players: allPlayers, // text[] (自動 + 手動)
            status: 'planning'
        };

        try {
            await Utils.apiPost("runs", payload);
            alert("セッションを登録しました");
            location.href = "../index.html";
        } catch (err) {
            console.error(err);
            alert("登録失敗: " + err.message);
            submitBtn.disabled = false;
        }
    });
});