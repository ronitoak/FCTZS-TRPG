// フロント向けAPI、Supabase中継、Discord連携、定期通知を担うWorkerの実エントリ。
import nacl from 'tweetnacl'; // Discord Interactionを信頼する前にEd25519署名を検証する。

// worker/worker.js は実エントリではなく、このファイルをデプロイ対象として扱う。
// URLやテーブル名の散在は変更漏れを生むため、外部契約に関わる固定値をここへ集約する。
// Discord埋め込みリンク用。本番フロントを Pages へ切り替えたら Worker の SITE_URL 変数を更新する。
const DEFAULT_SITE_URL = "https://fctzs.daruji.workers.dev";
function resolveSiteUrl(env) {
  const raw = env?.SITE_URL || DEFAULT_SITE_URL;
  return String(raw).replace(/\/+$/, "");
}
const GITHUB_IMAGE_BASE_URL = "https://github.com/ronitoak/FCTZS-TRPG/blob/main/img";
const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const DISCORD_DEFAULT_NAME = "右坂 弦介";
const DISCORD_SESSION_DEFAULT_AVATAR_URL = `${GITHUB_IMAGE_BASE_URL}/scenario/c-001.png?raw=true`;
const DISCORD_CHARACTER_DEFAULT_AVATAR_URL = `${GITHUB_IMAGE_BASE_URL}/character/c-001.png?raw=true`;
const DISCORD_COLORS = Object.freeze({
  sessionNotice: 15158332,
  recruitment: 3447003,
  recruitmentFulfilled: 3066993
});

const SUPABASE_TABLES = Object.freeze({
  comments: "comments",
  characters: "characters",
  characterScenarios: "character_scenarios",
  characterAttributes: "character_attributes",
  characterSkills: "character_skills",
  characterLastSession: "character_last_session",
  characterSkillList: "character_skill_list",
  players: "players",
  playerProfiles: "player_profiles",
  playerAvailability: "player_availability",
  playerDetailSummary: "player_detail_summary",
  scenarios: "scenarios",
  scenarioSummary: "scenario_summary",
  scenarioInterests: "scenario_interests",
  runs: "runs",
  runPlayers: "run_players",
  runCharacters: "run_characters",
  sessions: "sessions",
  recruitments: "recruitments",
  recruitmentList: "recruitment_list",
  recruitmentApplicants: "recruitment_applicants",
  recentCommentsWithNames: "recent_comments_with_names",
  posts: "posts",
  systemAttributes: "system_attributes",
  systemSkillBases: "system_skill_bases"
});

const R2_ALLOWED_TYPES = Object.freeze(["character", "scenario", "run", "general"]);
const R2_ALLOWED_EXTENSIONS = Object.freeze([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const R2_ALLOWED_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
]);
const R2_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const PUBLIC_EXTERNAL_PASSED_PATH = "/api/player_profiles/external_passed";

/**
 * 自バケットの公開URLだけを R2 オブジェクトキーへ変換する。
 * `_default/` や外部URLは削除対象外。
 */
function r2ObjectKeyFromPublicUrl(publicUrl, baseUrlRaw) {
  const text = publicUrl != null ? String(publicUrl).trim() : "";
  const baseRaw = baseUrlRaw != null ? String(baseUrlRaw).trim() : "";
  if (!text || !baseRaw) return null;
  const base = baseRaw.endsWith("/") ? baseRaw : `${baseRaw}/`;
  if (!text.startsWith(base)) return null;
  let key = text.slice(base.length).split("?")[0].split("#")[0];
  try {
    key = decodeURIComponent(key);
  } catch (_) {
    // 壊れた percent-encoding はそのまま扱う
  }
  if (!key || key.includes("..") || key.startsWith("_default/")) return null;
  const prefix = key.split("/")[0];
  if (!R2_ALLOWED_TYPES.includes(prefix)) return null;
  return key;
}

/**
 * 差し替えアップロード時に旧オブジェクトを消す。失敗してもアップロード自体は成功扱い。
 */
async function deleteReplacedR2Object(env, replaceUrl) {
  const key = r2ObjectKeyFromPublicUrl(replaceUrl, env.R2_PUBLIC_URL);
  if (!key || !env.R2_BUCKET) {
    return { deleted: false, key: null };
  }
  try {
    await env.R2_BUCKET.delete(key);
    return { deleted: true, key };
  } catch (err) {
    console.error("R2 replace delete failed:", key, err);
    return { deleted: false, key };
  }
}

const PATCH_ALLOWED_RESOURCES = Object.freeze([
  SUPABASE_TABLES.sessions,
  SUPABASE_TABLES.characters,
  SUPABASE_TABLES.scenarios,
  SUPABASE_TABLES.characterAttributes,
  SUPABASE_TABLES.characterSkills,
  SUPABASE_TABLES.recruitments,
  SUPABASE_TABLES.recruitmentApplicants,
  SUPABASE_TABLES.playerProfiles
]);

const DELETE_ALLOWED_RESOURCES = Object.freeze([
  SUPABASE_TABLES.runs,
  SUPABASE_TABLES.sessions,
  SUPABASE_TABLES.characters,
  SUPABASE_TABLES.scenarios,
  SUPABASE_TABLES.characterAttributes,
  SUPABASE_TABLES.characterSkills,
  SUPABASE_TABLES.recruitments,
  SUPABASE_TABLES.recruitmentApplicants
]);

const UPSERT_ENDPOINTS = Object.freeze({
  "/api/character_skills": `/rest/v1/${SUPABASE_TABLES.characterSkills}`,
  "/api/character_scenarios": `/rest/v1/${SUPABASE_TABLES.characterScenarios}`,
  "/api/character_attributes": `/rest/v1/${SUPABASE_TABLES.characterAttributes}`,
  "/api/player_availability": `/rest/v1/${SUPABASE_TABLES.playerAvailability}`
});

const SIMPLE_INSERT_ENDPOINTS = Object.freeze({
  "/api/sessions": `/rest/v1/${SUPABASE_TABLES.sessions}`,
  "/api/player_profiles": `/rest/v1/${SUPABASE_TABLES.playerProfiles}`,
  "/api/posts": `/rest/v1/${SUPABASE_TABLES.posts}`
});

// 一覧APIは現行画面で参照する互換列だけに絞り、ID指定の詳細APIは既存の全列契約を維持する。
const CHARACTER_LIST_SELECT = "id,name,job,player_id,system,state,image_url,players(player_name)";
// runs に gm/players 列は存在しない。参加者は junction から組み立て、名称は gm_id / player_ids から Worker 側で解決する。
const RUN_LIST_SELECT = "id,title,scenario_id,gm_id,status,image_url,updated_at";
const SESSION_LIST_SELECT = "id,run_id,start,status,title";
const PLAYER_LIST_SELECT = "player_id,player_name,user_id,discord_id";
const SCENARIO_LIST_SELECT = "id,title,system,author,image_url,updated_at,trend_story_chaos,trend_avatar_clear,trend_harmony_active,min_players,max_players,play_time_minutes,lost_rate";
const RECRUITMENT_LIST_SELECT = "id,owner_player_id,owner_player_name,scenario_id,scenario_title,scenario_image_url,recruit_role,target_count,memo,status,created_at,applicant_count";
const SCENARIO_SUMMARY_SELECT = `${SCENARIO_LIST_SELECT},run_count`;
const PLAYER_DETAIL_SUMMARY_SELECT = "player_id,player_name,memo,icon_url,profile_text,tier_list_first,tier_list_second,tier_list_third,desire_avatar,desire_story,desire_clear,desire_chaos,desire_active,desire_harmony,character_count";

// 署名検証用の補助関数
function hexToUint8Array(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

/**
* Discordにメッセージを送る共通関数
* @param {string} content - メインメッセージ
* @param {object} embed - 綺麗な枠（タイトルや説明など）
* @param {object} env - 環境変数（URLが入っている）
* @param {string} webhookUrl - 通知先のWebhook URL
* @param {string} customUsername - カスタムユーザー名
* @param {string} customAvatarUrl - カスタムアバターURL
*/
/** 本番誤送信を防ぐため、テスト用Webhookが有効ならそちらを優先する。 */
function resolveDiscordWebhookUrl(env, webhookUrl = null) {
  if (webhookUrl) return webhookUrl;
  const useTest = env.DISCORD_USE_TEST_WEBHOOK === "true" || env.DISCORD_USE_TEST_WEBHOOK === "1";
  if (useTest && env.DISCORD_TEST_WEBHOOK_URL) {
    return env.DISCORD_TEST_WEBHOOK_URL;
  }
  return env.DISCORD_WEBHOOK_URL || null;
}

/**
 * sessions.notes の「[観戦希望]」以降から Discord メンション `<@数字>` を抽出する。
 * フロント（session_detail.js）が追記する形式と揃える。
 */
function extractViewerMentions(notes) {
  if (!notes || typeof notes !== "string") return [];
  const markerIndex = notes.indexOf("[観戦希望]");
  if (markerIndex < 0) return [];
  const viewerSection = notes.slice(markerIndex);
  const matches = viewerSection.match(/<@\d+>/g);
  return matches ? [...new Set(matches)] : [];
}

/** PostgREST の array contains (cs) 用に値をクォートする。 */
function formatPostgrestCsValue(value) {
  const raw = String(value ?? "");
  return `"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Discord Bot 経由でユーザーへ DM を送る。
 * Webhook と違い、受信者本人にしか見えない。
 */
async function sendDiscordDirectMessage(discordUserId, content, env) {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token || !discordUserId) return { ok: false, reason: "missing_token_or_user" };

  const channelRes = await fetch(`${DISCORD_API_BASE_URL}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ recipient_id: String(discordUserId) })
  });
  if (!channelRes.ok) {
    const detail = await channelRes.text().catch(() => "");
    console.warn("Discord DMチャンネル作成に失敗:", channelRes.status, detail);
    return { ok: false, reason: "channel", status: channelRes.status };
  }
  const channel = await channelRes.json();
  const messageRes = await fetch(`${DISCORD_API_BASE_URL}/channels/${channel.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content })
  });
  if (!messageRes.ok) {
    const detail = await messageRes.text().catch(() => "");
    console.warn("Discord DM送信に失敗:", messageRes.status, detail);
    return { ok: false, reason: "message", status: messageRes.status };
  }
  return { ok: true };
}

async function countScenarioInterests(env, scenarioId) {
  const { res, text } = await sbServiceFetch(
    env,
    `/rest/v1/${SUPABASE_TABLES.scenarioInterests}?select=player_id&scenario_id=eq.${encodeURIComponent(scenarioId)}`
  );
  if (!res.ok) {
    console.warn("気になる件数の取得に失敗:", text);
    return 0;
  }
  const rows = JSON.parse(text);
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * run_players / run_characters から player_ids・characters を組み立て直す。
 * 公開 SELECT の RLS で junction が空に見えることがあるため Service Role で読む。
 */
async function hydrateRunsMembershipFromJunctions(env, request, runs) {
  if (!Array.isArray(runs) || runs.length === 0) return runs;

  const runIds = [...new Set(runs.map(run => run?.id).filter(Boolean).map(String))];
  if (runIds.length === 0) return runs;

  const encodedIds = runIds.map(encodeURIComponent).join(",");
  const playersByRun = new Map();
  const charactersByRun = new Map();
  let playersHydrated = false;
  let charactersHydrated = false;

  try {
    const [{ res: rpRes, text: rpText }, { res: rcRes, text: rcText }] = await Promise.all([
      sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.runPlayers}?select=run_id,player_id,sort_order&run_id=in.(${encodedIds})&order=sort_order.asc`
      ),
      sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.runCharacters}?select=run_id,character_id,sort_order&run_id=in.(${encodedIds})&order=sort_order.asc`
      )
    ]);

    if (rpRes.ok) {
      playersHydrated = true;
      for (const row of JSON.parse(rpText) || []) {
        const runId = String(row.run_id);
        if (!playersByRun.has(runId)) playersByRun.set(runId, []);
        if (row.player_id) playersByRun.get(runId).push(String(row.player_id));
      }
    } else {
      console.warn("run_players hydrate failed:", rpText);
    }
    if (rcRes.ok) {
      charactersHydrated = true;
      for (const row of JSON.parse(rcText) || []) {
        const runId = String(row.run_id);
        if (!charactersByRun.has(runId)) charactersByRun.set(runId, []);
        if (row.character_id) charactersByRun.get(runId).push(String(row.character_id));
      }
    } else {
      console.warn("run_characters hydrate failed:", rcText);
    }
  } catch (err) {
    console.error("junction membership hydrate failed:", err);
  }

  for (const run of runs) {
    const runId = String(run.id);
    run.player_ids = playersHydrated ? (playersByRun.get(runId) || []) : [];
    run.characters = charactersHydrated ? (charactersByRun.get(runId) || []) : [];
  }

  return runs;
}

/**
 * 配列の ID を順序維持で正規化（空文字除去・重複排除）。
 * 配列でない入力は null（「キー未指定」扱い用）。
 */
function normalizeIdList(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * junction を洗替する（書込みの正）。
 * Service Role 必須（RLS 回避）。
 */
async function replaceRunPlayers(env, runId, playerIds, userId) {
  const { res: delRes, text: delText } = await sbServiceFetch(
    env,
    `/rest/v1/${SUPABASE_TABLES.runPlayers}?run_id=eq.${encodeURIComponent(runId)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
  if (!delRes.ok) {
    throw new Error(`run_players delete failed: ${delText}`);
  }
  if (!Array.isArray(playerIds) || playerIds.length === 0) return;
  const rows = playerIds.map((player_id, index) => ({
    run_id: runId,
    player_id,
    sort_order: index + 1,
    user_id: userId || null
  }));
  const { res, text } = await sbServiceFetch(env, `/rest/v1/${SUPABASE_TABLES.runPlayers}`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: rows
  });
  if (!res.ok) {
    throw new Error(`run_players insert failed: ${text}`);
  }
}

