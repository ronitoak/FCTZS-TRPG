"use strict";

Utils.domReady(() => {
    const form = document.getElementById("character-form");
    const systemSelect = document.getElementById("system-select");
    const dynamicContainer = document.getElementById("dynamic-fields-container");

    // --- システム選択時の動的生成 ---
    systemSelect.addEventListener("change", async () => {
        const system = systemSelect.value;
        dynamicContainer.innerHTML = "<p>読み込み中...</p>";
        if (!system) { dynamicContainer.innerHTML = ""; return; }

        try {
            // 属性定義と初期技能を並列取得 [cite: 1]
            const [attrDefs, skillBases] = await Promise.all([
                Utils.apiGet(`system_attributes?system=${encodeURIComponent(system)}`),
                Utils.apiGet(`system_skill_bases?system=${encodeURIComponent(system)}`)
            ]);

            renderDynamicFields(attrDefs, skillBases);
        } catch (err) {
            console.error(err);
            dynamicContainer.innerHTML = "<p>データの取得に失敗しました</p>";
        }
    });

    // --- 修正版: renderDynamicFields ---
function renderDynamicFields(attrs, skills) {
    let html = `<h3>能力値</h3><div class="attr-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;">`;
    (attrs || []).forEach(a => {
        html += `
            <div class="form-group">
                <label>${Utils.escapeHtml(a.label)}</label>
                <input type="number" name="attr_${a.key}" placeholder="0" class="form-control">
            </div>`;
    });
    html += `</div>`;

    html += `<h3>技能</h3><div class="skill-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px;">`;
    
    (skills || []).forEach(s => {
        // 「芸術（）」のように（）が含まれるものは詳細入力ありとみなす
        const isDetailRequired = s.name.includes("（）");
        const displayName = isDetailRequired ? s.name.replace("（）", "") : s.name;

        html += `
            <div class="form-group skill-input-item" style="border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
                <label style="display: block; font-weight: bold; margin-bottom: 5px;">
                    ${Utils.escapeHtml(displayName)} <small>(初期値: ${s.base_value})</small>
                </label>
                
                <div style="display: flex; gap: 5px;">
                    ${isDetailRequired ? `
                        <input type="text" 
                            name="skill_label" 
                            placeholder="専門（例: 写真）" 
                            style="flex: 2;"
                            data-base-name="${Utils.escapeHtml(displayName)}">
                    ` : ""}
                    <input type="number" 
                        name="skill_val" 
                        data-name="${Utils.escapeHtml(s.name)}" 
                        data-base="${s.base_value}" 
                        placeholder="${s.base_value}"
                        style="flex: 1;"
                        class="form-control">
                </div>
            </div>`;
    });
    
    // オリジナル技能追加枠（必要であればここに追加ボタンを実装可能ですが、まずはマスタ分を優先）
    html += `</div>`;
    
    const dynamicContainer = document.getElementById("dynamic-fields-container");
    if (dynamicContainer) dynamicContainer.innerHTML = html;
    } 

    // --- 修正版: 送信時の収集ロジック ---
    // form.addEventListener("submit", ...) の中で以下のように収集します
    const skillItems = document.querySelectorAll('.skill-input-item');
    skillItems.forEach(item => {
        const valInput = item.querySelector('input[name="skill_val"]');
        const labelInput = item.querySelector('input[name="skill_label"]');
        
        const base = parseInt(valInput.dataset.base, 10);
        const finalVal = valInput.value === "" ? base : parseInt(valInput.value, 10);
        let finalName = valInput.dataset.name;

        // 専門指定（例: 芸術 + 写真 -> 芸術（写真））の構築
        if (labelInput && labelInput.value.trim() !== "") {
            finalName = `${labelInput.dataset.baseName}（${labelInput.value.trim()}）`;
        }

        payload.skills.push({
            name: finalName,
            value: finalVal
        });
    });

    // --- 修正版: 送信処理 ---
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type=submit]");
        submitBtn.disabled = true;

        // フォームから直接値を取得
        const payload = {
            character: {
                name: form.name.value,
                player: form.player.value,
                system: document.getElementById("system-select").value,
                job: form.job.value,
                age: parseInt(form.age.value, 10) || null,
                gender: form.gender.value || null,
                height: parseInt(form.height.value, 10) || null,
                weight: parseInt(form.weight.value, 10) || null,
                origin: form.origin.value || null,
                memo: form.memo.value || null
            },
            attributes: [],
            skills: []
        };

        // 動的属性の収集
        document.querySelectorAll('input[name^="attr_"]').forEach(input => {
            const key = input.name.replace("attr_", "");
            if (input.value !== "") {
                payload.attributes.push({ 
                    key: key, 
                    value_int: parseInt(input.value, 10) 
                });
            }
        });

        // 技能の収集（全件）
        document.querySelectorAll('input[name="skill_val"]').forEach(input => {
            const base = parseInt(input.dataset.base, 10);
            const finalVal = input.value === "" ? base : parseInt(input.value, 10);
            payload.skills.push({
                name: input.dataset.name,
                base_value: base,
                value: finalVal
            });
        });

        try {
            const result = await Utils.apiPost("character_full", payload);
            const row = Array.isArray(result) ? result[0] : result;
            if (row && row.id) {
                location.href = `detail.html?id=${row.id}`;
            }
        } catch (err) {
            console.error("送信エラー:", err);
            alert("作成失敗: " + err.message);
            submitBtn.disabled = false;
        }
    });
});