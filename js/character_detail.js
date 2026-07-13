"use strict";

let currentCharData = null;
let currentSkillRows = null;
let currentSystemAttrs = []; 
let currentCharAttrsMap = new Map();
let allScenarios = []; 
let currentCharacterScenarios = []; 

function renderLink(url, label) {
  const u = String(url ?? "").trim();
  if (!u) return "";
  const safe = Utils.escapeHtml(u);
  const text = Utils.escapeHtml(label ?? u);
  return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

function toIntOrNull(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ==========================================
// ★完成版：ココフォリア用データ生成ロジック（仕様書完全準拠）
// ==========================================
function generateCcfoliaData() {
  const c = currentCharData;
  if (!c) return null;

  const data = {
    name: c.name,
    memo: "",
    initiative: 0,
    externalUrl: c.iachara_url || window.location.href,
    status: [],
    params: [],
    commands: ""
  };

  // 汎用能力値・感情をマップから安全に取得するヘルパー
  const getAttrInt = (key) => currentCharAttrsMap.get(String(key).toUpperCase())?.value_int ?? 0;
  const getAttrEmotion = (key) => currentCharAttrsMap.get(String(key).toLowerCase())?.value_emotion || "なし";

  // 1. 基本能力値の定義
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

  // システム別の詳細切り替えロジック
  if (c.system === 'CoC6' || c.system === 'クトゥルフ神話TRPG(6版)') {
    // ① 基本属性・ステータス
    const dex = abilities.DEX ?? getAttrInt('DEX');
    data.initiative = dex;

    const con = abilities.CON ?? getAttrInt('CON');
    const siz = abilities.SIZ ?? getAttrInt('SIZ');
    const pow = abilities.POW ?? getAttrInt('POW');
    const int = abilities.INT ?? getAttrInt('INT');
    const edu = abilities.EDU ?? getAttrInt('EDU');

    const hp = Math.ceil((con + siz) / 2);
    const mp = pow;
    const san = pow * 5;

    data.status.push({ label: "HP", value: hp, max: hp });
    data.status.push({ label: "MP", value: mp, max: mp });
    data.status.push({ label: "SAN", value: san, max: san });

    const keys = ['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU'];
    keys.forEach(k => {
      const val = abilities[k] ?? getAttrInt(k);
      data.params.push({ label: k, value: String(val) });
    });

    // ② ダメージボーナス判定
    const str = abilities.STR ?? getAttrInt('STR');
    const sum = str + siz;
    let db = "0";
    if (sum >= 2 && sum <= 12) db = "-1d6";
    else if (sum >= 13 && sum <= 16) db = "-1d4";
    else if (sum >= 17 && sum <= 24) db = "0";
    else if (sum >= 25 && sum <= 32) db = "+1d4";
    else if (sum >= 33 && sum <= 40) db = "+1d6";
    else if (sum >= 41 && sum <= 46) db = "+2d6";
    else if (sum >= 47 && sum <= 56) db = "+3d6";

    // ③ チャットパレット組み立て
    const commands = [];
    commands.push(`1d100<={SAN} 【正気度ロール】`);
    commands.push(`CCB<=${int * 5} 【アイデア】`);
    commands.push(`CCB<=${pow * 5} 【幸運】`);
    commands.push(`CCB<=${edu * 5} 【知識】`);

    if (currentSkillRows) {
      currentSkillRows.forEach(s => {
        const v = s.display_value ?? s.override_value ?? s.base_value;
        if (v != null) commands.push(`CCB<=${v} 【${s.name}】`);
      });
    }

    const dbSuffix = db === "0" ? "" : db;
    commands.push(`1d3${dbSuffix} 【ダメージ判定】`);
    commands.push(`1d4${dbSuffix} 【ダメージ判定】`);
    commands.push(`1d6${dbSuffix} 【ダメージ判定】`);

    keys.forEach(k => {
      const val = abilities[k] ?? getAttrInt(k);
      commands.push(`CCB<={${k}}*5 【${k}】`);
    });
    data.commands = commands.join("\n");

  } else if (c.system === 'CoC7' || c.system === '新クトゥルフ神話TRPG(7版)') {
    // ① 基本属性・ステータス
    const dex = abilities.DEX ?? getAttrInt('DEX');
    data.initiative = dex; // 仕様書: DEXの値

    const str = abilities.STR ?? getAttrInt('STR');
    const con = abilities.CON ?? getAttrInt('CON');
    const pow = abilities.POW ?? getAttrInt('POW');
    const siz = abilities.SIZ ?? getAttrInt('SIZ');
    const int = abilities.INT ?? getAttrInt('INT');
    const edu = abilities.EDU ?? getAttrInt('EDU');

    const hp = Math.floor((con + siz) / 10);
    const mp = Math.floor(pow / 5);
    const san = pow;

    data.status.push({ label: "HP", value: hp, max: hp });
    data.status.push({ label: "MP", value: mp, max: mp });
    data.status.push({ label: "SAN", value: san, max: san });

    // ② ビルド(BLD) および ダメージボーナス判定
    const sum = str + siz;
    let bld = 0;
    let db = "0";
    if (sum >= 2 && sum <= 64) { bld = -2; db = "-2"; }
    else if (sum >= 65 && sum <= 84) { bld = -1; db = "-1"; }
    else if (sum >= 85 && sum <= 124) { bld = 0; db = "0"; }
    else if (sum >= 125 && sum <= 164) { bld = 1; db = "+1d4"; }
    else if (sum >= 165 && sum <= 204) { bld = 2; db = "+1d6"; }
    else if (sum >= 205 && sum <= 284) { bld = 3; db = "+2d6"; }
    else if (sum >= 285 && sum <= 364) { bld = 4; db = "+3d6"; }

    const keys = ['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU'];
    keys.forEach(k => {
      const val = abilities[k] ?? getAttrInt(k);
      data.params.push({ label: k, value: String(val) });
    });
    data.params.push({ label: "BLD", value: String(bld) });

    // ③ チャットパレット組み立て
    const commands = [];
    commands.push(`1d100<={SAN} 【正気度ロール】`);
    commands.push(`CC<=${int} 【アイデア】`);
    commands.push(`CC<=${pow} 【幸運】`);
    commands.push(`CC<=${edu} 【知識】`);

    if (currentSkillRows) {
      currentSkillRows.forEach(s => {
        const v = s.display_value ?? s.override_value ?? s.base_value;
        if (v != null) commands.push(`CC<={${v}} 【${s.name}】`);
      });
    }

    const dbSuffix = db === "0" ? "" : db;
    commands.push(`1d3${dbSuffix} 【ダメージ判定】`);
    commands.push(`1d4${dbSuffix} 【ダメージ判定】`);
    commands.push(`1d6${dbSuffix} 【ダメージ判定】`);

    commands.push(`CC<={STR} 【STR】`);
    commands.push(`CC<={CON} 【CON】`);
    commands.push(`CC<={POW} 【POW】`);
    commands.push(`CC<={DEX} 【DEX】`);
    commands.push(`CC<={APP} 【APP】`);
    commands.push(`CC<={SIZ} 【SIZ】`);
    commands.push(`CC<={INT} 【INT】`);
    commands.push(`CC<={EDU} 【EDU】`);
    data.commands = commands.join("\n");

  } else if (c.system === 'エモクロアTRPG') {
    // ① 基本属性・ステータス
    data.initiative = getAttrInt('身体');
    data.memo = `共鳴感情・表: ${getAttrEmotion('emotion_front')}\n共鳴感情・裏: ${getAttrEmotion('emotion_back')}\n共鳴感情・ルーツ: ${getAttrEmotion('emotion_root')}`;

    const hp = getAttrInt('身体') + 10;
    const mp = getAttrInt('精神') + getAttrInt('知力');

    data.status.push({ label: "HP", value: hp, max: hp });
    data.status.push({ label: "MP", value: mp, max: mp });
    data.status.push({ label: "共鳴", value: 1, max: 9 });

    const keys = ['身体', '精神', '知力', '器用', '五感', '魅力', '社会', '運勢'];
    keys.forEach(k => data.params.push({ label: k, value: String(getAttrInt(k)) }));

    // ② チャットパレット組み立て
    const commands = [];
    commands.push(`{共鳴}DM<={強度} 〈∞共鳴〉`);
    commands.push(`({共鳴}+1)DM<={強度} 〈∞共鳴〉ルーツ属性一致`);
    commands.push(`({共鳴}*2)DM<={強度} 〈∞共鳴〉完全一致`);

    if (currentSkillRows) {
      currentSkillRows.forEach(s => {
        const v = s.display_value ?? s.override_value ?? s.base_value;
        if (v != null) commands.push(`1DM<=${v} 【${s.name}】`);
      });
    }

    const baseChecks = [
      { k: '器用', n: '調査' }, { k: '五感', n: '知覚' }, { k: '魅力', n: '交渉' }, { k: '知力', n: '知識' },
      { k: '社会', n: 'ニュース' }, { k: '身体', n: '運動' }, { k: '身体', n: '格闘' }, { k: '器用', n: '投擲' },
      { k: '身体', n: '生存' }, { k: '精神', n: '自我' }, { k: '知力', n: '手当て' }, { k: '器用', n: '細工' },
      { k: '運勢', n: '幸運' }
    ];
    baseChecks.forEach(b => commands.push(`1DM<=${getAttrInt(b.k)} 〈＊${b.n}〉`));
    data.commands = commands.join("\n");

  } else if (c.system === 'ガイアケアTRPG') {
    // ① 基本属性・ステータス
    data.initiative = getAttrInt('身体');
    data.memo = `共鳴感情・表: ${getAttrEmotion('emotion_front')}\n共鳴感情・裏: ${getAttrEmotion('emotion_back')}\n共鳴感情・ルーツ: ${getAttrEmotion('emotion_root')}`;

    const hp = getAttrInt('身体') + 10;
    const mp = getAttrInt('精神') + getAttrInt('知力');

    data.status.push({ label: "HP", value: hp, max: hp });
    data.status.push({ label: "MP", value: mp, max: mp });
    data.status.push({ label: "共鳴", value: 1, max: 9 });

    const keys = ['身体', '精神', '知力', '器用', '五感', '魅力', '社会', '真価'];
    keys.forEach(k => data.params.push({ label: k, value: String(getAttrInt(k)) }));

    // ② チャットパレット組み立て
    const commands = [];
    commands.push(`{共鳴}DM<={強度} 〈∞共鳴〉`);
    commands.push(`({共鳴}+1)DM<={強度} 〈∞共鳴〉ルーツ属性一致`);
    commands.push(`({共鳴}*2)DM<={強度} 〈∞共鳴〉完全一致`);

    if (currentSkillRows) {
      currentSkillRows.forEach(s => {
        const v = s.display_value ?? s.override_value ?? s.base_value;
        if (v != null) commands.push(`1DM<=${v} 【${s.name}】`);
      });
    }

    commands.push(`1DA{真価}+({共鳴}) 〈オリジン〉`);
    const baseChecks = [
      { k: '器用', n: '調査' }, { k: '五感', n: '知覚' }, { k: '魅力', n: '交渉' }, { k: '知力', n: '知識' },
      { k: '社会', n: 'ニュース' }, { k: '身体', n: '運動' }, { k: '身体', n: '格闘' }, { k: '器用', n: '投擲' },
      { k: '身体', n: '生存' }, { k: '精神', n: '自我' }, { k: '知力', n: '手当て' }, { k: '器用', n: '細工' },
      { k: '真価', n: '幸運' }
    ];
    baseChecks.forEach(b => commands.push(`1DM<=${getAttrInt(b.k)} 〈＊${b.n}〉`));
    data.commands = commands.join("\n");
  }

  return {
    kind: "character",
    data: data
  };
}

// ==========================================
// --- メイン描画・データ展開ロジック ---
// ==========================================
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
      Utils.apiGet("runs"),
      Utils.apiGet(`character_scenarios?character_id=${encodeURIComponent(id)}`).catch(() => []),
      Utils.apiGet(`character_skill_list?character_id=${encodeURIComponent(id)}`).catch(() => []),
    ]);

    const editBtn = `<button id="btn-open-char-edit" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8rem;">📝</button>`;
    const skillsEditBtn = `<button id="btn-open-skills-edit" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8rem; margin-left: 10px;">📝</button>`;
    const paramsEditBtn = `<button id="btn-open-params-edit" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8rem; margin-left: 10px;">📝</button>`;
    const emotionsEditBtn = `<button id="btn-open-emotions-edit" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8rem; margin-left: 10px;">📝</button>`;
    
    const charactersSafe = Array.isArray(characters) ? characters : [];
    const scenariosSafe = Array.isArray(scenarios) ? scenarios : [];
    const runsSafe = Array.isArray(runs) ? runs : [];

    const scenariosById = new Map(scenariosSafe.map(s => [s.id, s]));

    const c = charactersSafe.find(ch => ch?.id === id);
    if (!c) {
      root.innerHTML = "<p>キャラクターが見つが見つかりません</p>";
      return;
    }

    const players = await Utils.apiGet("players");
    const playerSelect = document.getElementById("player-select");
    if (playerSelect) {
        playerSelect.innerHTML = '<option value="">選択してください</option>'; 
        players.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.player_id;
            opt.textContent = p.player_name;
            playerSelect.appendChild(opt);
        });
    }

    currentCharData = c; 
    currentSkillRows = Array.isArray(skillRows) ? skillRows : []; 

    const [systemAttrDefs, characterAttrRows] = await Promise.all([
      Utils.apiGet(`system_attributes?system=${encodeURIComponent(c.system ?? "")}`).catch(() => []),
      Utils.apiGet(`character_attributes?character_id=${encodeURIComponent(id)}`).catch(() => []),
    ]);

    const sysDefsSafe = Array.isArray(systemAttrDefs) ? systemAttrDefs : [];
    const attrMap = buildCharacterAttributeMap(characterAttrRows);
    currentSystemAttrs = sysDefsSafe;
    currentCharAttrsMap = attrMap;

    const hasGeneric = sysDefsSafe.length > 0;
    const src = Utils.getCharacterImagePath(c.id, c.image_url);
    const fallback = Utils.DEFAULT_CHARACTER_IMAGE;

    const rawProfileRows = [
      { label: "職業", value: c.job },
      { label: "年齢", value: c.age },
      { label: "性別", value: c.gender },
      { label: "身長", value: c.height ? `${c.height}cm` : "" },
      { label: "体重", value: c.weight ? `${c.weight}kg` : "" },
      { label: "出身", value: c.origin },
      { label: "プレイヤー", value: c.players?.player_name },
      { label: "システム", value: c.system }
    ];

    if (c.system === "ガイアケアTRPG") {
      rawProfileRows.push({ label: "種族", value: c.race, isSpoiler: true });
      rawProfileRows.push({ label: "原種", value: c.original_species, isSpoiler: true });
    }

    const profileRowsHtml = rawProfileRows
      .filter(r => r.value !== undefined && r.value !== null && String(r.value).trim() !== "")
      .map(r => {
        const escapedVal = Utils.escapeHtml(String(r.value));
        const valHtml = r.isSpoiler ? `<span class="spoiler-field">${escapedVal}</span>` : escapedVal;
        return `<tr><th>${Utils.escapeHtml(r.label)}</th><td>${valHtml}</td></tr>`;
      }).join("");

    const abilities = {
      STR: toIntOrNull(c.ability_str), CON: toIntOrNull(c.ability_con), POW: toIntOrNull(c.ability_pow),
      DEX: toIntOrNull(c.ability_dex), APP: toIntOrNull(c.ability_app), SIZ: toIntOrNull(c.ability_siz),
      INT: toIntOrNull(c.ability_int), EDU: toIntOrNull(c.ability_edu),
    };
    for (const k of Object.keys(abilities)) { if (abilities[k] === null) delete abilities[k]; }

    const memo = c.memo ?? "";
    const skillEntries = currentSkillRows.map(r => ({
      name: String(r?.name),
      display_value: r?.display_value ?? r?.override_value ?? r?.base_value
    })).filter(s => s.display_value != null);

    let passedScenarioIds = Array.isArray(scenarioIds) ? scenarioIds : [];
    if (passedScenarioIds.length === 0) {
      const relatedRuns = runsSafe
        .filter(r => r.status === 'done' && Array.isArray(r?.characters) && r.characters.includes(c.id));
      passedScenarioIds = [...new Set(relatedRuns.map(r => r?.scenario_id).filter(Boolean))];
    }

    allScenarios = scenariosSafe; 
    currentCharacterScenarios = passedScenarioIds; 

    const iacharaLinkHtml = c.iachara_url
      ? `<section class="character-detail-url"><h2 class="character-detail-h2">キャラシート</h2><ul><li>${renderLink(c.iachara_url, "開く")}</li></ul></section>`
      : "";

    const passedHtml = passedScenarioIds.length
    ? `<ul class="character-detail-scenario-list">${passedScenarioIds.map(row => {
          const sid = (typeof row === 'object' && row !== null) ? row.scenario_id : row;
          if (!sid) return ""; 
          const s = scenariosById.get(sid);
          return `<li><a class="character-detail-link" href="../scenarios/detail.html?id=${encodeURIComponent(sid)}">${Utils.escapeHtml(s?.title ?? sid)}</a></li>`;
        }).join("")}</ul>`
    : `<p class="character-detail-muted">なし</p>`;

    root.innerHTML = `
      ${buildCharacterHeaderHtml(c)}
      ${buildCharacterTopHtml(c, src, fallback, profileRowsHtml, editBtn)}
      ${buildCharacterBottomHtml(c, hasGeneric, sysDefsSafe, attrMap, abilities, skillEntries, memo, paramsEditBtn, emotionsEditBtn, skillsEditBtn)}
      <section class="character-detail-scenarios">
        <h2 class="character-detail-h2">通過シナリオ</h2>
        ${passedHtml}
      </section>
      ${iacharaLinkHtml}
    `;

    // 既存の下部コメントマウント処理の復元
    if (window.Comments && typeof window.Comments.mount === "function") {
      window.Comments.mount("comments-root", "character", id);
    }

  } catch (e) {
    console.error(e);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

// ==========================================
// --- 編集モーダル・インプット制御ロジック群の完全復元 ---
// ==========================================
function addSkillInputRow(name = "", value = 0) {
    const container = document.getElementById('edit-skills-container');
    if (!container) return;
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

function appendAttrInput(container, def, value, inputType, inputName) {
    const div = document.createElement('div');
    div.className = 'form-group';
    div.style.marginBottom = '12px';

    let inputHtml = "";
    if (inputType === 'select') {
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

function renderGenericAttributes(system, defs, attrMap, targetKind) {
  const safeDefs = (Array.isArray(defs) ? defs : []).slice().sort((a, b) => (Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0)));
  const targetDefs = safeDefs.filter(d => d?.kind === targetKind);
  const chips = [];

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
  return `<div class="character-detail-chips">${chips.map(([k, v]) => `<span class="character-detail-chip"><span class="character-detail-chip-key">${Utils.escapeHtml(String(k))}</span><span class="character-detail-chip-val">${Utils.escapeHtml(String(v))}</span></span>`).join("")}</div>`;
}

// ==========================================
// --- グローバル イベントリスナー群の完全復元・統治 ---
// ==========================================
document.addEventListener('click', async (e) => {
    // 1. ココフォリアコピーボタン処理（トースト表示フィードバック含む）
    const copyBtn = e.target.closest('#btn-copy-ccfolia');
    if (copyBtn) {
        const ccfoliaData = generateCcfoliaData();
        if (ccfoliaData) {
            try {
                await navigator.clipboard.writeText(JSON.stringify(ccfoliaData));
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = "✅ ココフォリア形式でコピーしました！";
                copyBtn.style.backgroundColor = "var(--success-color)";
                copyBtn.style.color = "#fff";
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.backgroundColor = "";
                    copyBtn.style.color = "";
                }, 2000);
            } catch (err) {
                console.error("クリップボードコピーに失敗:", err);
                alert("コピーに失敗しました。ブラウザの権限を確認してください。");
            }
        }
    }

    // 2. キャラクター基本情報編集モーダル展開
    if (e.target.id === 'btn-open-char-edit') {
        const modal = document.getElementById('edit-character-modal');
        const form = document.getElementById('edit-character-form');
        if (!currentCharData || !form) {
            alert("データの読み込みが完了していません。リロードしてください。");
            return;
        }
        form.name.value = currentCharData.name || "";
        form.reading.value = currentCharData.reading || "";
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
    
    if (e.target.id === 'btn-close-char-edit') {
        document.getElementById('edit-character-modal').style.display = 'none';
    }

    // 3. 技能編集モーダル展開
    if (e.target.id === 'btn-open-skills-edit') {
        const modal = document.getElementById('edit-skills-modal');
        const container = document.getElementById('edit-skills-container');
        if (container) {
          container.innerHTML = '';
          currentSkillRows.forEach(s => addSkillInputRow(s.name, s.display_value));
        }
        if (modal) modal.style.display = 'block';
    }
    if (e.target.id === 'btn-close-skills-edit') {
        document.getElementById('edit-skills-modal').style.display = 'none';
    }

    // 4. パラメータ(能力値)編集モーダル展開
    if (e.target.id === 'btn-open-params-edit') {
        const container = document.getElementById('edit-params-container');
        if (container) {
          container.innerHTML = '';
          currentSystemAttrs.filter(d => d.kind !== 'emotion').forEach(def => {
              const attr = currentCharAttrsMap.get(def.key) || {};
              appendAttrInput(container, def, attr.value_int ?? 0, 'number', 'attr_value');
          });
        }
        document.getElementById('edit-params-modal').style.display = 'block';
    }
    if (e.target.id === 'btn-close-params-edit') {
        document.getElementById('edit-params-modal').style.display = 'none';
    }

    // 5. 共鳴感情編集モーダル展開
    if (e.target.id === 'btn-open-emotions-edit') {
        const container = document.getElementById('edit-emotions-container');
        if (container) {
          container.innerHTML = '';
          currentSystemAttrs.filter(d => d.kind === 'emotion').forEach(def => {
              const attr = currentCharAttrsMap.get(def.key) || {};
              appendAttrInput(container, def, attr.value_emotion || '', 'select', 'attr_value_emo');
          });
        }
        document.getElementById('edit-emotions-modal').style.display = 'block';
    }
    if (e.target.id === 'btn-close-emotions-edit') {
        document.getElementById('edit-emotions-modal').style.display = 'none';
    }

    // 6. 隠し項目のトグル（種族など）
    if (e.target.classList.contains('spoiler-field')) {
        e.target.classList.toggle('revealed');
    }

    // 7. モーダルの背景クリックによる閉鎖処理
    const modals = [
        document.getElementById('edit-character-modal'),
        document.getElementById('edit-skills-modal'),
        document.getElementById('edit-params-modal'),
        document.getElementById('edit-emotions-modal')
    ];
    if (modals.includes(e.target)) {
        e.target.style.display = 'none';
    }
});

// --- サブミット(Submit)系イベントリスナーの完全復元 ---
document.getElementById('btn-add-skill-row')?.addEventListener('click', () => {
    addSkillInputRow("", 0);
});

document.getElementById('edit-character-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    
    const fileInput = e.target.querySelector('input[name="image_file"]');
    let imageUrl = currentCharData.image_url || null;
    
    if (fileInput && fileInput.files[0]) {
        try {
            const originalFile = fileInput.files[0];
            const compressedBlob = await Utils.compressAndResizeImage(originalFile);

            const formData = new FormData();
            const fileBaseName = originalFile.name.includes('.') 
                ? originalFile.name.substring(0, originalFile.name.lastIndexOf('.')) 
                : originalFile.name;
            const fileName = `${fileBaseName}.webp`;

            formData.append("file", compressedBlob, fileName);
            formData.append("type", "character");
            
            const uploadRes = await fetch(`${API_BASE}/api/upload`, {
                method: "POST",
                body: formData
            });
            if (uploadRes.ok) {
                const uploadResult = await uploadRes.json();
                imageUrl = uploadResult.url;
            } else {
                console.error("画像アップロード失敗:", await uploadRes.text());
            }
        } catch (err) {
            console.error("画像アップロードエラー:", err);
        }
    }

    const payload = {
        name: fd.get("name"),
        player_id: fd.get("player_id"),
        state: fd.get("state"),
        job: fd.get("job"),
        age: toIntOrNull(fd.get("age")),
        gender: fd.get("gender"),
        height: toIntOrNull(fd.get("height")),
        weight: toIntOrNull(fd.get("weight")),
        origin: fd.get("origin"),
        reading: fd.get("reading"),
        iachara_url: fd.get("iachara_url"),
        memo: fd.get("memo"),
        image_url: imageUrl
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
        await Utils.apiDelete("character_skills", `character_id=eq.${currentCharData.id}`);
        if (skillsPayload.length > 0) {
            await Utils.apiPost("character_skills", skillsPayload);
        }
        alert("技能値を更新しました");
        location.reload();
    } catch (err) {
        console.error(err);
        alert("更新に失敗しました");
    }
});

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

// ==========================================
// --- HTML生成系コンポーネントの完全同期 ---
// ==========================================
function buildCharacterHeaderHtml(c) {
  return `
    <header class="character-detail-header" style="display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
      <h1 class="character-detail-title" style="margin: 0; border: none; padding: 0;">
        ${Utils.escapeHtml(c.name)} <span class="character-detail-reading">(${Utils.escapeHtml(c.reading || "")})</span>
      </h1>
      ${c.state ? `<span class="character-detail-badge ${Utils.escapeHtml(c.state)}" style="margin-left: 10px;">${Utils.escapeHtml(String(c.state).toUpperCase())}</span>` : ""}
      
      <button id="btn-copy-ccfolia" class="btn-primary" title="ココフォリア出力形式でクリップボードにコピー" style="margin-left: auto; font-size: 0.9rem; padding: 6px 12px; display: flex; align-items: center; gap: 5px; cursor: pointer;">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
        ココフォリア出力
      </button>
    </header>
  `;
}

function buildCharacterTopHtml(c, src, fallback, profileRowsHtml, editBtn) {
  return `
    <section class="character-detail-top">
      <div class="character-detail-imagewrap">
        <img class="character-detail-image" src="${src}" onerror="this.onerror=null; this.src='${fallback}';" alt="${Utils.escapeHtml(c.name ?? c.id ?? "")}" loading="lazy">
      </div>
      <article class="character-detail-panel character-detail-profile">
        <h2 class="character-detail-h2">プロフィール${editBtn}</h2>
        <table class="character-detail-table">
          <tbody>${profileRowsHtml}</tbody>
        </table>
      </article>
    </section>
  `;
}

function buildCharacterBottomHtml(c, hasGeneric, sysDefsSafe, attrMap, abilities, skillEntries, memo, paramsEditBtn, emotionsEditBtn, skillsEditBtn) {
  const paramsHtml = hasGeneric 
    ? renderGenericAttributes(c.system, sysDefsSafe, attrMap, "int")
    : (Object.keys(abilities).length ? `<div class="character-detail-chips">${Object.entries(abilities).map(([k, v]) => `<span class="character-detail-chip"><span class="character-detail-chip-key">${Utils.escapeHtml(k)}</span><span class="character-detail-chip-val">${Utils.escapeHtml(String(v))}</span></span>`).join("")}</div>` : `<p class="character-detail-muted">未登録</p>`);

  const emotionHtml = (hasGeneric && (c.system === "エモクロアTRPG" || c.system === "ガイアケアTRPG"))
    ? `<article class="character-detail-panel character-detail-emotions">
         <h2 class="character-detail-h2">共鳴感情${emotionsEditBtn}</h2>
         ${renderGenericAttributes(c.system, sysDefsSafe, attrMap, "emotion")}
       </article>`
    : ``;

  const skillsHtml = skillEntries.length 
    ? `<div class="character-detail-chips">${skillEntries.map(s => `<span class="character-detail-chip character-detail-chip--skill"><span class="character-detail-chip-key">${Utils.escapeHtml(s.name)}</span><span class="character-detail-chip-val">${Utils.escapeHtml(String(s.display_value))}</span></span>`).join("")}</div>`
    : `<p class="character-detail-muted">（初期値以上の技能なし）</p>`;

  const memoHtml = memo && String(memo).trim() !== "" 
    ? `<p class="character-detail-memo">${Utils.renderMultilineText(memo)}</p>` 
    : `<p class="character-detail-muted">未登録</p>`;

  return `
    <section class="character-detail-bottom">
      <div class="character-detail-panels">
        <div class="character-detail-tripanel">
          <article class="character-detail-panel">
            <h2 class="character-detail-h2">能力値${paramsEditBtn}</h2>
            ${paramsHtml}
          </article>
          ${emotionHtml}
          <article class="character-detail-panel">
            <h2 class="character-detail-h2">技能${skillsEditBtn}</h2>
            ${skillsHtml}
          </article>
        </div>
        <article class="character-detail-panel character-detail-panel--full">
          <h2 class="character-detail-h2">メモ</h2>
          ${memoHtml}
        </article>
      </div>
    </section>
  `;
}

Utils.domReady(main);