async function replaceRunCharacters(env, runId, characterIds, userId) {
  const { res: delRes, text: delText } = await sbServiceFetch(
    env,
    `/rest/v1/${SUPABASE_TABLES.runCharacters}?run_id=eq.${encodeURIComponent(runId)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } }
  );
  if (!delRes.ok) {
    throw new Error(`run_characters delete failed: ${delText}`);
  }
  if (!Array.isArray(characterIds) || characterIds.length === 0) return;
  const rows = characterIds.map((character_id, index) => ({
    run_id: runId,
    character_id,
    sort_order: index + 1,
    user_id: userId || null
  }));
  const { res, text } = await sbServiceFetch(env, `/rest/v1/${SUPABASE_TABLES.runCharacters}`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: rows
  });
  if (!res.ok) {
    throw new Error(`run_characters insert failed: ${text}`);
  }
}

/**
 * runs 行の payload から membership キーを除く（配列列へは書かない）。
 * 参加者の正は junction 洗替のみ。
 */
function stripMembershipFromRunPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  delete payload.player_ids;
  delete payload.characters;
  delete payload.players;
}

/**
 * junction を body の内容で洗替する（書込みの正）。
 */
async function replaceMembershipFromBody(env, runId, body, userId) {
  if (Object.prototype.hasOwnProperty.call(body, "player_ids")) {
    await replaceRunPlayers(env, runId, normalizeIdList(body.player_ids) || [], userId);
  }
  if (Object.prototype.hasOwnProperty.call(body, "characters")) {
    await replaceRunCharacters(env, runId, normalizeIdList(body.characters) || [], userId);
  }
}

async function fetchRunIdsByPlayer(env, request, playerId) {
  const { res, text } = await sbServiceFetch(
    env,
    `/rest/v1/${SUPABASE_TABLES.runPlayers}?select=run_id&player_id=eq.${encodeURIComponent(playerId)}`
  );
  if (!res.ok) return [];
  const rows = JSON.parse(text);
  return Array.isArray(rows) ? [...new Set(rows.map(row => String(row.run_id)).filter(Boolean))] : [];
}

async function fetchRunIdsByCharacter(env, request, characterId) {
  const { res, text } = await sbServiceFetch(
    env,
    `/rest/v1/${SUPABASE_TABLES.runCharacters}?select=run_id&character_id=eq.${encodeURIComponent(characterId)}`
  );
  if (!res.ok) return [];
  const rows = JSON.parse(text);
  return Array.isArray(rows) ? [...new Set(rows.map(row => String(row.run_id)).filter(Boolean))] : [];
}

/**
 * 複数卓の参加プレイヤーを junction から取得（sort_order 順）。
 * Service Role で読む（Cron / 権限判定でも同じ経路）。
 */
async function fetchPlayerIdsByRunIds(env, runIds) {
  const map = new Map();
  const ids = [...new Set((runIds || []).map(id => String(id)).filter(Boolean))];
  if (ids.length === 0) return map;
  const encoded = ids.map(encodeURIComponent).join(",");
  try {
    const { res, text } = await sbServiceFetch(
      env,
      `/rest/v1/${SUPABASE_TABLES.runPlayers}?select=run_id,player_id,sort_order&run_id=in.(${encoded})&order=sort_order.asc`
    );
    if (!res.ok) {
      console.warn("run_players lookup failed:", text);
      return map;
    }
    for (const row of JSON.parse(text) || []) {
      const runId = String(row.run_id);
      if (!map.has(runId)) map.set(runId, []);
      if (row.player_id) map.get(runId).push(String(row.player_id));
    }
  } catch (err) {
    console.error("fetchPlayerIdsByRunIds failed:", err);
  }
  return map;
}

/** junction のみ（配列フォールバックなし）。 */
function resolveRunPlayerIds(run, playersByRun) {
  if (!run) return [];
  const runId = String(run.id || "");
  const fromJunction = playersByRun?.get(runId);
  return Array.isArray(fromJunction) ? fromJunction : [];
}

/**
 * 気になる初回ON時: GM可能登録者へ DM（テスト時は Webhook プレビューのみ）。
 */
async function notifyGmablePlayersOfInterest(env, {
  scenarioId,
  interestedPlayerId,
  interestedPlayerName,
  scenarioTitle
}) {
  const siteUrl = resolveSiteUrl(env);
  const detailUrl = `${siteUrl}/scenarios/detail.html?id=${encodeURIComponent(scenarioId)}`;
  const content = `${interestedPlayerName || "誰か"}さんが「${scenarioTitle || scenarioId}」を気になるに登録しました\n${detailUrl}`;

  const cs = formatPostgrestCsValue(scenarioId);
  const { res: profileRes, text: profileText } = await sbServiceFetch(
    env,
    `/rest/v1/${SUPABASE_TABLES.playerProfiles}?select=player_id&gmable_scenario_ids=cs.{${cs}}`
  );
  if (!profileRes.ok) {
    console.warn("GM可能プレイヤーの取得に失敗:", profileText);
    return;
  }
  const profiles = JSON.parse(profileText);
  const targetIds = (Array.isArray(profiles) ? profiles : [])
    .map(row => String(row.player_id))
    .filter(id => id && id !== String(interestedPlayerId));

  if (targetIds.length === 0) return;

  const encodedIds = targetIds.map(encodeURIComponent).join(",");
  const { res: playersRes, text: playersText } = await sbServiceFetch(
    env,
    `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,player_name,discord_id&player_id=in.(${encodedIds})`
  );
  if (!playersRes.ok) {
    console.warn("通知先プレイヤーの取得に失敗:", playersText);
    return;
  }
  const playerRows = JSON.parse(playersText);
  const players = (Array.isArray(playerRows) ? playerRows : []).filter(p => p?.discord_id);

  const useTest = env.DISCORD_USE_TEST_WEBHOOK === "true" || env.DISCORD_USE_TEST_WEBHOOK === "1";
  if (useTest) {
    const previewTargets = players
      .map(p => `${p.player_name || p.player_id} (<@${p.discord_id}>)`)
      .join(", ");
    await sendDiscordNotification(
      `[TEST] 気になる通知プレビュー（実DMは送信しません）\n宛先: ${previewTargets || "なし"}\n\n${content}`,
      {
        title: "気になる通知（テスト）",
        description: content,
        color: DISCORD_COLORS.recruitment
      },
      env,
      env.DISCORD_TEST_WEBHOOK_URL || null
    );
    return;
  }

  for (const player of players) {
    await sendDiscordDirectMessage(player.discord_id, content, env);
  }
}

async function sendDiscordNotification(content, embed, env, webhookUrl, customUsername = null, customAvatarUrl = null) {
  console.log("Discord通知を開始します..."); // 外部通知の開始点をWorkerログで追跡できるようにする。
  const url = resolveDiscordWebhookUrl(env, webhookUrl);
  if (!url) {
    console.log("URLが見つかりません"); // 通知先未設定は定期処理全体を失敗させず、通知だけを省略する。
    return;
  }

  const payload = {
    content: content,
    embeds: [embed]
  };

  if (customUsername) payload.username = customUsername;
  if (customAvatarUrl) payload.avatar_url = customAvatarUrl;

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// Discord通知の表示名候補だけに用途を絞り、キャラクターのIDと名前を軽量取得する。
async function getCharacterList(env) {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${SUPABASE_TABLES.characters}?select=id,name`, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
      }
    });
    if (res.ok) {
      const characters = await res.json();
      return characters && characters.length > 0 ? characters : [];
    }
  } catch (err) {
    console.error("キャラクター取得エラー:", err);
  }
  return [];
}

/**
 * 通知ごとに一度だけランダム選択し、画像が存在する場合だけキャラ名・画像へ差し替える。
 * フォールバック画像は通知種別で異なるため引数で受け、従来payloadを維持する。
 */
async function resolveDiscordCharacterIdentity(characters, defaultAvatarUrl) {
  let customName = DISCORD_DEFAULT_NAME;
  let customAvatar = defaultAvatarUrl;
  let randomChar = null;

  if (characters.length > 0) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    randomChar = characters[randomIndex];
  }

  if (randomChar) {
    const targetUrl = `${GITHUB_IMAGE_BASE_URL}/character/${randomChar.id}.png?raw=true`;
    try {
      const imgCheck = await fetch(targetUrl, { method: 'HEAD' });
      if (imgCheck.ok) {
        customName = randomChar.name;
        customAvatar = targetUrl;
      }
    } catch (err) {
      console.error("画像チェックエラー:", err);
    }
  }

  return { customName, customAvatar };
}

export default {
  async fetch(request, env, ctx) {
    return handleFetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    // Cronの完了をCloudflareへ伝えるため、従来どおりwaitUntilへ単一Promiseを渡す。
    ctx.waitUntil(runScheduledTasks(env));
  }
};

async function runScheduledTasks(env) {
  await notifyScheduledSessions(env);
  await deleteExpiredRecruitments(env);
}

