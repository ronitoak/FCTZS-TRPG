/**
 * Flutter Web を release ビルドする（CI / ローカル共通）。
 * 前提: PATH に flutter がある、または FCTZS_FLUTTER_BIN で flutter 実行ファイルを指定。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "flutter", "fctzs_app");
const outIndex = join(appDir, "build", "web", "index.html");

const flutterBin =
  process.env.FCTZS_FLUTTER_BIN ||
  (process.platform === "win32" ? "flutter.bat" : "flutter");

const apiBase =
  process.env.FCTZS_API_BASE || "https://fctzs-trpg.daruji.workers.dev";

if (!existsSync(appDir)) {
  console.error(`アプリディレクトリがありません: ${appDir}`);
  process.exit(1);
}

function run(command, args, cwd) {
  console.log(`> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(flutterBin, ["pub", "get"], appDir);
run(
  flutterBin,
  [
    "build",
    "web",
    "--release",
    `--dart-define=API_BASE=${apiBase}`,
    "--base-href",
    "/"
  ],
  appDir
);

if (!existsSync(outIndex)) {
  console.error(`ビルド成果物がありません: ${outIndex}`);
  process.exit(1);
}

console.log(`Flutter Web ビルド完了: ${outIndex}`);
console.log("デプロイ例: npx wrangler deploy --config wrangler.flutter.toml");
