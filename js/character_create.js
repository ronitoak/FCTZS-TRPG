"use strict";

Utils.domReady(() => {
    const form = document.getElementById("character-form");
    const systemSelect = document.getElementById("system-select");
    const dynamicContainer = document.getElementById("dynamic-fields-container");
    const btnImport = document.getElementById('btn-import');
    const importArea = document.getElementById('import-text');

    if (!form || !systemSelect || !dynamicContainer) return;

    // --- 1. システム選択時の動的生成 (既存ロジック) ---
    systemSelect.addEventListener("change", async () => {
        const system = systemSelect.value;
        const customSkillActions = document.getElementById('custom-skill-actions');
        if (!system) {
            dynamicContainer.innerHTML = "";
            if (customSkillActions) customSkillActions.style.display = "none"; // 非表示 
            return;
        }

        // システムが選択されたらボタンを表示
        if (customSkillActions) customSkillActions.style.display = "block"; // 表示

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

// --- 2. いあきゃらテキスト解析関数 (精度向上・ガイアケア対応版) ---
    function parseIachara(text) {
        const result = { profile: {}, attributes: {}, skills: {} };
        const trimmedText = text.trim();

        // --- JSON形式（エモクロア・ガイアケア等）の判定と解析 ---
        if (trimmedText.startsWith('{')) {
            try {
                const json = JSON.parse(trimmedText);
                const data = json.data || {};

                // ★ ガイアケアTRPGの判定ロジック
                let isGaia = false;
                // params内に「真価」があるかチェック
                if (Array.isArray(data.params) && data.params.some(p => p.label === "真価")) {
                    isGaia = true;
                }
                // commands（チャットパレット）に「〈オリジン〉」技能があるかチェック
                if (data.commands && data.commands.includes("〈オリジン〉")) {
                    isGaia = true;
                }

                // A. プロフィール
                result.profile.name = data.name || "";
                result.profile.memo = data.memo || "";
                // 判定結果に基づいてシステムをセット
                result.profile.system = isGaia ? "ガイアケアTRPG" : "エモクロアTRPG";

                const emotionFields = {
                    "共鳴感情・表": "emotion_front",
                    "共鳴感情・裏": "emotion_back",
                    "共鳴感情・ルーツ": "emotion_root"
                };

                for (const [label, key] of Object.entries(emotionFields)) {
                    const reg = new RegExp(`${label}:\\s*([^\\n]+)`);
                    const m = (data.memo || "").match(reg);
                    if (m) {
                        result.attributes[key] = m[1].trim();
                    }
                }

                // B. 能力値 (params配列から抽出)
                const emoAttrMap = {
                    "精神":"power","五感":"senses","身体":"strength","社会":"social",
                    "運勢":"luck", "真価":"luck", // ★「真価」は既存テーブル互換のため「運勢(luck)」としてマッピング
                    "知力":"intellect","器用":"dexterity","魅力":"appearance",
                    "共鳴感情・表":"emotion_front","共鳴感情・裏":"emotion_back","共鳴感情・ルーツ":"emotion_root"
                };

                if (Array.isArray(data.params)) {
                    data.params.forEach(p => {
                        const key = emoAttrMap[p.label] || p.label;
                        result.attributes[key.toLowerCase()] = p.value;
                    });
                }

                // C. 技能の抽出 (xDM<=y 〈技能名〉 から x を抽出)
                if (data.commands) {
                    const skillRegex = /(\d+)DM<=\d+\s*〈(.+?)〉/g;
                    const skillRegexGaia = /(\d+)DA<=\d+\s*〈(.+?)〉/g;
                    let match;
                    while ((match = skillRegex.exec(data.commands)) !== null) {
                        // 技能値は不等号の後ろではなく、「DM」の前の数字を正しく取得します
                        const diceNum = match[1]; 
                        const skillName = match[2].replace('＊', '');
                        
                        result.skills[skillName] = diceNum;
                    }
                    while ((match = skillRegexGaia.exec(data.commands)) !== null) {
                        // ガイアケアTRPGの技能抽出
                        const diceNum = match[1];
                        const skillName = match[2].replace('＊', '');
                        
                        result.skills[skillName] = diceNum;
                    }
                }
                return result;
            } catch (e) {
                console.error("JSON解析失敗、テキストとして続行します", e);
            }
        } else if (trimmedText.startsWith('いあきゃら')) {

            // A. プロフィール抽出
            const profileFields = {
                name: /名前:\s*([^/(\n]+)/,
                job: /職業:\s*([^/(\n]+)/,
                age: /年齢:\s*([^/]+)/,
                gender: /性別:\s*([^/]+)/,
                height: /身長:\s*([^/]+)/,
                weight: /体重:\s*([^/]+)/,
                origin: /出身:\s*([^/]+)/
            };

            for (const [key, regex] of Object.entries(profileFields)) {
                const m = text.match(regex);
                if (m) {
                    const val = m[1].trim();
                    result.profile[key] = (['name', 'job', 'gender', 'origin'].includes(key)) 
                        ? val : (parseInt(val) || null);
                }
            }

            // B. システム判定 (★テキスト形式の場合も判定を強化)
            if (text.includes("6版 v2.0.1")) result.profile.system = "CoC6"; 
            else if (text.includes("7版 v2.0.1")) result.profile.system = "CoC7";
            else if (text.includes("ガイアケアTRPG") || text.includes("真価") || text.includes("〈オリジン〉")) result.profile.system = "ガイアケアTRPG";
            else if (text.includes("エモクロアTRPG")) result.profile.system = "エモクロアTRPG";

            // C. 能力値の抽出
            const attrNames = ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU"];
            attrNames.forEach(attr => {
                const reg = new RegExp(`${attr}\\s+([0-9]+)`, 'i'); 
                const m = text.match(reg);
                if (m) result.attributes[attr.toLowerCase()] = m[1];
            });

            // D. 技能の抽出
            text.split('\n').forEach(line => {
                const skillMatch = line.match(/^([^\s\d]{2,})\s+(\d+)\s+\d+/);
                if (skillMatch) result.skills[skillMatch[1]] = skillMatch[2];
            });

            // E. メモ欄の抽出
            const memoMatch = text.match(/【メモ】\s*([\s\S]*)/);
            if (memoMatch) result.profile.memo = memoMatch[1].trim();

            return result;
        }
    }

    // --- 3. インポート実行イベント (完全版) ---
    if (btnImport && importArea) {
        btnImport.addEventListener('click', async () => {
            const text = importArea.value;
            if (!text) return alert("テキストを貼り付けてください");

            const data = parseIachara(text);

            // プロフィールとメモの反映
            if (data.profile.name) form.name.value = data.profile.name;
            if (data.profile.job) form.job.value = data.profile.job;
            if (data.profile.age) form.age.value = data.profile.age;
            if (data.profile.gender) form.gender.value = data.profile.gender;
            if (data.profile.height) form.height.value = data.profile.height;
            if (data.profile.weight) form.weight.value = data.profile.weight;
            if (data.profile.origin) form.origin.value = data.profile.origin;
            if (data.profile.memo) form.memo.value = data.profile.memo;

            // システム切り替えと待機
            if (data.profile.system) {
                systemSelect.value = data.profile.system;
                systemSelect.dispatchEvent(new Event('change'));
                await new Promise(resolve => setTimeout(resolve, 800)); // 描画待ち
            }

            // 能力値反映
            for (const [key, val] of Object.entries(data.attributes)) {
                const lowerKey = key.toLowerCase();
                // input か select のいずれか、name属性が一致するものを探す
                const el = dynamicContainer.querySelector(`[name="attr_${lowerKey}"]`);
                if (el) {
                    el.value = val;
                }
            }

            // 技能反映 (部分一致)
            const existingInputs = dynamicContainer.querySelectorAll('input[name="skill_val"]');
            const matchedSkills = new Set();

            for (const [sName, sVal] of Object.entries(data.skills)) {
                let found = false;
                
                existingInputs.forEach(input => {
                    const dataName = input.dataset.name || "";
                    // 既存リストにその技能名が含まれているかチェック
                    if (dataName.includes(sName)) {
                        input.value = sVal;
                        matchedSkills.add(sName);
                        found = true;
                    }
                });

                // 2. 既存リストに見つからなかった場合、オリジナル技能として行を追加
                if (!found) {
                    addCustomSkillRow(sName, sVal);
                }
            }
        });
    }

    function renderDynamicFields(attrs, skills) {
        //const emotions = ["自己顕示(欲望)", "所有(欲望)", "本能(欲望)", "破壊(欲望)", "優越感(欲望)", "怠惰(欲望)", "逃避(欲望)", "好奇心(欲望)", "スリル(欲望)","喜び(情念)", "怒り(情念)", "哀しみ(情念)", "幸福(情念)", "不安(情念)", "嫌悪(情念)", "恐怖(情念)", "嫉妬(情念)", "恨み(情念)","正義(理想)", "崇拝(理想)", "善悪(理想)", "希望(理想)", "向上(理想)", "理性(理想)", "勝利(理想)", "秩序(理想)", "憧憬(理想)", "無我(理想)","友情(関係)", "愛(関係)", "恋(関係)", "依存(関係)", "尊敬(関係)", "軽蔑(関係)", "庇護(関係)", "支配(関係)", "奉仕(関係)", "甘え(関係)","後悔(傷)", "孤独(傷)", "諦観(傷)", "絶望(傷)", "否定(傷)", "疑念(傷)", "罪悪感(傷)", "狂気(傷)", "劣等感(傷)"];
        let html = `<fieldset class="form-section"><legend>能力値</legend><div class="attr-grid">`;
        (attrs || []).forEach(a => {
            // a.key を小文字に変換して name にセット
            const safeKey = a.key.toLowerCase(); 
            html += `<div class="attr-input-item"><label>${Utils.escapeHtml(a.label)}</label>`;
            
            if (a.kind === 'emotion') {
                html += `<select name="attr_${safeKey}" class="form-control" data-kind="emotion">
                            <option value="">--</option>
                            ${Utils.emotions.map(e => `<option value="${e}">${e}</option>`).join('')}
                        </select>`;
            } else {
                html += `<input type="number" name="attr_${safeKey}" placeholder="0" class="form-control" data-kind="int">`;
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

    function addCustomSkillRow(name = "", value = "") {
        // 技能セクションが生成されているか確認
        const skillGrid = dynamicContainer.querySelector('.skill-grid'); 
        if (!skillGrid) return;

        const row = document.createElement('div');
        row.className = 'skill-input-item custom-skill';
        row.innerHTML = `
            <div class="skill-input-container">
                <input type="text" name="skill_label_custom" placeholder="技能名" 
                    value="${Utils.escapeHtml(name)}" class="form-control" style="flex: 2;">
                <input type="number" name="skill_val" value="${value}" 
                    placeholder="値" class="form-control" style="flex: 1;">
                <button type="button" class="btn-remove-skill" 
                        style="background:none; border:none; color:#e53e3e; cursor:pointer; padding: 0 10px;">×</button>
            </div>
        `;

        // 削除ボタンのイベント
        row.querySelector('.btn-remove-skill').addEventListener('click', () => row.remove());
        skillGrid.appendChild(row); 
    }

    // ボタンへのイベント登録
    document.getElementById('btn-add-custom-skill').addEventListener('click', () => addCustomSkillRow());

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
        // --- form.submit 内の技能収集ロジック ---
        // 既存の固定技能 + カスタム技能の両方をループ
        dynamicContainer.querySelectorAll('.skill-input-item').forEach(item => {
            const valInput = item.querySelector('input[name="skill_val"]');
            const labelInput = item.querySelector('input[name="skill_label"]'); // 既存の（）付き
            const customLabelInput = item.querySelector('input[name="skill_label_custom"]'); // 新設
            
            if (!valInput) return;

            const base = parseInt(valInput.dataset.base, 10) || 0;
            const finalVal = valInput.value === "" ? base : parseInt(valInput.value, 10);
            
            let finalName = "";
            if (customLabelInput) {
                // オリジナル技能の場合
                finalName = customLabelInput.value.trim();
            } else if (labelInput && labelInput.value.trim() !== "") {
                // 既存の「製作（）」などの場合
                finalName = `${labelInput.dataset.baseName}（${labelInput.value.trim()}）`;
            } else {
                // 通常技能
                finalName = valInput.dataset.name;
            }

            if (finalName) {
                payload.skills.push({ name: finalName, value: finalVal });
            }
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


});