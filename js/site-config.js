"use strict";

/**
 * フロント公開先・API・OAuth の環境依存値。
 * Cloudflare Pages へ切り替えるときは CI の prepare-pages が値を上書きする。
 * 手動確認時は本ファイルを編集するか、HTML 読込前に window.FCTZS_CONFIG を定義する。
 */
window.FCTZS_CONFIG = Object.freeze({
  // API Worker（バックエンド）とフロント公開URLは別物。
  API_BASE: "https://fctzs-trpg.daruji.workers.dev",
  SITE_URL: "https://fctzs.daruji.workers.dev",
  AUTH_REDIRECT_URL: "https://fctzs.daruji.workers.dev/",
  SUPABASE_PROJECT_ID: "bcmxaqrjpelpfxafrtqu",
  R2_PUBLIC_URL: "https://pub-b7f067c04745438680b7ed7adebbba6b.r2.dev"
});
