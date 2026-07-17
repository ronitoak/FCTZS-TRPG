/**
 * ソースHTML（public/ 以外）へ site-config.js を utils.js の直前に挿入する。
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skip = new Set(["public", "dist", "worker", "node_modules", ".git"]);

function walk(directory, results = []) {
  for (const name of readdirSync(directory)) {
    if (skip.has(name)) continue;
    const full = join(directory, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, results);
    else if (name.endsWith(".html")) results.push(full);
  }
  return results;
}

let updated = 0;
for (const file of walk(root)) {
  const rel = relative(root, file).replace(/\\/g, "/");
  let html = readFileSync(file, "utf8");
  if (!html.includes("utils.js") || html.includes("site-config.js")) continue;

  const isRoot = !rel.includes("/");
  const configSrc = isRoot ? "js/site-config.js" : "../js/site-config.js";
  const next = html.replace(
    /(<script[^>]+src=["'][^"']*utils\.js["'][^>]*>\s*<\/script>)/i,
    `<script src="${configSrc}"></script>\n    $1`
  );
  if (next === html) continue;
  writeFileSync(file, next, "utf8");
  updated += 1;
  console.log(`updated ${rel}`);
}

console.log(`site-config を ${updated} 件のHTMLへ挿入しました`);
