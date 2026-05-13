"use strict";

let currentCharData = null;
let currentSkillRows = null;
let currentSystemAttrs = []; 
let currentCharAttrsMap = new Map();
let allScenarios = []; // 全シナリオマスタ
let currentCharacterScenarios = []; // このキャラが通過済みのIDリスト

function renderMultilineText(text) {
  const normalized = String(text)
    .replaceAll("\r\n", "\n")
    .replaceAll("\\n", "\n");
  const escaped = Utils.escapeHtml(normalized);
  return escaped.replaceAll("\n", "<br>");
}

function renderLink(url, label) {
  const u = String(url ?? "").trim();
  if (!u) return "";
  // https:// などを想定。escapeHtmlして属性に入れる
  const safe = Utils.escapeHtml(u);
  const text = Utils.escapeHtml(label ?? u);
  return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

function toIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const root = document.getElementById("character-detail");
  if (!root) return;

  await Utils.initAuthAndHeader('common-nav', '../');

  const id = Utils.getQueryParam("id");
  if (!id) {
    root.innerHTML = "<p>キャラクターIDが指定されていません</p>";
    return;
  }

  try {
    const [characters, scenarios, runs, scenarioIds, skillRows] = await Promise.all([
      Utils.apiGet("characters"),
      Utils.apiGet("scenarios"),
      // フォールバック用（character_scenarios が未整備でも通過シナリオ表示できる）
      Utils.apiGet("runs"),
      // 正規化：キャラ→シナリオ（無ければ空に）
      Utils.apiGet(`character_scenarios?character_id=${encodeURIComponent(id)}`).catch(() => []),
      // 正規化：キャラ技能（無ければ空に）
      Utils.apiGet(`character_skill_list?character_id=${encodeURIComponent(id)}`).catch(() => []),
    ]);

    const editBtn = `<button id="btn-open-char-edit" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8rem;">📝</button>`;
    const skillsEditBtn = `<button id="btn-open-skills-edit" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8rem; margin-left: 10px;">📝</button>`;
    const paramsEditBtn = `<button id="btn-open-params-edit" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8rem; margin-left: 10px;">📝</button>`;
    const emotionsEditBtn = `<button id="btn-open-emotions-edit" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8rem; margin-left: 10px;">📝</button>`;
    const scenarioEditBtn = `<button id="btn-open-scenarios-edit" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8rem; margin-left: 10px;">📝</button>`;
    const charactersSafe = Array.isArray(characters) ? characters : [];
    const scenariosSafe = Array.isArray(scenarios) ? scenarios : [];
    const runsSafe = Array.isArray(runs) ? runs : [];

    const scenariosById = new Map(scenariosSafe.map(s => [s.id, s]));

    const c = charactersSafe.find(ch => ch?.id === id);
    if (!c) {
      root.innerHTML = "<p>キャラクターが見つかりません</p>";
      return;
    }

        // プレイヤー一覧を取得してセレクトボックスに詰める
    const players = await Utils.apiGet("players");
    const playerSelect = document.getElementById("player-select");
    if (playerSelect) {
        playerSelect.innerHTML = '<option value="">選択してください</option>'; // 初期化
        players.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.player_id;
            opt.textContent = p.player_name;
            playerSelect.appendChild(opt);
        });
    }

    currentCharData = c; // 編集モーダルで使用するためグローバルに保持
    currentSkillRows = Array.isArray(skillRows) ? skillRows : []; // 技能編集モーダル用

    // ここから汎用属性（system_attributes / character_attributes）
    const [systemAttrDefs, characterAttrRows] = await Promise.all([
      Utils.apiGet(`system_attributes?system=${encodeURIComponent(c.system ?? "")}`).catch(() => []),
      Utils.apiGet(`character_attributes?character_id=${encodeURIComponent(id)}`).catch(() => []),
    ]);

    const sysDefsSafe = Array.isArray(systemAttrDefs) ? systemAttrDefs : [];
    const attrMap = buildCharacterAttributeMap(characterAttrRows);
    currentSystemAttrs = sysDefsSafe
    currentCharAttrsMap = attrMap

    const hasGeneric = sysDefsSafe.length > 0;

    // 画像（規約生成）
    const src = Utils.getCharacterImagePath(c.id);
    const fallback = Utils.DEFAULT_CHARACTER_IMAGE;

    // プロフィール（columns）
    const rawProfileRows = [
      { label: "職業", value: c.job },
      { label: "年齢", value: c.age },
      { label: "性別", value: c.gender },
      { label: "身長", value: c.height ? `${c.height}cm` : "" },
      { label: "体重", value: c.weight ? `${c.weight}kg` : "" },
      { label: "出身", value: c.origin },
      { label: "プレイヤー", value: c.players.player_name },
      { label: "システム", value: c.system }
    ];

    // ★ガイアケアTRPGの場合のみ追加
    if (c.system === "ガイアケアTRPG") {
      rawProfileRows.push({ label: "種族", value: c.race, isSpoiler: true });
      rawProfileRows.push({ label: "原種", value: c.original_species, isSpoiler: true });
    }

    // HTMLの行(tr)要素として組み立てる
    const profileRowsHtml = rawProfileRows
      .filter(r => r.value !== undefined && r.value !== null && String(r.value).trim() !== "")
      .map(r => {
        const escapedVal = Utils.escapeHtml(String(r.value));
        // スポイラー設定がある場合は span で囲む
        const valHtml = r.isSpoiler ? `<span class="spoiler-field">${escapedVal}</span>` : escapedVal;
        return `
          <tr>
            <th>${Utils.escapeHtml(r.label)}</th>
            <td>${valHtml}</td>
          </tr>
        `;
      }).join("");


    // 能力値（ability_* columns -> object）
    const abilities = {
      STR: toIntOrNull(c.ability_str),
      CON: toIntOrNull(c.ability_con),
      POW: toIntOrNull(c.ability_pow),
      DEX: toIntOrNull(c.ability_dex),
      APP: toIntOrNull(c.ability_app),
      SIZ: toIntOrNull(c.ability_siz),
      INT: toIntOrNull(c.ability_int),
      EDU: toIntOrNull(c.ability_edu),
    };
    for (const k of Object.keys(abilities)) {
      if (abilities[k] === null) delete abilities[k];
    }

    const memo = c.memo ?? "";

    // 技能（DBの view: character_skill_list を前提）
    // 想定カラム: name, base_value, override_value, display_value
    const skillList = (Array.isArray(skillRows) ? skillRows : [])
      .map(r => {
        const name = r?.name;
        if (!name) return null;

        const base = toIntOrNull(r?.base_value);
        const override = toIntOrNull(r?.override_value);
        const display = toIntOrNull(r?.display_value);

        // display_value が無い/壊れてる場合の最終フォールバック
        const finalValue = display ?? override ?? base;

        if (finalValue === null) return null;

        return {
          name: String(name),
          base_value: base,
          override_value: override,
          display_value: finalValue,
        };
      })
      .filter(Boolean);

    // ▼表示ポリシー（デフォ：初期値から上がってる技能だけ＝overrideがあるもの）
    // 「全部表示」にしたいなら、この filter を消す（または別UIで切替）
    const skillEntries = skillList;

    // 通過シナリオ：character_scenarios が優先。空なら runs逆引きにフォールバック
    let passedScenarioIds = Array.isArray(scenarioIds) ? scenarioIds : [];
    if (passedScenarioIds.length === 0) {
      const relatedRuns = runsSafe
        .filter(r => Array.isArray(r?.characters) && r.characters.includes(c.id));
      passedScenarioIds = [...new Set(relatedRuns.map(r => r?.scenario_id).filter(Boolean))];
    }

    allScenarios = scenariosById; // 編集モーダルで使用するためグローバルに保持
    currentCharacterScenarios = passedScenarioIds; // 編集モーダルで使用するためグローバルに保持

    const iacharaLinkHtml = c.iachara_url
      ? `<section class="character-detail-url">
        <h2 class="character-detail-h2">キャラシート</h2>
          <ul>
            <li>${renderLink(c.iachara_url, "開く")}</li>
          </ul>
        </section>`
      : "";

    const passedHtml = passedScenarioIds.length
    ? `<ul class="character-detail-scenario-list">
        ${passedScenarioIds.map(row => {
          // row がオブジェクトなら scenario_id を、文字列ならそのまま ID として扱う
          const sid = (typeof row === 'object' && row !== null) ? row.scenario_id : row;
          if (!sid) return ""; // IDが取れない場合はスキップ

          const s = scenariosById.get(sid);
          const title = s?.title ?? sid;
          return `<li>
            <a class="character-detail-link" href="../scenarios/detail.html?id=${encodeURIComponent(sid)}">
              ${Utils.escapeHtml(title)}
            </a>
          </li>`;
        }).join("")}
      </ul>`
    : `<p class="character-detail-muted">なし</p>`;

    root.innerHTML = `
      <header class="character-detail-header">
        <h1 class="character-detail-title">${Utils.escapeHtml(c.name)}</h1>
        ${c.state ? `<span class="character-detail-badge ${Utils.escapeHtml(c.state)}">${Utils.escapeHtml(String(c.state).toUpperCase())}</span>` : ""}
      </header>

      <section class="character-detail-top">
        <div class="character-detail-imagewrap">
          <img class="character-detail-image"
            src="${src}"
            onerror="this.onerror=null; this.src='${fallback}';"
            alt="${Utils.escapeHtml(c.name ?? c.id ?? "")}"
            loading="lazy"
          >
        </div>

        <article class="character-detail-panel character-detail-profile">
          <h2 class="character-detail-h2">プロフィール${editBtn}</h2>

          <table class="character-detail-table">
            <tbody>
              ${profileRowsHtml}
            </tbody>
          </table>
        </article>
      </section>

      <section class="character-detail-bottom">
        <div class="character-detail-panels">
          <div class="character-detail-tripanel">
            <article class="character-detail-panel">
              <h2 class="character-detail-h2">能力値${paramsEditBtn}</h2>

              ${hasGeneric
                ? renderGenericAttributes(c.system, sysDefsSafe, attrMap, "int")
                : (
                  Object.keys(abilities).length
                    ? `
                      <div class="character-detail-chips">
                        ${Object.entries(abilities).map(([k, v]) => `
                          <span class="character-detail-chip">
                            <span class="character-detail-chip-key">${Utils.escapeHtml(k)}</span>
                            <span class="character-detail-chip-val">${Utils.escapeHtml(String(v))}</span>
                          </span>
                        `).join("")}
                      </div>
                    `
                    : `<p class="character-detail-muted">未登録</p>`
                )
              }
            </article>

            ${hasGeneric && c.system === "エモクロアTRPG" ? `
              <article class="character-detail-panel character-detail-emotions">
                <h2 class="character-detail-h2">共鳴感情${emotionsEditBtn}</h2>
                ${renderGenericAttributes(c.system, sysDefsSafe, attrMap, "emotion")}
              </article>
            ` : ``}

            ${hasGeneric && c.system === "ガイアケアTRPG" ? `
              <article class="character-detail-panel character-detail-emotions">
                <h2 class="character-detail-h2">共鳴感情${emotionsEditBtn}</h2>
                ${renderGenericAttributes(c.system, sysDefsSafe, attrMap, "emotion")}
              </article>
            ` : ``}

            <article class="character-detail-panel">
              <h2 class="character-detail-h2">技能${skillsEditBtn}</h2>
              ${skillEntries.length ? `
                <div class="character-detail-chips">
                  ${skillEntries.map(s => `
                    <span class="character-detail-chip character-detail-chip--skill">
                      <span class="character-detail-chip-key">${Utils.escapeHtml(s.name)}</span>
                      <span class="character-detail-chip-val">${Utils.escapeHtml(String(s.display_value))}</span>
                    </span>
                  `).join("")}
                </div>
              ` : `<p class="character-detail-muted">（初期値以上の技能なし）</p>`}
            </article>
          </div>
          <article class="character-detail-panel character-detail-panel--full">
            <h2 class="character-detail-h2">メモ</h2>
            ${memo && String(memo).trim() !== ""
              ? `<p class="character-detail-memo">${renderMultilineText(memo)}</p>`
              : `<p class="character-detail-muted">未登録</p>`}
          </article>

        </div>
      </section>

      <section class="character-detail-scenarios">
        <h2 class="character-detail-h2">通過シナリオ${scenarioEditBtn}</h2>
        ${passedHtml}
      </section>

      
        ${iacharaLinkHtml}
      
    `;

    // --- 編集モーダルを開く処理 ---
    document.addEventListener('click', (e) => {
      // クリックされた要素のIDが 'btn-open-char-edit' かどうか判定
      if (e.target && e.target.id === 'btn-open-char-edit') {
          const modal = document.getElementById('edit-character-modal');
          const form = document.getElementById('edit-character-form');
          
          if (!currentCharData) {
              alert("データの読み込みが完了していません。リロードしてください。");
              return;
          }
          
          // フォームに値をセット
          form.name.value = currentCharData.name || "";
          form.player_id.value = currentCharData.player_id || "";
          form.state.value = currentCharData.state || "survived";
          form.job.value = currentCharData.job || "";
          form.age.value = currentCharData.age || "";
          form.gender.value = currentCharData.gender || "";
          form.height.value = currentCharData.height || "";
          form.weight.value = currentCharData.weight || "";
          form.origin.value = currentCharData.origin || "";
          form.iachara_url.value = currentCharData.iachara_url || "";
          form.memo.value = currentCharData.memo || "";
          
          modal.style.display = 'block';
      }
        // モーダルの外側をクリックしたら閉じる（おまけの親切機能）
        const modal = document.getElementById('edit-character-modal');
        if (e.target === modal) {
          modal.style.display = 'none';
        }

      // キャンセルボタンの判定
      if (e.target && e.target.id === 'btn-close-char-edit') {
          document.getElementById('edit-character-modal').style.display = 'none';
      }
    });

    // --- 更新実行処理 ---
    document.getElementById('edit-character-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        
        // 全項目をpayloadにまとめる
        const payload = {
            name: fd.get("name"),
            player_name: fd.get("players.player_name"),
            state: fd.get("state"),
            job: fd.get("job"),
            age: toIntOrNull(fd.get("age")),
            gender: fd.get("gender"),
            height: toIntOrNull(fd.get("height")),
            weight: toIntOrNull(fd.get("weight")),
            origin: fd.get("origin"),
            iachara_url: fd.get("iachara_url"),
            memo: fd.get("memo")
        };

        try {
            await Utils.apiPatch("characters", payload, `id=eq.${currentCharData.id}`);
            alert("キャラクター情報を更新しました");
            location.reload();
        } catch (err) {
            console.error(err);
            alert("更新に失敗しました: " + err.message);
        }
    });

    // 技能行を追加する補助関数
    function addSkillInputRow(name = "", value = 0) {
        const container = document.getElementById('edit-skills-container');
        const div = document.createElement('div');
        div.className = 'skill-edit-item';
        div.style = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';
        div.innerHTML = `
            <input type="text" name="skill_name" class="form-control" value="${Utils.escapeHtml(name)}" placeholder="技能名" style="flex: 2;">
            <input type="number" name="skill_value" class="form-control" value="${value}" style="flex: 1;">
            <button type="button" class="btn-delete-skill" style="background:none; border:none; color:var(--danger-color); cursor:pointer; font-size:1.2rem;">×</button>
        `;
        div.querySelector('.btn-delete-skill').onclick = () => div.remove();
        container.appendChild(div);
    }

    // イベントリスナー
    document.addEventListener('click', (e) => {
        // モーダルを開く
        if (e.target.id === 'btn-open-skills-edit') {
            const modal = document.getElementById('edit-skills-modal');
            const container = document.getElementById('edit-skills-container');
            container.innerHTML = '';
            
            // 現在の技能データを回して入力欄を作成
            currentSkillRows.forEach(s => addSkillInputRow(s.name, s.display_value));
            
            modal.style.display = 'block';
        }

        // モーダルの外側をクリックしたら閉じる（おまけの親切機能）
        const modal = document.getElementById('edit-skills-modal');
        if (e.target === modal) {
          modal.style.display = 'none';
        }

        // キャンセル
        if (e.target.id === 'btn-close-skills-edit') {
            document.getElementById('edit-skills-modal').style.display = 'none';
        }
    });

    // 技能追加ボタン
    document.getElementById('btn-add-skill-row')?.addEventListener('click', () => {
        addSkillInputRow("", 0);
    });

    // 技能保存実行
    document.getElementById('edit-skills-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const names = fd.getAll("skill_name");
        const values = fd.getAll("skill_value");

        const skillsPayload = names.map((name, i) => ({
            character_id: currentCharData.id,
            name: name.trim(),
            value: parseInt(values[i], 10) || 0
        })).filter(s => s.name !== "");

        try {
            // Worker経由でUpsert実行
            await Utils.apiPost("character_skills", skillsPayload);
            alert("技能値を更新しました");
            location.reload();
        } catch (err) {
            console.error(err);
            alert("更新に失敗しました");
        }
    });

  } catch (e) {
    console.error(e);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

document.addEventListener('click', (e) => {
    // --- 能力値（数値）モーダルを開く ---
    if (e.target.id === 'btn-open-params-edit') {
        const container = document.getElementById('edit-params-container');
        container.innerHTML = '';
        currentSystemAttrs.filter(d => d.kind !== 'emotion').forEach(def => {
            const attr = currentCharAttrsMap.get(def.key) || {};
            appendAttrInput(container, def, attr.value_int ?? 0, 'number', 'attr_value');
        });
        document.getElementById('edit-params-modal').style.display = 'block';
    }

    // --- 共鳴感情モーダルを開く ---
    if (e.target.id === 'btn-open-emotions-edit') {
        const container = document.getElementById('edit-emotions-container');
        container.innerHTML = '';
        
        // 感情(emotion)属性のみをフィルタリング
        currentSystemAttrs.filter(d => d.kind === 'emotion').forEach(def => {
            const attr = currentCharAttrsMap.get(def.key) || {};
            // 第4引数を 'select' に変更
            appendAttrInput(container, def, attr.value_emotion || '', 'select', 'attr_value_emo');
        });
        
        document.getElementById('edit-emotions-modal').style.display = 'block';
    }

    // モーダルの外側をクリックしたら閉じる（おまけの親切機能）
    const paramsModal = document.getElementById('edit-params-modal');
    if (e.target === paramsModal) {
      paramsModal.style.display = 'none';
    }
    const emotionsModal = document.getElementById('edit-emotions-modal');
    if (e.target === emotionsModal) {
      emotionsModal.style.display = 'none';
    }
    // キャンセルボタン
    if (e.target.id === 'btn-close-params-edit') document.getElementById('edit-params-modal').style.display = 'none';
    if (e.target.id === 'btn-close-emotions-edit') document.getElementById('edit-emotions-modal').style.display = 'none';
});

// イベントリスナー
document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-open-scenarios-edit') {
        const container = document.getElementById('edit-scenarios-container');
        container.innerHTML = '';
        
        // 現在の通過シナリオを表示
        if (currentCharacterScenarios.length > 0) {
            currentCharacterScenarios.forEach(id => addScenarioInputRow(id));
        } else {
            addScenarioInputRow(); // 空の行を1つ出す
        }
        document.getElementById('edit-scenarios-modal').style.display = 'block';
    }

    const scenariosModal = document.getElementById('edit-scenarios-modal');
    if (e.target === scenariosModal) {
      scenariosModal.style.display = 'none';
    }

    if (e.target.id === 'btn-close-scenarios-edit') {
        document.getElementById('edit-scenarios-modal').style.display = 'none';
    }
});

