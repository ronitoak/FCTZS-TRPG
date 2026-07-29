"use strict";

// システム別の入力欄と外部キャラクターデータを正規化し、関連能力値・技能と一緒に登録する。
(() => {

Utils.domReady(async () => {
    const form = document.getElementById("character-form");
    const systemSelect = document.getElementById("system-select");
    const dynamicContainer = document.getElementById("dynamic-fields-container");
    const btnImport = document.getElementById('btn-import');
    const importArea = document.getElementById('import-text');
    const importFileInput = document.getElementById('import-file');

    if (!form || !systemSelect || !dynamicContainer) return;

    await Utils.initAuthAndHeader('common-nav', '../');

    // 画像プレビュー表示
    const imageFileInput = document.getElementById("image-file");
    const imagePreviewContainer = document.getElementById("image-preview-container");
    const imagePreview = document.getElementById("image-preview");

    Utils.setupImagePreview(imageFileInput, imagePreview, imagePreviewContainer);

    // プレイヤー一覧を取得してセレクトボックスに詰める
    const players = await Utils.apiGet("players");
    const playerSelect = document.getElementById("player-select");
    players.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.player_id;
        opt.textContent = p.player_name;
        playerSelect.appendChild(opt);
    });

    // --- 1. システム選択時の動的生成 ---
    let systemFieldsReady = Promise.resolve();

    async function loadSystemFields(system) {
        const isGaia = (system === "ガイアケアTRPG");
        document.querySelectorAll(".gaia-specific-field").forEach(el => {
            el.style.display = isGaia ? "" : "none";
        });
        const customSkillActions = document.getElementById('custom-skill-actions');
        if (!system) {
            dynamicContainer.innerHTML = "";
            if (customSkillActions) customSkillActions.style.display = "none";
            return;
        }

        if (customSkillActions) customSkillActions.style.display = "block";
        dynamicContainer.innerHTML = "<p>読み込み中...</p>";

        const [attrDefs, skillBases] = await Promise.all([
            Utils.apiGet(`system_attributes?system=${encodeURIComponent(system)}`),
            Utils.apiGet(`system_skill_bases?system=${encodeURIComponent(system)}`)
        ]);
        renderDynamicFields(attrDefs, skillBases);
    }

    systemSelect.addEventListener("change", () => {
        const system = systemSelect.value;
        systemFieldsReady = loadSystemFields(system).catch(err => {
            console.error(err);
            dynamicContainer.innerHTML = "<p>データの取得に失敗しました</p>";
        });
    });

// --- 2. いあきゃら／CCFOLIA テキスト解析 ---
    function parseIachara(text) {
        const result = { profile: {}, attributes: {}, skills: {} };
        const trimmedText = String(text || "").replace(/^\uFEFF/, "").trim();
        if (!trimmedText) return null;

        // --- JSON形式（エモクロア・ガイアケア等） ---
        if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
            try {
                let json = JSON.parse(trimmedText);
                // CCFOLIA は配列で来る場合がある
                if (Array.isArray(json)) json = json[0] || {};
                const data = json.data || json;
                if (!data || typeof data !== "object") {
                    throw new Error("JSONにキャラクターデータがありません");
                }

                let isGaia = false;
                if (Array.isArray(data.params) && data.params.some(p => p.label === "真価")) {
                    isGaia = true;
                }
                const commandsText = typeof data.commands === "string"
                    ? data.commands
                    : (Array.isArray(data.commands) ? data.commands.join("\n") : "");
                if (commandsText.includes("〈オリジン〉")) {
                    isGaia = true;
                }

                result.profile.name = data.name || "";
                result.profile.memo = data.memo || "";
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

                const emoAttrMap = {
                    "精神":"power","五感":"senses","身体":"strength","社会":"social",
                    "運勢":"luck", "真価":"luck",
                    "知力":"intellect","器用":"dexterity","魅力":"appearance",
                    "共鳴感情・表":"emotion_front","共鳴感情・裏":"emotion_back","共鳴感情・ルーツ":"emotion_root"
                };

                if (Array.isArray(data.params)) {
                    data.params.forEach(p => {
                        const key = emoAttrMap[p.label] || p.label;
                        result.attributes[String(key).toLowerCase()] = p.value;
                    });
                }

                if (commandsText) {
                    const skillRegex = /(\d+)D[MA].*?〈(.+?)〉/g;
                    let match;
                    while ((match = skillRegex.exec(commandsText)) !== null) {
                        const diceNum = match[1];
                        const rawSkillName = match[2];
                        if (rawSkillName.startsWith('＊') || rawSkillName.startsWith('∞')) continue;
                        result.skills[rawSkillName] = diceNum;
                    }
                }

                return result;
            } catch (e) {
                console.error("JSON解析失敗、テキスト形式として続行します", e);
                // 下のテキスト解析へフォールバック
            }
        }

        // --- いあきゃらテキスト出力 ---
        const looksLikeIachara = trimmedText.startsWith('いあきゃら')
            || /名前:\s*/.test(trimmedText)
            || /(?:^|\n)\s*STR\s+\d+/i.test(trimmedText);
        if (looksLikeIachara) {
            const profileFields = {
                job: /職業:\s*([^/\n]+)/,
                age: /年齢:\s*([^/\n]+)/,
                gender: /性別:\s*([^/\n]+)/,
                height: /身長:\s*([^/\n]+)/,
                weight: /体重:\s*([^/\n]+)/,
                origin: /出身:\s*([^/\n]+)/
            };

            // 名前: 本名 (よみがな) 形式に対応
            const nameLine = trimmedText.match(/名前:\s*([^\n]+)/);
            if (nameLine) {
                const rawName = nameLine[1].trim();
                const withReading = rawName.match(/^(.+?)\s*[（(]([^）)]+)[）)]\s*$/);
                if (withReading) {
                    result.profile.name = withReading[1].trim();
                    result.profile.reading = withReading[2].trim();
                } else {
                    result.profile.name = rawName;
                }
            }
            const readingField = trimmedText.match(/読み仮名:\s*([^/\n]+)/);
            if (readingField && readingField[1].trim()) {
                result.profile.reading = readingField[1].trim();
            }

            for (const [key, regex] of Object.entries(profileFields)) {
                const m = trimmedText.match(regex);
                if (!m) continue;
                const val = m[1].trim();
                if (!val) continue;
                result.profile[key] = (['job', 'gender', 'origin'].includes(key))
                    ? val
                    : (parseInt(val, 10) || null);
            }

            if (trimmedText.includes("6版 v2.0.1") || /いあきゃらテキスト\s*6版/.test(trimmedText) || /\b6版\b/.test(trimmedText)) {
                result.profile.system = "CoC6";
            } else if (trimmedText.includes("7版 v2.0.1") || /いあきゃらテキスト\s*7版/.test(trimmedText) || /\b7版\b/.test(trimmedText)) {
                result.profile.system = "CoC7";
            } else if (trimmedText.includes("ガイアケアTRPG") || trimmedText.includes("真価") || trimmedText.includes("〈オリジン〉")) {
                result.profile.system = "ガイアケアTRPG";
            } else if (trimmedText.includes("エモクロアTRPG")) {
                result.profile.system = "エモクロアTRPG";
            }

            // 能力値表: 「STR  現在値  能力値 ...」の先頭数値（現在値）を採用
            const attrNames = ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU"];
            attrNames.forEach(attr => {
                const reg = new RegExp(`(?:^|\\n)\\s*${attr}\\s+([0-9]+)`, "i");
                const m = trimmedText.match(reg);
                if (m) result.attributes[attr.toLowerCase()] = m[1];
            });

            const excludeParams = new Set([
                "STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU", "IDE",
                "HP", "MP", "SAN", "現在SAN", "最大SAN", "アイデア", "幸運", "知識",
                "耐久力", "DB", "ビルド", "MOV", "マジック・ポイント", "正気度", "技能名"
            ]);

            // 【技能値】〜次の【〜】までに限定（表ヘッダやポイント行を除外）
            const skillSectionMatch = trimmedText.match(/【技能値】([\s\S]*?)(?=\n【[^技]|$)/);
            const skillText = skillSectionMatch ? skillSectionMatch[1] : trimmedText;
            skillText.split("\n").forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;
                if (trimmed.startsWith("『") || trimmed.startsWith("技能名")) return;
                if (trimmed.includes("ポイント:")) return;

                // 技能名 + 空白 + 合計 + 初期値 ...
                const skillMatch = trimmed.match(/^(\S+)\s+(\d+)\s+\d+/);
                if (!skillMatch) return;
                const skillName = skillMatch[1].trim();
                if (!skillName || excludeParams.has(skillName) || excludeParams.has(skillName.toUpperCase())) return;
                result.skills[skillName] = skillMatch[2];
            });

            const memoMatch = trimmedText.match(/【メモ】\s*([\s\S]*)/);
            if (memoMatch) result.profile.memo = memoMatch[1].trim();

            return result;
        }

        return null;
    }

    // --- 3. インポート実行（テキスト欄／.txtファイル共通） ---
    async function applyImportText(text) {
        const source = String(text || "").replace(/^\uFEFF/, "").trim();
        if (!source) {
            Utils.showToast("テキストを貼り付けるか、.txtファイルを選択してください", "error");
            return;
        }

        if (importArea) importArea.value = source;

        const data = parseIachara(source);
        if (!data) {
            Utils.showToast("取り込める形式ではありません。いあきゃら出力またはCCFOLIA形式のJSONを確認してください", "error");
            return;
        }

        if (data.profile.name) form.name.value = data.profile.name;
        if (data.profile.reading) form.reading.value = data.profile.reading;
        if (data.profile.job) form.job.value = data.profile.job;
        if (data.profile.age) form.age.value = data.profile.age;
        if (data.profile.gender) form.gender.value = data.profile.gender;
        if (data.profile.height) form.height.value = data.profile.height;
        if (data.profile.weight) form.weight.value = data.profile.weight;
        if (data.profile.origin) form.origin.value = data.profile.origin;
        if (data.profile.memo) form.memo.value = data.profile.memo;

        // システム切替の描画完了を待ってから能力値・技能を入れる
        if (data.profile.system) {
            systemSelect.value = data.profile.system;
            systemSelect.dispatchEvent(new Event('change'));
            await systemFieldsReady;
        }

        for (const [key, val] of Object.entries(data.attributes || {})) {
            const lowerKey = String(key).toLowerCase();
            const el = dynamicContainer.querySelector(`[name="attr_${lowerKey}"]`);
            if (el) el.value = val;
        }

        for (const [sName, sVal] of Object.entries(data.skills || {})) {
            let found = false;
            const detailMatch = sName.match(/^(.+?)[（\(](.+?)[）\)]$/);

            if (detailMatch) {
                const baseName = detailMatch[1].trim();
                const detailText = detailMatch[2].trim();
                const labelInputs = dynamicContainer.querySelectorAll(`input[name="skill_label"][data-base-name="${baseName}"]`);

                for (const labelInput of labelInputs) {
                    if (labelInput.value === "" || labelInput.value === detailText) {
                        labelInput.value = detailText;
                        const valInput = labelInput.closest('.skill-input-container')?.querySelector('input[name="skill_val"]');
                        if (valInput) valInput.value = sVal;
                        found = true;
                        break;
                    }
                }
            }

            if (!found) {
                const existingInputs = dynamicContainer.querySelectorAll('input[name="skill_val"]');
                for (const input of existingInputs) {
                    const dataName = input.dataset.name || "";
                    if (dataName === sName || dataName === `${sName}（）`) {
                        input.value = sVal;
                        found = true;
                        break;
                    }
                }
            }

            if (!found) {
                addCustomSkillRow(sName, sVal);
            }
        }

        Utils.showToast("インポート内容を反映しました", "success");
    }

    if (btnImport && importArea) {
        btnImport.addEventListener('click', async () => {
            try {
                await applyImportText(importArea.value);
            } catch (err) {
                console.error(err);
                Utils.showToast("インポートに失敗しました", "error");
            }
        });
    }

    if (importFileInput) {
        importFileInput.addEventListener('change', () => {
            const file = importFileInput.files && importFileInput.files[0];
            if (!file) return;

            const name = String(file.name || "").toLowerCase();
            const isText = name.endsWith(".txt")
                || file.type === "text/plain"
                || file.type === "";
            if (!isText) {
                Utils.showToast(".txtファイルを選択してください", "error");
                importFileInput.value = "";
                return;
            }

            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const text = typeof reader.result === "string" ? reader.result : "";
                    await applyImportText(text);
                } catch (err) {
                    console.error(err);
                    Utils.showToast("ファイルの読み込みに失敗しました", "error");
                } finally {
                    importFileInput.value = "";
                }
            };
            reader.onerror = () => {
                Utils.showToast("ファイルの読み込みに失敗しました", "error");
                importFileInput.value = "";
            };
            reader.readAsText(file, "UTF-8");
        });
    }

    function renderDynamicFields(attrs, skills) {
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

        let imageUrl = null;
        if (imageFileInput?.files[0]) {
            imageUrl = await Utils.uploadImageAsWebp(imageFileInput.files[0], "character");
        }

        const payload = {
            character: {
                name: form.name.value,
                reading: form.reading.value,
                player_id: form.player_id.value,
                system: systemSelect.value,
                job: form.job.value,
                age: parseInt(form.age.value) || null,
                gender: form.gender.value,
                height: parseInt(form.height.value) || null,
                weight: parseInt(form.weight.value) || null,
                origin: form.origin.value,
                memo: form.memo.value,
                race: (systemSelect.value === "ガイアケアTRPG" && form.race.value) ? form.race.value : null,
                original_species: (systemSelect.value === "ガイアケアTRPG" && form.original_species.value) ? form.original_species.value : null,
                image_url: imageUrl,
            },
            attributes: [],
            skills: []
        };

        // 能力値の収集
        dynamicContainer.querySelectorAll('[name^="attr_"]').forEach(el => {
            const key = el.name.replace("attr_", "");
            const upperKey = key.toUpperCase();

            if (el.dataset.kind === 'emotion') {
                if (el.value) payload.attributes.push({ key, value_int: null, value_emotion: el.value });
            } else {
                const val = parseInt(el.value, 10);
                if (!isNaN(val)) payload.attributes.push({ key: upperKey, value_int: val, value_emotion: null });
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
            Utils.showToast("作成失敗", "error");
            submitBtn.disabled = false;
        }
    });


});
})();