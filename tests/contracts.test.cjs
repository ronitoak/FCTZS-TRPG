/**
 * DB/API軽量化で既存URLや画面の描画先を失わないための静的契約テスト。
 * 外部通信を行わず、ソースに残すべき互換入口だけを固定する。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const workerSource = readFileSync(join(root, "worker", "index.js"), "utf8");
const scheduleSource = readFileSync(join(root, "js", "schedule.js"), "utf8");

test("フロント公開URLはsite-config経由で切り替え可能", () => {
  const siteConfig = readFileSync(join(root, "js", "site-config.js"), "utf8");
  const utilsSource = readFileSync(join(root, "js", "utils.js"), "utf8");
  assert.match(siteConfig, /window\.FCTZS_CONFIG/);
  assert.match(siteConfig, /AUTH_REDIRECT_URL/);
  assert.match(utilsSource, /SITE_CONFIG/);
  assert.match(utilsSource, /window\.FCTZS_CONFIG/);
  assert.match(workerSource, /function resolveSiteUrl\(/);
  assert.match(workerSource, /env\?\.SITE_URL/);
});

test("Pages準備スクリプトが公開対象をdistへ切り出す", () => {
  const prepareSource = readFileSync(join(root, "scripts", "prepare-pages.mjs"), "utf8");
  assert.match(prepareSource, /FCTZS_SITE_URL/);
  assert.match(prepareSource, /COPY_DIRS/);
  assert.doesNotMatch(prepareSource, /["']public["']/);
  assert.doesNotMatch(prepareSource, /["']worker["']/);
});

test("Workerは既存APIルートを互換入口として維持する", () => {
  const legacyRoutes = [
    "/api/interactions",
    "/api/comments",
    "/api/comments/recent",
    "/api/characters",
    "/api/character_last_session",
    "/api/character_details",
    "/api/player_profiles",
    "/api/players",
    "/api/player_availability",
    "/api/schedule_match",
    "/api/scenarios",
    "/api/character_scenarios",
    "/api/runs",
    "/api/recruitments",
    "/api/recruitment_applicants",
    "/api/sessions",
    "/api/sessions/detail",
    "/api/system_attributes",
    "/api/system_skill_bases",
    "/api/character_skill_list",
    "/api/character_attributes",
    "/api/posts",
    "/api/upload",
    "/api/character_full",
    "/api/player_availability/session_block"
  ];

  legacyRoutes.forEach(route => {
    assert.ok(workerSource.includes(route), `互換ルートがありません: ${route}`);
  });
});

test("WorkerはDB軽量ビューの追加APIを公開する", () => {
  const lightweightRoutes = [
    "/api/recruitment_list",
    "/api/scenario_summary",
    "/api/comments/recent/with_names",
    "/api/player_detail_summary"
  ];

  lightweightRoutes.forEach(route => {
    assert.ok(workerSource.includes(route), `軽量APIルートがありません: ${route}`);
  });
});

test("Workerは退役した一覧APIを410で明示する", () => {
  assert.match(workerSource, /RETIRED_GET_ROUTES/);
  assert.match(workerSource, /\/api\/scenario_list/);
  assert.match(workerSource, /\/api\/session_list/);
  assert.match(workerSource, /status: 410/);
  assert.match(workerSource, /Use GET \/api\/scenario_summary/);
  assert.match(workerSource, /Use GET \/api\/sessions/);
});

test("Workerは詳細画面向けのID scope queryを維持する", () => {
  [
    'url.searchParams.get("ids")',
    'url.searchParams.get("participant_id")',
    'url.searchParams.get("character_id")',
    'url.searchParams.get("run_id")',
    'url.searchParams.get("run_ids")'
  ].forEach(contract => {
    assert.ok(workerSource.includes(contract), `scope queryがありません: ${contract}`);
  });
});

test("Worker一覧APIは列限定selectを使う", () => {
  [
    "CHARACTER_LIST_SELECT",
    "RUN_LIST_SELECT",
    "SESSION_LIST_SELECT",
    "PLAYER_LIST_SELECT",
    "RECRUITMENT_LIST_SELECT",
    "SCENARIO_SUMMARY_SELECT"
  ].forEach(token => {
    assert.ok(workerSource.includes(token), `列限定定数がありません: ${token}`);
  });
  assert.doesNotMatch(workerSource, /CHARACTER_LIST_SELECT = "[^"]*\bplayer,/);
  // runs テーブルに存在しないレガシー列を select に載せない。
  assert.doesNotMatch(workerSource, /RUN_LIST_SELECT = "[^"]*\bgm,/);
  assert.doesNotMatch(workerSource, /RUN_LIST_SELECT = "[^"]*\bplayers,/);
});

test("Workerは通常書込みのBearer境界とService Role内部経路を分離する", () => {
  // 通常POST/PATCH/DELETEはAuth APIでJWTを実検証し、署名検証するInteractionだけを除外する。
  assert.match(workerSource, /\["POST", "PATCH", "DELETE"\]\.includes\(request\.method\)/);
  assert.match(workerSource, /url\.pathname !== "\/api\/interactions"/);
  assert.match(workerSource, /await validateUserBearer\(request, env\)/);
  assert.match(workerSource, /async function getAuthenticatedUser\(/);
  assert.match(workerSource, /async function resolveCallerPlayerId\(/);

  // Service Role Secretは専用関数内に限定し、通常のsbFetchは利用者Bearerを引き継ぐ。
  assert.match(workerSource, /async function sbServiceFetch\(/);
  assert.match(workerSource, /env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workerSource, /const authHeader = request\?\.headers\?\.get\("Authorization"\)/);
});

test("部活外通過履歴だけはログインなしの共同編集経路を使う", () => {
  const utilsSource = readFileSync(join(root, "js", "utils.js"), "utf8");
  const playerDetailSource = readFileSync(join(root, "js", "player_detail.js"), "utf8");
  assert.match(workerSource, /PUBLIC_EXTERNAL_PASSED_PATH = "\/api\/player_profiles\/external_passed"/);
  assert.match(workerSource, /request\.method === "PATCH" && url\.pathname === PUBLIC_EXTERNAL_PASSED_PATH/);
  assert.match(workerSource, /external_passed_scenarios must contain at most 100 items/);
  assert.match(utilsSource, /async function apiPublicPatch\(/);
  assert.match(playerDetailSource, /Utils\.apiPublicPatch\("player_profiles\/external_passed"/);
});

test("Workerはnightreign APIを公開しない", () => {
  assert.doesNotMatch(workerSource, /nightreign/i);
});

test("Workerは所有者フィールドをサーバー側で解決する", () => {
  assert.match(workerSource, /owner_player_id: callerPlayerId/);
  assert.match(workerSource, /player_id: callerPlayerId/);
  assert.match(workerSource, /\/api\/player_availability\/session_block/);
  assert.match(workerSource, /R2_MAX_UPLOAD_BYTES/);
  assert.match(workerSource, /resolveDiscordWebhookUrl/);
});

test("予定一日占有はSupabase直書きせずWorker経由である", () => {
  const utilsSource = readFileSync(join(root, "js", "utils.js"), "utf8");
  assert.match(utilsSource, /player_availability\/session_block/);
  assert.doesNotMatch(
    utilsSource,
    /syncSchedulesForFullDay[\s\S]*?\.from\(\s*['"]player_availability['"]\s*\)/
  );
});

test("R2 uploadはSupabase Auth検証後だけ書き込む", () => {
  assert.match(workerSource, /async function validateUserBearer\(request, env\)/);
  assert.match(workerSource, /`\$\{env\.SUPABASE_URL\}\/auth\/v1\/user`/);
  assert.match(workerSource, /apikey: env\.SUPABASE_ANON_KEY/);
  assert.match(workerSource, /if \(!await validateUserBearer\(request, env\)\)/);

  const authCheckIndex = workerSource.indexOf("if (!await validateUserBearer(request, env))");
  const r2PutIndex = workerSource.indexOf("await env.R2_BUCKET.put");
  assert.ok(authCheckIndex >= 0 && authCheckIndex < r2PutIndex, "Auth検証はR2 putより前である必要があります");
});

test("R2 uploadは差し替え時にreplace_urlから旧オブジェクトを削除する", () => {
  assert.match(workerSource, /function r2ObjectKeyFromPublicUrl/);
  assert.match(workerSource, /async function deleteReplacedR2Object/);
  assert.match(workerSource, /formData\.get\("replace_url"\)/);
  assert.match(workerSource, /await env\.R2_BUCKET\.delete\(key\)/);
  assert.match(workerSource, /_default\//);

  const detailChar = readFileSync(join(root, "js", "character_detail.js"), "utf8");
  const detailScen = readFileSync(join(root, "js", "scenario_detail.js"), "utf8");
  assert.match(detailChar, /replaceUrl:\s*currentCharData\.image_url/);
  assert.match(detailScen, /replaceUrl:\s*currentScenarioImageUrl/);
});

test("GET /api/runs は junction から membership を組み立てる", () => {
  assert.match(workerSource, /async function hydrateRunsMembershipFromJunctions/);
  assert.match(workerSource, /SUPABASE_TABLES\.runPlayers/);
  assert.match(workerSource, /SUPABASE_TABLES\.runCharacters/);
  assert.match(workerSource, /fetchRunIdsByPlayer/);
  assert.match(workerSource, /fetchRunIdsByCharacter/);
  assert.match(workerSource, /hydrateRunsMembershipFromJunctions\(env, request, runs\)/);
  assert.doesNotMatch(workerSource, /player_ids\.cs\./);
  assert.doesNotMatch(workerSource, /characters=cs\./);
});

test("卓のPOST/PATCHはjunction明示洗替と配列ミラーを行う", () => {
  assert.match(workerSource, /function normalizeIdList\(/);
  assert.match(workerSource, /async function replaceRunPlayers\(/);
  assert.match(workerSource, /async function replaceRunCharacters\(/);
  assert.match(workerSource, /applyNormalizedMembershipToPayload/);
  assert.match(workerSource, /replaceMembershipFromBody/);
});

test("卓メンバー判定はjunctionのみで行う", () => {
  assert.match(workerSource, /async function fetchPlayerIdsByRunIds\(/);
  assert.match(workerSource, /function resolveRunPlayerIds\(/);
  assert.match(workerSource, /resolveRunPlayerIds\(run, playersByRun\)/);
  assert.match(workerSource, /junction のみ（配列フォールバックなし）/);
});

test("作成画面のuploadは認証付き共通APIへ統一される", () => {
  ["character_create.js", "scenario_create.js", "session_create.js"].forEach(file => {
    const source = readFileSync(join(root, "js", file), "utf8");
    assert.match(source, /Utils\.apiUpload\(formData\)/, `${file} がUtils.apiUploadを使用していません`);
    assert.doesNotMatch(source, /fetch\(`\$\{API_BASE\}\/api\/upload`/, `${file} にraw upload fetchが残っています`);
  });
});

test("履歴同期は卓参加者のcharacterだけをService Roleで追加する", () => {
  assert.match(workerSource, /const allowedPlayerIds = new Set/);
  assert.match(workerSource, /select=id,player_id&id=in\./);
  assert.match(workerSource, /allowedPlayerIds\.has\(String\(character\.player_id\)\)/);
  assert.match(workerSource, /const rejectedCount = characterIds\.length - validCharacterIds\.size/);
});

test("予定比較は最新リクエストだけを画面状態へ反映する", () => {
  assert.match(scheduleSource, /const comparisonRequestToken = Utils\.createLatestRequestToken\(\)/);
  assert.match(scheduleSource, /const requestToken = comparisonRequestToken\.issue\(\)/);
  const guardIndex = scheduleSource.indexOf("if (!comparisonRequestToken.isLatest(requestToken)) return false;");
  const assignmentIndex = scheduleSource.indexOf("comparisonData = nextComparisonData;");
  assert.ok(guardIndex >= 0 && guardIndex < assignmentIndex, "古い応答の破棄は状態更新より前である必要があります");
});

test("募集削除は応募行を直接削除せずFK CASCADEへ任せる", () => {
  const source = readFileSync(join(root, "js", "recruit_detail.js"), "utf8");
  const deleteHandlerStart = source.indexOf('// 募集の削除ボタン');
  const extendHandlerStart = source.indexOf('// 募集の延長ボタン');
  const deleteHandler = source.slice(deleteHandlerStart, extendHandlerStart);
  assert.match(deleteHandler, /apiDelete\("recruitments"/);
  assert.doesNotMatch(deleteHandler, /apiDelete\("recruitment_applicants"/);
});

test("主要画面のDOM描画先は維持される", () => {
  const contracts = {
    "index.html": ["guest-dashboard", "member-dashboard", "home-calendar-grid", "my-style-matches"],
    "character/detail.html": ["character-detail", "comments-root"],
    "scenarios/detail.html": ["scenario-detail", "comments-root"],
    "sessions/detail.html": ["session-detail", "comments-root"],
    "recruit/index.html": ["recruit-list-container"],
    "player/detail.html": ["player-detail-root", "availability-modal"],
    "schedule/index.html": ["calendar-grid", "compare-modal"]
  };

  Object.entries(contracts).forEach(([path, ids]) => {
    const html = readFileSync(join(root, path), "utf8");
    ids.forEach(id => assert.ok(html.includes(`id="${id}"`), `${path} #${id}`));
  });
});
