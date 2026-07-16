// フロント向けAPI、Supabase中継、Discord連携、定期通知を担うWorkerの実エントリ。
import nacl from 'tweetnacl'; // Discord Interactionを信頼する前にEd25519署名を検証する。

// worker/worker.js は実エントリではなく、このファイルをデプロイ対象として扱う。
// URLやテーブル名の散在は変更漏れを生むため、外部契約に関わる固定値をここへ集約する。
const SITE_URL = "https://ronitoak.github.io/FCTZS-TRPG";
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
  scenarios: "scenarios",
  scenarioListView: "scenario_list",
  runs: "runs",
  sessions: "sessions",
  sessionListView: "session_list",
  recruitments: "recruitments",
  recruitmentApplicants: "recruitment_applicants",
  posts: "posts",
  systemAttributes: "system_attributes",
  systemSkillBases: "system_skill_bases",
  nightreignCharacters: "nightreign_characters",
  nightreignSlotPresets: "nightreign_slot_presets",
  nightreignRelicEffects: "nightreign_relic_effects",
  nightreignUserRelics: "nightreign_user_relics"
});

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
  "/api/posts": `/rest/v1/${SUPABASE_TABLES.posts}`,
  "/api/nightreign/user_relics": `/rest/v1/${SUPABASE_TABLES.nightreignUserRelics}`
});

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
async function sendDiscordNotification(content, embed, env, webhookUrl, customUsername = null, customAvatarUrl = null) {
  console.log("Discord通知を開始します..."); // 外部通知の開始点をWorkerログで追跡できるようにする。
  const url = webhookUrl || env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.log("URLが見つかりません"); // 通知先未設定は定期処理全体を失敗させず、通知だけを省略する。
    return;
  }; // URLが設定されていなければ何もしない

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

        const { res: sessionRes, text: sessionText } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.sessions}?select=id,start,run_id,title,stream_url&status=eq.scheduled&start=gte.${startDate}&start=lt.${endDate}`);
        
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
              const { res: runsRes, text: runsText } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.runs}?select=*&id=in.${runIdsParam}`);
              
              if (runsRes.ok) {
                const runsData = JSON.parse(runsText);
                runsMap = new Map(runsData.map(r => [String(r.id), r]));
              } else {
                console.error("Supabase APIエラー(Runs):", runsText);
              }
            }

            // --- プレイヤー情報を一括取得 ---
            const { res: mapRes, text: mapText } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.players}?select=player_id,player_name,discord_id`);
            const allPlayers = mapRes.ok ? JSON.parse(mapText) : [];
            
            const playerMapById = new Map(allPlayers.map(p => [String(p.player_id), p]));
            const playerMapByName = new Map(allPlayers.map(p => [p.player_name, p]));

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

              const gmObj = (run.gm_id ? playerMapById.get(String(run.gm_id)) : null) || (run.gm ? playerMapByName.get(run.gm) : null);
              const gmName = gmObj ? gmObj.player_name : (run.gm || 'GM未定');
              const gmDiscordId = gmObj ? gmObj.discord_id : null;

              const displayPlayers = [];
              const playerDiscordIds = [];
              const targetPlayers = (Array.isArray(run.player_ids) && run.player_ids.length > 0) ? run.player_ids : (Array.isArray(run.players) ? run.players : []);

              targetPlayers.forEach(identifier => {
                const pObj = playerMapById.get(String(identifier)) || playerMapByName.get(identifier);
                if (pObj) {
                  displayPlayers.push(`- ${pObj.player_name}`);
                  if (pObj.discord_id) playerDiscordIds.push(pObj.discord_id);
                } else {
                  displayPlayers.push(`- ${identifier}`); 
                }
              });

              const displayPlayerList = displayPlayers.length > 0 ? displayPlayers.join("\n") : "- 参加者情報なし";

              const mentions = [];
              if (gmDiscordId) mentions.push(`<@${gmDiscordId}>`);
              playerDiscordIds.forEach(dId => mentions.push(`<@${dId}>`));

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
                  description: `**開始予定：${timeString}**\n\n**【GM】**\n- ${gmName}\n\n**【PL】**\n${displayPlayerList}\n\n**【配信URL（ネタバレ注意）】**\n${streamURL}\n\nFCTZS TRPG部に集合！`,
                  color: DISCORD_COLORS.sessionNotice,
                  url: `${SITE_URL}/sessions/detail.html?id=${session.run_id}`
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

        const { res: fetchOldRes, text: fetchOldText } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.recruitments}?created_at=lt.${thresholdISO}&select=id`);
        
        if (fetchOldRes.ok) {
          const oldRecruits = JSON.parse(fetchOldText);
          
          if (oldRecruits && oldRecruits.length > 0) {
            const oldIds = oldRecruits.map(r => r.id);
            const deleteIdsQuery = `(${oldIds.map(id => encodeURIComponent(id)).join(',')})`;

            await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.recruitmentApplicants}?recruitment_id=in.${deleteIdsQuery}`, { method: 'DELETE' });
            await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.recruitments}?id=in.${deleteIdsQuery}`, { method: 'DELETE' });

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
  "/api/character_last_session": `/rest/v1/${SUPABASE_TABLES.characterLastSession}?select=*`,
  "/api/scenario_list": `/rest/v1/${SUPABASE_TABLES.scenarioListView}?select=id,title,system,author,image_url,updated_at,trend_story_chaos,trend_avatar_clear,trend_harmony_active,min_players,max_players,play_time_minutes,lost_rate`,
  "/api/sessions": `/rest/v1/${SUPABASE_TABLES.sessions}?select=*`,
  "/api/session_list": `/rest/v1/${SUPABASE_TABLES.sessionListView}?select=*`,
  "/api/nightreign/characters": `/rest/v1/${SUPABASE_TABLES.nightreignCharacters}?select=*&order=id.asc`,
  "/api/nightreign/relic_effects": `/rest/v1/${SUPABASE_TABLES.nightreignRelicEffects}?select=*&order=category.asc,effect_name.asc`,
  "/api/nightreign/user_relics": `/rest/v1/${SUPABASE_TABLES.nightreignUserRelics}?select=*&order=created_at.desc`
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
  if (request.method === "POST")   return await handlePost(request, env, ctx, url);
  if (request.method === "PATCH")  return await handlePatch(request, env, ctx, url);
  if (request.method === "DELETE") return await handleDelete(request, env, url);

  return new Response("Method not allowed", { status: 405 });
}

