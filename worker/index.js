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
  characterDetailsView: "v_character_details",
  characterSkillList: "character_skill_list",
  players: "players",
  playerProfiles: "player_profiles",
  playerAvailability: "player_availability",
  playerDetailSummary: "player_detail_summary",
  scenarios: "scenarios",
  scenarioListView: "scenario_list",
  scenarioSummary: "scenario_summary",
  runs: "runs",
  sessions: "sessions",
  sessionListView: "session_list",
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
// runs に gm/players 列は存在しない。名称は gm_id / player_ids から Worker 側で解決する。
const RUN_LIST_SELECT = "id,title,scenario_id,gm_id,player_ids,characters,status,image_url,updated_at";
const SESSION_LIST_SELECT = "id,run_id,start,status,title";
const SESSION_VIEW_LIST_SELECT = "id,run_id,start,status,title";
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
              const { res: runsRes, text: runsText } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.runs}?select=id,title,gm_id,player_ids,characters&id=in.${runIdsParam}`);

              if (runsRes.ok) {
                const runsData = JSON.parse(runsText);
                runsMap = new Map(runsData.map(r => [String(r.id), r]));
              } else {
                console.error("Supabase APIエラー(Runs):", runsText);
              }
            }

            // --- 卓内で参照されるプレイヤーだけを一括取得 ---
            const requiredPlayerIds = [...new Set(
              [...runsMap.values()].flatMap(run => [
                run.gm_id,
                ...(Array.isArray(run.player_ids) ? run.player_ids : [])
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
              const targetPlayers = Array.isArray(run.player_ids) ? run.player_ids : [];

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
  "/api/character_last_session": `/rest/v1/${SUPABASE_TABLES.characterLastSession}?select=character_id,last_session_start`,
  "/api/scenario_list": `/rest/v1/${SUPABASE_TABLES.scenarioListView}?select=${SCENARIO_LIST_SELECT}`,
  "/api/sessions": `/rest/v1/${SUPABASE_TABLES.sessions}?select=${SESSION_LIST_SELECT}`,
  "/api/session_list": `/rest/v1/${SUPABASE_TABLES.sessionListView}?select=${SESSION_VIEW_LIST_SELECT}`
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

/** JWTのauth.users.idから、紐づくplayers.player_idを解決する。 */
async function resolveCallerPlayerId(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user?.id) return null;

  const { res, text } = await sbFetch(
    env,
    request,
    `/rest/v1/${SUPABASE_TABLES.players}?select=player_id&user_id=eq.${encodeURIComponent(user.id)}&limit=1`
  );
  if (!res.ok) return null;
  const rows = JSON.parse(text);
  return Array.isArray(rows) && rows[0]?.player_id ? String(rows[0].player_id) : null;
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
    const fixedProxyPath = FIXED_GET_PROXY_ROUTES[url.pathname];
    if (fixedProxyPath) {
      const { res, text } = await sbFetch(env, request, fixedProxyPath);
      return new Response(text, { status: res.status, headers: jsonHeaders });
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

    if (request.method === "GET" && url.pathname === "/api/character_details") {
      const id = url.searchParams.get("id");
      const { res, text } = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.characterDetailsView}?id=eq.${encodeURIComponent(id)}`);
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
      if (participantId) {
        const value = encodeURIComponent(participantId);
        queryParams.push(`or=(gm_id.eq.${value},player_ids.cs.%7B${value}%7D)`);
      }
      // 通過履歴が未同期でも、配列に残る参加キャラクターから卓を復元できるようにする。
      if (characterId) {
        queryParams.push(`characters=cs.%7B${encodeURIComponent(characterId)}%7D`);
      }

      if (keyword) {
        const kw = encodeURIComponent(`*${keyword}*`);
        queryParams.push(`title.ilike.${kw}`);
      }

      queryParams.push(id ? "select=*" : `select=${RUN_LIST_SELECT}`);
      queryParams.push("order=updated_at.desc");

      const apiUrl = `/rest/v1/${SUPABASE_TABLES.runs}?${queryParams.join("&")}`;

      // 1. 従来通りruns（セッションデータ）をSupabaseから取得
      const { res, text } = await sbFetch(env, request,apiUrl);

      // もし通信エラーなどの場合はそのまま返す
      if (!res.ok) {
        return new Response(text, { status: res.status, headers: jsonHeaders });
      }

      // データを編集できるように一度JSONオブジェクト（配列）に変換
      let runs = JSON.parse(text);

      if (Array.isArray(runs) && runs.length > 0) {
        try {
          // 2. プレイヤーの名前マスタ（IDと名前のセット）を紐づけ用に一括取得
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
              // 移行中の型差などでIN句が使えない場合だけ、従来の全件取得へ戻す。
              const fallback = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,player_name`);
              players = fallback.res.ok ? JSON.parse(fallback.text) : [];
            }
          }

          if (Array.isArray(players)) {
            // IDから名前をすぐに引ける「辞書（Map）」を作る
            const playerMap = new Map(players.map(p => [p.player_id, p.player_name]));

            // 3. 取得したセッションデータ1件ずつに、名前を合体させていく
            runs.forEach(run => {
              // gm_id から GM名を解決する（DBに gm 列はない）。
              run.gm_name = playerMap.get(run.gm_id) || "未設定";

              // 通知・画面表示向けに player_ids を表示名配列へ解決する。
              run.player_names = Array.isArray(run.player_ids)
                ? run.player_ids.map(id => playerMap.get(id) || id)
                : [];
            });
          }
        } catch (err) {
          // 万が一名前の合体処理でエラーが起きても画面が真っ白にならないよう、ログだけ吐いて処理は続行
          console.error("プレイヤー名結合エラー:", err);
        }
      }

      // 4. 名前情報が合体した新しいデータを文字列に戻してフロントエンドへ返却
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

      return new Response(JSON.stringify({ url: imageUrl }), { status: 201, headers: jsonHeaders });
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
        `/rest/v1/${SUPABASE_TABLES.runs}?select=id,gm_id,player_ids,user_id&id=eq.${encodeURIComponent(runId)}&limit=1`
      );
      if (!runRes.ok) {
        return new Response(JSON.stringify({ error: "Run lookup failed", detail: runText }), { status: runRes.status, headers: jsonHeaders });
      }
      const runRows = JSON.parse(runText);
      const run = Array.isArray(runRows) ? runRows[0] : null;
      if (!run) {
        return new Response(JSON.stringify({ error: "Run not found" }), { status: 404, headers: jsonHeaders });
      }

      const runPlayerIds = new Set(
        [run.gm_id, ...(Array.isArray(run.player_ids) ? run.player_ids : [])]
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
    if (url.pathname === "/api/character_full") {
      if (!callerPlayerId) {
        return new Response(JSON.stringify({ error: "Player mapping required" }), { status: 403, headers: jsonHeaders });
      }
      const { character, attributes, skills } = body;
      const ownedCharacter = { ...(character || {}), player_id: callerPlayerId };
      const { res: charRes, text: charText } = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.characters}`, { method: "POST", headers: { "Prefer": "return=representation" }, body: [ownedCharacter] });
      if (!charRes.ok) return new Response(JSON.stringify({ error: "Character creation failed", detail: charText }), { status: charRes.status, headers: jsonHeaders });

      const newCharId = JSON.parse(charText)[0].id;

      if (attributes?.length > 0) {
        await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.characterAttributes}`, { method: "POST", body: attributes.map(a => ({ ...a, character_id: newCharId })) });
      }
      if (skills?.length > 0) {
        await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.characterSkills}`, { method: "POST", headers: { "Prefer": "resolution=merge-duplicates" }, body: skills.map(s => ({ ...s, character_id: newCharId })) });
      }
      return new Response(JSON.stringify({ id: newCharId }), { status: 201, headers: jsonHeaders });
    }

    // 複合キーの重複を通常更新として扱う資源だけ、宣言済み経路でUpsertする。
    if (UPSERT_ENDPOINTS[url.pathname]) {
      let upsertBody = body;
      if (url.pathname === "/api/player_availability") {
        if (!callerPlayerId) {
          return new Response(JSON.stringify({ error: "Player mapping required" }), { status: 403, headers: jsonHeaders });
        }
        const rows = Array.isArray(body) ? body : [body];
        upsertBody = rows.map(row => ({ ...row, player_id: callerPlayerId }));
      }
      const { res, text } = await sbFetch(env, request, UPSERT_ENDPOINTS[url.pathname], { method: "POST", headers: { "Prefer": "resolution=merge-duplicates" }, body: upsertBody });
      if (!res.ok) return new Response(JSON.stringify({ error: "Upsert Failed", detail: text }), { status: res.status, headers: jsonHeaders });
      return new Response(text, { status: 201, headers: jsonHeaders });
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
      const { res, text } = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.runs}`, { method: "POST", headers: { "Prefer": "return=representation" }, body: [body] });
      if (!res.ok) return new Response(JSON.stringify({ error: "Run creation failed", detail: text }), { status: res.status, headers: jsonHeaders });
      const insertedData = JSON.parse(text);
      if (insertedData && insertedData[0]) ctx.waitUntil(syncCharacterScenarios(insertedData[0], env));
      return new Response(text, { status: 201, headers: jsonHeaders });
    }

    // 募集保存の応答を先に確定し、Discord通知はwaitUntilで非同期に継続する。
    if (url.pathname === "/api/recruitments") {
      if (!callerPlayerId) {
        return new Response(JSON.stringify({ error: "Player mapping required" }), { status: 403, headers: jsonHeaders });
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
        return new Response(JSON.stringify({ error: "Player mapping required" }), { status: 403, headers: jsonHeaders });
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

    // ② 特殊処理（runsのみ以前からユーザー証明書を使っていたので request を渡す）
    if (url.pathname === "/api/runs") {
      try {
        const body = await request.json();
        const { res, text } = await sbFetch(env, request, `/rest/v1/${SUPABASE_TABLES.runs}${url.search}`, {
          method: "PATCH",
          headers: { "Prefer": "return=representation" },
          body: body
        });
        if (res.ok) {
          const updatedData = JSON.parse(text);
          if (updatedData && updatedData[0]) ctx.waitUntil(syncCharacterScenarios(updatedData[0], env));
          return new Response(text, { status: 200, headers: jsonHeaders });
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