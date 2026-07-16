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
    "/api/scenario_list",
    "/api/runs",
    "/api/recruitments",
    "/api/recruitment_applicants",
    "/api/sessions",
    "/api/session_list",
    "/api/sessions/detail",
    "/api/system_attributes",
    "/api/system_skill_bases",
    "/api/character_skill_list",
    "/api/character_attributes",
    "/api/posts",
    "/api/nightreign/characters",
    "/api/nightreign/slot_presets",
    "/api/nightreign/relic_effects",
    "/api/nightreign/user_relics",
    "/api/upload",
    "/api/character_full"
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

test("Workerは詳細画面向けのID scope queryを維持する", () => {
  [
    'url.searchParams.get("ids")',
    'url.searchParams.get("participant_id")',
    'url.searchParams.get("run_id")',
    'url.searchParams.get("run_ids")'
  ].forEach(contract => {
    assert.ok(workerSource.includes(contract), `scope queryがありません: ${contract}`);
  });
});

test("Workerは通常書込みのBearer境界とService Role内部経路を分離する", () => {
  // 通常POST/PATCH/DELETEは同じ入口で401にし、署名検証するInteractionだけを除外する。
  assert.match(workerSource, /\["POST", "PATCH", "DELETE"\]\.includes\(request\.method\)/);
  assert.match(workerSource, /url\.pathname !== "\/api\/interactions"/);
  assert.match(workerSource, /Authorization Bearer token required/);

  // Service Role Secretは専用関数内に限定し、通常のsbFetchは利用者Bearerを引き継ぐ。
  assert.match(workerSource, /async function sbServiceFetch\(/);
  assert.match(workerSource, /env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workerSource, /const authHeader = request\?\.headers\?\.get\("Authorization"\)/);
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
    "index.html": ["guest-dashboard", "member-dashboard", "home-calendar-grid"],
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