document.getElementById('btn-add-scenario-row')?.addEventListener('click', () => addScenarioInputRow());

// 保存処理
document.getElementById('edit-scenarios-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const ids = fd.getAll("scenario_id").filter(id => id !== "");

    const payload = ids.map(id => ({
        character_id: currentCharData.id,
        scenario_id: id
    }));

    try {
        // ※ character_scenariosへのPOST (Upsert) を実行
        await Utils.apiPost("character_scenarios", payload);
        alert("通過シナリオを更新しました");
        location.reload();
    } catch (err) {
        console.error(err);
        alert("更新に失敗しました");
    }
});

// 隠しフィールドをクリックしたら開示する
document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('spoiler-field')) {
        e.target.classList.toggle('revealed');
    }
});

// データの流し込み（例）
function renderDetail(data) {
    const raceEl = document.getElementById('display-race');
    const originEl = document.getElementById('display-original-species');
    
    if (raceEl) raceEl.textContent = data.race || '未設定';
    if (originEl) originEl.textContent = data.original_species || '未設定';
}

// 入力行を生成する共通補助関数（select対応版）
function appendAttrInput(container, def, value, inputType, inputName) {
    const div = document.createElement('div');
    div.className = 'form-group';
    div.style.marginBottom = '12px';

    let inputHtml = "";
    if (inputType === 'select') {
        // Utils.emotions をループして option を作成
        const options = Utils.emotions.map(emo => {
            const selected = (emo === value) ? 'selected' : '';
            return `<option value="${Utils.escapeHtml(emo)}" ${selected}>${Utils.escapeHtml(emo)}</option>`;
        }).join("");
        
        inputHtml = `
            <select name="${inputName}" class="form-control">
                <option value="">-- 選択してください --</option>
                ${options}
            </select>`;
    } else {
        inputHtml = `<input type="${inputType}" name="${inputName}" class="form-control" value="${Utils.escapeHtml(String(value))}">`;
    }

    div.innerHTML = `
        <label style="display:block; margin-bottom:4px; font-weight:bold;">${Utils.escapeHtml(def.label)}</label>
        <input type="hidden" name="attr_key" value="${def.key}">
        ${inputHtml}
    `;
    container.appendChild(div);
}