async function handleInteraction(request, env, ctx) {
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  const body = await request.text();

  // Discord Developer Portalの登録要件なので、本文解釈より先に署名を検証する。
  const isVerified = nacl.sign.detached.verify(
    new TextEncoder().encode(timestamp + body),
    hexToUint8Array(signature),
    hexToUint8Array(env.DISCORD_PUBLIC_KEY)
  );

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


        // ---- Characters ----
    if (request.method === "GET" && url.pathname === "/api/characters") {
      let queryParams = [];
  
      const system = url.searchParams.get("system");
      const player = url.searchParams.get("player_id");
      const state = url.searchParams.get("state");
      const keyword = url.searchParams.get("keyword");
      const scenarioId = url.searchParams.get("scenario_id");

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

      queryParams.push("select=*,players(player_name)");
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
      const apiUrl = `/rest/v1/${SUPABASE_TABLES.players}${url.search || "?select=*"}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
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

      const playerIds = playerIdsStr.split(",");
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
      for (const [key, playerMap] of Object.entries(grouped)) {
        const pList = Object.values(playerMap);
        const statuses = pList.map(p => p.status);
        
        if (statuses.includes("ng")) {
          results[key] = { color: "red", symbol: "×", label: "不可" };
        } else if (statuses.includes("maybe")) {
          const maybeNames = pList.filter(p => p.status === "maybe").map(p => p.name);
          results[key] = { color: "yellow", symbol: "△", maybe_players: maybeNames };
        } else if (statuses.length === playerIds.length && statuses.every(s => s === "ok")) {
          results[key] = { color: "green", symbol: "○", label: "全員空き" };
        }
      }

      return new Response(JSON.stringify(results), { status: 200, headers: jsonHeaders });
    }

        // ---- Scenarios  ----
    // シナリオ一覧の取得
    if (request.method === "GET" && url.pathname === "/api/scenarios") {
      let queryParams = [];

      const system = url.searchParams.get("system");
      const author = url.searchParams.get("author");
      const keyword = url.searchParams.get("keyword");

      if (system) queryParams.push(`system=eq.${encodeURIComponent(system)}`);
      if (author) queryParams.push(`author=eq.${encodeURIComponent(author)}`);
      
      if (keyword) {
        const kw = encodeURIComponent(`*${keyword}*`);
        queryParams.push(`or=(title.ilike.${kw},author.ilike.${kw})`);
      }

      queryParams.push("select=id,title,system,author,description,notes,image_url,updated_at,trend_story_chaos,trend_avatar_clear,trend_harmony_active,min_players,max_players,play_time_minutes,lost_rate");
      queryParams.push("order=updated_at.desc");

      const apiUrl = `/rest/v1/${SUPABASE_TABLES.scenarios}?${queryParams.join("&")}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
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

      // 表示名の変更に左右されない新形式gm_idで検索し、保存契約と揃える。
      const gmId = url.searchParams.get("gm_id"); 
      const status = url.searchParams.get("status");
      const keyword = url.searchParams.get("keyword");

      if (gmId) queryParams.push(`gm_id=eq.${encodeURIComponent(gmId)}`);
      if (status) queryParams.push(`status=eq.${encodeURIComponent(status)}`);
      
      if (keyword) {
        const kw = encodeURIComponent(`*${keyword}*`);
        queryParams.push(`title.ilike.${kw}`);
      }

      queryParams.push("select=*");
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
          const { text: playersText } = await sbFetch(env, request,`/rest/v1/${SUPABASE_TABLES.players}?select=player_id,player_name`);
          const players = JSON.parse(playersText);
          
          if (Array.isArray(players)) {
            // IDから名前をすぐに引ける「辞書（Map）」を作る
            const playerMap = new Map(players.map(p => [p.player_id, p.player_name]));

            // 3. 取得したセッションデータ1件ずつに、名前を合体させていく
            runs.forEach(run => {
              // gm_id から GMの名前を取得して gm_name カラムを作る。なければ従来のgm値をフォールバック
              run.gm_name = playerMap.get(run.gm_id) || run.gm || "未設定";

              // 通知先ではIDを判読できないため、player_idsを表示名配列へ解決する。
              if (Array.isArray(run.player_ids)) {
                run.player_names = run.player_ids.map(id => playerMap.get(id) || id);
              } else {
                // まだID化されていない古いデータがあった場合の保険（以前の名前配列をそのまま使う）
                run.player_names = Array.isArray(run.players) ? run.players : [];
              }
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

        // 応募者一覧の取得
    if (request.method === "GET" && url.pathname === "/api/recruitment_applicants") {
      const apiUrl = `/rest/v1/${SUPABASE_TABLES.recruitmentApplicants}${url.search || "?select=*"}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/sessions/detail") {
      const id = url.searchParams.get("id");
      const { res, text } = await sbFetch(env, request,`/rest/v1/${SUPABASE_TABLES.sessions}?select=*&id=eq.${id}`);
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
      const { res, text } = await sbFetch(env, request,`/rest/v1/${SUPABASE_TABLES.characterAttributes}?character_id=eq.${charId}`);
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

    // 特定キャラのスロットプリセット取得
    if (request.method === "GET" && url.pathname === "/api/nightreign/slot_presets") {
      const charId = url.searchParams.get("character_id");
      if (!charId) return new Response(JSON.stringify({ error: "character_id required" }), { status: 400, headers: jsonHeaders });
      
      const { res, text } = await sbFetch(env, request,`/rest/v1/${SUPABASE_TABLES.nightreignSlotPresets}?select=*&character_id=eq.${charId}&order=created_at.asc`);
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
      const type = formData.get("type") || "general"; // character, scenario, run, general
      
      if (!file) {
        return new Response(JSON.stringify({ error: "No file uploaded" }), { status: 400, headers: jsonHeaders });
      }

      // ファイルの拡張子を取得
      const originalName = file.name || "image.png";
      const extMatch = originalName.match(/\.[^.]+$/);
      const ext = extMatch ? extMatch[0].toLowerCase() : ".png";
      
      // 一意なファイル名を生成
      const key = `${type}/${crypto.randomUUID()}${ext}`;
      
      // R2へアップロード
      await env.R2_BUCKET.put(key, file.stream(), {
        httpMetadata: {
          contentType: file.type || "image/png"
        }
      });
      
      // 公開URLの組み立て
      const baseUrl = env.R2_PUBLIC_URL || "";
      const imageUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}${key}`;
      
      return new Response(JSON.stringify({ url: imageUrl }), { status: 201, headers: jsonHeaders });
    }

    const body = await request.json();

    // ---- Comments ----
    if (url.pathname === "/api/comments") {
      const { res, text } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.comments}`, { method: "POST", headers: { "Prefer": "return=representation" }, body: [body] });
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- Characters (一括作成) ----
    if (url.pathname === "/api/character_full") {
      const { character, attributes, skills } = body;
      const { res: charRes, text: charText } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.characters}`, { method: "POST", headers: { "Prefer": "return=representation" }, body: [character] });
      if (!charRes.ok) return new Response(JSON.stringify({ error: "Character creation failed", detail: charText }), { status: charRes.status, headers: jsonHeaders });
      
      const newCharId = JSON.parse(charText)[0].id;

      if (attributes?.length > 0) {
        await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.characterAttributes}`, { method: "POST", body: attributes.map(a => ({ ...a, character_id: newCharId })) });
      }
      if (skills?.length > 0) {
        await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.characterSkills}`, { method: "POST", headers: { "Prefer": "resolution=merge-duplicates" }, body: skills.map(s => ({ ...s, character_id: newCharId })) });
      }
      return new Response(JSON.stringify({ id: newCharId }), { status: 201, headers: jsonHeaders });
    }

    // 複合キーの重複を通常更新として扱う資源だけ、宣言済み経路でUpsertする。
    if (UPSERT_ENDPOINTS[url.pathname]) {
      const { res, text } = await sbFetch(env, null, UPSERT_ENDPOINTS[url.pathname], { method: "POST", headers: { "Prefer": "resolution=merge-duplicates" }, body: body });
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
      const { res, text } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.scenarios}`, { method: "POST", headers: { "Prefer": "return=representation" }, body: [scenarioData] });
      if (!res.ok) return new Response(JSON.stringify({ error: "Scenario Insert Failed", detail: text }), { status: res.status, headers: jsonHeaders });
      return new Response(text, { status: 201, headers: jsonHeaders });
    }

    if (url.pathname === "/api/runs") {
      const { res, text } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.runs}`, { method: "POST", headers: { "Prefer": "return=representation" }, body: [body] });
      if (!res.ok) return new Response(JSON.stringify({ error: "Run creation failed", detail: text }), { status: res.status, headers: jsonHeaders });
      const insertedData = JSON.parse(text);
      if (insertedData && insertedData[0]) ctx.waitUntil(syncCharacterScenarios(insertedData[0], env));
      return new Response(text, { status: 201, headers: jsonHeaders });
    }

    // 募集保存の応答を先に確定し、Discord通知はwaitUntilで非同期に継続する。
    if (url.pathname === "/api/recruitments") {
      const { res, text } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.recruitments}`, { method: "POST", headers: { "Prefer": "return=representation" }, body: body });
      if (res.ok) {
        const insertedData = JSON.parse(text);
        const record = Array.isArray(insertedData) ? insertedData[0] : insertedData;
        ctx.waitUntil(recruited({ ...record, ...body }, env));
      }
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (url.pathname === "/api/recruitment_applicants") {
      const { res, text } = await sbFetch(env, null, `/rest/v1/${SUPABASE_TABLES.recruitmentApplicants}`, { method: "POST", headers: { "Prefer": "return=representation" }, body: body });
      if (res.ok) {
        const payload = Array.isArray(body) ? body[0] : body;
        if (payload.recruitment_id || payload.recruit_id) {
          ctx.waitUntil(checkAndNotifyIfFulfilled(payload.recruitment_id || payload.recruit_id, env));
        }
      }
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- シンプルなInsert系 ----
    if (SIMPLE_INSERT_ENDPOINTS[url.pathname]) {
      const targetUrl = SIMPLE_INSERT_ENDPOINTS[url.pathname];
      const requestBody = url.pathname === "/api/player_profiles" ? body : [body];
      
      // 投稿者単位のRLSを適用する必要があるチャットだけ、利用者の認証情報を引き継ぐ。
      const reqOrNull = url.pathname === "/api/posts" ? request : null;
      
      const { res, text } = await sbFetch(env, reqOrNull, targetUrl, { method: "POST", headers: { "Prefer": "return=representation" }, body: requestBody });
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
    // ① ホワイトリストに合致する汎用PATCH処理（強制ANON_KEY化するため request ではなく null を渡す）
    if (PATCH_ALLOWED_RESOURCES.includes(resource)) {
      try {
        const body = await request.json();
        const { res, text } = await sbFetch(env, null, `/rest/v1/${resource}${url.search}`, {
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
        // 強制ANON_KEY化するため null を渡す
        const { res, text } = await sbFetch(env, null, `/rest/v1/${resource}${url.search}`, { method: "DELETE" });
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
  const { scenario_id, characters, user_id, status } = runData;
  
  // 予定・進行中の参加者を通過済みにしないよう、完了時だけ関連を同期する。
  if (status !== 'done') {
    return;
  }

  if (!scenario_id || !Array.isArray(characters) || characters.length === 0) {
    return;
  }

  // 有効なキャラクターIDのみ抽出
  const records = characters
    .filter(cId => cId && cId.trim() !== '')
    .map(cId => ({
      character_id: cId,
      scenario_id: scenario_id,
      user_id: user_id
    }));

  if (records.length === 0) return;

  // SupabaseへUpsertを実行
  await fetch(`${env.SUPABASE_URL}/rest/v1/${SUPABASE_TABLES.characterScenarios}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates" // 重複は上書き（実質スキップ）
    },
    body: JSON.stringify(records),
  });
}

