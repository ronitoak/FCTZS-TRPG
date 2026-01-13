"use strict";

const SKILL_BASE_BY_SYSTEM = {
  CoC6: {
    "回避": 20,
    "キック": 25,
    "組み付き": 25,
    "こぶし（パンチ）": 50,
    "頭突き": 10,
    "投擲": 25,
    "マーシャルアーツ": 1,
    "拳銃": 20,
    "サブマシンガン": 15,
    "ショットガン": 30,
    "マシンガン": 15,
    "ライフル": 25,
    "応急手当": 30,
    "鍵開け": 1,
    "隠す": 15,
    "隠れる": 10,
    "聞き耳": 25,
    "忍び歩き": 10,
    "写真術": 10,
    "精神分析": 1,
    "追跡": 10,
    "登攀": 40,
    "図書館": 25,
    "目星": 25,
    "運転": 20,
    "機械修理": 20,
    "重機械操作": 1,
    "乗馬": 5,
    "水泳": 25,
    "製作": 5,
    "操縦": 1,
    "跳躍": 25,
    "電気修理": 10,
    "ナビゲート": 10,
    "変装": 1,
    "言いくるめ": 5,
    "信用": 15,
    "説得": 15,
    "値切り": 5,
    "医学": 5,
    "オカルト": 5,
    "化学": 1,
    "クトゥルフ神話": 0,
    "芸術": 5,
    "経理": 10,
    "考古学": 1,
    "コンピューター": 1,
    "心理学": 5,
    "人類学": 1,
    "生物学": 1,
    "地質学": 1,
    "電子工学": 1,
    "天文学": 1,
    "博物学": 10,
    "物理学": 1,
    "法律": 5,
    "薬学": 1,
    "歴史": 20
  },
  CoC7: {
    "回避": 0,
    "近接戦闘": 25,
    "投擲": 20,
    "射撃": 0,
    "応急手当": 30,
    "鍵開け": 1,
    "手さばき": 10,
    "聞き耳": 20,
    "隠密": 20,
    "精神分析": 1,
    "追跡": 10,
    "登攀": 20,
    "図書館": 20,
    "目星": 25,
    "鑑定": 5,
    "運転": 20,
    "機械修理": 10,
    "重機械操作": 1,
    "乗馬": 5,
    "水泳": 20,
    "製作": 5,
    "操縦": 1,
    "跳躍": 20,
    "電気修理": 10,
    "ナビゲート": 10,
    "変装": 5,
    "言いくるめ": 5,
    "信用": 0,
    "説得": 10,
    "母国語": 0,
    "威圧": 15,
    "魅惑": 15,
    "言語": 1,
    "医学": 1,
    "オカルト": 5,
    "クトゥルフ神話": 0,
    "芸術": 5,
    "経理": 5,
    "考古学": 1,
    "コンピューター": 5,
    "科学": 1,
    "心理学": 10,
    "人類学": 1,
    "電子工学": 1,
    "自然": 10,
    "法律": 5,
    "歴史": 5,
    "サバイバル": 10
  }
};

function renderMultilineText(text) {
  const normalized = String(text)
    .replaceAll("\r\n", "\n")
    .replaceAll("\\n", "\n");
  const escaped = Utils.escapeHtml(normalized);
  return escaped.replaceAll("\n", "<br>");
}

function toIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const root = document.getElementById("character-detail");
  if (!root) return;

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
      Utils.apiGet(`character_skills?character_id=${encodeURIComponent(id)}`).catch(() => []),
    ]);

    const charactersSafe = Array.isArray(characters) ? characters : [];
    const scenariosSafe = Array.isArray(scenarios) ? scenarios : [];
    const runsSafe = Array.isArray(runs) ? runs : [];

    const scenariosById = new Map(scenariosSafe.map(s => [s.id, s]));

    const c = charactersSafe.find(ch => ch?.id === id);
    if (!c) {
      root.innerHTML = "<p>キャラクターが見つかりません</p>";
      return;
    }

    // 画像（規約生成）
    const src = Utils.getCharacterImagePath(c.id);
    const fallback = Utils.DEFAULT_CHARACTER_IMAGE;

    // プロフィール（columns）
    const profileRows = [
      ["職業", c.job],
      ["年齢", c.age],
      ["性別", c.gender],
      ["身長", c.height ? `${c.height}cm` : ""],
      ["体重", c.weight ? `${c.weight}kg` : ""],
      ["出身", c.origin],
      ["プレイヤー", c.player],
      ["システム", c.system],
    ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");

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

    // 技能（character_skills rows -> object）
    const skills = {};
    for (const row of (Array.isArray(skillRows) ? skillRows : [])) {
      const name = row?.name;
      const v = toIntOrNull(row?.value);
      if (!name || v === null) continue;
      skills[String(name)] = v;
    }

    const memo = c.memo ?? "";

    const baseMap = SKILL_BASE_BY_SYSTEM[c.system] ?? null;

    const skillEntries = Object.entries(skills)
      .map(([k, v]) => [k, Number(v)])
      .filter(([, v]) => Number.isFinite(v))
      .filter(([k, v]) => {
        if (!baseMap) return true;
        const base = baseMap[k];
        if (typeof base !== "number") return true;
        return v > base;
      })
      .sort((a, b) => b[1] - a[1]);

    // 通過シナリオ：character_scenarios が優先。空なら runs逆引きにフォールバック
    let passedScenarioIds = Array.isArray(scenarioIds) ? scenarioIds : [];
    if (passedScenarioIds.length === 0) {
      const relatedRuns = runsSafe
        .filter(r => Array.isArray(r?.characters) && r.characters.includes(c.id));
      passedScenarioIds = [...new Set(relatedRuns.map(r => r?.scenario_id).filter(Boolean))];
    }

    const passedHtml = passedScenarioIds.length
      ? `<ul class="character-detail-scenario-list">
          ${passedScenarioIds.map(sid => {
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

        <div class="character-detail-profile">
          <h2 class="character-detail-h2">プロフィール</h2>

          <table class="character-detail-table">
            <tbody>
              ${profileRows.map(([k, v]) => `
                <tr>
                  <th>${Utils.escapeHtml(k)}</th>
                  <td>${Utils.escapeHtml(String(v))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="character-detail-bottom">
        <div class="character-detail-panels">
          <article class="character-detail-panel">
            <h2 class="character-detail-h2">能力値</h2>
            ${Object.keys(abilities).length ? `
              <div class="character-detail-chips">
                ${Object.entries(abilities).map(([k, v]) => `
                  <span class="character-detail-chip">
                    <span class="character-detail-chip-key">${Utils.escapeHtml(k)}</span>
                    <span class="character-detail-chip-val">${Utils.escapeHtml(String(v))}</span>
                  </span>
                `).join("")}
              </div>
            ` : `<p class="character-detail-muted">未登録</p>`}
          </article>

          <article class="character-detail-panel">
            <h2 class="character-detail-h2">技能</h2>
            ${skillEntries.length ? `
              <div class="character-detail-chips">
                ${skillEntries.map(([k, v]) => `
                  <span class="character-detail-chip character-detail-chip--skill">
                    <span class="character-detail-chip-key">${Utils.escapeHtml(k)}</span>
                    <span class="character-detail-chip-val">${Utils.escapeHtml(String(v))}</span>
                  </span>
                `).join("")}
              </div>
            ` : `<p class="character-detail-muted">（初期値以上の技能なし）</p>`}
          </article>

          <article class="character-detail-panel character-detail-panel--full">
            <h2 class="character-detail-h2">メモ</h2>
            ${memo && String(memo).trim() !== ""
              ? `<p class="character-detail-memo">${renderMultilineText(memo)}</p>`
              : `<p class="character-detail-muted">未登録</p>`}
          </article>
        </div>
      </section>

      <section class="character-detail-scenarios">
        <h2 class="character-detail-h2">通過シナリオ</h2>
        ${passedHtml}
      </section>
    `;
  } catch (e) {
    console.error(e);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

main();
