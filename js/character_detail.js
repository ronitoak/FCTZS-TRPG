"use strict";

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

    const charactersSafe = Array.isArray(characters) ? characters : [];
    const scenariosSafe = Array.isArray(scenarios) ? scenarios : [];
    const runsSafe = Array.isArray(runs) ? runs : [];

    const scenariosById = new Map(scenariosSafe.map(s => [s.id, s]));

    const c = charactersSafe.find(ch => ch?.id === id);
    if (!c) {
      root.innerHTML = "<p>キャラクターが見つかりません</p>";
      return;
    }

    // ここから汎用属性（system_attributes / character_attributes）
    const [systemAttrDefs, characterAttrRows] = await Promise.all([
      Utils.apiGet(`system_attributes?system=${encodeURIComponent(c.system ?? "")}`).catch(() => []),
      Utils.apiGet(`character_attributes?character_id=${encodeURIComponent(id)}`).catch(() => []),
    ]);

    const sysDefsSafe = Array.isArray(systemAttrDefs) ? systemAttrDefs : [];
    const attrMap = buildCharacterAttributeMap(characterAttrRows);

    const hasGeneric = sysDefsSafe.length > 0;

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

    const iacharaLinkHtml = c.iachara_url
      ? `<div class="character-detail-links">
          <ul>
            <li>${renderLink(c.iachara_url, "開く")}</li>
          </ul>
        </div>`
      : "";

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
          <div class="character-detail-tripanel">
            <article class="character-detail-panel">
              <h2 class="character-detail-h2">能力値</h2>

              ${hasGeneric
                ? renderGenericIntAttributes(c.system, sysDefsSafe, attrMap)
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
                <h2 class="character-detail-h2">共鳴感情</h2>
                ${renderGenericEmotionAttributes(sysDefsSafe, attrMap)}
              </article>
            ` : ``}

            <article class="character-detail-panel">
              <h2 class="character-detail-h2">技能</h2>
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
        <h2 class="character-detail-h2">通過シナリオ</h2>
        ${passedHtml}
      </section>

      <section class="character-detail-url">
        <h2 class="character-detail-h2">キャラシート</h2>
        ${iacharaLinkHtml}
      </section>
    `;
  } catch (e) {
    console.error(e);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
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

function renderGenericIntAttributes(system, defs, attrMap) {
  const safeDefs = (Array.isArray(defs) ? defs : [])
    .slice()
    .sort((a, b) => (Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0)));

  const intDefs = safeDefs.filter(d => d?.kind === "int");
  const chips = [];

  // 派生値（エモクロアTRPGのみ）
  if (system === "エモクロアTRPG") {
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
