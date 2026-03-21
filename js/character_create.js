"use strict";

Utils.domReady(() => {
    const form = document.getElementById("character-form");
    const systemSelect = document.getElementById("system-select");
    const dynamicContainer = document.getElementById("dynamic-fields-container");

    if (!form || !systemSelect || !dynamicContainer) return;

    // --- システム選択時の動的生成 ---
    systemSelect.addEventListener("change", async () => {
        const system = systemSelect.value;
        if (!system) {
            dynamicContainer.innerHTML = "";
            return;
        }
        dynamicContainer.innerHTML = "<p>読み込み中...</p>";

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
        const emotions = ["自己顕示(欲望)", "所有(欲望)", "本能(欲望)", "破壊(欲望)", "優越感(欲望)", "怠惰(欲望)", "逃避(欲望)", "好奇心(欲望)", "スリル(欲望)","喜び(情念)", "怒り(情念)", "哀しみ(情念)", "幸福(情念)", "不安(情念)", "嫌悪(情念)", "恐怖(情念)", "嫉妬(情念)", "恨み(情念)","正義(理想)", "崇拝(理想)", "善悪(理想)", "希望(理想)", "向上(理想)", "理性(理想)", "勝利(理想)", "秩序(理想)", "憧憬(理想)", "無我(理想)","友情(関係)", "愛(関係)", "恋(関係)", "依存(関係)", "尊敬(関係)", "軽蔑(関係)", "庇護(関係)", "支配(関係)", "奉仕(関係)", "甘え(関係)","後悔(傷)", "孤独(傷)", "諦観(傷)", "絶望(傷)", "否定(傷)", "疑念(傷)", "罪悪感(傷)", "狂気(傷)", "劣等感(傷)"];
        let html = `<fieldset class="form-section"><legend>能力値</legend><div class="attr-grid">`;
        (attrs || []).forEach(a => {
            html += `<div class="attr-input-item"><label>${Utils.escapeHtml(a.label)}</label>`;
            if (a.kind === 'emotion') {
                html += `<select name="attr_${a.key}" class="form-control" data-kind="emotion">
                            <option value="">--</option>
                            ${emotions.map(e => `<option value="${e}">${e}</option>`).join('')}
                        </select>`;
            } else {
                html += `<input type="number" name="attr_${a.key}" placeholder="0" class="form-control" data-kind="int">`;
            }
            html += `</div>`;
        });

        html += `</div></fieldset><fieldset class="form-section"><legend>技能</legend><div class="skill-grid">`;
        (skills || []).forEach(s => {
            const isDetailRequired = s.name.includes("（）");
            const displayName = isDetailRequired ? s.name.replace("（）", "") : s.name;
            
            html += `
                <div class="skill-input-item">
                    <label style="font-size: 0.85rem; font-weight: bold; margin-bottom: 4px;">
                        ${Utils.escapeHtml(displayName)} <small style="font-weight: normal; color: #718096;">(初期値: ${s.base_value})</small>
                    </label>
                    <div class="skill-input-container">
                        ${isDetailRequired ? `
                            <input type="text" name="skill_label" placeholder="詳細" class="form-control" data-base-name="${Utils.escapeHtml(displayName)}">
                        ` : ""}
                        <input type="number" name="skill_val" data-name="${Utils.escapeHtml(s.name)}" data-base="${s.base_value}" placeholder="${s.base_value}" class="form-control">
                    </div>
                </div>`;
        });
        html += `</div></fieldset>`;
        dynamicContainer.innerHTML = html;
    }

    // --- 送信処理（一本化） ---
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

        // 能力値の収集
        dynamicContainer.querySelectorAll('[name^="attr_"]').forEach(el => {
            const key = el.name.replace("attr_", "");
            if (el.dataset.kind === 'emotion') {
                if (el.value) payload.attributes.push({ key, value_int: null, value_emotion: el.value });
            } else {
                const val = parseInt(el.value, 10);
                if (!isNaN(val)) payload.attributes.push({ key, value_int: val, value_emotion: null });
            }
        });

        // 技能の収集
        dynamicContainer.querySelectorAll('.skill-input-item').forEach(item => {
            const valInput = item.querySelector('input[name="skill_val"]');
            const labelInput = item.querySelector('input[name="skill_label"]');
            if (!valInput) return;

            const base = parseInt(valInput.dataset.base, 10);
            const finalVal = valInput.value === "" ? base : parseInt(valInput.value, 10);
            let finalName = valInput.dataset.name;

            if (labelInput && labelInput.value.trim() !== "") {
                finalName = `${labelInput.dataset.baseName}（${labelInput.value.trim()}）`;
            }
            payload.skills.push({ name: finalName, value: finalVal });
        });

        try {
            const result = await Utils.apiPost("character_full", payload);
            const row = Array.isArray(result) ? result[0] : result;
            if (row?.id) location.href = `detail.html?id=${row.id}`;
        } catch (err) {
            console.error(err);
            alert("作成失敗");
            submitBtn.disabled = false;
        }
    });

    // いあきゃらのテキストを解析する関数
    function parseIachara(text) {
        const lines = text.split('\n');
        const result = { profile: {}, attributes: {}, skills: {} };

        // 名前・職業などの基本情報 
        const nameMatch = text.match(/名前:\s*(.+)/);
        if (nameMatch) result.profile.name = nameMatch[1].split('(')[0].trim();

        const jobMatch = text.match(/職業:\s*(.+)/);
        if (jobMatch) result.profile.job = jobMatch[1].trim();

        const ageMatch = text.match(/年齢:\s*(.+)/);
        if (ageMatch) result.profile.age = parseInt(ageMatch[1].trim()) || null;

        const genderMatch = text.match(/性別:\s*(.+)/);
        if (genderMatch) result.profile.gender = genderMatch[1].trim();

        const heightMatch = text.match(/身長:\s*(.+)/);
        if (heightMatch) result.profile.height = parseInt(heightMatch[1].trim()) || null;

        const weightMatch = text.match(/体重:\s*(.+)/);
        if (weightMatch) result.profile.weight = parseInt(weightMatch[1].trim()) || null;

        const originMatch = text.match(/出身:\s*(.+)/);
        if (originMatch) result.profile.origin = originMatch[1].trim();

        const systemMatch = text.match(/いあきゃらテキスト \s*(.+)/);
        // システム判定の修正（文字列が含まれているかチェック）
        if (text.includes("6版 v2.0.1")) {
            result.profile.system = "CoC6"; // DB側の値に合わせる
        } else if (text.includes("7版 v2.0.1")) {
            result.profile.system = "CoC7"; // DB側の値に合わせる
        }

        // 能力値の抽出 (現在値を取得) 
        // 例: STR         10      10
        const attrNames = ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU"];
        attrNames.forEach(attr => {
            const reg = new RegExp(`^${attr}\\s+(\\d+)`, 'm');
            const m = text.match(reg);
            if (m) result.attributes[attr.toLowerCase()] = m[1];
        });

        // 技能の抽出 (技能名と合計値) 
        // 合計値は「技能名」のあとの最初の数字を狙う
        lines.forEach(line => {
            // 技能名 合計 初期値 職業P ... の並びを想定
            const skillMatch = line.match(/^([^\s\d]{2,})\s+(\d+)\s+\d+/);
            if (skillMatch) {
                result.skills[skillMatch[1]] = skillMatch[2];
            }
        });

        return result;
    }

    const btnImport = document.getElementById('btn-import');
    const importArea = document.getElementById('import-text'); // HTMLのIDに合わせてください

    if (btnImport && importArea) {
        btnImport.addEventListener('click', async () => {
            const text = importArea.value;
            if (!text) return alert("テキストを貼り付けてください");

            const data = parseIachara(text);

            // 1. プロフィールの反映（HTMLのname属性を使用）
            if (data.profile.name) form.name.value = data.profile.name;
            if (data.profile.job) form.job.value = data.profile.job;
            if (data.profile.age) form.age.value = data.profile.age;
            if (data.profile.gender) form.gender.value = data.profile.gender;
            if (data.profile.height) form.height.value = data.profile.height;
            if (data.profile.weight) form.weight.value = data.profile.weight;
            if (data.profile.origin) form.origin.value = data.profile.origin;

            // 2. システムの自動切り替え
            if (data.profile.system) {
                systemSelect.value = data.profile.system;
                // 手動で change イベントを発火させて入力欄を生成させる
                systemSelect.dispatchEvent(new Event('change'));
                
                // API取得とレンダリングを待つための簡易的な待機
                // 本来は Promise で管理するのが理想ですが、学習用として1秒待ちます
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // 3. 能力値の反映
            for (const [key, val] of Object.entries(data.attributes)) {
                const input = dynamicContainer.querySelector(`input[name="attr_${key}"]`);
                if (input) input.value = val;
            }

            // 4. 技能の反映
            for (const [sName, sVal] of Object.entries(data.skills)) {
                const inputs = dynamicContainer.querySelectorAll('input[name="skill_val"]');
                inputs.forEach(input => {
                    // 技能名が部分一致、またはデータ名に含まれる場合
                    if (input.dataset.name.includes(sName)) {
                        input.value = sVal;
                    }
                });
            }

            alert("データを反映しました。システムが異なる場合は手動で調整してください。");
        });
    }

    document.getElementById('btn-import').addEventListener('click', () => {
        const text = document.getElementById('import-text').value;
        if (!text) return alert("テキストを貼り付けてください");

        const data = parseIachara(text);

        // プロフィールの反映
        if (data.profile.name) document.querySelector('input[name="name"]').value = data.profile.name;
        if (data.profile.job) document.querySelector('input[name="job"]').value = data.profile.job;

        // 能力値の反映 (システム切り替え後に実行される想定)
        for (const [key, val] of Object.entries(data.attributes)) {
            const input = document.querySelector(`input[name="attr_${key}"]`);
            if (input) input.value = val;
        }

        // 技能の反映
        for (const [sName, sVal] of Object.entries(data.skills)) {
            // 技能名が部分一致する入力欄を探す
            const inputs = document.querySelectorAll('input[name="skill_val"]');
            inputs.forEach(input => {
                if (input.dataset.name.includes(sName)) {
                    input.value = sVal;
                }
            });
        }

        alert("データを反映しました。内容を確認してください。");
    });
});