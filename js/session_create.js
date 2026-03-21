"use strict";

Utils.domReady(async () => {
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
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type=submit]");
        
        // 選択されたキャラIDとPL名を取得
        const selectedChecks = Array.from(form.querySelectorAll('input[name="char_id"]:checked'));
        const charIds = selectedChecks.map(el => el.value);
        
        // プレイヤー名の重複を排除して配列化
        const players = Array.from(new Set(selectedChecks.map(el => el.dataset.player).filter(p => p !== "")));

        if (charIds.length === 0) {
            alert("キャラクターを1人以上選択してください");
            return;
        }

        submitBtn.disabled = true;

        const payload = {
            title: form.title.value,
            scenario_id: form.scenario_id.value,
            gm: form.gm.value || null,
            characters: charIds, // text[] 型
            players: players    // text[] 型
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