async function notifyScheduledSessions(env) {
      // ==========================================
      // ---- 1. 本日のセッション通知処理 ----
      // ==========================================
      try {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const startDate = encodeURIComponent(now.toISOString());
        const endDate = encodeURIComponent(tomorrow.toISOString());

        const { res: sessionRes, text: sessionText } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.sessions}?select=id,start,run_id,title,stream_url,notes&status=eq.scheduled&start=gte.${startDate}&start=lt.${endDate}`);

        if (!sessionRes.ok) {
          console.error("Supabase APIエラー(Sessions):", sessionText);
        } else {
          const upcomingSessions = JSON.parse(sessionText);

          if (!Array.isArray(upcomingSessions) || upcomingSessions.length === 0) {
            console.log("本日の予定セッションはありません。");
            // 通知対象がなくても、別責務である期限切れ募集の削除は継続させる。
          } else {
            // --- セッション情報から卓情報を取得 ---
            const runIds = [...new Set(upcomingSessions.map(s => s.run_id).filter(Boolean))];
            let runsMap = new Map();

            if (runIds.length > 0) {
              const runIdsParam = encodeURIComponent(`(${runIds.join(',')})`);
              const { res: runsRes, text: runsText } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.runs}?select=id,title,gm_id&id=in.${runIdsParam}`);

              if (runsRes.ok) {
                const runsData = JSON.parse(runsText);
                runsMap = new Map(runsData.map(r => [String(r.id), r]));
              } else {
                console.error("Supabase APIエラー(Runs):", runsText);
              }
            }

            const playersByRun = await fetchPlayerIdsByRunIds(env, [...runsMap.keys()]);

            // --- 卓内で参照されるプレイヤーだけを一括取得 ---
            const requiredPlayerIds = [...new Set(
              [...runsMap.values()].flatMap(run => [
                run.gm_id,
                ...resolveRunPlayerIds(run, playersByRun)
              ]).filter(Boolean).map(String)
            )];
            let allPlayers = [];
            if (requiredPlayerIds.length > 0) {
              const playerIdsParam = encodeURIComponent(`(${requiredPlayerIds.join(',')})`);
              const { res: mapRes, text: mapText } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,player_name,discord_id&player_id=in.${playerIdsParam}`);
              allPlayers = mapRes.ok ? JSON.parse(mapText) : [];
            }

            const playerMapById = new Map(allPlayers.map(p => [String(p.player_id), p]));

            // キャラクター一覧を取得
            const availableCharacters = await getCharacterList(env);

            // --- 通知の作成と送信 ---
            for (const session of upcomingSessions) {
              const run = runsMap.get(String(session.run_id)) || {};
              const runTitle = run.title || "名称未設定の卓";
              const sessionTitle = session.title || session.name || "名称未設定のセッション";
              const streamURL = session.stream_url || "";

              const sessionStart = new Date(session.start);
              const timeString = sessionStart.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });

              const gmObj = run.gm_id ? playerMapById.get(String(run.gm_id)) : null;
              const gmName = gmObj ? gmObj.player_name : 'GM未定';
              const gmDiscordId = gmObj ? gmObj.discord_id : null;

              const displayPlayers = [];
              const playerDiscordIds = [];
              const targetPlayers = resolveRunPlayerIds(run, playersByRun);

              targetPlayers.forEach(identifier => {
                const pObj = playerMapById.get(String(identifier));
                if (pObj) {
                  displayPlayers.push(`- ${pObj.player_name}`);
                  if (pObj.discord_id) playerDiscordIds.push(pObj.discord_id);
                } else {
                  displayPlayers.push(`- ${identifier}`);
                }
              });

              const displayPlayerList = displayPlayers.length > 0 ? displayPlayers.join("\n") : "- 参加者情報なし";

              const viewerMentions = extractViewerMentions(session.notes);
              const viewerSection = viewerMentions.length > 0
                ? `\n\n**【観戦】**\n${viewerMentions.map(m => `- ${m}`).join("\n")}`
                : "";

              const mentions = [];
              if (gmDiscordId) mentions.push(`<@${gmDiscordId}>`);
              playerDiscordIds.forEach(dId => mentions.push(`<@${dId}>`));
              viewerMentions.forEach(m => mentions.push(m));

              const notificationLine = mentions.length > 0 ? [...new Set(mentions)].join(" ") : "";

              const { customName, customAvatar } = await resolveDiscordCharacterIdentity(
                availableCharacters,
                DISCORD_SESSION_DEFAULT_AVATAR_URL
              );

              // --- Discordへ送信 ---
              await sendDiscordNotification(
                `${notificationLine}\n🔔 **セッション通知**`,
                {
                  title: `卓名：${runTitle} （${sessionTitle}）`,
                  description: `**開始予定：${timeString}**\n\n**【GM】**\n- ${gmName}\n\n**【PL】**\n${displayPlayerList}${viewerSection}\n\n**【配信URL（ネタバレ注意）】**\n${streamURL}\n\nFCTZS TRPG部に集合！`,
                  color: DISCORD_COLORS.sessionNotice,
                  url: `${resolveSiteUrl(env)}/sessions/detail.html?id=${session.run_id}`
                },
                env,
                env.DISCORD_WEBHOOK_URL,
                customName,
                customAvatar
              );
            }
          }
        }
      } catch (err) {
        console.error("定期実行エラー(Session):", err);
      }
}

async function deleteExpiredRecruitments(env) {
      // ==========================================
      // ---- 2. 1ヶ月経過した募集の自動削除 ----
      // ==========================================
      try {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        // ISO日時の記号がPostgREST条件として誤解釈されないよう、クエリ値をエンコードする。
        const thresholdISO = encodeURIComponent(oneMonthAgo.toISOString());

        const { res: fetchOldRes, text: fetchOldText } = await sbServiceFetch(env, `/rest/v1/${SUPABASE_TABLES.recruitments}?created_at=lt.${thresholdISO}&select=id`);

        if (fetchOldRes.ok) {
          const oldRecruits = JSON.parse(fetchOldText);

          if (oldRecruits && oldRecruits.length > 0) {
            const oldIds = oldRecruits.map(r => r.id);
            const deleteIdsQuery = `(${oldIds.map(id => encodeURIComponent(id)).join(',')})`;

            await sbServiceFetch(env, `/rest/v1/${SUPABASE_TABLES.recruitmentApplicants}?recruitment_id=in.${deleteIdsQuery}`, { method: 'DELETE' });
            await sbServiceFetch(env, `/rest/v1/${SUPABASE_TABLES.recruitments}?id=in.${deleteIdsQuery}`, { method: 'DELETE' });

            console.log(`${oldRecruits.length}件の募集を自動削除しました。`);
          }
        }
      } catch (err) {
        console.error("募集の自動削除エラー:", err);
      }
}

// 共通のヘッダー設定
const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*"
};

// path・query・返却形式が完全に同じGETだけを宣言表へ寄せる。
const FIXED_GET_PROXY_ROUTES = Object.freeze({
  "/api/sessions": `/rest/v1/${SUPABASE_TABLES.sessions}?select=${SESSION_LIST_SELECT}`
});

/** クライアント参照を外したレガシーGET。410で明示退役。 */
const RETIRED_GET_ROUTES = Object.freeze({
  "/api/scenario_list": "Use GET /api/scenario_summary",
  "/api/session_list": "Use GET /api/sessions",
  "/api/character_details": "Use GET /api/characters + /api/character_attributes + /api/character_skill_list + /api/character_scenarios"
});

/**
 * HTTP入口の優先順位を固定する。
 * Interactionは通常POSTと本文の読み方が異なるため、汎用ルーターより先に分離する。
 */
async function handleFetch(request, env, ctx) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  if (request.method === "POST" && url.pathname === "/api/interactions") {
    const interactionResponse = await handleInteraction(request, env, ctx);
    if (interactionResponse !== undefined) {
      return interactionResponse;
    }
    // 未対応Interactionは従来どおり通常POSTへ流し、本文再読込時の既存エラー挙動を保つ。
  }

  try {
    return await routeApiRequest(request, env, ctx, url);
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
  }
}

/**
 * method判定を一か所に保ち、各ハンドラーには従来と同じ引数を渡す。
 * 未知GET等は既存ハンドラーのundefinedをそのまま返し、404へ補正しない。
 */
async function routeApiRequest(request, env, ctx, url) {
  if (request.method === "GET")    return await handleGet(request, env, url);

  // 通常書込みはAuth APIでJWTを実検証する。Discord Interactionは署名検証済み経路で先に分離済み。
  if (
    ["POST", "PATCH", "DELETE"].includes(request.method)
    && url.pathname !== "/api/interactions"
    && !(request.method === "PATCH" && url.pathname === PUBLIC_EXTERNAL_PASSED_PATH)
  ) {
    if (!await validateUserBearer(request, env)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }
  }

  if (request.method === "POST")   return await handlePost(request, env, ctx, url);
  if (request.method === "PATCH")  return await handlePatch(request, env, ctx, url);
  if (request.method === "DELETE") return await handleDelete(request, env, url);

  return new Response("Method not allowed", { status: 405 });
}

async function handleInteraction(request, env, ctx) {
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  const body = await request.text();

  if (!signature || !timestamp || !env.DISCORD_PUBLIC_KEY) {
    return new Response('Invalid request signature', { status: 401 });
  }

  let isVerified = false;
  try {
    // Discord Developer Portalの登録要件なので、本文解釈より先に署名を検証する。
    isVerified = nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + body),
      hexToUint8Array(signature),
      hexToUint8Array(env.DISCORD_PUBLIC_KEY)
    );
  } catch {
    return new Response('Invalid request signature', { status: 401 });
  }

  if (!isVerified) {
    return new Response('Invalid request signature', { status: 401 });
  }

  const interaction = JSON.parse(body);

  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (interaction.type === 3) {
    const customId = interaction.data.custom_id;
    if (customId.startsWith("join_")) {
      const recruitmentId = customId.replace("join_", "");
      ctx.waitUntil(registerParticipant(recruitmentId, interaction.member.user, env));

      return new Response(JSON.stringify({
        type: 4,
        data: { content: "参加希望を受け付けました！", flags: 64 }
      }), { headers: { 'Content-Type': 'application/json' } });
    }
  }
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS, PATCH, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Discord-Provider-Token",
    }
  });
}

/**
 * SupabaseへのAPI通信を共通化・正規化するラッパー関数
 */
async function sbFetch(env, request, pathAndQuery, options = {}) {
  const url = `${env.SUPABASE_URL}${pathAndQuery}`;

  // 利用者認証を引き継ぐ経路だけBearerを採用し、内部処理は匿名キーへ明示的にフォールバックする。
  const authHeader = request?.headers?.get("Authorization");

  const headers = {
    "apikey": env.SUPABASE_ANON_KEY,
    "Authorization": authHeader || `Bearer ${env.SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const fetchOptions = {
    method: options.method || "GET",
    headers: headers,
  };

  if (options.body) {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOptions);
  const text = await res.text();
  return { res, text };
}

/**
 * Auth APIで利用者JWTを検証し、成功時のみuser JSONを返す。
 * JWT本文はログ・レスポンスへ含めない。
 */
async function getAuthenticatedUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;

  try {
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: authorization
      }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    console.warn("利用者認証APIへの接続に失敗しました");
    return null;
  }
}

async function validateUserBearer(request, env) {
  return !!(await getAuthenticatedUser(request, env));
}

function decodeBearerJwtPayload(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  try {
    const payloadPart = match[1].split(".")[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** Auth user / JWT / Admin API から Discord snowflake を取り出す。 */
function extractDiscordIdFromAuthUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  const appMeta = user.app_metadata || {};
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const candidates = [
    meta.provider_id,
    meta.sub,
    meta.discord_id,
    meta.custom_claims?.provider_id,
    meta.custom_claims?.sub,
    appMeta.provider_id,
    appMeta.sub,
    ...identities.flatMap(identity => {
      const provider = String(identity?.provider || "").toLowerCase();
      if (provider && provider !== "discord") return [];
      const data = identity.identity_data || {};
      return [data.provider_id, data.sub, data.id, data.user_id, identity.id];
    })
  ];
  for (const candidate of candidates) {
    const raw = String(candidate || "").trim();
    if (!raw) continue;
    // UUID は除外し、Discord snowflake（おおむね17〜20桁）だけを採用する
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
      continue;
    }
    const matched = raw.match(/(\d{17,20})/);
    if (matched) return matched[1];
  }
  return null;
}

/** Service Role の Admin API で identities 付きユーザーを取り、Discord ID を補完する。 */
async function fetchAuthAdminUser(env, userId) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !userId) return null;
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: "GET",
        signal: AbortSignal.timeout(8000),
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    if (!response.ok) {
      console.warn("Auth Admin ユーザー取得に失敗:", response.status);
      return null;
    }
    return await response.json();
  } catch (err) {
    console.warn("Auth Admin ユーザー取得エラー:", err);
    return null;
  }
}

async function resolveDiscordIdForRequest(request, env, user, providerToken = null) {
  let discordId = extractDiscordIdFromAuthUser(user);
  if (discordId) return discordId;

  const jwtPayload = decodeBearerJwtPayload(request);
  if (jwtPayload) {
    discordId = extractDiscordIdFromAuthUser({
      id: jwtPayload.sub,
      user_metadata: jwtPayload.user_metadata || jwtPayload,
      app_metadata: jwtPayload.app_metadata || {},
      identities: jwtPayload.identities || []
    });
    if (discordId) return discordId;
  }

  const adminUser = await fetchAuthAdminUser(env, user?.id || jwtPayload?.sub);
  if (adminUser) {
    discordId = extractDiscordIdFromAuthUser(adminUser);
    if (discordId) return discordId;
  }

  // Auth メタデータに無い場合、Discord OAuth の provider_token で @me を叩く
  const tokenFromHeader = request.headers.get("X-Discord-Provider-Token");
  const token = String(providerToken || tokenFromHeader || "").trim();
  if (token) {
    discordId = await fetchDiscordIdWithProviderToken(token);
    if (discordId) return discordId;
  }
  return null;
}

