"use strict";

// 卓登録に必要なシナリオ・GM・参加者を関連付け、旧文字列表現も添えて互換形式で保存する。
(() => {

Utils.domReady(async () => {
    await Utils.initAuthAndHeader('common-nav', '../');
    
    const scenarioSelect = document.getElementById("scenario-select");
    const charGrid = document.getElementById("character-selection-grid");
    const form = document.getElementById("session-form");

    let allCharacters = [];

    const imageFileInput = document.getElementById("image-file");
    const imagePreviewContainer = document.getElementById("image-preview-container");
    const imagePreview = document.getElementById("image-preview");

    if (imageFileInput && imagePreviewContainer && imagePreview) {
        imageFileInput.addEventListener("change", () => {
            const file = imageFileInput.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePreview.src = e.target.result;
                    imagePreviewContainer.style.display = "block";
                };
                reader.readAsDataURL(file);
            } else {
                imagePreview.src = "";
                imagePreviewContainer.style.display = "none";
            }
        });
    }

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
        // 表示名に依存せずプレイヤーを識別できるよう、候補DOMへ安定したIDを保持する。
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

        // キャラクター未選択の参加者も保存できるよう、手動選択からPL IDを回収する。
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

        let imageUrl = null;
        if (imageFileInput && imageFileInput.files[0]) {
            try {
                const originalFile = imageFileInput.files[0];
                const compressedBlob = await Utils.compressAndResizeImage(originalFile);

                const formData = new FormData();
                const fileBaseName = originalFile.name.includes('.') 
                    ? originalFile.name.substring(0, originalFile.name.lastIndexOf('.')) 
                    : originalFile.name;
                const fileName = `${fileBaseName}.webp`;

                formData.append("file", compressedBlob, fileName);
                formData.append("type", "run");

                const uploadResult = await Utils.apiUpload(formData);
                imageUrl = uploadResult?.url || null;
            } catch (err) {
                console.error("画像アップロードエラー:", err);
            }
        }

        const payload = {
            // IDはDB側のトリガー r-XXX_Y で自動生成されるため不要
            title: form.title.value,
            scenario_id: form.scenario_id.value,
            gm_id: form.gm_id ? form.gm_id.value : null, // 名前変更に影響されないGM識別子を保存する。
            characters: charIds, 
            player_ids: allPlayerIds,
            status: 'planning',
            image_url: imageUrl
        };

        try {
            const result = await Utils.apiPost("runs", payload);
            const row = Array.isArray(result) ? result[0] : result;
            alert("セッションを登録しました");
            if (row?.id) {
                location.href = `detail.html?id=${encodeURIComponent(row.id)}`;
            } else {
                location.href = "index.html";
            }
        } catch (err) {
            console.error(err);
            alert("登録失敗: " + err.message);
            submitBtn.disabled = false;
        }
    });
});
})();