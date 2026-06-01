"use strict";

Utils.domReady(async () => {
    await Utils.initAuthAndHeader('common-nav', '../');
    
    const scenarioSelect = document.getElementById("scenario-select");
    const charGrid = document.getElementById("character-selection-grid");
    const form = document.getElementById("session-form");

    let allCharacters = [];

    // 1. マスターデータの取得
    try {
        const [scenarios, characters, players] = await Promise.all([
            Utils.apiGet("scenarios"),
            Utils.apiGet("characters"),
            Utils.apiGet("players")
        ]);
        allCharacters = characters;

        const playersById = new Map();
        if (Array.isArray(players)) {
            players.forEach(p => playersById.set(p.player_id, p.player_name));
        }

        const gmSelect = document.getElementById("gm-select");
        const extraPlayerSelect = document.getElementById("extra-player-select");
        
        if (gmSelect) gmSelect.innerHTML = '<option value="">選択してください</option>';
        if (extraPlayerSelect) extraPlayerSelect.innerHTML = ''; // 初期化

        if (Array.isArray(players)) {
            players.forEach(p => {
                if (gmSelect) {
                    const opt = document.createElement("option");
                    opt.value = p.player_id;
                    opt.textContent = p.player_name;
                    gmSelect.appendChild(opt);
                }
                if (extraPlayerSelect) {
                    const opt = document.createElement("option");
                    opt.value = p.player_id;
                    opt.textContent = p.player_name;
                    extraPlayerSelect.appendChild(opt);
                }
            });
        }

        // シナリオ選択肢
        scenarioSelect.innerHTML = '<option value="">選択してください</option>' +
            scenarios.map(s => `<option value="${s.id}">${Utils.escapeHtml(s.title)}</option>`).join('');

        // キャラクター選択（カード形式）
        // ★修正: inputタグに data-player-id 属性を追加
        charGrid.innerHTML = characters.map(c => {
            // IDがあれば名前を辞書から取得し、無ければ過去の c.player(テキスト) を使い、どちらも無ければ '未設定'
            const playerName = (c.player_id && playersById.has(c.player_id)) 
                ? playersById.get(c.player_id) 
                : (c.player || '未設定');

            return `
            <label class="skill-input-item" style="cursor:pointer; display:flex; gap:10px; align-items:center;">
                <input type="checkbox" name="char_id" value="${c.id}" 
                       data-player-id="${Utils.escapeHtml(c.player_id || '')}">
                <div>
                    <div style="font-weight:bold;">${Utils.escapeHtml(c.name)}</div>
                    <small style="color:#666;">PL: ${Utils.escapeHtml(playerName)}</small>
                </div>
            </label>
            `;
        }).join('');
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
        const autoPlayerIds = selectedChecks.map(el => el.dataset.playerId).filter(id => id && id.trim() !== "");

        // 2. ★修正: 手動入力(複数選択セレクトボックス)から PL ID を取得
        const extraPlayerSelect = document.getElementById("extra-player-select");
        let extraPlayerIds = [];
        if (extraPlayerSelect) {
            extraPlayerIds = Array.from(extraPlayerSelect.selectedOptions).map(opt => opt.value);
        }

        // 3. 両方を結合して重複を排除 (Setを使用)
        const allPlayerIds = Array.from(new Set([...autoPlayerIds, ...extraPlayerIds]));

        if (charIds.length === 0 && allPlayerIds.length === 0) {
            alert("キャラクターまたはプレイヤーを登録してください");
            return;
        }

        submitBtn.disabled = true;

        const payload = {
            // IDはDB側のトリガー r-XXX_Y で自動生成されるため不要
            title: form.title.value,
            scenario_id: form.scenario_id.value,
            gm_id: form.gm_id ? form.gm_id.value : null, // ★修正: gm_idを取得
            characters: charIds, 
            player_ids: allPlayerIds, // ★修正: players(text)から player_ids に変更
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