// シナリオ入力行を追加する関数
function addScenarioInputRow(selectedId = "") {
    const container = document.getElementById('edit-scenarios-container');
    const div = document.createElement('div');
    div.className = 'scenario-edit-item';
    div.style = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';
    
    // --- 修正ポイント：Mapから配列に変換してループする ---
    const scenariosArray = (allScenarios instanceof Map) 
        ? Array.from(allScenarios.values()) 
        : (Array.isArray(allScenarios) ? allScenarios : []);

    const options = scenariosArray.map(s => {
        const selected = (String(s.id) === String(selectedId)) ? 'selected' : '';
        return `<option value="${Utils.escapeHtml(String(s.id))}" ${selected}>${Utils.escapeHtml(s.title)}</option>`;
    }).join("");

    div.innerHTML = `
        <select name="scenario_id" class="form-control" style="flex: 1;">
            <option value="">-- シナリオを選択 --</option>
            ${options}
        </select>
        <button type="button" class="btn-delete-row" style="background:none; border:none; color:var(--danger-color); cursor:pointer;">×</button>
    `;
    div.querySelector('.btn-delete-row').onclick = () => div.remove();
    container.appendChild(div);
}

// 能力値（数値）保存
document.getElementById('edit-params-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const keys = fd.getAll("attr_key");
    const vals = fd.getAll("attr_value");
    const payload = keys.map((key, i) => ({
        character_id: currentCharData.id,
        key: key,
        value_int: parseInt(vals[i], 10) || 0
    }));
    await saveAttributes(payload);
});

