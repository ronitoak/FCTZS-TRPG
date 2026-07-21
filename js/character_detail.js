"use strict";

// キャラクターの関連データを詳細表示へ統合し、編集とココフォリア向け書き出しを一貫して扱う。
(() => {

let currentCharData = null;
let currentSkillRows = null;
let currentSystemAttrs = [];
let currentCharAttrsMap = new Map();
let allScenarios = [];
let currentCharacterScenarios = [];

function toIntOrNull(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 日本語ラベル／作成保存／インポートでキー表記が揺れるため、別名をまとめて解決する。
const ATTR_KEY_ALIASES = Object.freeze({
  身体: ["身体", "STRENGTH", "strength", "BODY", "body"],
  精神: ["精神", "POWER", "power", "SPIRIT", "spirit"],
  知力: ["知力", "INTELLECT", "intellect", "INTELLIGENCE", "intelligence"],
  器用: ["器用", "DEXTERITY", "dexterity", "DEX", "dex"],
  五感: ["五感", "SENSES", "senses", "SENSE", "sense"],
  魅力: ["魅力", "APPEARANCE", "appearance", "APP", "app", "CHARISMA", "charisma"],
  社会: ["社会", "SOCIAL", "social"],
  運勢: ["運勢", "LUCK", "luck"],
  真価: ["真価", "LUCK", "luck", "TRUE_VALUE", "true_value"],
  STR: ["STR", "str"],
  CON: ["CON", "con"],
  POW: ["POW", "pow"],
  DEX: ["DEX", "dex"],
  APP: ["APP", "app"],
  SIZ: ["SIZ", "siz"],
  INT: ["INT", "int"],
  EDU: ["EDU", "edu"],
  LUCK: ["LUCK", "luck", "幸運"],
  幸運: ["幸運", "LUCK", "luck"]
});

// 公式サイトの技能→能力対応。複数行は配列で保持し、出力時は判定値が最大のものを採用する。
// 値の "知力/２" は能力値を半分（切り上げ）してから技能値を足す。
const EMOKLORE_SKILL_ABILITY_OPTIONS = (() => {
  const rows = [
    ["調査", "器用"],
    ["検索", "知力"],
    ["洞察", "知力"],
    ["マッピング", "器用"],
    ["マッピング", "五感"],
    ["直感", "精神"],
    ["直感", "運勢"],
    ["鑑定", "五感"],
    ["鑑定", "知力"],
    ["知覚", "五感"],
    ["観察眼", "五感"],
    ["聞き耳", "五感"],
    ["毒見", "五感"],
    ["危機察知", "五感"],
    ["危機察知", "運勢"],
    ["霊感", "精神"],
    ["霊感", "運勢"],
    ["交渉", "魅力"],
    ["社交術", "社会"],
    ["ディベート", "知力"],
    ["魅了", "魅力"],
    ["心理", "精神"],
    ["心理", "知力"],
    ["知識", "知力"],
    ["専門知識", "知力"],
    ["ニュース", "社会"],
    ["事情通", "五感"],
    ["事情通", "社会"],
    ["業界", "社会"],
    ["業界", "魅力"],
    ["運動", "身体"],
    ["スピード", "身体"],
    ["ストレングス", "身体"],
    ["アクロバット", "身体"],
    ["アクロバット", "器用"],
    ["ダイブ", "身体"],
    ["格闘", "身体"],
    ["武術", "身体"],
    ["奥義", "身体"],
    ["奥義", "精神"],
    ["奥義", "器用"],
    ["投擲", "器用"],
    ["射撃", "器用"],
    ["射撃", "五感"],
    ["生存", "身体"],
    ["耐久", "身体"],
    ["自我", "精神"],
    ["根性", "精神"],
    ["手当て", "知力/２"],
    ["医術", "器用"],
    ["医術", "知力"],
    ["蘇生", "知力/２"],
    ["蘇生", "精神/２"],
    ["細工", "器用"],
    ["技巧", "器用"],
    ["芸術", "器用"],
    ["芸術", "精神"],
    ["芸術", "五感"],
    ["操縦", "器用"],
    ["操縦", "五感"],
    ["操縦", "知力"],
    ["暗号", "知力"],
    ["電脳", "知力"],
    ["隠匿", "器用"],
    ["隠匿", "社会"],
    ["隠匿", "運勢"],
    ["幸運", "運勢"],
    ["強運", "運勢"]
  ];

  const map = {};
  for (const [skill, spec] of rows) {
    const key = normalizeEmokloreSkillKey(skill);
    const parsed = parseEmokloreAbilitySpec(spec);
    if (!map[key]) map[key] = [];
    map[key].push(parsed);
  }
  return Object.freeze(map);
})();

function normalizeEmokloreSkillKey(skillName) {
  return String(skillName || "")
    .trim()
    .replace(/^[＊★*]+/, "")
    .replace(/[（(].*$/, "")
    .trim();
}

function parseEmokloreAbilitySpec(spec) {
  const raw = String(spec || "").trim();
  const halved = raw.match(/^(.+?)\s*\/\s*[2２]$/);
  if (halved) {
    return { label: halved[1].trim(), divisor: 2 };
  }
  return { label: raw, divisor: 1 };
}

function resolveAttrEntry(key) {
  const raw = String(key || "");
  const candidates = ATTR_KEY_ALIASES[raw] || [raw, raw.toUpperCase(), raw.toLowerCase()];
  for (const candidate of candidates) {
    if (currentCharAttrsMap.has(candidate)) return currentCharAttrsMap.get(candidate);
  }
  return null;
}

function getAttrInt(key) {
  const entry = resolveAttrEntry(key);
  const n = toIntOrNull(entry?.value_int);
  return n ?? 0;
}

function getAttrEmotion(key) {
  const entry = resolveAttrEntry(key)
    || currentCharAttrsMap.get(String(key).toLowerCase())
    || currentCharAttrsMap.get(String(key));
  return entry?.value_emotion || "なし";
}

function buildCcfoliaDisplayName(c) {
  const name = String(c?.name || "").trim();
  const reading = String(c?.reading || "").trim();
  if (name && reading) return `${name} (${reading})`;
  return name;
}

function buildCcfoliaExternalUrl(c) {
  return c?.iachara_url || window.location.href;
}

function applyCcfoliaIconUrl(data, c) {
  const icon = String(c?.image_url || "").trim();
  if (icon) data.iconUrl = icon;
}

function clampEmokloreSkillLevel(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(3, Math.max(1, Math.trunc(n)));
}

function resolveEmokloreAbilityLabelForSystem(label, isGaia) {
  // ガイアケアは運勢の代わりに真価を使う。
  if (isGaia && label === "運勢") return "真価";
  return label;
}

function getEmokloreAbilityContribution(label, divisor, isGaia) {
  const resolved = resolveEmokloreAbilityLabelForSystem(label, isGaia);
  const raw = getAttrInt(resolved);
  return divisor === 2 ? Math.ceil(raw / 2) : raw;
}

/**
 * 技能の判定目標値を返す。
 * 複数対応能力がある場合は (能力寄与 + 技能値) が最大の組み合わせを採用。
 * 未登録技能は知力へフォールバック。
 */
function calcBestEmokloreTarget(skillName, skillLevel, isGaia) {
  const key = normalizeEmokloreSkillKey(skillName);
  const options = EMOKLORE_SKILL_ABILITY_OPTIONS[key];
  const level = Number(skillLevel) || 0;

  if (!options || options.length === 0) {
    return getAttrInt("知力") + level;
  }

  let best = -Infinity;
  for (const opt of options) {
    const target = getEmokloreAbilityContribution(opt.label, opt.divisor, isGaia) + level;
    if (target > best) best = target;
  }
  return best;
}

function buildEmokloreResonanceMemo(c) {
  const lines = [];
  const reading = String(c?.reading || "").trim();
  if (reading) lines.push(`ふりがな: ${reading}`);
  lines.push(`共鳴感情・表: ${getAttrEmotion("emotion_front")}`);
  lines.push(`共鳴感情・裏: ${getAttrEmotion("emotion_back")}`);
  lines.push(`共鳴感情・ルーツ: ${getAttrEmotion("emotion_root")}`);
  return `${lines.join("\n")}\n      `;
}

function calcCoc7Mov(str, dex, siz) {
  if (str > siz && dex > siz) return 10;
  if (str >= siz || dex >= siz) return 9;
  return 8;
}

function formatBldParam(bld) {
  if (bld > 0) return `+${bld}`;
  return String(bld);
}

// ココフォリアの取込契約を壊さないよう、画面表示用データから専用形式を明示的に組み立てる。
function generateCcfoliaData() {
  const c = currentCharData;
  if (!c) return null;

  const data = {
    name: buildCcfoliaDisplayName(c),
    memo: "",
    initiative: 0,
    externalUrl: buildCcfoliaExternalUrl(c),
    status: [],
    params: [],
    commands: ""
  };
  applyCcfoliaIconUrl(data, c);

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

  const cocStat = (key) => abilities[key] ?? getAttrInt(key);

  if (c.system === "CoC6" || c.system === "クトゥルフ神話TRPG(6版)") {
    const dex = cocStat("DEX");
    const con = cocStat("CON");
    const siz = cocStat("SIZ");
    const pow = cocStat("POW");
    const int = cocStat("INT");
    const edu = cocStat("EDU");
    const str = cocStat("STR");

    data.initiative = dex;

    const hp = Math.ceil((con + siz) / 2);
    const mp = pow;
    const san = pow * 5;

    data.status.push({ label: "HP", value: hp, max: hp });
    data.status.push({ label: "MP", value: mp, max: mp });
    data.status.push({ label: "SAN", value: san, max: san });

    const keys = ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU"];
    keys.forEach(k => {
      data.params.push({ label: k, value: String(cocStat(k)) });
    });

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
    commands.push(`1d100<={SAN} 【正気度ロール】`);
    commands.push(`CCB<=${int * 5} 【アイデア】`);
    commands.push(`CCB<=${pow * 5} 【幸運】`);
    commands.push(`CCB<=${edu * 5} 【知識】`);

    (currentSkillRows || []).forEach(s => {
      const v = s.display_value ?? s.override_value ?? s.base_value;
      if (v != null) commands.push(`CCB<=${v} 【${s.name}】`);
    });

    const dbSuffix = db === "0" ? "" : db;
    commands.push(`1d3${dbSuffix} 【ダメージ判定】`);
    commands.push(`1d4${dbSuffix} 【ダメージ判定】`);
    commands.push(`1d6${dbSuffix} 【ダメージ判定】`);

    keys.forEach(k => {
      commands.push(`CCB<={${k}}*5 【${k} × 5】`);
    });
    data.commands = commands.join("\n");

  } else if (c.system === "CoC7" || c.system === "新クトゥルフ神話TRPG(7版)") {
    const dex = cocStat("DEX");
    const str = cocStat("STR");
    const con = cocStat("CON");
    const pow = cocStat("POW");
    const siz = cocStat("SIZ");
    const int = cocStat("INT");
    const edu = cocStat("EDU");
    const luck = toIntOrNull(resolveAttrEntry("LUCK")?.value_int)
      ?? toIntOrNull(resolveAttrEntry("幸運")?.value_int);

    data.initiative = dex;

    const hp = Math.floor((con + siz) / 10);
    const mp = Math.floor(pow / 5);
    const san = pow;

    data.status.push({ label: "HP", value: hp, max: hp });
    data.status.push({ label: "MP", value: mp, max: mp });
    data.status.push({ label: "SAN", value: san, max: san });
    if (luck != null) {
      data.status.push({ label: "幸運", value: luck, max: luck });
    }

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

    const keys = ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU"];
    keys.forEach(k => {
      data.params.push({ label: k, value: String(cocStat(k)) });
    });
    data.params.push({ label: "BLD", value: formatBldParam(bld) });
    data.params.push({ label: "MOV", value: String(calcCoc7Mov(str, dex, siz)) });

    const commands = [];
    commands.push(`CC<={SAN} 【正気度ロール】`);
    commands.push(`CC<=${int} 【アイデア】`);
    if (luck != null) {
      commands.push(`CC<={幸運} 【幸運】`);
    } else {
      commands.push(`CC<=${pow} 【幸運】`);
    }
    commands.push(`CC<=${edu} 【知識】`);

    (currentSkillRows || []).forEach(s => {
      const v = s.display_value ?? s.override_value ?? s.base_value;
      if (v != null) commands.push(`CC<=${v} 【${s.name}】`);
    });

    const dbSuffix = db === "0" ? "" : db;
    commands.push(`1d3${dbSuffix} 【ダメージ判定】`);
    commands.push(`1d4${dbSuffix} 【ダメージ判定】`);
    commands.push(`1d6${dbSuffix} 【ダメージ判定】`);

    keys.forEach(k => {
      commands.push(`CC<={${k}}　【${k}】`);
    });
    data.commands = commands.join("\n");

  } else if (c.system === "エモクロアTRPG" || c.system === "ガイアケアTRPG") {
    const isGaia = c.system === "ガイアケアTRPG";
    const body = getAttrInt("身体");
    const spirit = getAttrInt("精神");
    const intellect = getAttrInt("知力");

    data.initiative = body;
    data.memo = buildEmokloreResonanceMemo(c);

    const hp = body + 10;
    const mp = spirit + intellect;
    data.status.push({ label: "HP", value: hp, max: hp });
    data.status.push({ label: "MP", value: mp, max: mp });
    data.status.push({ label: "共鳴", value: 1, max: 9 });

    // 参照JSONに合わせた params 順（ガイアは運勢の代わりに真価）
    const paramKeys = isGaia
      ? ["身体", "器用", "精神", "五感", "知力", "魅力", "社会", "真価"]
      : ["身体", "器用", "精神", "五感", "知力", "魅力", "社会", "運勢"];
    paramKeys.forEach(k => data.params.push({ label: k, value: String(getAttrInt(k)) }));

    const commands = [];
    commands.push(`{共鳴}DM<={強度} 〈∞共鳴〉`);
    commands.push(`({共鳴}+1)DM<={強度} 〈∞共鳴〉ルーツ属性一致`);
    commands.push(`({共鳴}*2)DM<={強度} 〈∞共鳴〉完全一致`);

    (currentSkillRows || []).forEach(s => {
      const n = clampEmokloreSkillLevel(s.display_value ?? s.override_value ?? s.base_value);
      if (n == null) return;
      // 公式マップの複数対応能力から、判定値（能力寄与+技能）が最大のものを採用する。
      const target = calcBestEmokloreTarget(s.name, n, isGaia);
      commands.push(`${n}DM<=${target} 〈${s.name}〉`);
    });

    if (isGaia) {
      commands.push(`1DA{真価}+({共鳴}) 〈オリジン〉`);
    }

    // ＊基礎判定も公式マップに合わせる（手当ては知力/2 など）。技能加算なし。
    const baseSkillNames = [
      "調査", "知覚", "交渉", "知識", "ニュース", "運動", "格闘",
      "投擲", "生存", "自我", "手当て", "細工", "幸運"
    ];
    baseSkillNames.forEach(name => {
      const target = calcBestEmokloreTarget(name, 0, isGaia);
      commands.push(`1DM<=${target} 〈＊${name}〉`);
    });
    data.commands = commands.join("\n");
  }

  return {
    kind: "character",
    data
  };
}

// ==========================================
// --- メイン描画・データ展開ロジック ---
// ==========================================
async function fetchCharacterDetailData(id) {
  const [characters, characterScenarioRows, skillRows] = await Promise.all([
    Utils.apiGet(`characters?id=${encodeURIComponent(id)}`),
    Utils.apiGet(`character_scenarios?character_id=${encodeURIComponent(id)}`).catch(() => null),
    Utils.apiGet(`character_skill_list?character_id=${encodeURIComponent(id)}`).catch(() => [])
  ]);

  let runs = [];
  let scenarioIds = Array.isArray(characterScenarioRows) ? characterScenarioRows : [];
  if (scenarioIds.length === 0) {
    // character_scenarios未同期時だけ、当該キャラクターを含む卓に絞って補完する。
    runs = await Utils.apiGet(`runs?character_id=${encodeURIComponent(id)}`).catch(() => []);
    const legacyIds = [...new Set((Array.isArray(runs) ? runs : [])
      .filter(run => run.status === "done" && Array.isArray(run.characters) && run.characters.includes(id))
      .map(run => run.scenario_id)
      .filter(Boolean))];
    scenarioIds = legacyIds;
  }

  const ids = scenarioIds
    .map(row => (typeof row === "object" && row !== null) ? row.scenario_id : row)
    .filter(Boolean);
  const scenarios = ids.length > 0
    ? await Utils.apiGet(`scenarios?ids=${encodeURIComponent([...new Set(ids)].join(","))}`).catch(() => [])
    : [];
  return { characters, scenarios, runs, scenarioIds, skillRows };
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
    const { characters, scenarios, runs, scenarioIds, skillRows } = await fetchCharacterDetailData(id);

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

    const players = await Utils.apiGet("players?select=player_id,player_name");
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
      ? `<section class="character-detail-url"><h2 class="character-detail-h2">キャラシート</h2><ul><li>${Utils.renderLink(c.iachara_url, "開く")}</li></ul></section>`
      : "";

    const passedHtml = passedScenarioIds.length
    ? `<ul class="character-detail-scenario-list">${passedScenarioIds.map(row => {
          // 旧APIのID配列と、移行後のオブジェクト配列をどちらも表示できるようにする。
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
        alert("更新に失敗しました: " + err.message);
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
    const hasBody = resolveAttrEntry("身体") != null;
    const hasSpirit = resolveAttrEntry("精神") != null;
    const hasIntellect = resolveAttrEntry("知力") != null;
    if (hasBody) chips.push(["HP", String(getAttrInt("身体") + 10)]);
    if (hasSpirit && hasIntellect) chips.push(["MP", String(getAttrInt("精神") + getAttrInt("知力"))]);
  }

  for (const d of targetDefs) {
    const key = String(d.key);
    const label = d.label ?? key;
    const v = attrMap.get(key) || resolveAttrEntry(key) || resolveAttrEntry(label);
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
function registerCharacterEventHandlers() {
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
        modal?.showModal();
    }

    if (e.target.id === 'btn-close-char-edit') {
        document.getElementById('edit-character-modal')?.close();
    }

    // 3. 技能編集モーダル展開
    if (e.target.id === 'btn-open-skills-edit') {
        const modal = document.getElementById('edit-skills-modal');
        const container = document.getElementById('edit-skills-container');
        if (container) {
          container.innerHTML = '';
          currentSkillRows.forEach(s => addSkillInputRow(s.name, s.display_value));
        }
        modal?.showModal();
    }
    if (e.target.id === 'btn-close-skills-edit') {
        document.getElementById('edit-skills-modal')?.close();
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
        document.getElementById('edit-params-modal')?.showModal();
    }
    if (e.target.id === 'btn-close-params-edit') {
        document.getElementById('edit-params-modal')?.close();
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
        document.getElementById('edit-emotions-modal')?.showModal();
    }
    if (e.target.id === 'btn-close-emotions-edit') {
        document.getElementById('edit-emotions-modal')?.close();
    }

    if (e.target.id === 'btn-close-scenarios-edit') {
        document.getElementById('edit-scenarios-modal')?.close();
    }

    // 6. 隠し項目のトグル（種族など）
    if (e.target.classList.contains('spoiler-field')) {
        e.target.classList.toggle('revealed');
    }

    // 7. モーダルの背景クリックによる閉鎖処理
    if (e.target.tagName === "DIALOG" && e.target.classList.contains("modal")) {
        e.target.close();
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

            const uploadResult = await Utils.apiUpload(formData, {
              replaceUrl: currentCharData.image_url || null
            });
            imageUrl = uploadResult.url;
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
        alert("更新に失敗しました: " + err.message);
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
}

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

registerCharacterEventHandlers();
Utils.domReady(main);
})();