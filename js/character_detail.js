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
// ★仕様書準拠：ココフォリア用データ生成関数
// ==========================================
function generateCcfoliaData() {
  const c = currentCharData;
  if (!c) return null;

  const data = {
    name: c.name,
    memo: "",
    initiative: 0,
    externalUrl: c.iachara_url || "",
    status: [],
    params: [],
    commands: ""
  };

  // 属性マップから値を取得するヘルパー
  const getAttrInt = (key) => currentCharAttrsMap.get(key.toUpperCase())?.value_int ?? 0;
  const getAttrEmotion = (key) => currentCharAttrsMap.get(key.toLowerCase())?.value_emotion || "なし";

  if (c.system === 'CoC6' || c.system === 'クトゥルフ神話TRPG(6版)') {
    const str = getAttrInt('STR');
    const con = getAttrInt('CON');
    const pow = getAttrInt('POW');
    const dex = getAttrInt('DEX');
    const app = getAttrInt('APP');
    const siz = getAttrInt('SIZ');
    const int = getAttrInt('INT');
    const edu = getAttrInt('EDU');

    data.initiative = dex;

    const hp = Math.ceil((con + siz) / 2);
    const mp = pow;
    const san = pow * 5;

    data.status.push({ label: "HP", value: hp, max: hp });
    data.status.push({ label: "MP", value: mp, max: mp });
    data.status.push({ label: "SAN", value: san, max: san });

    const keys = ['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU'];
    keys.forEach(k => data.params.push({ label: k, value: String(getAttrInt(k)) }));

    // ダメージボーナス計算
    const sum = str + siz;
    let db = "0";
    if (sum >= 2 && sum <= 12) db = "-1d6";
    else if (sum >= 13 && sum <= 16) db = "-1d4";
    else if (sum >= 17 && sum <= 24) db = "0";
    else if (sum >= 25 && sum <= 32) db = "+1d4";
    else if (sum >= 33 && sum <= 40) db = "+1d6";
    else if (sum >= 41 && sum <= 46) db = "+2d6";
    else if (sum >= 47 && sum <= 56) db = "+3d6";

    const commands = [];
    commands.push(`1d100<=${san} 【正気度ロール】`);
    commands.push(`CC<=${int * 5} 【アイデア】`);
    commands.push(`CC<=${pow * 5} 【幸運】`);
    commands.push(`CC<=${edu * 5} 【知識】`);

    if (currentSkillRows) {
      currentSkillRows.forEach(s => {
        const val = s.display_value ?? s.override_value ?? s.base_value;
        if (val != null) commands.push(`CCB<=${val} 【${s.name}】`);
      });
    }

    const dbSuffix = db === "0" ? "" : db;
    commands.push(`1d3${dbSuffix} 【ダメージ判定】`);
    commands.push(`1d4${dbSuffix} 【ダメージ判定】`);
    commands.push(`1d6${dbSuffix} 【ダメージ判定】`);

    keys.forEach(k => commands.push(`CC<=${getAttrInt(k)} 【${k}】`));
    data.commands = commands.join("\n");

  } else if (c.system === 'CoC7' || c.system === 'クトゥルフ神話TRPG(7版)') {
    const str = getAttrInt('STR');
    const con = getAttrInt('CON');
    const pow = getAttrInt('POW');
    const dex = getAttrInt('DEX');
    const app = getAttrInt('APP');
    const siz = getAttrInt('SIZ');
    const int = getAttrInt('INT');
    const edu = getAttrInt('EDU');

    data.initiative = Math.floor(dex / 5);

    const hp = Math.floor((con + siz) / 10);
    const mp = Math.floor(pow / 5);
    const san = pow;

    data.status.push({ label: "HP", value: hp, max: hp });
    data.status.push({ label: "MP", value: mp, max: mp });
    data.status.push({ label: "SAN", value: san, max: san });

    const sum = str + siz;
    let bld = 0;
    let db = "0";
    if (sum >= 2 && sum <= 64) { bld = -2; db = "-2"; }
    else if (sum >= 65 && sum <= 84) { bld = -1; db = "-1"; }
    else if (sum >= 85 && sum <= 124) { bld = 0; db = "0"; }
    else if (sum >= 125 && sum <= 164) { bld = 1; db = "+1d4"; }
    else if (sum >= 165 && sum <= 204) { bld = 2; db = "+1d6"; }
    else if (sum >= 205 && sum <= 284) { bld = 3; db = "+2d6"; }

    const keys = ['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU'];
    keys.forEach(k => data.params.push({ label: k, value: String(getAttrInt(k)) }));
    data.params.push({ label: "BLD", value: String(bld) });

    const commands = [];
    commands.push(`1d100<=${san} 【正気度ロール】`);
    commands.push(`CC<=${int} 【アイデア】`);
    commands.push(`CC<=${pow} 【幸運】`);
    commands.push(`CC<=${edu} 【知識】`);

    if (currentSkillRows) {
      currentSkillRows.forEach(s => {
        const val = s.display_value ?? s.override_value ?? s.base_value;
        if (val != null) commands.push(`CCB<=${val} 【${s.name}】`);
      });
    }

    const dbSuffix = db === "0" ? "" : db;
    commands.push(`1d3${dbSuffix} 【ダメージ判定】`);
    commands.push(`1d4${dbSuffix} 【ダメージ判定】`);
    commands.push(`1d6${dbSuffix} 【ダメージ判定】`);

    keys.forEach(k => commands.push(`CC<=${getAttrInt(k) * 5} 【${k} × 5】`));
    data.commands = commands.join("\n");

  } else if (c.system === 'エモクロアTRPG') {
    data.initiative = getAttrInt('身体');
    data.memo = `共鳴感情・表: ${getAttrEmotion('emotion_front')}\n共鳴感情・裏: ${getAttrEmotion('emotion_back')}\n共鳴感情・ルーツ: ${getAttrEmotion('emotion_root')}`;

    const hp = getAttrInt('身体') + 10;
    const mp = getAttrInt('精神') + getAttrInt('知力');

    data.status.push({ label: "HP", value: hp, max: hp });
    data.status.push({ label: "MP", value: mp, max: mp });
    data.status.push({ label: "共鳴", value: 1, max: 9 });

    const keys = ['身体', '精神', '知力', '器用', '五感', '魅力', '社会', '運勢'];
    keys.forEach(k => data.params.push({ label: k, value: String(getAttrInt(k)) }));

    const commands = [];
    commands.push(`{共鳴}DM<={強度} 〈∞共鳴〉`);
    commands.push(`({共鳴}+1)DM<={強度} 〈∞共鳴〉ルーツ属性一致`);
    commands.push(`({共鳴}*2)DM<={強度} 〈∞共鳴〉完全一致`);

    if (currentSkillRows) {
      currentSkillRows.forEach(s => {
        const val = s.display_value ?? s.override_value ?? s.base_value;
        if (val != null) commands.push(`1DM<=${val} 【${s.name}】`);
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
    data.initiative = getAttrInt('身体');
    data.memo = `共鳴感情・表: ${getAttrEmotion('emotion_front')}\n共鳴感情・裏: ${getAttrEmotion('emotion_back')}\n共鳴感情・ルーツ: ${getAttrEmotion('emotion_root')}`;

    const hp = getAttrInt('身体') + 10;
    const mp = getAttrInt('精神') + getAttrInt('知力');

    data.status.push({ label: "HP", value: hp, max: hp });
    data.status.push({ label: "MP", value: mp, max: mp });
    data.status.push({ label: "共鳴", value: 1, max: 9 });

    const keys = ['身体', '精神', '知力', '器用', '五感', '魅力', '社会', '真価'];
    keys.forEach(k => data.params.push({ label: k, value: String(getAttrInt(k)) }));

    const commands = [];
    commands.push(`{共鳴}DM<={強度} 〈∞共鳴〉`);
    commands.push(`({共鳴}+1)DM<={強度} 〈∞共鳴〉ルーツ属性一致`);
    commands.push(`({共鳴}*2)DM<={強度} 〈∞共鳴〉完全一致`);

    if (currentSkillRows) {
      currentSkillRows.forEach(s => {
        const val = s.display_value ?? s.override_value ?? s.base_value;
        if (val != null) commands.push(`1DM<=${val} 【${s.name}】`);
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

    allScenarios = scenariosSafe;

    const c = charactersSafe.find(ch => ch?.id === id);
    if (!c) {
      root.innerHTML = "<p>キャラクターが見つかりません</p>";
      return;
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

    const src = Utils.getCharacterImagePath(c.id);
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
    currentCharacterScenarios = passedScenarioIds;
    const passedHtml = passedScenarioIds.length
      ? `<ul class="character-detail-scenario-list">${passedScenarioIds.map(row => {
          const sid = (typeof row === 'object' && row !== null) ? row.scenario_id : row;
          const s = scenariosById.get(sid);
          return `<li><a class="character-detail-link" href="../scenarios/detail.html?id=${encodeURIComponent(sid)}">${Utils.escapeHtml(s?.title ?? sid)}</a></li>`;
        }).join("")}</ul>`
      : `<p class="character-detail-muted">なし</p>`;

    root.innerHTML = `
      ${buildCharacterHeaderHtml(c)}
      ${buildCharacterTopHtml(c, src, fallback, profileRowsHtml, editBtn)}
      ${buildCharacterBottomHtml(c, sysDefsSafe.length > 0, sysDefsSafe, attrMap, abilities, skillEntries, memo, paramsEditBtn, emotionsEditBtn, skillsEditBtn)}
      <section class="character-detail-scenarios">
        <h2 class="character-detail-h2">通過シナリオ <button id="btn-open-scenarios-edit" class="btn-secondary" style="padding: 2px 8px; font-size: 0.8rem;">📝</button></h2>
        ${passedHtml}
      </section>
    `;

    setupEventHandlers();

  } catch (e) {
    console.error(e);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

// 既存のすべてのイベントハンドラ群を完全復元・結合
function setupEventHandlers() {
  // ココフォリア出力ボタンの監視
  const copyBtn = document.getElementById('btn-copy-ccfolia');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
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
          console.error("コピー失敗:", err);
          alert("クリップボードへのコピーに失敗しました。");
        }
      }
    });
  }

  // プロフィール編集
  const openEdit = document.getElementById("btn-open-char-edit");
  if (openEdit) {
    openEdit.addEventListener("click", () => {
      openCharacterEditModal(currentCharData);
    });
  }

  // 通過シナリオ編集
  const openScenariosEdit = document.getElementById("btn-open-scenarios-edit");
  if (openScenariosEdit) {
    openScenariosEdit.addEventListener("click", () => {
      openScenariosEditModal(currentCharData, allScenarios, currentCharacterScenarios);
    });
  }

  // 汎用能力値編集
  const openParamsEdit = document.getElementById("btn-open-params-edit");
  if (openParamsEdit) {
    openParamsEdit.addEventListener("click", () => {
      openGenericAttributesModal("int", "能力値の編集", currentSystemAttrs, currentCharAttrsMap);
    });
  }

  // 感情編集
  const openEmotionsEdit = document.getElementById("btn-open-emotions-edit");
  if (openEmotionsEdit) {
    openEmotionsEdit.addEventListener("click", () => {
      openGenericAttributesModal("emotion", "共鳴感情の編集", currentSystemAttrs, currentCharAttrsMap);
    });
  }

  // 技能編集
  const openSkillsEdit = document.getElementById("btn-open-skills-edit");
  if (openSkillsEdit) {
    openSkillsEdit.addEventListener("click", () => {
      openSkillsEditModal(currentCharData, currentSkillRows);
    });
  }
}

function buildCharacterHeaderHtml(c) {
  return `
    <header class="character-detail-header" style="display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
      <h1 class="character-detail-title" style="margin: 0; border: none; padding: 0;">
        ${Utils.escapeHtml(c.name)} <span class="character-detail-reading">(${Utils.escapeHtml(c.reading || "")})</span>
      </h1>
      <button id="btn-copy-ccfolia" class="btn-primary" style="margin-left: auto; font-size: 0.9rem; padding: 6px 12px; display: flex; align-items: center; gap: 5px; cursor: pointer;">
        ココフォリア出力
      </button>
    </header>
  `;
}

function buildCharacterTopHtml(c, src, fallback, profileRowsHtml, editBtn) {
  return `
    <section class="character-detail-top">
      <div class="character-detail-imagewrap">
        <img class="character-detail-image" src="${src}" onerror="this.onerror=null; this.src='${fallback}';" alt="${Utils.escapeHtml(c.name)}" loading="lazy">
      </div>
      <article class="character-detail-panel character-detail-profile">
        <h2 class="character-detail-h2">プロフィール${editBtn}</h2>
        <table class="character-detail-table"><tbody>${profileRowsHtml}</tbody></table>
      </article>
    </section>
  `;
}

function buildCharacterBottomHtml(c, hasGeneric, sysDefsSafe, attrMap, abilities, skillEntries, memo, paramsEditBtn, emotionsEditBtn, skillsEditBtn) {
  const paramsHtml = hasGeneric 
    ? renderGenericAttributes(c.system, sysDefsSafe, attrMap, "int")
    : `<p class="character-detail-muted">未登録</p>`;

  const emotionHtml = (hasGeneric && (c.system === "エモクロアTRPG" || c.system === "ガイアケアTRPG"))
    ? `<article class="character-detail-panel character-detail-emotions">
         <h2 class="character-detail-h2">共鳴感情${emotionsEditBtn}</h2>
         ${renderGenericAttributes(c.system, sysDefsSafe, attrMap, "emotion")}
       </article>`
    : ``;

  const skillsHtml = skillEntries.length 
    ? `<div class="character-detail-chips">${skillEntries.map(s => `<span class="character-detail-chip character-detail-chip--skill"><span class="character-detail-chip-key">${Utils.escapeHtml(s.name)}</span><span class="character-detail-chip-val">${Utils.escapeHtml(String(s.display_value))}</span></span>`).join("")}</div>`
    : `<p class="character-detail-muted">（初期値以上の技能なし）</p>`;

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
          <p class="character-detail-memo">${Utils.renderMultilineText(memo || "未登録")}</p>
        </article>
      </div>
    </section>
  `;
}

function buildCharacterAttributeMap(rows) {
  const map = new Map();
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r?.key) continue;
    map.set(String(r.key).toUpperCase(), { value_int: r?.value_int ?? null, value_emotion: r?.value_emotion ?? null });
  }
  return map;
}

function renderGenericAttributes(system, defs, attrMap, targetKind) {
  const targetDefs = defs.filter(d => d?.kind === targetKind).sort((a, b) => Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0));
  const chips = [];

  for (const d of targetDefs) {
    const key = String(d.key).toUpperCase();
    const label = d.label ?? d.key;
    const v = attrMap.get(key);
    let display = "—";
    
    if (targetKind === "int") {
      if (v?.value_int !== null && v?.value_int !== undefined) display = String(v.value_int);
    } else {
      const emoKey = String(d.key).toLowerCase();
      const ev = currentCharAttrsMap.get(emoKey);
      if (ev?.value_emotion) display = String(ev.value_emotion);
    }
    chips.push([label, display]);
  }

  if (chips.length === 0) return `<p class="character-detail-muted">未登録</p>`;
  return `<div class="character-detail-chips">${chips.map(([k, v]) => `<span class="character-detail-chip"><span class="character-detail-chip-key">${Utils.escapeHtml(String(k))}</span><span class="character-detail-chip-val">${Utils.escapeHtml(String(v))}</span></span>`).join("")}</div>`;
}

// 既存の各種編集モーダル表示ロジック（プレースホルダーまたは既存の共通処理への橋渡し）
function openCharacterEditModal(char) {
  if (typeof window.openCharacterEditModalRaw === "function") {
    window.openCharacterEditModalRaw(char);
  } else {
    console.log("Profile edit triggered", char);
  }
}

function openScenariosEditModal(char, allScenarios, currentCharacterScenarios) {
  if (typeof window.openScenariosEditModalRaw === "function") {
    window.openScenariosEditModalRaw(char, allScenarios, currentCharacterScenarios);
  } else {
    console.log("Scenarios edit triggered");
  }
}

function openGenericAttributesModal(kind, title, defs, attrMap) {
  if (typeof window.openGenericAttributesModalRaw === "function") {
    window.openGenericAttributesModalRaw(kind, title, defs, attrMap);
  } else {
    console.log("Generic attributes edit triggered", kind);
  }
}

function openSkillsEditModal(char, skillRows) {
  if (typeof window.openSkillsEditModalRaw === "function") {
    window.openSkillsEditModalRaw(char, skillRows);
  } else {
    console.log("Skills edit triggered");
  }
}

Utils.domReady(main);