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
        let html = `<h3>能力値</h3><div class="attr-grid">`;
        // ...能力値の生成...

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
        dynamicContainer.innerHTML = html;
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

    // --- 送信処理 ---
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type=submit]");
        submitBtn.disabled = true;

        // 基本データ構築
        const payload = {
            character: {
                name: form.name.value,
                player: form.player.value,
                system: systemSelect.value,
                job: form.job.value,
                memo: form.memo.value
                // ...他のプロフィール項目
            },
            attributes: [],
            skills: []
        };

        // 動的属性の収集
        const attrInputs = dynamicContainer.querySelectorAll('input[name^="attr_"]');
        attrInputs.forEach(input => {
            const key = input.name.replace("attr_", "");
            if (input.value) {
                payload.attributes.push({ key, value_int: parseInt(input.value, 10) });
            }
        });

        // 選択された技能の収集
        const skillChecks = dynamicContainer.querySelectorAll('input[name="skill_check"]:checked');
        skillChecks.forEach(check => {
            payload.skills.push({
                name: check.value,
                base_value: parseInt(check.dataset.base, 10)
            });
        });

        try {
            // 一括POST（Worker側の修正が必要）
            const result = await Utils.apiPost("character_full", payload);
            location.href = `detail.html?id=${result.id}`;
        } catch (err) {
            console.error(err);
            alert("作成失敗");
            submitBtn.disabled = false;
        }
    });
});