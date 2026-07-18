/**
 * 追加依存なしで実行できる静的回帰チェック。
 * public/ と依存物は正本ではないため、明示的に検査対象から除外する。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const excludedDirectories = new Set([".git", "node_modules", "public"]);
const failures = [];

function walk(directory, predicate) {
  const results = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...walk(fullPath, predicate));
    if (entry.isFile() && predicate(fullPath)) results.push(fullPath);
  }
  return results;
}

function checkSyntax(filePath, moduleSource = false) {
  const args = moduleSource ? ["--input-type=module", "--check"] : ["--check", filePath];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    input: moduleSource ? readFileSync(filePath, "utf8") : undefined
  });
  if (result.status !== 0) {
    failures.push(`構文エラー: ${relative(root, filePath)}\n${result.stderr}`);
  }
}

function checkHtmlScripts(filePath) {
  const html = readFileSync(filePath, "utf8");
  const scriptPattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const source = match[1];
    if (/^(?:https?:)?\/\//.test(source)) continue;
    const resolved = resolve(dirname(filePath), source.split(/[?#]/, 1)[0]);
    if (!existsSync(resolved)) {
      failures.push(`script参照切れ: ${relative(root, filePath)} -> ${source}`);
    }
  }
}

function checkPatchNotes() {
  const source = readFileSync(join(root, "js", "patch-notes-data.js"), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const notes = context.window.PATCH_NOTES;
  const allowedTypes = new Set(["release", "feature", "improvement", "fix"]);

  if (!Array.isArray(notes) || notes.length === 0) {
    failures.push("PATCH_NOTES が空、または配列ではありません");
    return;
  }

  notes.forEach((note, index) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(note.date || "")) {
      failures.push(`PATCH_NOTES[${index}] の日付形式が不正です`);
    }
    if (!allowedTypes.has(note.type) || !note.title || !note.detail) {
      failures.push(`PATCH_NOTES[${index}] の必須項目が不正です`);
    }
    if (index > 0 && notes[index - 1].date < note.date) {
      failures.push(`PATCH_NOTES[${index}] が日付降順ではありません`);
    }
  });
}

function checkWorkerRoutes() {
  const source = readFileSync(join(root, "worker", "index.js"), "utf8");
  const requiredRoutes = [
    "/api/interactions",
    "/api/characters",
    "/api/players",
    "/api/player_availability",
    "/api/schedule_match",
    "/api/scenarios",
    "/api/runs",
    "/api/sessions",
    "/api/recruitments",
    "/api/recruitment_list",
    "/api/scenario_summary",
    "/api/player_detail_summary",
    "/api/comments",
    "/api/comments/recent",
    "/api/upload"
  ];
  requiredRoutes.forEach(route => {
    if (!source.includes(route)) failures.push(`Worker必須ルートがありません: ${route}`);
  });

  [
    "CHARACTER_LIST_SELECT",
    "RUN_LIST_SELECT",
    "SESSION_LIST_SELECT",
    "PLAYER_LIST_SELECT",
    "sbServiceFetch",
    "validateUserBearer"
  ].forEach(token => {
    if (!source.includes(token)) failures.push(`Worker必須定義がありません: ${token}`);
  });
}

function checkDomContracts() {
  const contracts = {
    "index.html": ["common-nav", "guest-dashboard", "member-dashboard", "home-calendar-grid"],
    "schedule/index.html": ["calendar-grid", "availability-modal", "compare-modal"],
    "player/detail.html": ["player-detail-root", "availability-modal"],
    "patch-notes/index.html": ["patch-notes-root"]
  };
  Object.entries(contracts).forEach(([relativePath, ids]) => {
    const html = readFileSync(join(root, relativePath), "utf8");
    ids.forEach(id => {
      if (!html.includes(`id="${id}"`)) {
        failures.push(`DOM契約がありません: ${relativePath} #${id}`);
      }
    });
  });
}

walk(join(root, "js"), file => extname(file) === ".js").forEach(file => checkSyntax(file));
checkSyntax(join(root, "worker", "index.js"), true);
walk(root, file => extname(file) === ".html").forEach(checkHtmlScripts);
checkPatchNotes();
checkWorkerRoutes();
checkDomContracts();

if (failures.length > 0) {
  console.error(failures.join("\n\n"));
  process.exitCode = 1;
} else {
  console.log("静的回帰チェック: OK");
}