// Discordボタン経由の参加を同じ検証・重複制御・満員判定へ集約する。
async function registerParticipant(recruitmentId, discordUser, env) {
  try {
    // 1. Discord ID を使って players テーブルから player_id を検索
    // ※ players テーブルに discord_id カラムがあることを前提としています
    const playerRes = await fetch(`${env.SUPABASE_URL}/rest/v1/${SUPABASE_TABLES.players}?discord_id=eq.${discordUser.id}&select=player_id,player_name`, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
      }
    });

    if (!playerRes.ok) {
      throw new Error(`Player lookup failed: ${await playerRes.text()}`);
    }

    const playerData = await playerRes.json();
    const player = playerData[0];

    // システム（playersテーブル）に登録がないユーザーがボタンを押した場合
    if (!player) {
      throw new Error("PLAYER_NOT_FOUND");
    }

    // 2. recruitment_applicants テーブルへ登録（インサート）
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${SUPABASE_TABLES.recruitmentApplicants}`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        // 複合主キーによる重複（二重登録）があった場合はエラーにせず無視する設定
        "Prefer": "return=representation,resolution=ignore-duplicates"
      },
      body: JSON.stringify({
        recruitment_id: recruitmentId,
        player_id: player.player_id
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      // 重複エラー以外のエラーが発生した場合は例外を投げる
      throw new Error(`Insert failed: ${errorText}`);
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
    const detailUrl = `${SITE_URL}/recruit/index.html`;

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
    const recruitRes = await fetch(`${env.SUPABASE_URL}/rest/v1/${SUPABASE_TABLES.recruitments}?id=eq.${recruitmentId}&select=target_count,owner_player_id,scenario_id,status`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` }
    });
    
    // 2. 現在の応募者リストを取得
    const applicantsRes = await fetch(`${env.SUPABASE_URL}/rest/v1/${SUPABASE_TABLES.recruitmentApplicants}?recruitment_id=eq.${recruitmentId}&select=player_id`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` }
    });

    if (recruitRes.ok && applicantsRes.ok) {
      const recruits = await recruitRes.json();
      const applicants = await applicantsRes.json();

      if (recruits.length > 0) {
        const recruit = recruits[0];
        
        // 再通知を防ぐため、募集中から初めて定員へ到達した場合だけ状態更新と通知を行う。
        if (recruit.status === "open" && applicants.length >= recruit.target_count) {
          
          // ① ステータスを「満員 (fulfilled)」に自動更新 (PATCH)
          await fetch(`${env.SUPABASE_URL}/rest/v1/${SUPABASE_TABLES.recruitments}?id=eq.${recruitmentId}`, {
            method: 'PATCH',
            headers: { 
              apikey: env.SUPABASE_ANON_KEY, 
              Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: "fulfilled" })
          });

          // ② 募集主のDiscord IDを取得
          let ownerDiscordId = null;
          const playerRes = await fetch(`${env.SUPABASE_URL}/rest/v1/${SUPABASE_TABLES.players}?player_id=eq.${recruit.owner_player_id}&select=discord_id`, {
            headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` }
          });
          if (playerRes.ok) {
            const players = await playerRes.json();
            if (players.length > 0) ownerDiscordId = players[0].discord_id;
          }

          // ③ シナリオ名を取得
          let scenarioTitle = "未定・オリジナル";
          if (recruit.scenario_id) {
            const scRes = await fetch(`${env.SUPABASE_URL}/rest/v1/${SUPABASE_TABLES.scenarios}?id=eq.${recruit.scenario_id}&select=title`, {
              headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` }
            });
            if (scRes.ok) {
              const scData = await scRes.json();
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