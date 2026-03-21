"use strict";

Utils.domReady(() => {
    const form = document.getElementById("character-form");
    const systemSelect = document.getElementById("system-select");
    const dynamicContainer = document.getElementById("dynamic-fields-container");

    if (!form || !systemSelect || !dynamicContainer) return;

    // --- システム選択時の動的生成 ---
    systemSelect.addEventListener("change", async () => {
        const system = systemSelect.value;
        dynamicContainer.innerHTML = "<p>読み込み中...</p>";
        if (!system) {
            dynamicContainer.innerHTML = "";
            return;
        }

        try {
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

    function renderDynamicFields(attrs, skills) {
        // エモクロアTRPG用：共鳴感情の選択肢
        const emotions = ["自己顕示(欲望)", "所有(欲望)", "本能(欲望)", "破壊(欲望)", "優越感(欲望)", "怠惰(欲望)", "逃避(欲望)", "好奇心(欲望)", "スリル(欲望)","喜び(情念)", "怒り(情念)", "哀しみ(情念)", "幸福(情念)", "不安(情念)", "嫌悪(情念)", "恐怖(情念)", "嫉妬(情念)", "恨み(情念)","正義(理想)", "崇拝(理想)", "善悪(理想)", "希望(理想)", "向上(理想)", "理性(理想)", "勝利(理想)", "秩序(理想)", "憧憬(理想)", "無我(理想)","友情(関係)", "愛(関係)", "恋(関係)", "依存(関係)", "尊敬(関係)", "軽蔑(関係)", "庇護(関係)", "支配(関係)", "奉仕(関係)", "甘え(関係)","後悔(傷)", "孤独(傷)", "諦観(傷)", "絶望(傷)", "否定(傷)", "疑念(傷)", "罪悪感(傷)", "狂気(傷)", "劣等感(傷)"];

        let html = `<h3>能力値</h3><div class="attr-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px;">`;
        
        (attrs || []).forEach(a => {
            html += `<div class="form-group"><label>${Utils.escapeHtml(a.label)}</label>`;
            if (a.kind === 'emotion') {
                // 共鳴感情用プルダウン。data-kindで後から判別可能にする
                html += `<select name="attr_${a.key}" class="form-control" data-kind="emotion">
                            <option value="">選択してください</option>
                            ${emotions.map(e => `<option value="${e}">${e}</option>`).join('')}
                         </select>`;
            } else {
                html += `<input type="number" name="attr_${a.key}" placeholder="0" class="form-control" data-kind="int">`;
            }
            html += `</div>`;
        });
        html += `</div>`;

        html += `<h3>技能</h3><div class="skill-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px;">`;
        
        (skills || []).forEach(s => {
            const isDetailRequired = s.name.includes("（）");
            const displayName = isDetailRequired ? s.name.replace("（）", "") : s.name;

            html += `
                <div class="form-group skill-input-item" style="border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
                    <label style="display: block; font-weight: bold; margin-bottom: 5px;">
                        ${Utils.escapeHtml(displayName)} <small>(初期値: ${s.base_value})</small>
                    </label>
                    <div style="display: flex; gap: 5px;">
                        ${isDetailRequired ? `
                            <input type="text" name="skill_label" placeholder="詳細" style="flex: 2;" data-base-name="${Utils.escapeHtml(displayName)}">
                        ` : ""}
                        <input type="number" name="skill_val" data-name="${Utils.escapeHtml(s.name)}" data-base="${s.base_value}" placeholder="${s.base_value}" style="flex: 1;" class="form-control">
                    </div>
                </div>`;
        });
        html += `</div>`;
        dynamicContainer.innerHTML = html;
    }

    // --- 送信処理 ---
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type=submit]");
        submitBtn.disabled = true;

        const payload = {
            character: {
                name: form.name.value,
                player: form.player.value,
                system: systemSelect.value,
                job: form.job.value,
                age: parseInt(form.age.value) || null,
                gender: form.gender.value,
                height: parseInt(form.height.value) || null,
                weight: parseInt(form.weight.value) || null,
                origin: form.origin.value,
                memo: form.memo.value
            },
            attributes: [],
            skills: []
        };

        // 能力値の収集 (data-kind属性で判別)
        const attrElements = dynamicContainer.querySelectorAll('[name^="attr_"]');
        attrElements.forEach(el => {
            const key = el.name.replace("attr_", "");
            const kind = el.dataset.kind;

            if (kind === 'emotion') {
                if (el.value) {
                    payload.attributes.push({ key, value_int: null, value_emotion: el.value });
                }
            } else {
                const val = parseInt(el.value, 10);
                if (!isNaN(val)) {
                    payload.attributes.push({ key, value_int: val, value_emotion: null });
                }
            }
        });

        // 技能の収集 (専門指定対応)
        const skillItems = dynamicContainer.querySelectorAll('.skill-input-item');
        skillItems.forEach(item => {
            const valInput = item.querySelector('input[name="skill_val"]');
            const labelInput = item.querySelector('input[name="skill_label"]');
            
            const base = parseInt(valInput.dataset.base, 10);
            const finalVal = valInput.value === "" ? base : parseInt(valInput.value, 10);
            let finalName = valInput.dataset.name;

            if (labelInput && labelInput.value.trim() !== "") {
                finalName = `${labelInput.dataset.baseName}（${labelInput.value.trim()}）`;
            }

            payload.skills.push({
                name: finalName,
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
            console.error(err);
            alert("作成失敗");
            submitBtn.disabled = false;
        }
    });
});