// 共鳴感情保存
document.getElementById('edit-emotions-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const keys = fd.getAll("attr_key");
    const vals = fd.getAll("attr_value_emo");
    const payload = keys.map((key, i) => ({
        character_id: currentCharData.id,
        key: key,
        value_emotion: vals[i]
    }));
    await saveAttributes(payload);
});

async function saveAttributes(payload) {
    try {
        await Utils.apiPost("character_attributes", payload);
        alert("更新しました");
        location.reload();
    } catch (err) {
        console.error(err);
        alert("更新に失敗しました");
    }
}

function buildCharacterAttributeMap(rows) {
  const map = new Map();
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const key = r?.key;
    if (!key) continue;
    map.set(String(key), {
      value_int: r?.value_int ?? null,
      value_emotion: r?.value_emotion ?? null,
    });
  }
  return map;
}

// 統合版：数値・感情の両方に対応する属性レンダリング関数
function renderGenericAttributes(system, defs, attrMap, targetKind) {
  const safeDefs = (Array.isArray(defs) ? defs : [])
    .slice()
    .sort((a, b) => (Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0)));

  // 指定されたkind（int または emotion）でフィルタリング
  const targetDefs = safeDefs.filter(d => d?.kind === targetKind);
  const chips = [];

  // 派生値（HP/MP）の計算処理（数値モードの時のみ実行）
  if (targetKind === "int" && (system === "エモクロアTRPG" || system === "ガイアケアTRPG")) {
    const body = Number(attrMap.get("body")?.value_int);
    const spirit = Number(attrMap.get("spirit")?.value_int);
    const intellect = Number(attrMap.get("intellect")?.value_int);

    if (Number.isFinite(body)) chips.push(["HP", String(body + 10)]);
    if (Number.isFinite(spirit) && Number.isFinite(intellect)) chips.push(["MP", String(spirit + intellect)]);
  }

  for (const d of targetDefs) {
    const key = String(d.key);
    const label = d.label ?? key;
    const v = attrMap.get(key);
    let display = "—";
    
    // kindに応じて取得する値を切り替え
    if (targetKind === "int") {
        const n = Number(v?.value_int);
        if (Number.isFinite(n)) display = String(n);
    } else {
        const e = v?.value_emotion;
        if (e !== null && e !== undefined && String(e).trim() !== "") display = String(e);
    }
    
    chips.push([label, display]);
  }

  if (chips.length === 0) return `<p class="character-detail-muted">未登録</p>`;

  return `
    <div class="character-detail-chips">
      ${chips.map(([k, v]) => `
        <span class="character-detail-chip">
          <span class="character-detail-chip-key">${Utils.escapeHtml(String(k))}</span>
          <span class="character-detail-chip-val">${Utils.escapeHtml(String(v))}</span>
        </span>
      `).join("")}
    </div>
  `;
}

