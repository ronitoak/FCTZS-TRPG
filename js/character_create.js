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

    // --- 技能入力欄の生成ロジック (renderDynamicFields内) ---
    function renderDynamicFields(attrs, skills) {
        let html = "";
    
        // 能力値セクション
        html += `<h3>能力値</h3><div class="attr-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;">`;
        (attrs || []).forEach(a => {
            html += `
                <div class="form-group">
                    <label>${Utils.escapeHtml(a.label)}</label>
                    <input type="number" name="attr_${a.key}" placeholder="0" class="form-control">
                </div>`;
        });
        html += `</div>`;   

        // 技能セクション
        html += `</div><h3>技能</h3><div class="skill-grid">`;
        (skills || []).forEach(s => {
            // placeholderに初期値を表示し、未入力時はこの値が採用されるようにする
            html += `
                <div class="form-group skill-input-item">
                    <label>${Utils.escapeHtml(s.name)} <small>(初期値: ${s.base_value})</small></label>
                    <input type="number" 
                        name="skill_val" 
                        data-name="${Utils.escapeHtml(s.name)}" 
                        data-base="${s.base_value}" 
                        placeholder="${s.base_value}">
                </div>`;
        });
        html += `</div>`;
        const dynamicContainer = document.getElementById("dynamic-fields-container");
        if (dynamicContainer) {
            dynamicContainer.innerHTML = html;
        }
    }

    // --- 送信時の収集ロジック (submitイベント内) ---
    const skillInputs = dynamicContainer.querySelectorAll('input[name="skill_val"]');
    skillInputs.forEach(input => {
        const base = parseInt(input.dataset.base, 10);
        // 入力が空なら初期値、入力があればその値を数値として取得
        const finalVal = input.value === "" ? base : parseInt(input.value, 10);
        
        payload.skills.push({
            name: input.dataset.name,
            base_value: base,
            value: finalVal // Viewの定義に合わせて'value'カラムに送る
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