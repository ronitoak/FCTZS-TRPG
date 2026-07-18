/**
 * Workers Static Assets（フロント Worker fctzs）向けに静的フロントだけを dist/ へコピーする。
 * worker/ tests/ public/ などは公開成果物に含めない。
 *
 * 環境変数（任意）:
 *   FCTZS_SITE_URL          例: https://fctzs.daruji.workers.dev
 *   FCTZS_AUTH_REDIRECT_URL 例: https://fctzs.daruji.workers.dev/
 *   FCTZS_API_BASE          例: https://fctzs-trpg.daruji.workers.dev
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const COPY_DIRS = [
  "bbs",
  "character",
  "css",
  "img",
  "js",
  "patch-notes",
  "player",
  "recruit",
  "scenarios",
  "schedule",
  "sessions"
];

const COPY_FILES = [
  "index.html",
  "404.html",
  "docs.html",
  ".nojekyll"
];

function walkHtml(directory, results = []) {
  if (!existsSync(directory)) return results;
  for (const name of readdirSync(directory)) {
    const full = join(directory, name);
    const st = statSync(full);
    if (st.isDirectory()) walkHtml(full, results);
    else if (name.endsWith(".html")) results.push(full);
  }
  return results;
}

function ensureSiteConfigScript(html, isRoot) {
  const configSrc = isRoot ? "js/site-config.js" : "../js/site-config.js";
  if (html.includes("site-config.js")) return html;
  return html.replace(
    /(<script[^>]+src=["'][^"']*utils\.js["'][^>]*>\s*<\/script>)/i,
    `<script src="${configSrc}"></script>\n    $1`
  );
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const dir of COPY_DIRS) {
  const from = join(root, dir);
  if (!existsSync(from)) continue;
  cpSync(from, join(dist, dir), { recursive: true });
}

for (const file of COPY_FILES) {
  const from = join(root, file);
  if (!existsSync(from)) continue;
  cpSync(from, join(dist, file));
}

const siteUrl = (process.env.FCTZS_SITE_URL || "https://fctzs.daruji.workers.dev").replace(/\/+$/, "");
const authRedirect = process.env.FCTZS_AUTH_REDIRECT_URL || `${siteUrl}/`;
const apiBase = process.env.FCTZS_API_BASE || "https://fctzs-trpg.daruji.workers.dev";
const projectId = process.env.FCTZS_SUPABASE_PROJECT_ID || "bcmxaqrjpelpfxafrtqu";
const r2Public = process.env.FCTZS_R2_PUBLIC_URL
  || "https://pub-b7f067c04745438680b7ed7adebbba6b.r2.dev";

const siteConfig = `"use strict";

window.FCTZS_CONFIG = Object.freeze({
  API_BASE: ${JSON.stringify(apiBase)},
  SITE_URL: ${JSON.stringify(siteUrl)},
  AUTH_REDIRECT_URL: ${JSON.stringify(authRedirect)},
  SUPABASE_PROJECT_ID: ${JSON.stringify(projectId)},
  R2_PUBLIC_URL: ${JSON.stringify(r2Public)}
});
`;

writeFileSync(join(dist, "js", "site-config.js"), siteConfig, "utf8");

for (const htmlPath of walkHtml(dist)) {
  const rel = relative(dist, htmlPath).replace(/\\/g, "/");
  const isRoot = !rel.includes("/");
  const original = readFileSync(htmlPath, "utf8");
  const updated = ensureSiteConfigScript(original, isRoot);
  if (updated !== original) writeFileSync(htmlPath, updated, "utf8");
}

// Pages 用: SPAではないが将来の拡張用ヘッダ
writeFileSync(
  join(dist, "_headers"),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`,
  "utf8"
);

console.log(`Pages成果物を作成しました: ${dist}`);
console.log(`SITE_URL=${siteUrl}`);
console.log(`API_BASE=${apiBase}`);