function renderGenericIntAttributes(system, defs, attrMap) {
  const safeDefs = (Array.isArray(defs) ? defs : [])
    .slice()
    .sort((a, b) => (Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0)));

  const intDefs = safeDefs.filter(d => d?.kind === "int");
  const chips = [];

  // ★修正：派生値（HP/MP）の計算処理のスコープエラーを解消
  if (system === "エモクロアTRPG" || system === "ガイアケアTRPG") {
    const body = Number(attrMap.get("body")?.value_int);
    const spirit = Number(attrMap.get("spirit")?.value_int);
    const intellect = Number(attrMap.get("intellect")?.value_int);

    if (Number.isFinite(body)) chips.push(["HP", String(body + 10)]);
    if (Number.isFinite(spirit) && Number.isFinite(intellect)) chips.push(["MP", String(spirit + intellect)]);
  }

  for (const d of intDefs) {
    const key = String(d.key);
    const label = d.label ?? key;
    const v = attrMap.get(key);
    let display = "—";
    const n = Number(v?.value_int);
    if (Number.isFinite(n)) display = String(n);
    chips.push([label, display]);
  }

  if (chips.length === 0) return `<p class="character-detail-muted">未登録</p>`;

  return `
    <div class="character-detail-chips">
      ${chips.map(([k, v]) => `
        <span class="character-detail-chip">
          <span class="character-detail-chip-key">${Utils.escapeHtml(String(k))}</span>
          <span class="character-detail-chip-val">${Utils.escapeHtml(String(v))}</span>
        </span>
      `).join("")}
    </div>
  `;
}

function renderGenericEmotionAttributes(defs, attrMap) {
  const safeDefs = (Array.isArray(defs) ? defs : [])
    .slice()
    .sort((a, b) => (Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0)));

  const emoDefs = safeDefs.filter(d => d?.kind === "emotion");
  const chips = [];

  for (const d of emoDefs) {
    const key = String(d.key);
    const label = d.label ?? key;
    const v = attrMap.get(key);
    let display = "—";
    const e = v?.value_emotion;
    if (e !== null && e !== undefined && String(e).trim() !== "") display = String(e);
    chips.push([label, display]);
  }

  if (chips.length === 0) return `<p class="character-detail-muted">未登録</p>`;

  return `
    <div class="character-detail-chips">
      ${chips.map(([k, v]) => `
        <span class="character-detail-chip">
          <span class="character-detail-chip-key">${Utils.escapeHtml(String(k))}</span>
          <span class="character-detail-chip-val">${Utils.escapeHtml(String(v))}</span>
        </span>
      `).join("")}
    </div>
  `;
}

main();