async function fetchDiscordIdWithProviderToken(providerToken) {
  if (!providerToken) return null;
  try {
    const response = await fetch("https://discord.com/api/users/@me", {
      method: "GET",
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${providerToken}` }
    });
    if (!response.ok) {
      console.warn("Discord @me 取得に失敗:", response.status);
      return null;
    }
    const data = await response.json();
    const id = String(data?.id || "").trim();
    return /^\d{17,20}$/.test(id) ? id : null;
  } catch (err) {
    console.warn("Discord @me 取得エラー:", err);
    return null;
  }
}

async function listClaimablePlayers(env, discordId) {
  const { res, text } = await sbServiceFetch(
    env,
    `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,player_name,user_id,discord_id&order=player_name.asc`
  );
  if (!res.ok) {
    console.warn("claimable players 取得失敗:", text);
    return [];
  }
  const rows = JSON.parse(text);
  const list = Array.isArray(rows) ? rows : [];
  // 選択UI用: user_id 未設定をすべて出す（紐づけ可否は POST /api/me/link 側で判定）
  // 自分の Discord ID と一致する行は先頭に寄せる
  const unlinked = list
    .filter(p => !p.user_id)
    .map(p => ({
      player_id: p.player_id,
      player_name: p.player_name,
      discord_id: p.discord_id ? String(p.discord_id).trim() : "",
      user_id: p.user_id || null
    }));
  if (!discordId) {
    return unlinked.sort((a, b) =>
      String(a.player_name || "").localeCompare(String(b.player_name || ""), "ja")
    );
  }
  const matched = [];
  const others = [];
  for (const p of unlinked) {
    if (p.discord_id && p.discord_id === String(discordId)) matched.push(p);
    else others.push(p);
  }
  others.sort((a, b) =>
    String(a.player_name || "").localeCompare(String(b.player_name || ""), "ja")
  );
  return [...matched, ...others];
}

/**
 * JWT の本人を players.player_id へ解決する。
 * 1) players.user_id = auth.users.id（Auth UUID）
 * 2) 未連携時は players.discord_id = Discord snowflake で検索し、user_id を自動連携
 * Auth UUID と Discord snowflake を直接比較しない。
 * 名簿照合は Service Role（公開 SELECT でも JWT 経路と揃える）。
 */
async function resolveCallerPlayerId(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user?.id) return null;
  const authUserId = String(user.id);

  const { res: byUserRes, text: byUserText } = await sbServiceFetch(
    env,
    `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,user_id,discord_id&user_id=eq.${encodeURIComponent(authUserId)}&limit=1`
  );
  if (byUserRes.ok) {
    const byUserRows = JSON.parse(byUserText);
    if (Array.isArray(byUserRows) && byUserRows[0]?.player_id) {
      return String(byUserRows[0].player_id);
    }
  }

  const discordId = await resolveDiscordIdForRequest(request, env, user);
  if (!discordId) return null;

  let matchedRow = null;
  const { res: byDiscordRes, text: byDiscordText } = await sbServiceFetch(
    env,
    `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,user_id,discord_id&discord_id=eq.${encodeURIComponent(discordId)}&limit=1`
  );
  if (byDiscordRes.ok) {
    const byDiscordRows = JSON.parse(byDiscordText);
    if (Array.isArray(byDiscordRows) && byDiscordRows[0]?.player_id) {
      matchedRow = byDiscordRows[0];
    }
  }

  // eq 照合で漏れないよう、全件を trim 比較でも拾う（空白・型ゆれ対策）
  if (!matchedRow) {
    const { res: allRes, text: allText } = await sbServiceFetch(
      env,
      `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,user_id,discord_id`
    );
    if (allRes.ok) {
      const allRows = JSON.parse(allText);
      matchedRow = (Array.isArray(allRows) ? allRows : []).find(
        p => String(p?.discord_id || "").trim() === String(discordId)
      ) || null;
    }
  }
  if (!matchedRow?.player_id) return null;

  const playerId = String(matchedRow.player_id);
  const linkedUserId = matchedRow.user_id ? String(matchedRow.user_id) : "";

  // RLS は players.user_id = auth.uid() を見るため、Discord 解決後に Auth UUID を書き戻す。
  if (linkedUserId !== authUserId) {
    try {
      const { res: conflictRes, text: conflictText } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.players}?select=player_id&user_id=eq.${encodeURIComponent(authUserId)}&limit=1`
      );
      const conflictRows = conflictRes.ok ? JSON.parse(conflictText) : [];
      const conflictPlayerId = Array.isArray(conflictRows) && conflictRows[0]?.player_id
        ? String(conflictRows[0].player_id)
        : null;
      if (!conflictPlayerId || conflictPlayerId === playerId) {
        await sbServiceFetch(
          env,
          `/rest/v1/${SUPABASE_TABLES.players}?player_id=eq.${encodeURIComponent(playerId)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: { user_id: authUserId }
          }
        );
      } else {
        console.error("players.user_id 自動連携をスキップ: 別プレイヤーに同一 Auth UUID が既にある", {
          playerId,
          conflictPlayerId
        });
      }
    } catch (err) {
      console.error("players.user_id 自動連携に失敗:", err);
    }
  }

  return playerId;
}

/**
 * Service Roleは署名検証済みInteraction・Cron・認証後の内部同期だけから呼ぶ。
 * 通常HTTPルーターへrequestを受け取る形では公開せず、Secretをログやレスポンスへ含めない。
 */
async function sbServiceFetch(env, pathAndQuery, options = {}) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("内部処理エラー: SUPABASE_SERVICE_ROLE_KEY が設定されていません");
    throw new Error("Service Role is not configured");
  }

  const headers = {
    "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const fetchOptions = { method: options.method || "GET", headers };
  if (options.body) {
    fetchOptions.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  const res = await fetch(`${env.SUPABASE_URL}${pathAndQuery}`, fetchOptions);
  const text = await res.text();
  return { res, text };
}

function appendSafeViewQuery(url, allowedFilters, allowedOrderColumns, defaultOrder, selectColumns) {
  const params = new URLSearchParams({ select: selectColumns });

  for (const filter of allowedFilters) {
    const value = url.searchParams.get(filter);
    if (value && /^(?:eq|neq|in)\.[A-Za-z0-9_.,()%-]+$/.test(value)) {
      params.set(filter, value);
    }
  }

  const order = url.searchParams.get("order");
  if (order) {
    const clauses = order.split(",");
    const valid = clauses.every(clause => {
      const [column, direction, nulls] = clause.split(".");
      return allowedOrderColumns.includes(column)
        && (!direction || direction === "asc" || direction === "desc")
        && (!nulls || nulls === "nullsfirst" || nulls === "nullslast");
    });
    if (valid) params.set("order", order);
  } else if (defaultOrder) {
    params.set("order", defaultOrder);
  }

  for (const name of ["limit", "offset"]) {
    const raw = url.searchParams.get(name);
    if (raw && /^\d+$/.test(raw)) {
      params.set(name, String(Math.min(Number(raw), name === "limit" ? 100 : 10000)));
    }
  }

  return params.toString();
}

async function handleGet(request, env, url) {
    const retiredHint = RETIRED_GET_ROUTES[url.pathname];
    if (retiredHint) {
      return new Response(JSON.stringify({
        error: "Gone",
        detail: retiredHint
      }), { status: 410, headers: jsonHeaders });
    }

    const fixedProxyPath = FIXED_GET_PROXY_ROUTES[url.pathname];
    if (fixedProxyPath) {
      const { res, text } = await sbFetch(env, request, fixedProxyPath);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ビューは security_invoker のため、anon RLS だと空になる。Service Role で読む。
    if (request.method === "GET" && url.pathname === "/api/character_last_session") {
      const { res, text } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.characterLastSession}?select=character_id,last_session_start`
      );
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ログイン本人のプレイヤー解決（Discord 自動連携込み）。ホーム等のクライアント照合の正本。
    if (request.method === "GET" && url.pathname === "/api/me") {
      const user = await getAuthenticatedUser(request, env);
      if (!user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
      }
      const discordId = await resolveDiscordIdForRequest(request, env, user);
      const claimablePlayers = await listClaimablePlayers(env, discordId);
      const playerId = await resolveCallerPlayerId(request, env);
      if (!playerId) {
        return new Response(JSON.stringify({
          linked: false,
          player: null,
          discord_id: discordId,
          auth_user_id: String(user.id),
          claimable_players: claimablePlayers
        }), { status: 200, headers: jsonHeaders });
      }
      const { res, text } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,player_name,user_id,discord_id&player_id=eq.${encodeURIComponent(playerId)}&limit=1`
      );
      if (!res.ok) {
        return new Response(text, { status: res.status, headers: jsonHeaders });
      }
      const rows = JSON.parse(text);
      const player = Array.isArray(rows) && rows[0] ? rows[0] : null;
      return new Response(JSON.stringify({
        linked: Boolean(player),
        player,
        discord_id: discordId || player?.discord_id || null,
        auth_user_id: String(user.id),
        claimable_players: []
      }), { status: 200, headers: jsonHeaders });
    }

    // ---- Comments (既存保持) ----
    if (request.method === "GET" && url.pathname === "/api/comments") {
      const target_type = url.searchParams.get("target_type");
      const target_id = url.searchParams.get("target_id");
      const apiUrl = `/rest/v1/${SUPABASE_TABLES.comments}?select=*&target_type=eq.${target_type}&target_id=eq.${target_id}&order=created_at.asc`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/comments/recent") {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 100);
      const apiUrl = `/rest/v1/${SUPABASE_TABLES.comments}?select=id,created_at,target_type,target_id,author,body&order=created_at.desc&limit=${limit}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (
      request.method === "GET"
      && ["/api/comments/recent/with_names", "/api/comments/recent_with_names"].includes(url.pathname)
    ) {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 100);
      const apiUrl = `/rest/v1/${SUPABASE_TABLES.recentCommentsWithNames}?select=id,created_at,target_type,target_id,author,body,target_name&order=created_at.desc&limit=${limit}`;
      const { res, text } = await sbFetch(env, request, apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }


        // ---- Characters ----
    if (request.method === "GET" && url.pathname === "/api/characters") {
      let queryParams = [];

      const id = url.searchParams.get("id");
      const ids = url.searchParams.get("ids");
      const system = url.searchParams.get("system");
      const player = url.searchParams.get("player_id");
      const state = url.searchParams.get("state");
      const keyword = url.searchParams.get("keyword");
      const scenarioId = url.searchParams.get("scenario_id");

      if (id) queryParams.push(`id=eq.${encodeURIComponent(id)}`);
      if (!id && ids) {
        const encodedIds = ids.split(",").map(value => value.trim()).filter(Boolean).map(encodeURIComponent);
        if (encodedIds.length > 0) queryParams.push(`id=in.(${encodedIds.join(",")})`);
      }

      if (scenarioId) {
        const csRes = await fetch(`${env.SUPABASE_URL}/rest/v1/${SUPABASE_TABLES.characterScenarios}?select=character_id&scenario_id=eq.${encodeURIComponent(scenarioId)}`, {
          headers: {
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          }
        });

        if (csRes.ok) {
          const csData = await csRes.json();
          const charIds = csData.map(d => d.character_id);

          // 該当するキャラクターが一人もいない場合は、空っぽの配列を返して終了
          if (charIds.length === 0) {
             return new Response(JSON.stringify([]), { status: 200, headers: jsonHeaders });
          }
          // IN句を使って、見つかったキャラクターIDに絞り込む
          queryParams.push(`id=in.(${charIds.map(encodeURIComponent).join(',')})`);
        }
      }

      if (system) queryParams.push(`system=eq.${encodeURIComponent(system)}`);
      if (player) queryParams.push(`player_id=eq.${encodeURIComponent(player)}`);
      if (state) queryParams.push(`state=eq.${encodeURIComponent(state)}`);

      if (keyword) {
        const kw = encodeURIComponent(`*${keyword}*`);
        queryParams.push(`or=(name.ilike.${kw},job.ilike.${kw})`); // キーワードからはplayerを外す(選択式になったため)
      }

      queryParams.push(id ? "select=*,players(player_name)" : `select=${CHARACTER_LIST_SELECT}`);
      queryParams.push("order=id.desc");

      const apiUrl = `/rest/v1/${SUPABASE_TABLES.characters}?${queryParams.join("&")}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- Schedule & Players ----
    // プロフィールはプレイヤー本体と別管理のため、画面側が結合できる取得経路を公開する。
    if (request.method === "GET" && url.pathname === "/api/player_profiles") {
      const apiUrl = `/rest/v1/${SUPABASE_TABLES.playerProfiles}${url.search || "?select=*"}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // プレイヤー一覧の取得
    if (request.method === "GET" && url.pathname === "/api/players") {
      // 明示selectがない一覧呼び出しは名簿表示に必要な列だけ返す。
      const apiUrl = `/rest/v1/${SUPABASE_TABLES.players}${url.search || `?select=${PLAYER_LIST_SELECT}`}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/player_detail_summary") {
      const playerId = url.searchParams.get("player_id");
      if (!playerId) {
        return new Response(JSON.stringify({ error: "player_id required" }), { status: 400, headers: jsonHeaders });
      }
      const apiUrl = `/rest/v1/${SUPABASE_TABLES.playerDetailSummary}?select=${PLAYER_DETAIL_SUMMARY_SELECT}&player_id=eq.${encodeURIComponent(playerId)}`;
      const { res, text } = await sbFetch(env, request, apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // プレイヤーの予定を取得
    if (request.method === "GET" && url.pathname === "/api/player_availability") {
      // フロントから送られたクエリパラメータ（?select=...&player_id=...）をそのままSupabaseに渡す
      const apiUrl = `/rest/v1/${SUPABASE_TABLES.playerAvailability}${url.search}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // 複数プレイヤーの予定を照合 (AND計算)
    if (request.method === "GET" && url.pathname === "/api/schedule_match") {
      const playerIdsStr = url.searchParams.get("player_ids");
      const startDate = url.searchParams.get("start_date");
      const endDate = url.searchParams.get("end_date");

      if (!playerIdsStr) return new Response(JSON.stringify({ error: "player_ids required" }), { status: 400, headers: jsonHeaders });
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate || "")
        || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")
      ) {
        return new Response(JSON.stringify({ error: "valid start_date and end_date required" }), { status: 400, headers: jsonHeaders });
      }

      const playerIds = playerIdsStr.split(",").map(value => value.trim()).filter(Boolean);
      if (playerIds.length === 0 || playerIds.length > 100) {
        return new Response(JSON.stringify({ error: "player_ids must contain 1 to 100 values" }), { status: 400, headers: jsonHeaders });
      }
      const encodedIds = playerIds.map(id => encodeURIComponent(id)).join(",");

      const { res, text } = await sbFetch(env, request,`/rest/v1/${SUPABASE_TABLES.playerAvailability}?select=*,players(player_name)&player_id=in.(${encodedIds})&target_date=gte.${startDate}&target_date=lte.${endDate}`);

      if (!res.ok) return new Response(text, { status: res.status, headers: jsonHeaders });

      const raw = JSON.parse(text);
      const grouped = {};

      raw.forEach(r => {
        const key = `${r.target_date}_${r.time_slot}`;
        if (!grouped[key]) grouped[key] = {};
        grouped[key][r.player_id] = {
          status: r.status,
          name: r.players?.player_name || r.player_id
        };
      });

      const results = {};
      const start = new Date(`${startDate}T00:00:00Z`);
      const end = new Date(`${endDate}T00:00:00Z`);
      for (let date = start; date <= end; date = new Date(date.getTime() + 86400000)) {
        const dateString = date.toISOString().slice(0, 10);
        for (const slot of ["afternoon", "night"]) {
          const key = `${dateString}_${slot}`;
          const pList = Object.values(grouped[key] || {});
          const statuses = pList.map(p => p.status);
          const missingCount = playerIds.length - pList.length;

          if (statuses.includes("ng") || statuses.includes("none")) {
            results[key] = { color: "red", symbol: "×", label: "不可あり" };
          } else if (missingCount > 0) {
            results[key] = { color: "yellow", symbol: "△", label: `未入力: ${missingCount}人` };
          } else if (statuses.includes("maybe")) {
            const maybeNames = pList.filter(p => p.status === "maybe").map(p => p.name);
            results[key] = { color: "yellow", symbol: "△", label: `△: ${maybeNames.join(", ")}`, maybe_players: maybeNames };
          } else if (statuses.length === playerIds.length && statuses.every(status => status === "ok")) {
            results[key] = { color: "green", symbol: "○", label: "全員空き" };
          } else {
            results[key] = { color: "red", symbol: "×", label: "不可" };
          }
        }
      }

      return new Response(JSON.stringify(results), { status: 200, headers: jsonHeaders });
    }

        // ---- Scenarios  ----
    // シナリオ一覧の取得
    // 気になる: 件数（公開）とログイン中本人の状態
    if (request.method === "GET" && url.pathname === "/api/scenario_interests") {
      const scenarioId = url.searchParams.get("scenario_id");
      if (!scenarioId) {
        return new Response(JSON.stringify({ error: "scenario_id required" }), { status: 400, headers: jsonHeaders });
      }
      const count = await countScenarioInterests(env, scenarioId);
      let interested = false;
      const callerPlayerId = await resolveCallerPlayerId(request, env);
      if (callerPlayerId) {
        const { res, text } = await sbServiceFetch(
          env,
          `/rest/v1/${SUPABASE_TABLES.scenarioInterests}?select=player_id&scenario_id=eq.${encodeURIComponent(scenarioId)}&player_id=eq.${encodeURIComponent(callerPlayerId)}&limit=1`
        );
        if (res.ok) {
          const rows = JSON.parse(text);
          interested = Array.isArray(rows) && rows.length > 0;
        }
      }
      return new Response(JSON.stringify({ scenario_id: scenarioId, interested, count }), {
        status: 200,
        headers: jsonHeaders
      });
    }

    if (request.method === "GET" && url.pathname === "/api/scenarios") {
      let queryParams = [];

      const id = url.searchParams.get("id");
      const ids = url.searchParams.get("ids");
      const system = url.searchParams.get("system");
      const author = url.searchParams.get("author");
      const keyword = url.searchParams.get("keyword");

      if (id) queryParams.push(`id=eq.${encodeURIComponent(id)}`);
      if (!id && ids) {
        const encodedIds = ids.split(",").map(value => value.trim()).filter(Boolean).map(encodeURIComponent);
        if (encodedIds.length > 0) queryParams.push(`id=in.(${encodedIds.join(",")})`);
      }
      if (system) queryParams.push(`system=eq.${encodeURIComponent(system)}`);
      if (author) queryParams.push(`author=eq.${encodeURIComponent(author)}`);

      if (keyword) {
        const kw = encodeURIComponent(`*${keyword}*`);
        queryParams.push(`or=(title.ilike.${kw},author.ilike.${kw})`);
      }

      queryParams.push(id ? "select=*" : `select=${SCENARIO_LIST_SELECT}`);
      queryParams.push("order=updated_at.desc");

      const apiUrl = `/rest/v1/${SUPABASE_TABLES.scenarios}?${queryParams.join("&")}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/scenario_summary") {
      const query = appendSafeViewQuery(
        url,
        ["id", "system", "author"],
        ["updated_at", "title", "run_count"],
        "updated_at.desc",
        SCENARIO_SUMMARY_SELECT
      );
      const { res, text } = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.scenarioSummary}?${query}`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/character_scenarios") {
      const scenarioId = url.searchParams.get("scenario_id");
      const charId = url.searchParams.get("character_id");

      // キャラクター詳細でもシナリオ詳細でも使えるように select=* にする
      let apiUrl = `/rest/v1/${SUPABASE_TABLES.characterScenarios}?select=*`;

      if (scenarioId) {
        apiUrl += `&scenario_id=eq.${encodeURIComponent(scenarioId)}`;
      }

      if (charId) {
        // character_id=eq.xxx の形式に対応
        const cleanCharId = charId.replace("eq.", "");
        apiUrl += `&character_id=eq.${encodeURIComponent(cleanCharId)}`;
      }

      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- Runs & Sessions (既存保持) ----
    if (request.method === "GET" && url.pathname === "/api/runs") {
      let queryParams = [];

      const id = url.searchParams.get("id");
      // 表示名の変更に左右されない新形式gm_idで検索し、保存契約と揃える。
      const gmId = url.searchParams.get("gm_id");
      const scenarioId = url.searchParams.get("scenario_id");
      const status = url.searchParams.get("status");
      const keyword = url.searchParams.get("keyword");
      const participantId = url.searchParams.get("participant_id");
      const characterId = url.searchParams.get("character_id");

      if (id) queryParams.push(`id=eq.${encodeURIComponent(id)}`);
      if (gmId) queryParams.push(`gm_id=eq.${encodeURIComponent(gmId)}`);
      if (scenarioId) queryParams.push(`scenario_id=eq.${encodeURIComponent(scenarioId)}`);
      if (status) queryParams.push(`status=eq.${encodeURIComponent(status)}`);

      // 参加者・参加キャラは junction から run_id を引く（配列 contains は使わない）。
      if (participantId) {
        const value = encodeURIComponent(participantId);
        const memberRunIds = await fetchRunIdsByPlayer(env, request, participantId);
        if (memberRunIds.length > 0) {
          const encodedMemberIds = memberRunIds.map(encodeURIComponent).join(",");
          queryParams.push(`or=(gm_id.eq.${value},id.in.(${encodedMemberIds}))`);
        } else {
          // junction に無い場合は GM のみ（配列フォールバックなし）
          queryParams.push(`gm_id.eq.${value}`);
        }
      }
      if (characterId) {
        const characterRunIds = await fetchRunIdsByCharacter(env, request, characterId);
        if (characterRunIds.length === 0) {
          return new Response(JSON.stringify([]), { status: 200, headers: jsonHeaders });
        }
        queryParams.push(`id=in.(${characterRunIds.map(encodeURIComponent).join(",")})`);
      }

      if (keyword) {
        const kw = encodeURIComponent(`*${keyword}*`);
        queryParams.push(`title.ilike.${kw}`);
      }

      queryParams.push(id ? `select=${RUN_LIST_SELECT},user_id` : `select=${RUN_LIST_SELECT}`);
      queryParams.push("order=updated_at.desc");

      const apiUrl = `/rest/v1/${SUPABASE_TABLES.runs}?${queryParams.join("&")}`;

      const { res, text } = await sbFetch(env, request, apiUrl);

      if (!res.ok) {
        return new Response(text, { status: res.status, headers: jsonHeaders });
      }

      let runs = JSON.parse(text);
      runs = await hydrateRunsMembershipFromJunctions(env, request, runs);

      if (Array.isArray(runs) && runs.length > 0) {
        try {
          const requiredPlayerIds = [...new Set(runs.flatMap(run => [
            run.gm_id,
            ...(Array.isArray(run.player_ids) ? run.player_ids : [])
          ]).filter(Boolean).map(String))];
          let players = [];
          if (requiredPlayerIds.length > 0) {
            const ids = encodeURIComponent(`(${requiredPlayerIds.join(",")})`);
            const { res: playersRes, text: playersText } = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,player_name&player_id=in.${ids}`);
            if (playersRes.ok) {
              players = JSON.parse(playersText);
            } else {
              const fallback = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,player_name`);
              players = fallback.res.ok ? JSON.parse(fallback.text) : [];
            }
          }

          if (Array.isArray(players)) {
            const playerMap = new Map(players.map(p => [p.player_id, p.player_name]));

            runs.forEach(run => {
              run.gm_name = playerMap.get(run.gm_id) || "未設定";
              run.player_names = Array.isArray(run.player_ids)
                ? run.player_ids.map(pid => playerMap.get(pid) || pid)
                : [];
            });
          }
        } catch (err) {
          console.error("プレイヤー名結合エラー:", err);
        }
      }

      return new Response(JSON.stringify(runs), { status: 200, headers: jsonHeaders });
    }

    // ---- Recruit ----
    // 募集一覧の取得
    if (request.method === "GET" && url.pathname === "/api/recruitments") {
      const apiUrl = `/rest/v1/${SUPABASE_TABLES.recruitments}${url.search || "?select=*"}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/recruitment_list") {
      const query = appendSafeViewQuery(
        url,
        ["id", "status", "owner_player_id", "scenario_id", "recruit_role"],
        ["created_at", "status", "applicant_count"],
        "created_at.desc",
        RECRUITMENT_LIST_SELECT
      );
      const { res, text } = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.recruitmentList}?${query}`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

        // 応募者一覧の取得
    if (request.method === "GET" && url.pathname === "/api/recruitment_applicants") {
      const apiUrl = `/rest/v1/${SUPABASE_TABLES.recruitmentApplicants}${url.search || "?select=*"}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/sessions/detail") {
      const id = url.searchParams.get("id");
      const runId = url.searchParams.get("run_id");
      const runIds = url.searchParams.get("run_ids");
      // 詳細画面はnotes・配信URL等を含む既存の全列契約を維持する。
      const filters = ["select=*"];
      if (id) filters.push(`id=eq.${encodeURIComponent(id)}`);
      if (runId) filters.push(`run_id=eq.${encodeURIComponent(runId)}`);
      if (!runId && runIds) {
        const encodedIds = runIds.split(",").map(value => value.trim()).filter(Boolean).map(encodeURIComponent);
        if (encodedIds.length > 0) filters.push(`run_id=in.(${encodedIds.join(",")})`);
      }
      if (!id && !runId && !runIds) {
        return new Response(JSON.stringify({ error: "id, run_id or run_ids required" }), { status: 400, headers: jsonHeaders });
      }
      const { res, text } = await sbFetch(env, request,`/rest/v1/${SUPABASE_TABLES.sessions}?${filters.join("&")}`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

        // ---- Master Data & Helpers (既存保持) ----
    if (request.method === "GET" && url.pathname === "/api/system_attributes") {
      const system = url.searchParams.get("system");
      const query = system ? `?system=eq.${encodeURIComponent(system)}&order=sort_order.asc` : "?order=sort_order.asc";
      const { res, text } = await sbFetch(env, request,`/rest/v1/${SUPABASE_TABLES.systemAttributes}${query}`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/system_skill_bases") {
      const system = url.searchParams.get("system");
      const query = system ? `?system=eq.${encodeURIComponent(system)}&order=sort_order.asc` : "?order=sort_order.asc";
      const { res, text } = await sbFetch(env, request,`/rest/v1/${SUPABASE_TABLES.systemSkillBases}${query}`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/character_skill_list") {
      const charId = url.searchParams.get("character_id");
      const { res, text } = await sbFetch(env, request,`/rest/v1/${SUPABASE_TABLES.characterSkillList}?character_id=eq.${charId}`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/character_attributes") {
      const charId = url.searchParams.get("character_id");
      if (!charId) {
        return new Response(JSON.stringify({ error: "character_id required" }), { status: 400, headers: jsonHeaders });
      }
      const { res, text } = await sbFetch(
        env,
        request,
        `/rest/v1/${SUPABASE_TABLES.characterAttributes}?character_id=eq.${encodeURIComponent(charId)}`
      );
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- Posts (なりきりチャット) ----
    if (request.method === "GET" && url.pathname === "/api/posts") {
      // 最新の50件を取得
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
      const apiUrl = `/rest/v1/${SUPABASE_TABLES.posts}?select=*&order=created_at.desc&limit=${limit}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

}

async function handlePost(request, env, ctx, url) {
  try {
    // ログイン本人が名簿の自分の行へ Discord / Auth を自己連携する
    if (url.pathname === "/api/me/link") {
      const user = await getAuthenticatedUser(request, env);
      if (!user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
      }
      const authUserId = String(user.id);

      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: jsonHeaders });
      }
      const playerId = String(body?.player_id || "").trim();
      const providerToken = String(body?.provider_token || "").trim();
      if (!playerId) {
        return new Response(JSON.stringify({ error: "player_id required" }), { status: 400, headers: jsonHeaders });
      }

      const discordId = await resolveDiscordIdForRequest(request, env, user, providerToken || null);
      if (!discordId) {
        return new Response(JSON.stringify({
          error: "Discord ID を取得できません。一度ログアウトしてから Discord で再ログインしてください。"
        }), { status: 400, headers: jsonHeaders });
      }

      const alreadyLinked = await resolveCallerPlayerId(request, env);
      if (alreadyLinked && alreadyLinked !== playerId) {
        return new Response(JSON.stringify({
          error: "すでに別のプレイヤーへ連携済みです",
          player_id: alreadyLinked
        }), { status: 409, headers: jsonHeaders });
      }
      if (alreadyLinked === playerId) {
        const { res, text } = await sbServiceFetch(
          env,
          `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,player_name,user_id,discord_id&player_id=eq.${encodeURIComponent(playerId)}&limit=1`
        );
        const rows = res.ok ? JSON.parse(text) : [];
        return new Response(JSON.stringify({
          linked: true,
          player: Array.isArray(rows) ? rows[0] || null : null
        }), { status: 200, headers: jsonHeaders });
      }

      const { res: targetRes, text: targetText } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,player_name,user_id,discord_id&player_id=eq.${encodeURIComponent(playerId)}&limit=1`
      );
      if (!targetRes.ok) {
        return new Response(targetText, { status: targetRes.status, headers: jsonHeaders });
      }
      const targetRows = JSON.parse(targetText);
      const target = Array.isArray(targetRows) ? targetRows[0] : null;
      if (!target) {
        return new Response(JSON.stringify({ error: "プレイヤーが見つかりません" }), { status: 404, headers: jsonHeaders });
      }

      const targetUserId = target.user_id ? String(target.user_id) : "";
      const targetDiscordId = target.discord_id ? String(target.discord_id).trim() : "";
      if (targetUserId && targetUserId !== authUserId) {
        return new Response(JSON.stringify({ error: "このプレイヤーは別アカウントに連携済みです" }), { status: 403, headers: jsonHeaders });
      }
      if (targetDiscordId && targetDiscordId !== discordId) {
        return new Response(JSON.stringify({ error: "このプレイヤーは別の Discord に紐づいています" }), { status: 403, headers: jsonHeaders });
      }

      const { res: discordConflictRes, text: discordConflictText } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.players}?select=player_id&discord_id=eq.${encodeURIComponent(discordId)}&limit=1`
      );
      const discordConflictRows = discordConflictRes.ok ? JSON.parse(discordConflictText) : [];
      const discordConflictId = Array.isArray(discordConflictRows) && discordConflictRows[0]?.player_id
        ? String(discordConflictRows[0].player_id)
        : null;
      if (discordConflictId && discordConflictId !== playerId) {
        return new Response(JSON.stringify({
          error: "この Discord は別のプレイヤーに既に登録されています",
          player_id: discordConflictId
        }), { status: 409, headers: jsonHeaders });
      }

      const { res: patchRes, text: patchText } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.players}?player_id=eq.${encodeURIComponent(playerId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: { user_id: authUserId, discord_id: discordId }
        }
      );
      if (!patchRes.ok) {
        return new Response(patchText || JSON.stringify({ error: "連携に失敗しました" }), {
          status: patchRes.status,
          headers: jsonHeaders
        });
      }
      const patched = JSON.parse(patchText);
      const player = Array.isArray(patched) ? patched[0] : patched;
      return new Response(JSON.stringify({ linked: true, player }), { status: 200, headers: jsonHeaders });
    }

    // Cloudflare R2 画像アップロード
    if (url.pathname === "/api/upload") {
      if (!env.R2_BUCKET) {
        return new Response(JSON.stringify({ error: "R2_BUCKET is not bound" }), { status: 500, headers: jsonHeaders });
      }

      const formData = await request.formData();
      const file = formData.get("file");
      const typeRaw = String(formData.get("type") || "general");
      const type = R2_ALLOWED_TYPES.includes(typeRaw) ? typeRaw : null;

      if (!file) {
        return new Response(JSON.stringify({ error: "No file uploaded" }), { status: 400, headers: jsonHeaders });
      }
      if (!type) {
        return new Response(JSON.stringify({ error: "Invalid upload type" }), { status: 400, headers: jsonHeaders });
      }

      const fileSize = Number(file.size);
      if (Number.isFinite(fileSize) && fileSize > R2_MAX_UPLOAD_BYTES) {
        return new Response(JSON.stringify({ error: "File too large" }), { status: 413, headers: jsonHeaders });
      }

      const originalName = file.name || "image.png";
      const extMatch = originalName.match(/\.[^.]+$/);
      const ext = extMatch ? extMatch[0].toLowerCase() : "";
      if (!R2_ALLOWED_EXTENSIONS.includes(ext)) {
        return new Response(JSON.stringify({ error: "Unsupported file extension" }), { status: 400, headers: jsonHeaders });
      }

      const mimeType = String(file.type || "").toLowerCase();
      if (mimeType && !R2_ALLOWED_MIME_TYPES.includes(mimeType)) {
        return new Response(JSON.stringify({ error: "Unsupported content type" }), { status: 400, headers: jsonHeaders });
      }

      const key = `${type}/${crypto.randomUUID()}${ext}`;
      await env.R2_BUCKET.put(key, file.stream(), {
        httpMetadata: {
          contentType: mimeType || "image/png"
        }
      });

      const baseUrl = env.R2_PUBLIC_URL || "";
      const imageUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}${key}`;

      // 画面からの差し替え時: 旧URLが自バケットなら削除（デフォルト画像は触らない）
      const replaceUrlRaw = formData.get("replace_url");
      const replaceUrl = replaceUrlRaw != null ? String(replaceUrlRaw).trim() : "";
      let replaced = false;
      if (replaceUrl && replaceUrl !== imageUrl) {
        const del = await deleteReplacedR2Object(env, replaceUrl);
        replaced = del.deleted;
      }

      return new Response(JSON.stringify({ url: imageUrl, replaced }), { status: 201, headers: jsonHeaders });
    }

    // 卓GMが参加者予定を一日NGにする専用経路（他者行更新のためService Roleを使う）。
    if (url.pathname === "/api/player_availability/session_block") {
      const body = await request.json();
      const runId = body?.run_id != null ? String(body.run_id) : "";
      const sessionDate = body?.session_date || body?.target_date;
      const requestedIds = Array.isArray(body?.player_ids)
        ? body.player_ids.map(id => String(id)).filter(Boolean)
        : [];

      if (!runId || !sessionDate || requestedIds.length === 0) {
        return new Response(JSON.stringify({ error: "run_id, session_date, player_ids required" }), { status: 400, headers: jsonHeaders });
      }

      const callerPlayerId = await resolveCallerPlayerId(request, env);
      if (!callerPlayerId) {
        return new Response(JSON.stringify({ error: "Player mapping required" }), { status: 403, headers: jsonHeaders });
      }

      const { res: runRes, text: runText } = await sbFetch(
        env,
        request,
        `/rest/v1/${SUPABASE_TABLES.runs}?select=id,gm_id,user_id&id=eq.${encodeURIComponent(runId)}&limit=1`
      );
      if (!runRes.ok) {
        return new Response(JSON.stringify({ error: "Run lookup failed", detail: runText }), { status: runRes.status, headers: jsonHeaders });
      }
      const runRows = JSON.parse(runText);
      const run = Array.isArray(runRows) ? runRows[0] : null;
      if (!run) {
        return new Response(JSON.stringify({ error: "Run not found" }), { status: 404, headers: jsonHeaders });
      }

      const playersByRun = await fetchPlayerIdsByRunIds(env, [runId]);
      const runPlayerIds = new Set(
        [run.gm_id, ...resolveRunPlayerIds(run, playersByRun)]
          .filter(Boolean)
          .map(String)
      );
      const isRunMember = runPlayerIds.has(callerPlayerId);
      if (!isRunMember) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: jsonHeaders });
      }

      const invalidTargets = requestedIds.filter(id => !runPlayerIds.has(id));
      if (invalidTargets.length > 0) {
        return new Response(JSON.stringify({ error: "player_ids must belong to the run" }), { status: 400, headers: jsonHeaders });
      }

      const targetDate = new Date(sessionDate);
      if (Number.isNaN(targetDate.getTime())) {
        return new Response(JSON.stringify({ error: "Invalid session_date" }), { status: 400, headers: jsonHeaders });
      }
      const ymd = targetDate.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
      const updates = [];
      for (const playerId of requestedIds) {
        for (const slot of ["afternoon", "night"]) {
          updates.push({
            player_id: playerId,
            target_date: ymd,
            time_slot: slot,
            status: "ng",
            raw_text: "System: Session Booked (Full Day)"
          });
        }
      }

      const { res, text } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.playerAvailability}`,
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: updates
        }
      );
      if (!res.ok) {
        return new Response(JSON.stringify({ error: "Availability sync failed", detail: text }), { status: res.status, headers: jsonHeaders });
      }
      return new Response(JSON.stringify({ ok: true, count: updates.length }), { status: 200, headers: jsonHeaders });
    }

    const body = await request.json();
    const callerPlayerId = await resolveCallerPlayerId(request, env);

    // ---- 気になる ON（新規INSERT時のみ GM可能者へDM） ----
    if (url.pathname === "/api/scenario_interests") {
      if (!callerPlayerId) {
        return new Response(JSON.stringify({ error: "Player mapping required" }), { status: 403, headers: jsonHeaders });
      }
      const scenarioId = body?.scenario_id != null ? String(body.scenario_id).trim() : "";
      if (!scenarioId) {
        return new Response(JSON.stringify({ error: "scenario_id required" }), { status: 400, headers: jsonHeaders });
      }

      const { res: scenarioRes, text: scenarioText } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.scenarios}?select=id,title&id=eq.${encodeURIComponent(scenarioId)}&limit=1`
      );
      if (!scenarioRes.ok) {
        return new Response(JSON.stringify({ error: "Scenario lookup failed", detail: scenarioText }), { status: scenarioRes.status, headers: jsonHeaders });
      }
      const scenarioRows = JSON.parse(scenarioText);
      const scenario = Array.isArray(scenarioRows) ? scenarioRows[0] : null;
      if (!scenario) {
        return new Response(JSON.stringify({ error: "Scenario not found" }), { status: 404, headers: jsonHeaders });
      }

      const { res: existingRes, text: existingText } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.scenarioInterests}?select=player_id&scenario_id=eq.${encodeURIComponent(scenarioId)}&player_id=eq.${encodeURIComponent(callerPlayerId)}&limit=1`
      );
      if (!existingRes.ok) {
        return new Response(JSON.stringify({ error: "Interest lookup failed", detail: existingText }), { status: existingRes.status, headers: jsonHeaders });
      }
      const existingRows = JSON.parse(existingText);
      if (Array.isArray(existingRows) && existingRows.length > 0) {
        const count = await countScenarioInterests(env, scenarioId);
        return new Response(JSON.stringify({
          scenario_id: scenarioId,
          interested: true,
          count,
          notified: false
        }), { status: 200, headers: jsonHeaders });
      }

      const { res: insertRes, text: insertText } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.scenarioInterests}`,
        {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: [{ player_id: callerPlayerId, scenario_id: scenarioId }]
        }
      );
      if (!insertRes.ok) {
        return new Response(JSON.stringify({ error: "Interest insert failed", detail: insertText }), { status: insertRes.status, headers: jsonHeaders });
      }

      const { res: playerRes, text: playerText } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.players}?select=player_name&player_id=eq.${encodeURIComponent(callerPlayerId)}&limit=1`
      );
      const playerRows = playerRes.ok ? JSON.parse(playerText) : [];
      const interestedPlayerName = Array.isArray(playerRows) && playerRows[0]?.player_name
        ? playerRows[0].player_name
        : callerPlayerId;

      ctx.waitUntil(notifyGmablePlayersOfInterest(env, {
        scenarioId,
        interestedPlayerId: callerPlayerId,
        interestedPlayerName,
        scenarioTitle: scenario.title
      }));

      const count = await countScenarioInterests(env, scenarioId);
      return new Response(JSON.stringify({
        scenario_id: scenarioId,
        interested: true,
        count,
        notified: true
      }), { status: 201, headers: jsonHeaders });
    }

    // ---- Comments ----
    if (url.pathname === "/api/comments") {
      const commentBody = { ...body };
      if (callerPlayerId) {
        // 表示名のなりすましを避けるため、紐づきプレイヤー名があれば上書きする。
        const { res: playerRes, text: playerText } = await sbFetch(
          env,
          request,
          `/rest/v1/${SUPABASE_TABLES.players}?select=player_name&player_id=eq.${encodeURIComponent(callerPlayerId)}&limit=1`
        );
        if (playerRes.ok) {
          const players = JSON.parse(playerText);
          if (Array.isArray(players) && players[0]?.player_name) {
            commentBody.author = players[0].player_name;
          }
        }
      }
      const { res, text } = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.comments}`, { method: "POST", headers: { "Prefer": "return=representation" }, body: [commentBody] });
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- Characters (一括作成) ----
    // player_id はフォームで選んだ所有者。user_id は作成者（Auth）で編集権限を持つ。
    if (url.pathname === "/api/character_full") {
      const authUser = await getAuthenticatedUser(request, env);
      if (!authUser?.id || !callerPlayerId) {
        return new Response(JSON.stringify({ error: "Player mapping required" }), { status: 403, headers: jsonHeaders });
      }
      const { character, attributes, skills } = body;
      const ownerPlayerId = character?.player_id != null ? String(character.player_id).trim() : "";
      if (!ownerPlayerId) {
        return new Response(JSON.stringify({ error: "player_id required" }), { status: 400, headers: jsonHeaders });
      }

      const { res: ownerRes, text: ownerText } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.players}?select=player_id&player_id=eq.${encodeURIComponent(ownerPlayerId)}&limit=1`
      );
      if (!ownerRes.ok) {
        return new Response(JSON.stringify({ error: "Player lookup failed", detail: ownerText }), { status: ownerRes.status, headers: jsonHeaders });
      }
      const ownerRows = JSON.parse(ownerText);
      if (!Array.isArray(ownerRows) || ownerRows.length === 0) {
        return new Response(JSON.stringify({ error: "player_id not found" }), { status: 400, headers: jsonHeaders });
      }

      const { user_id: _ignoredUserId, ...characterFields } = character || {};
      const ownedCharacter = {
        ...characterFields,
        player_id: ownerPlayerId,
        user_id: authUser.id
      };
      const { res: charRes, text: charText } = await sbServiceFetch(
        env,
        `/rest/v1/${SUPABASE_TABLES.characters}`,
        { method: "POST", headers: { Prefer: "return=representation" }, body: [ownedCharacter] }
      );
      if (!charRes.ok) {
        return new Response(JSON.stringify({ error: "Character creation failed", detail: charText }), { status: charRes.status, headers: jsonHeaders });
      }

      const newCharId = JSON.parse(charText)[0].id;

      if (attributes?.length > 0) {
        const { res: attrRes, text: attrText } = await sbServiceFetch(
          env,
          `/rest/v1/${SUPABASE_TABLES.characterAttributes}`,
          {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: attributes.map(a => ({ ...a, character_id: newCharId, user_id: authUser.id }))
          }
        );
        if (!attrRes.ok) {
          console.warn("キャラクター能力値の保存に失敗:", attrText);
        }
      }
      if (skills?.length > 0) {
        const { res: skillRes, text: skillText } = await sbServiceFetch(
          env,
          `/rest/v1/${SUPABASE_TABLES.characterSkills}`,
          {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: skills.map(s => ({ ...s, character_id: newCharId, user_id: authUser.id }))
          }
        );
        if (!skillRes.ok) {
          console.warn("キャラクター技能の保存に失敗:", skillText);
        }
      }
      return new Response(JSON.stringify({ id: newCharId }), { status: 201, headers: jsonHeaders });
    }

    // 複合キーの重複を通常更新として扱う資源だけ、宣言済み経路でUpsertする。
    if (UPSERT_ENDPOINTS[url.pathname]) {
      let upsertBody = body;
      let useServiceRole = false;

      if (url.pathname === "/api/player_availability") {
        if (!callerPlayerId) {
          return new Response(JSON.stringify({
            error: "Player mapping required",
            detail: "players.user_id（Auth UUID）または players.discord_id（Discord snowflake）とログイン情報が紐づいていません"
          }), { status: 403, headers: jsonHeaders });
        }

        const rows = (Array.isArray(body) ? body : [body])
          .map(row => ({
            player_id: row?.player_id != null && String(row.player_id).trim() !== ""
              ? String(row.player_id)
              : callerPlayerId,
            target_date: row?.target_date,
            time_slot: row?.time_slot,
            status: row?.status,
            raw_text: row?.raw_text ?? null
          }))
          .filter(row => row.target_date && row.time_slot && row.status);

        // 同一コマンド内の複合キー重複は PostgREST ON CONFLICT が拒否するため、後勝ちで畳む。
        const dedupedByKey = new Map();
        for (const row of rows) {
          const key = `${row.player_id}|${row.target_date}|${row.time_slot}`;
          dedupedByKey.set(key, row);
        }
        upsertBody = [...dedupedByKey.values()];

        const distinctPlayerIds = [...new Set(upsertBody.map(row => row.player_id))];
        const isSelfOnly = distinctPlayerIds.length === 1 && distinctPlayerIds[0] === callerPlayerId;

        if (isSelfOnly) {
          // 自分の予定だけなら利用者JWT + RLS で十分。player_id は呼び出し元に固定する。
          upsertBody = upsertBody.map(row => ({ ...row, player_id: callerPlayerId }));
        } else {
          // 調整さんCSVなど複数人一括は、他人行のRLSを避けるため Service Role を使う。
          useServiceRole = true;
        }
      }

      const { res, text } = useServiceRole
        ? await sbServiceFetch(env, UPSERT_ENDPOINTS[url.pathname], {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: upsertBody
          })
        : await sbFetch(env, request, UPSERT_ENDPOINTS[url.pathname], {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates" },
            body: upsertBody
          });
      if (!res.ok) return new Response(JSON.stringify({ error: "Upsert Failed", detail: text }), { status: res.status, headers: jsonHeaders });
      return new Response(text || JSON.stringify({ ok: true, count: Array.isArray(upsertBody) ? upsertBody.length : 1 }), {
        status: 201,
        headers: jsonHeaders
      });
    }

    // ---- 通常の Insert 系 ----
    if (url.pathname === "/api/scenarios") {
      const scenarioData = {
        title: body.title,
        system: body.system,
        author: body.author,
        description: body.description,
        notes: body.notes,
        image_url: body.image_url,
        trend_story_chaos: body.trend_story_chaos || null,
        trend_avatar_clear: body.trend_avatar_clear || null,
        trend_harmony_active: body.trend_harmony_active || null,
        min_players: body.min_players !== undefined ? parseInt(body.min_players, 10) : 1,
        max_players: body.max_players !== undefined ? parseInt(body.max_players, 10) : 4,
        play_time_minutes: body.play_time_minutes !== undefined ? parseInt(body.play_time_minutes, 10) : 180,
        lost_rate: body.lost_rate || 'low'
      };
      const { res, text } = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.scenarios}`, { method: "POST", headers: { "Prefer": "return=representation" }, body: [scenarioData] });
      if (!res.ok) return new Response(JSON.stringify({ error: "Scenario Insert Failed", detail: text }), { status: res.status, headers: jsonHeaders });
      return new Response(text, { status: 201, headers: jsonHeaders });
    }

    if (url.pathname === "/api/runs") {
      // junction 明示洗替が正。配列列（player_ids / characters）へは書かない。
      // Service Role: junction RLS（INVOKER）を回避する。
      const user = await getAuthenticatedUser(request, env);
      if (!user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
      }
      const runPayload = { ...body, user_id: user.id };
      stripMembershipFromRunPayload(runPayload);
      const { res, text } = await sbServiceFetch(env, `/rest/v1/${SUPABASE_TABLES.runs}`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: [runPayload]
      });
      if (!res.ok) return new Response(JSON.stringify({ error: "Run creation failed", detail: text }), { status: res.status, headers: jsonHeaders });
      const insertedData = JSON.parse(text);
      const created = insertedData && insertedData[0];
      if (created?.id) {
        try {
          await replaceMembershipFromBody(env, created.id, body, user.id);
        } catch (membershipError) {
          console.error("run membership write failed:", membershipError);
          return new Response(JSON.stringify({
            error: "Run membership sync failed",
            detail: String(membershipError.message || membershipError)
          }), { status: 500, headers: jsonHeaders });
        }
        const hydrated = await hydrateRunsMembershipFromJunctions(env, request, [created]);
        const out = hydrated[0] || created;
        ctx.waitUntil(syncCharacterScenarios(out, env));
        return new Response(JSON.stringify([out]), { status: 201, headers: jsonHeaders });
      }
      return new Response(text, { status: 201, headers: jsonHeaders });
    }

    // 募集保存の応答を先に確定し、Discord通知はwaitUntilで非同期に継続する。
    if (url.pathname === "/api/recruitments") {
      if (!callerPlayerId) {
        return new Response(JSON.stringify({
          error: "Player mapping required",
          detail: "players.user_id（Auth UUID）または players.discord_id（Discord snowflake）とログイン情報が紐づいていません"
        }), { status: 403, headers: jsonHeaders });
      }
      const recruitPayload = Array.isArray(body)
        ? body.map(row => ({ ...row, owner_player_id: callerPlayerId }))
        : { ...body, owner_player_id: callerPlayerId };
      const { res, text } = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.recruitments}`, { method: "POST", headers: { "Prefer": "return=representation" }, body: recruitPayload });
      if (res.ok) {
        const insertedData = JSON.parse(text);
        const record = Array.isArray(insertedData) ? insertedData[0] : insertedData;
        ctx.waitUntil(recruited({ ...record, ...(Array.isArray(body) ? body[0] : body), owner_player_id: callerPlayerId }, env));
      }
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (url.pathname === "/api/recruitment_applicants") {
      if (!callerPlayerId) {
        return new Response(JSON.stringify({
          error: "Player mapping required",
          detail: "players.user_id（Auth UUID）または players.discord_id（Discord snowflake）とログイン情報が紐づいていません"
        }), { status: 403, headers: jsonHeaders });
      }
      const applicantPayload = Array.isArray(body)
        ? body.map(row => ({ ...row, player_id: callerPlayerId }))
        : { ...body, player_id: callerPlayerId };
      const { res, text } = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.recruitmentApplicants}`, { method: "POST", headers: { "Prefer": "return=representation" }, body: applicantPayload });
      if (res.ok) {
        const payload = Array.isArray(applicantPayload) ? applicantPayload[0] : applicantPayload;
        if (payload.recruitment_id || payload.recruit_id) {
          ctx.waitUntil(checkAndNotifyIfFulfilled(payload.recruitment_id || payload.recruit_id, env));
        }
      }
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- シンプルなInsert系 ----
    if (SIMPLE_INSERT_ENDPOINTS[url.pathname]) {
      const targetUrl = SIMPLE_INSERT_ENDPOINTS[url.pathname];
      let requestBody = body;

      if (url.pathname === "/api/player_profiles") {
        if (!callerPlayerId) {
          return new Response(JSON.stringify({ error: "Player mapping required" }), { status: 403, headers: jsonHeaders });
        }
        requestBody = { ...body, player_id: callerPlayerId };
      } else if (url.pathname === "/api/posts") {
        if (!callerPlayerId) {
          return new Response(JSON.stringify({ error: "Player mapping required" }), { status: 403, headers: jsonHeaders });
        }
        if (body?.character_id) {
          const { res: charRes, text: charText } = await sbFetch(
            env,
            request,
            `/rest/v1/${SUPABASE_TABLES.characters}?select=id&id=eq.${encodeURIComponent(body.character_id)}&player_id=eq.${encodeURIComponent(callerPlayerId)}&limit=1`
          );
          if (!charRes.ok) {
            return new Response(JSON.stringify({ error: "Character ownership check failed", detail: charText }), { status: charRes.status, headers: jsonHeaders });
          }
          const owned = JSON.parse(charText);
          if (!Array.isArray(owned) || owned.length === 0) {
            return new Response(JSON.stringify({ error: "character_id is not owned by caller" }), { status: 403, headers: jsonHeaders });
          }
        }
        requestBody = [body];
      } else {
        requestBody = [body];
      }

      const { res, text } = await sbFetch(env, request, targetUrl, { method: "POST", headers: { "Prefer": "return=representation" }, body: requestBody });
      if (!res.ok) return new Response(JSON.stringify({ error: "Insert failed", detail: text }), { status: res.status, headers: jsonHeaders });
      return new Response(text, { status: 201, headers: jsonHeaders });
    }

    return new Response("Not found", { status: 404, headers: jsonHeaders });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
  }
}


async function handlePatch(request, env, ctx, url) {
  if (request.method === "PATCH") {
    // 部活外通過だけはログインなしで共同編集できる。ほかのプロフィール列はこの経路で受け付けない。
    if (url.pathname === PUBLIC_EXTERNAL_PASSED_PATH) {
      try {
        const body = await request.json();
        const playerId = body?.player_id != null ? String(body.player_id).trim() : "";
        const sourceRows = body?.external_passed_scenarios;
        if (!playerId || !Array.isArray(sourceRows)) {
          return new Response(JSON.stringify({
            error: "player_id and external_passed_scenarios are required"
          }), { status: 400, headers: jsonHeaders });
        }
        if (sourceRows.length > 100) {
          return new Response(JSON.stringify({
            error: "external_passed_scenarios must contain at most 100 items"
          }), { status: 400, headers: jsonHeaders });
        }

        const normalizedRows = [];
        const knownIds = new Set();
        for (const row of sourceRows) {
          const id = row?.id != null ? String(row.id).trim() : "";
          const title = row?.title != null ? String(row.title).trim() : "";
          const system = row?.system != null ? String(row.system).trim() : "";
          const note = row?.note != null ? String(row.note).trim() : "";
          if (!id || !title || id.length > 100 || title.length > 200 || system.length > 100 || note.length > 200) {
            return new Response(JSON.stringify({
              error: "Invalid external passed scenario"
            }), { status: 400, headers: jsonHeaders });
          }
          if (knownIds.has(id)) {
            return new Response(JSON.stringify({
              error: "Duplicate external passed scenario id"
            }), { status: 400, headers: jsonHeaders });
          }
          knownIds.add(id);
          normalizedRows.push({ id, title, system, note });
        }

        const { res: playerRes, text: playerText } = await sbServiceFetch(
          env,
          `/rest/v1/${SUPABASE_TABLES.players}?select=player_id&player_id=eq.${encodeURIComponent(playerId)}&limit=1`
        );
        if (!playerRes.ok) {
          return new Response(JSON.stringify({ error: "Player lookup failed", detail: playerText }), {
            status: playerRes.status,
            headers: jsonHeaders
          });
        }
        const players = JSON.parse(playerText);
        if (!Array.isArray(players) || players.length === 0) {
          return new Response(JSON.stringify({ error: "Player not found" }), { status: 404, headers: jsonHeaders });
        }

        const { res, text } = await sbServiceFetch(
          env,
          `/rest/v1/${SUPABASE_TABLES.playerProfiles}?on_conflict=player_id`,
          {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=representation" },
            body: [{ player_id: playerId, external_passed_scenarios: normalizedRows }]
          }
        );
        if (!res.ok) {
          return new Response(JSON.stringify({ error: "External passed scenarios update failed", detail: text }), {
            status: res.status,
            headers: jsonHeaders
          });
        }
        return new Response(text, { status: 200, headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
      }
    }

    const resource = url.pathname.replace("/api/", "");
    // ① ホワイトリストに合致する汎用PATCH処理
    if (PATCH_ALLOWED_RESOURCES.includes(resource)) {
      try {
        const body = await request.json();
        const { res, text } = await sbFetch(env, request, `/rest/v1/${resource}${url.search}`, {
          method: "PATCH",
          headers: { "Prefer": "return=representation" },
          body: body
        });
        if (!res.ok) return new Response(JSON.stringify({ error: `${resource} update failed`, detail: text }), { status: res.status, headers: jsonHeaders });
        return new Response(text, { status: 200, headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
      }
    }

    // ② runs: membership は junction 洗替のみ。配列列には書かない。Service Role で RLS を回避。
    // 編集可: Auth所有者 / GM / 参加PL。user_id 未設定の旧卓はメンバーが更新時に所有権を取得できる。
    if (url.pathname === "/api/runs") {
      try {
        const user = await getAuthenticatedUser(request, env);
        if (!user?.id) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
        }
        const callerPlayerId = await resolveCallerPlayerId(request, env);
        const body = await request.json();
        const patchBody = { ...body };
        delete patchBody.user_id;
        stripMembershipFromRunPayload(patchBody);

        const lookupPath = url.search.includes("select=")
          ? `/rest/v1/${SUPABASE_TABLES.runs}${url.search}`
          : `/rest/v1/${SUPABASE_TABLES.runs}${url.search}${url.search ? "&" : "?"}select=id,user_id,gm_id`;
        const { res: ownedRes, text: ownedText } = await sbServiceFetch(env, lookupPath, { method: "GET" });
        if (!ownedRes.ok) {
          return new Response(JSON.stringify({ error: "Run lookup failed", detail: ownedText }), { status: ownedRes.status, headers: jsonHeaders });
        }
        const ownedRows = JSON.parse(ownedText);
        if (!Array.isArray(ownedRows) || ownedRows.length === 0) {
          return new Response(JSON.stringify({ error: "Run not found" }), { status: 404, headers: jsonHeaders });
        }

        const playersByRun = await fetchPlayerIdsByRunIds(
          env,
          ownedRows.map(row => row?.id).filter(Boolean)
        );

        const canEditRun = (row) => {
          if (row?.user_id && String(row.user_id) === String(user.id)) return true;
          if (!callerPlayerId) return false;
          if (row?.gm_id && String(row.gm_id) === callerPlayerId) return true;
          const memberIds = resolveRunPlayerIds(row, playersByRun);
          if (memberIds.includes(callerPlayerId)) return true;
          // 旧データで所有者未設定の卓は、ログイン済みメンバーなら更新を許可する。
          if (!row?.user_id) return true;
          return false;
        };

        if (ownedRows.some(row => !canEditRun(row))) {
          return new Response(JSON.stringify({
            error: "Forbidden",
            detail: "卓の所有者・GM・参加プレイヤーのみ更新できます"
          }), { status: 403, headers: jsonHeaders });
        }

        // 所有者が空の旧卓は、今回の更新者へ Auth UUID を紐付ける。
        if (ownedRows.every(row => !row?.user_id)) {
          patchBody.user_id = user.id;
        }

        const { res, text } = await sbServiceFetch(env, `/rest/v1/${SUPABASE_TABLES.runs}${url.search}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: patchBody
        });
        if (res.ok) {
          const updatedData = JSON.parse(text);
          const rows = Array.isArray(updatedData) ? updatedData : [];
          try {
            for (const row of rows) {
              if (!row?.id) continue;
              await replaceMembershipFromBody(env, row.id, body, user.id);
            }
          } catch (membershipError) {
            console.error("run membership write failed:", membershipError);
            return new Response(JSON.stringify({
              error: "Run membership sync failed",
              detail: String(membershipError.message || membershipError)
            }), { status: 500, headers: jsonHeaders });
          }
          const hydrated = await hydrateRunsMembershipFromJunctions(env, request, rows);
          if (hydrated[0]) ctx.waitUntil(syncCharacterScenarios(hydrated[0], env));
          return new Response(JSON.stringify(hydrated), { status: 200, headers: jsonHeaders });
        }
        return new Response(text, { status: res.status, headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
      }
    }
  }
}

