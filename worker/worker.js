/**
 * 旧エントリ（非デプロイ）。
 * 本番Workerは wrangler.toml の main = "index.js" を使う。
 * ここに Service Role 全通し実装を復元しないこと。
 */
module.exports = {
  async fetch() {
    return new Response(
      JSON.stringify({
        error: "Deprecated worker entry. Deploy worker/index.js instead."
      }),
      {
        status: 410,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};
