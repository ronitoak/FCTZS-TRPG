"use strict";

Utils.domReady(() => {
    const form = document.getElementById("character-form");
    const systemSelect = document.getElementById("system-select");
    const dynamicContainer = document.getElementById("dynamic-fields-container");

    // --- システム選択時の動的生成 ---
    systemSelect.addEventListener("change", async () => {
        const system = systemSelect.value;
        dynamicContainer.innerHTML = "<p>読み込み中...</p>";
        if (!system) {
            dynamicContainer.innerHTML = "";
            return;
        }

        try {
            // 属性定義と初期技能を並列取得
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
        // 共鳴感情の選択肢（DBのenum: emoklore_emotionの内容に合わせる）
        const emotions = ["自己顕示(欲望)", "所有(欲望)", "本能(欲望)", "破壊(欲望)", "優越感(欲望)", "怠惰(欲望)", "逃避(欲望)", "好奇心(欲望)", "スリル(欲望)","喜び(情念)", "怒り(情念)", "哀しみ(情念)", "幸福(情念)", "不安(情念)", "嫌悪(情念)", "恐怖(情念)", "嫉妬(情念)", "恨み(情念)","正義(理想)", "崇拝(理想)", "善悪(理想)", "希望(理想)", "向上(理想)", "理性(理想)", "勝利(理想)", "秩序(理想)", "憧憬(理想)", "無我(理想)","友情(関係)", "愛(関係)", "恋(関係)", "依存(関係)", "尊敬(関係)", "軽蔑(関係)", "庇護(関係)", "支配(関係)", "奉仕(関係)", "甘え(関係)","後悔(傷)", "孤独(傷)", "諦観(傷)", "絶望(傷)", "否定(傷)", "疑念(傷)", "罪悪感(傷)", "狂気(傷)", "劣等感(傷)"];

        let html = `<h3>能力値</h3><div class="attr-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px;">`;
        
        (attrs || []).forEach(a => {
            html += `<div class="form-group"><label>${Utils.escapeHtml(a.label)}</label>`;
            
            if (a.kind === 'emotion') {
                // 共鳴感情（enum）用のプルダウン
                html += `<select name="attr_${a.key}" class="form-control">
                            <option value="">選択してください</option>
                            ${emotions.map(e => `<option value="${e}">${e}</option>`).join('')}
                        </select>`;
            } else {
                // 通常の数値入力
                html += `<input type="number" name="attr_${a.key}" placeholder="0" class="form-control">`;
            }
            html += `</div>`;
        });
        html += `</div>`;

        // --- 技能セクション（前回提示の専門指定対応を含む） ---
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
                        ${isDetailRequired ? `<input type="text" name="skill_label" placeholder="詳細" style="flex: 2;" data-base-name="${Utils.escapeHtml(displayName)}">` : ""}
                        <input type="number" name="skill_val" data-name="${Utils.escapeHtml(s.name)}" data-base="${s.base_value}" placeholder="${s.base_value}" style="flex: 1;" class="form-control">
                    </div>
                </div>`;
        });
        html += `</div>`;

        document.getElementById("dynamic-fields-container").innerHTML = html;
    }

    // --- 送信処理 ---
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

        // 技能の収集（詳細ラベルと数値を統合して収集）
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
                base_value: base,
                value: finalVal
            });
        });

        // --- 修正版: 送信時のデータ収集ロジック (form submit内) ---
        // attributesの収集
        const attributes = [];
        // attributesマスタ（attrs）をループして値を取得
        currentSystemAttrs.forEach(a => {
            const input = document.querySelector(`[name="attr_${a.key}"]`);
            if (!input) return;

            if (a.kind === 'emotion') {
                attributes.push({
                    key: a.key,
                    value_int: null,
                    value_emotion: input.value || null
                });
            } else {
                attributes.push({
                    key: a.key,
                    value_int: input.value === "" ? 0 : parseInt(input.value, 10),
                    value_emotion: null
                });
            }
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