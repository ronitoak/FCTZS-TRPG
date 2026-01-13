"use strict";


function normalize(s) {
  return String(s ?? "").toLowerCase();
}

function renderCharacters(root, characters, query) {
  root.innerHTML = "";

  const q = normalize(query);
  const list = (Array.isArray(characters) ? characters : [])
    .filter(c => {
      if (!q) return true;
      const hay = [
        c.id, c.name, c.job, c.player, c.system
      ].map(normalize).join(" ");
      return hay.includes(q);
    });

  if (list.length === 0) {
    root.innerHTML = "<p>該当するキャラクターがありません</p>";
    return;
  }

  const grid = document.createElement("div");
  grid.className = "character-grid";
  root.appendChild(grid);

  for (const c of list) {
    const name = Utils.escapeHtml(c.name ?? c.id ?? "（無名）");
    const job = Utils.escapeHtml(c.job ?? "");
    const player = Utils.escapeHtml(c.player ?? "");
    const system = Utils.escapeHtml(c.system ?? "");

    const titleHtml = `
      <a class="character-title-link"
        href="./detail.html?id=${encodeURIComponent(c.id)}">
        ${name}
      </a>
    `;


    const card = document.createElement("article");
    const state = typeof c.state === "string" ? c.state : ""; // "lost" | "rescued" | "survived"
    card.className = `character-card ${state}`.trim();

    const imagePath = Utils.getCharacterImagePath(c.id);
    const DEFAULT_IMAGE = Utils.DEFAULT_CHARACTER_IMAGE;

    const imgHtml = `
      <img class="character-image"
        src="${imagePath}"
        onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';"
        alt="${name}"
        loading="lazy"
      >
    `;


    card.innerHTML = `
        ${imgHtml}
        <h2 class="character-title">${titleHtml}</h2>
        <div class="character-meta">
            <div>職業: ${job || "—"}</div>
            <div>PL: ${player || "—"}</div>
            <div>System: ${system || "—"}</div>
        </div>
    `;


    grid.appendChild(card);
  }
}

async function main() {
  const root = document.getElementById("character-list");
  const input = document.getElementById("character-search");
if (!root) {
  console.error("character-list not found");
  return;
}
  try {
    const characters = await Utils.apiGet("characters");
    renderCharacters(root, characters, input ? input.value : "");

    if (input) {
      input.addEventListener("input", () => {
        renderCharacters(root, characters, input.value);
      });
    }
  } catch (err) {
    console.error(err);
    root.innerHTML = "<p>読み込みに失敗しました</p>";
  }
}

main();