async function handleDelete(request, env, url) {
  if (request.method === "DELETE") {
    // 気になる OFF（通知なし）
    if (url.pathname === "/api/scenario_interests") {
      try {
        const callerPlayerId = await resolveCallerPlayerId(request, env);
        if (!callerPlayerId) {
          return new Response(JSON.stringify({ error: "Player mapping required" }), { status: 403, headers: jsonHeaders });
        }
        const scenarioId = url.searchParams.get("scenario_id");
        if (!scenarioId) {
          return new Response(JSON.stringify({ error: "scenario_id required" }), { status: 400, headers: jsonHeaders });
        }
        const { res, text } = await sbServiceFetch(
          env,
          `/rest/v1/${SUPABASE_TABLES.scenarioInterests}?scenario_id=eq.${encodeURIComponent(scenarioId)}&player_id=eq.${encodeURIComponent(callerPlayerId)}`,
          { method: "DELETE", headers: { Prefer: "return=minimal" } }
        );
        if (!res.ok) {
          return new Response(JSON.stringify({ error: "Interest delete failed", detail: text }), { status: res.status, headers: jsonHeaders });
        }
        const count = await countScenarioInterests(env, scenarioId);
        return new Response(JSON.stringify({
          scenario_id: scenarioId,
          interested: false,
          count,
          notified: false
        }), { status: 200, headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
      }
    }

    const resource = url.pathname.replace("/api/", "");
    if (DELETE_ALLOWED_RESOURCES.includes(resource)) {
      try {
        const { res, text } = await sbFetch(env, request, `/rest/v1/${resource}${url.search}`, { method: "DELETE" });
        if (!res.ok) return new Response(JSON.stringify({ error: `${resource} delete failed`, detail: text }), { status: res.status, headers: jsonHeaders });
        return new Response(text, { status: 200, headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
      }
    }
  }
}
// character_scenarios を同期する共通関数
async function syncCharacterScenarios(runData, env) {
  // 通過履歴は完了卓だけから作るため、同期判定に卓状態も含める。
  const { scenario_id, characters, user_id, status, gm_id, player_ids } = runData;

  // 予定・進行中の参加者を通過済みにしないよう、完了時だけ関連を同期する。
  if (status !== 'done') {
    return;
  }

  if (!scenario_id || !Array.isArray(characters) || characters.length === 0) {
    return;
  }

  // 空IDと重複を除去し、卓のGM・参加者だけをキャラクター所有者として許可する。
  const characterIds = [...new Set(
    characters
      .filter(cId => typeof cId === "string" && cId.trim() !== "")
      .map(cId => cId.trim())
  )];
  if (characterIds.length === 0) return;

  const allowedPlayerIds = new Set(
    [gm_id, ...(Array.isArray(player_ids) ? player_ids : [])]
      .filter(playerId => playerId !== null && playerId !== undefined && String(playerId).trim() !== "")
      .map(String)
  );

  const encodedCharacterIds = characterIds.map(encodeURIComponent).join(",");
  const { res: characterRes, text: characterText } = await sbServiceFetch(
    env,
    `/rest/v1/${SUPABASE_TABLES.characters}?select=id,player_id&id=in.(${encodedCharacterIds})`
  );
  if (!characterRes.ok) {
    throw new Error("Character history validation failed");
  }

  const characterRows = JSON.parse(characterText);
  const validCharacterIds = new Set(
    (Array.isArray(characterRows) ? characterRows : [])
      .filter(character => allowedPlayerIds.has(String(character.player_id)))
      .map(character => String(character.id))
  );
  const rejectedCount = characterIds.length - validCharacterIds.size;
  if (rejectedCount > 0) {
    console.warn(`キャラクター履歴同期で許可外または不明なIDを${rejectedCount}件除外しました`);
  }

  const records = characterIds
    .filter(characterId => validCharacterIds.has(characterId))
    .map(characterId => ({
      character_id: characterId,
      scenario_id: scenario_id,
      user_id: user_id
    }));

  if (records.length === 0) return;

  // 認証済みrun保存の後続処理だけは、所有者の複数行同期を内部権限で完遂する。
  await sbServiceFetch(env, `/rest/v1/${SUPABASE_TABLES.characterScenarios}`, {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates" },
    body: records
  });
}

// Discordボタン経由の参加を同じ検証・重複制御・満員判定へ集約する。
async function registerParticipant(recruitmentId, discordUser, env) {
  try {
    // 1. Discord ID を使って players テーブルから player_id を検索
    // ※ players テーブルに discord_id カラムがあることを前提としています
    const { res: playerRes, text: playerText } = await sbServiceFetch(
      env,
      `/rest/v1/${SUPABASE_TABLES.players}?discord_id=eq.${encodeURIComponent(discordUser.id)}&select=player_id,player_name`
    );

    if (!playerRes.ok) {
      throw new Error(`Player lookup failed: ${playerText}`);
    }

    const playerData = JSON.parse(playerText);
    const player = playerData[0];

    // システム（playersテーブル）に登録がないユーザーがボタンを押した場合
    if (!player) {
      throw new Error("PLAYER_NOT_FOUND");
    }

    // 2. recruitment_applicants テーブルへ登録（インサート）
    const { res, text: insertText } = await sbServiceFetch(env, `/rest/v1/${SUPABASE_TABLES.recruitmentApplicants}`, {
      method: "POST",
      headers: {
        // 複合主キーによる重複（二重登録）があった場合はエラーにせず無視する設定
        "Prefer": "return=representation,resolution=ignore-duplicates"
      },
      body: {
        recruitment_id: recruitmentId,
        player_id: player.player_id
      }
    });

    if (!res.ok) {
      // 重複エラー以外のエラーが発生した場合は例外を投げる
      throw new Error(`Insert failed: ${insertText}`);
    }

    // 参加登録と満員通知の順序を保証するため、同じバックグラウンド処理内で完了を待つ。
    await checkAndNotifyIfFulfilled(recruitmentId, env);

    return { success: true, playerName: player.player_name };
  } catch (e) {
    console.error("registerParticipant 内でエラー:", e.message);
    throw e; // 上位の interaction 処理でエラーを検知させるため
  }
}

// 募集登録後に、募集主とシナリオを解決してDiscordへ操作可能な通知を送る。
async function recruited(data, env) {
  try {
    // 1. 募集者名とシナリオ名をIDから取得する (sbFetchを使用)
    const [playerRes, scenarioRes] = await Promise.all([
      sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.players}?player_id=eq.${data.owner_player_id}&select=player_name`),
      data.scenario_id ? sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.scenarios}?id=eq.${data.scenario_id}&select=id,title`) : Promise.resolve(null)
    ]);

    const playerData = playerRes.res.ok ? JSON.parse(playerRes.text) : [];
    const scenarioData = (scenarioRes && scenarioRes.res.ok) ? JSON.parse(scenarioRes.text) : [];

    const scenarioId = data.scenario_id || "default";
    const scenarioImageUrl = `${GITHUB_IMAGE_BASE_URL}/scenario/${scenarioId}.png?raw=true`;

    const recruiterName = playerData[0]?.player_name || data.owner_player_id || "不明な募集者";
    const scenarioTitle = scenarioData[0]?.title || data.scenario_id || "シナリオ未設定";

    const role = data.recruit_role === 'PL' ? 'プレイヤー(PL)' : 'ゲームマスター(GM)';
    const count = data.target_count;
    const memo = data.memo || "詳細情報なし";
    const detailUrl = `${resolveSiteUrl(env)}/recruit/index.html`;

    // 2. Discordへ通知 (Bot Tokenを使用するためここは直接fetch)
    await fetch(`${DISCORD_API_BASE_URL}/channels/${env.RECRUIT_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `**新規募集**`,
        embeds: [{
            image: { url: scenarioImageUrl },
            title: `【${role}募集】${scenarioTitle}`,
            description: `**【募集主】\n- ${recruiterName}**\n**【募集人数】**\n- ${count}人\n**【メモ】**\n${memo}`,
            color: DISCORD_COLORS.recruitment,
            url: detailUrl,
        }],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 1,
                label: "参加希望",
                custom_id: `join_${data.id}`
              }
            ]
          }
        ]
      })
    });
  } catch (err) {
    console.error("募集通知エラー:", err);
  }
}

// ==========================================
// 募集が満員に達したかチェックし、ステータス更新＆通知を行う共通関数
// ==========================================
async function checkAndNotifyIfFulfilled(recruitmentId, env) {
  if (!recruitmentId) return;

  try {
    // 1. 募集の「目標人数」「ステータス」「募集主」「シナリオ」を取得
    const { res: recruitRes, text: recruitText } = await sbServiceFetch(
      env,
      `/rest/v1/${SUPABASE_TABLES.recruitments}?id=eq.${encodeURIComponent(recruitmentId)}&select=target_count,owner_player_id,scenario_id,status`
    );

    // 2. 現在の応募者リストを取得
    const { res: applicantsRes, text: applicantsText } = await sbServiceFetch(
      env,
      `/rest/v1/${SUPABASE_TABLES.recruitmentApplicants}?recruitment_id=eq.${encodeURIComponent(recruitmentId)}&select=player_id`
    );

    if (recruitRes.ok && applicantsRes.ok) {
      const recruits = JSON.parse(recruitText);
      const applicants = JSON.parse(applicantsText);

      if (recruits.length > 0) {
        const recruit = recruits[0];

        // 再通知を防ぐため、募集中から初めて定員へ到達した場合だけ状態更新と通知を行う。
        if (recruit.status === "open" && applicants.length >= recruit.target_count) {

          // ① ステータスを「満員 (fulfilled)」に自動更新 (PATCH)
          await sbServiceFetch(env, `/rest/v1/${SUPABASE_TABLES.recruitments}?id=eq.${encodeURIComponent(recruitmentId)}`, {
            method: 'PATCH',
            body: { status: "fulfilled" }
          });

          // ② 募集主のDiscord IDを取得
          let ownerDiscordId = null;
          const { res: playerRes, text: playerText } = await sbServiceFetch(
            env,
            `/rest/v1/${SUPABASE_TABLES.players}?player_id=eq.${encodeURIComponent(recruit.owner_player_id)}&select=discord_id`
          );
          if (playerRes.ok) {
            const players = JSON.parse(playerText);
            if (players.length > 0) ownerDiscordId = players[0].discord_id;
          }

          // ③ シナリオ名を取得
          let scenarioTitle = "未定・オリジナル";
          if (recruit.scenario_id) {
            const { res: scRes, text: scenarioText } = await sbServiceFetch(
              env,
              `/rest/v1/${SUPABASE_TABLES.scenarios}?id=eq.${encodeURIComponent(recruit.scenario_id)}&select=title`
            );
            if (scRes.ok) {
              const scData = JSON.parse(scenarioText);
              if (scData.length > 0) scenarioTitle = scData[0].title;
            }
          }

          // ④ ランダムキャラの取得とアイコン判定
          const availableCharacters = await getCharacterList(env);
          const { customName, customAvatar } = await resolveDiscordCharacterIdentity(
            availableCharacters,
            DISCORD_CHARACTER_DEFAULT_AVATAR_URL
          );

          // ⑤ Discordへ通知
          const mention = ownerDiscordId ? `<@${ownerDiscordId}>` : `(募集主様)`;
          await sendDiscordNotification(
            `${mention}\n🎉 **募集が満員になりました！**`,
            {
              title: `✅ 募集満員：${scenarioTitle}`,
              description: `目標人数（${recruit.target_count}人）に達したため、募集ステータスを「満員」に自動更新しました！\n詳細画面のコメント欄などで、メンバーと日程の調整を進めてください。`,
              color: DISCORD_COLORS.recruitmentFulfilled // 緑色
            },
            env,
            env.DISCORD_WEBHOOK_URL,
            customName,
            customAvatar
          );
        }
      }
    }
  } catch (err) {
    console.error("満員通知エラー:", err);
  }
}