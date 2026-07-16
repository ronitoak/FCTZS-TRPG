import nacl from 'tweetnacl'; // これでライブラリを読み込みます

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
  console.log("Discord通知を開始します..."); // これを追加
  const url = webhookUrl || env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.log("URLが見つかりません"); // これを追加
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

// charactersテーブルからリストを取得する関数に変更
async function getCharacterList(env) {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/characters?select=id,name`, {
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

// charactersテーブルからランダムに1件取得する関数
async function getRandomCharacter(env) {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/characters?select=id,name`, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
      }
    });
    
    if (res.ok) {
      const characters = await res.json();
      if (characters && characters.length > 0) {
        // 取得したリストからランダムに1つ選択
        const randomIndex = Math.floor(Math.random() * characters.length);
        return characters[randomIndex];
      }
    }
  } catch (err) {
    console.error("キャラクター取得エラー:", err);
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. CORS Preflight リクエスト (OPTIONS)
    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    // DiscordからのInteraction(ボタン押下など)専用エンドポイント
    if (request.method === "POST" && url.pathname === "/api/interactions") {
      const signature = request.headers.get('X-Signature-Ed25519');
      const timestamp = request.headers.get('X-Signature-Timestamp');
      const body = await request.text();

      // 【重要】署名検証
      // これがないとDiscord Developer PortalでURLを保存できません
      const isVerified = nacl.sign.detached.verify(
        new TextEncoder().encode(timestamp + body),
        hexToUint8Array(signature),
        hexToUint8Array(env.DISCORD_PUBLIC_KEY)
      );

      if (!isVerified) {
        return new Response('Invalid request signature', { status: 401 });
      }

      const interaction = JSON.parse(body);

      // PING (接続確認) への応答
      if (interaction.type === 1) {
        return new Response(JSON.stringify({ type: 1 }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // ボタン押下 (MESSAGE_COMPONENT) への応答
      if (interaction.type === 3) {
        const customId = interaction.data.custom_id;
        if (customId.startsWith("join_")) {
          const recruitmentId = customId.replace("join_", "");
          
          // 前に作ったSupabase更新関数を呼び出す
          ctx.waitUntil(registerParticipant(recruitmentId, interaction.member.user, env));

          return new Response(JSON.stringify({
            type: 4,
            data: { content: "参加希望を受け付けました！", flags: 64 }
          }), { headers: { 'Content-Type': 'application/json' } });
        }
      }
    }

    // ==========================================
    // 各メソッドへの振り分け（ルーティング）
    // ==========================================
    try {
      if (request.method === "GET")    return await handleGet(request, env, url);
      if (request.method === "POST")   return await handlePost(request, env, ctx, url);
      if (request.method === "PATCH")  return await handlePatch(request, env, ctx, url); 
      if (request.method === "DELETE") return await handleDelete(request, env, url);

      return new Response("Method not allowed", { status: 405 });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
    }

  },

  // セッション通知処理
  // セッション通知処理
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      // ==========================================
      // ---- 1. 本日のセッション通知処理 ----
      // ==========================================
      try {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const startDate = encodeURIComponent(now.toISOString());
        const endDate = encodeURIComponent(tomorrow.toISOString());

        const { res: sessionRes, text: sessionText } = await sbFetch(env, null, `/rest/v1/sessions?select=id,start,run_id,title,stream_url&status=eq.scheduled&start=gte.${startDate}&start=lt.${endDate}`);
        
        if (!sessionRes.ok) {
          console.error("Supabase APIエラー(Sessions):", sessionText);
        } else {
          const upcomingSessions = JSON.parse(sessionText);

          if (!Array.isArray(upcomingSessions) || upcomingSessions.length === 0) {
            console.log("本日の予定セッションはありません。");
            // ★ `return;` を削除し、後続の処理（自動削除）が必ず走るようにしました
          } else {
            // --- セッション情報から卓情報を取得 ---
            const runIds = [...new Set(upcomingSessions.map(s => s.run_id).filter(Boolean))];
            let runsMap = new Map();
            
            if (runIds.length > 0) {
              const runIdsParam = encodeURIComponent(`(${runIds.join(',')})`);
              const { res: runsRes, text: runsText } = await sbFetch(env, null, `/rest/v1/runs?select=*&id=in.${runIdsParam}`);
              
              if (runsRes.ok) {
                const runsData = JSON.parse(runsText);
                runsMap = new Map(runsData.map(r => [String(r.id), r]));
              } else {
                console.error("Supabase APIエラー(Runs):", runsText);
              }
            }

            // --- プレイヤー情報を一括取得 ---
            const { res: mapRes, text: mapText } = await sbFetch(env, null, `/rest/v1/players?select=player_id,player_name,discord_id`);
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

              let randomChar = null;
              if (availableCharacters.length > 0) {
                const randomIndex = Math.floor(Math.random() * availableCharacters.length);
                randomChar = availableCharacters[randomIndex];
              }

              let customName = "右坂 弦介"; 
              let customAvatar = "https://github.com/ronitoak/FCTZS-TRPG/blob/main/img/scenario/c-001.png?raw=true";

              if (randomChar) {
                const targetUrl = `https://github.com/ronitoak/FCTZS-TRPG/blob/main/img/character/${randomChar.id}.png?raw=true`;
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

              // --- Discordへ送信 ---
              await sendDiscordNotification(
                `${notificationLine}\n🔔 **セッション通知**`,
                {
                  title: `卓名：${runTitle} （${sessionTitle}）`,
                  description: `**開始予定：${timeString}**\n\n**【GM】**\n- ${gmName}\n\n**【PL】**\n${displayPlayerList}\n\n**【配信URL（ネタバレ注意）】**\n${streamURL}\n\nFCTZS TRPG部に集合！`,
                  color: 15158332,
                  url: `https://ronitoak.github.io/FCTZS-TRPG/sessions/detail.html?id=${session.run_id}`
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

      // ==========================================
      // ---- 2. 1ヶ月経過した募集の自動削除 ----
      // ==========================================
      try {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        // ★念のためURLエンコードを適用し、通信エラーを防ぎます
        const thresholdISO = encodeURIComponent(oneMonthAgo.toISOString());

        const { res: fetchOldRes, text: fetchOldText } = await sbFetch(env, null, `/rest/v1/recruitments?created_at=lt.${thresholdISO}&select=id`);
        
        if (fetchOldRes.ok) {
          const oldRecruits = JSON.parse(fetchOldText);
          
          if (oldRecruits && oldRecruits.length > 0) {
            const oldIds = oldRecruits.map(r => r.id);
            const deleteIdsQuery = `(${oldIds.map(id => encodeURIComponent(id)).join(',')})`;

            await sbFetch(env, null, `/rest/v1/recruitment_applicants?recruitment_id=in.${deleteIdsQuery}`, { method: 'DELETE' });
            await sbFetch(env, null, `/rest/v1/recruitments?id=in.${deleteIdsQuery}`, { method: 'DELETE' });

            console.log(`${oldRecruits.length}件の募集を自動削除しました。`);
          }
        }
      } catch (err) {
        console.error("募集の自動削除エラー:", err);
      }
    })());
  }
};

// 共通のヘッダー設定
const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*"
};

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
  
  // ★修正：request に「?」をつけて、nullの時はそのままnullにする（安全確認）
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

    // ---- Comments (既存保持) ----
    if (request.method === "GET" && url.pathname === "/api/comments") {
      const target_type = url.searchParams.get("target_type");
      const target_id = url.searchParams.get("target_id");
      const apiUrl = `/rest/v1/comments?select=*&target_type=eq.${target_type}&target_id=eq.${target_id}&order=created_at.asc`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/comments/recent") {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 100);
      const apiUrl = `/rest/v1/comments?select=id,created_at,target_type,target_id,author,body&order=created_at.desc&limit=${limit}`;
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
        const csRes = await fetch(`${env.SUPABASE_URL}/rest/v1/character_scenarios?select=character_id&scenario_id=eq.${encodeURIComponent(scenarioId)}`, {
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

      const apiUrl = `/rest/v1/characters?${queryParams.join("&")}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/character_last_session") {
      const { res, text } = await sbFetch(env, request,"/rest/v1/character_last_session?select=*");
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/character_details") {
      const id = url.searchParams.get("id");
      const { res, text } = await sbFetch(env, request, `/rest/v1/v_character_details?id=eq.${encodeURIComponent(id)}`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- Schedule & Players ----
    // ★追加：プレイヤープロフィールの取得を開通
    if (request.method === "GET" && url.pathname === "/api/player_profiles") {
      const apiUrl = `/rest/v1/player_profiles${url.search || "?select=*"}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // プレイヤー一覧の取得
    if (request.method === "GET" && url.pathname === "/api/players") {
      const apiUrl = `/rest/v1/players${url.search || "?select=*"}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // プレイヤーの予定を取得
    if (request.method === "GET" && url.pathname === "/api/player_availability") {
      // フロントから送られたクエリパラメータ（?select=...&player_id=...）をそのままSupabaseに渡す
      const apiUrl = `/rest/v1/player_availability${url.search}`;
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
      
      const { res, text } = await sbFetch(env, request,`/rest/v1/player_availability?select=*,players(player_name)&player_id=in.(${encodedIds})&target_date=gte.${startDate}&target_date=lte.${endDate}`);
      
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

      const apiUrl = `/rest/v1/scenarios?${queryParams.join("&")}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/character_scenarios") {
      const scenarioId = url.searchParams.get("scenario_id");
      const charId = url.searchParams.get("character_id");
      
      // キャラクター詳細でもシナリオ詳細でも使えるように select=* にする
      let apiUrl = `/rest/v1/character_scenarios?select=*`;
      
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

    // scenario_list ビュー（もしDB側でビューを使っている場合）の取得
    if (request.method === "GET" && url.pathname === "/api/scenario_list") {
      // ビューの定義もDB側で更新が必要ですが、Worker側でも安全にカラムを指定します
      const { res, text } = await sbFetch(env, request,"/rest/v1/scenario_list?select=id,title,system,author,image_url,updated_at,trend_story_chaos,trend_avatar_clear,trend_harmony_active,min_players,max_players,play_time_minutes,lost_rate");
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- Runs & Sessions (既存保持) ----
    if (request.method === "GET" && url.pathname === "/api/runs") {
      let queryParams = [];

      // ★修正: gm -> gm_id に変更
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

      const apiUrl = `/rest/v1/runs?${queryParams.join("&")}`;
      
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
          const { text: playersText } = await sbFetch(env, request,"/rest/v1/players?select=player_id,player_name");
          const players = JSON.parse(playersText);
          
          if (Array.isArray(players)) {
            // IDから名前をすぐに引ける「辞書（Map）」を作る
            const playerMap = new Map(players.map(p => [p.player_id, p.player_name]));

            // 3. 取得したセッションデータ1件ずつに、名前を合体させていく
            runs.forEach(run => {
              // gm_id から GMの名前を取得して gm_name カラムを作る。なければ従来のgm値をフォールバック
              run.gm_name = playerMap.get(run.gm_id) || run.gm || "未設定";

              // player_ids（ID配列）から、プレイヤーの名前配列（player_names）を作成して追加
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
      const apiUrl = `/rest/v1/recruitments${url.search || "?select=*"}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

        // 応募者一覧の取得
    if (request.method === "GET" && url.pathname === "/api/recruitment_applicants") {
      const apiUrl = `/rest/v1/recruitment_applicants${url.search || "?select=*"}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- sessions ---- 
        if (request.method === "GET" && url.pathname === "/api/sessions") {
      const { res, text } = await sbFetch(env, request,"/rest/v1/sessions?select=*");
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/session_list") {
      const { res, text } = await sbFetch(env, request,"/rest/v1/session_list?select=*");
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/sessions/detail") {
      const id = url.searchParams.get("id");
      const { res, text } = await sbFetch(env, request,`/rest/v1/sessions?select=*&id=eq.${id}`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

        // ---- Master Data & Helpers (既存保持) ----
    if (request.method === "GET" && url.pathname === "/api/system_attributes") {
      const system = url.searchParams.get("system");
      const query = system ? `?system=eq.${encodeURIComponent(system)}&order=sort_order.asc` : "?order=sort_order.asc";
      const { res, text } = await sbFetch(env, request,`/rest/v1/system_attributes${query}`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/system_skill_bases") {
      const system = url.searchParams.get("system");
      const query = system ? `?system=eq.${encodeURIComponent(system)}&order=sort_order.asc` : "?order=sort_order.asc";
      const { res, text } = await sbFetch(env, request,`/rest/v1/system_skill_bases${query}`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/character_skill_list") {
      const charId = url.searchParams.get("character_id");
      const { res, text } = await sbFetch(env, request,`/rest/v1/character_skill_list?character_id=eq.${charId}`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (request.method === "GET" && url.pathname === "/api/character_attributes") {
      const charId = url.searchParams.get("character_id");
      const { res, text } = await sbFetch(env, request,`/rest/v1/character_attributes?character_id=eq.${charId}`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- Posts (なりきりチャット) ----
    if (request.method === "GET" && url.pathname === "/api/posts") {
      // 最新の50件を取得
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
      const apiUrl = `/rest/v1/posts?select=*&order=created_at.desc&limit=${limit}`;
      const { res, text } = await sbFetch(env, request,apiUrl);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- ここからナイトレインツール ----
    // キャラクターマスタ取得
    if (request.method === "GET" && url.pathname === "/api/nightreign/characters") {
      const { res, text } = await sbFetch(env, request,"/rest/v1/nightreign_characters?select=*&order=id.asc");
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // 特定キャラのスロットプリセット取得
    if (request.method === "GET" && url.pathname === "/api/nightreign/slot_presets") {
      const charId = url.searchParams.get("character_id");
      if (!charId) return new Response(JSON.stringify({ error: "character_id required" }), { status: 400, headers: jsonHeaders });
      
      const { res, text } = await sbFetch(env, request,`/rest/v1/nightreign_slot_presets?select=*&character_id=eq.${charId}&order=created_at.asc`);
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // 遺物効果マスタ取得
    if (request.method === "GET" && url.pathname === "/api/nightreign/relic_effects") {
      const { res, text } = await sbFetch(env, request,"/rest/v1/nightreign_relic_effects?select=*&order=category.asc,effect_name.asc");
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ユーザー所持遺物の取得
    if (request.method === "GET" && url.pathname === "/api/nightreign/user_relics") {
      const { res, text } = await sbFetch(env, request,"/rest/v1/nightreign_user_relics?select=*&order=created_at.desc");
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
      const { res, text } = await sbFetch(env, null, "/rest/v1/comments", { method: "POST", headers: { "Prefer": "return=representation" }, body: [body] });
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- Characters (一括作成) ----
    if (url.pathname === "/api/character_full") {
      const { character, attributes, skills } = body;
      const { res: charRes, text: charText } = await sbFetch(env, null, "/rest/v1/characters", { method: "POST", headers: { "Prefer": "return=representation" }, body: [character] });
      if (!charRes.ok) return new Response(JSON.stringify({ error: "Character creation failed", detail: charText }), { status: charRes.status, headers: jsonHeaders });
      
      const newCharId = JSON.parse(charText)[0].id;

      if (attributes?.length > 0) {
        await sbFetch(env, null, "/rest/v1/character_attributes", { method: "POST", body: attributes.map(a => ({ ...a, character_id: newCharId })) });
      }
      if (skills?.length > 0) {
        await sbFetch(env, null, "/rest/v1/character_skills", { method: "POST", headers: { "Prefer": "resolution=merge-duplicates" }, body: skills.map(s => ({ ...s, character_id: newCharId })) });
      }
      return new Response(JSON.stringify({ id: newCharId }), { status: 201, headers: jsonHeaders });
    }

    // ---- 各種 Upsert (更新付き追加) 系 ----
    const upsertEndpoints = {
      "/api/character_skills": "/rest/v1/character_skills",
      "/api/character_scenarios": "/rest/v1/character_scenarios",
      "/api/character_attributes": "/rest/v1/character_attributes",
      "/api/player_availability": "/rest/v1/player_availability"
    };

    if (upsertEndpoints[url.pathname]) {
      const { res, text } = await sbFetch(env, null, upsertEndpoints[url.pathname], { method: "POST", headers: { "Prefer": "resolution=merge-duplicates" }, body: body });
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
      const { res, text } = await sbFetch(env, null, "/rest/v1/scenarios", { method: "POST", headers: { "Prefer": "return=representation" }, body: [scenarioData] });
      if (!res.ok) return new Response(JSON.stringify({ error: "Scenario Insert Failed", detail: text }), { status: res.status, headers: jsonHeaders });
      return new Response(text, { status: 201, headers: jsonHeaders });
    }

    if (url.pathname === "/api/runs") {
      const { res, text } = await sbFetch(env, null, "/rest/v1/runs", { method: "POST", headers: { "Prefer": "return=representation" }, body: [body] });
      if (!res.ok) return new Response(JSON.stringify({ error: "Run creation failed", detail: text }), { status: res.status, headers: jsonHeaders });
      const insertedData = JSON.parse(text);
      if (insertedData && insertedData[0]) ctx.waitUntil(syncCharacterScenarios(insertedData[0], env));
      return new Response(text, { status: 201, headers: jsonHeaders });
    }

    // ★ 募集関係の処理の呼び出し
    if (url.pathname === "/api/recruitments") {
      const { res, text } = await sbFetch(env, null, "/rest/v1/recruitments", { method: "POST", headers: { "Prefer": "return=representation" }, body: body });
      if (res.ok) {
        const insertedData = JSON.parse(text);
        const record = Array.isArray(insertedData) ? insertedData[0] : insertedData;
        ctx.waitUntil(recruited({ ...record, ...body }, env));
      }
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    if (url.pathname === "/api/recruitment_applicants") {
      const { res, text } = await sbFetch(env, null, "/rest/v1/recruitment_applicants", { method: "POST", headers: { "Prefer": "return=representation" }, body: body });
      if (res.ok) {
        const payload = Array.isArray(body) ? body[0] : body;
        if (payload.recruitment_id || payload.recruit_id) {
          ctx.waitUntil(checkAndNotifyIfFulfilled(payload.recruitment_id || payload.recruit_id, env));
        }
      }
      return new Response(text, { status: res.status, headers: jsonHeaders });
    }

    // ---- シンプルなInsert系 ----
    const simpleInsertEndpoints = {
      "/api/sessions": "/rest/v1/sessions",
      "/api/player_profiles": "/rest/v1/player_profiles",
      "/api/posts": "/rest/v1/posts",
      "/api/nightreign/user_relics": "/rest/v1/nightreign_user_relics"
    };

    if (simpleInsertEndpoints[url.pathname]) {
      const targetUrl = simpleInsertEndpoints[url.pathname];
      const requestBody = url.pathname === "/api/player_profiles" ? body : [body];
      
      // ★なりきりチャット（/api/posts）の時だけはユーザー証明書を渡す
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
    const allowedResources = ["sessions", "characters", "scenarios", "character_attributes", "character_skills", "recruitments", "recruitment_applicants", "player_profiles"];
    
    // ① ホワイトリストに合致する汎用PATCH処理（強制ANON_KEY化するため request ではなく null を渡す）
    if (allowedResources.includes(resource)) {
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
        const { res, text } = await sbFetch(env, request, `/rest/v1/runs${url.search}`, {
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
    const allowedResources = ["runs", "sessions", "characters", "scenarios", "character_attributes", "character_skills", "recruitments", "recruitment_applicants"];
    
    if (allowedResources.includes(resource)) {
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
  // ★ステータス（status）も受け取るように追加
  const { scenario_id, characters, user_id, status } = runData;
  
  // ★追加: 卓が「完了(done)」になった時のみ通過履歴として一括登録する（自動化）
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
  await fetch(`${env.SUPABASE_URL}/rest/v1/character_scenarios`, {
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

// ==========================================
// 参加登録の共通関数（★ここにお引っ越し！）
// ==========================================
async function registerParticipant(recruitmentId, discordUser, env) {
  try {
    // 1. Discord ID を使って players テーブルから player_id を検索
    // ※ players テーブルに discord_id カラムがあることを前提としています
    const playerRes = await fetch(`${env.SUPABASE_URL}/rest/v1/players?discord_id=eq.${discordUser.id}&select=player_id,player_name`, {
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
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/recruitment_applicants`, {
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

    // ★ 追加: 登録成功時に満員チェックを走らせる
    // （この関数自体がすでにctx.waitUntilの中で呼ばれているので、awaitでそのまま実行してOKです）
    await checkAndNotifyIfFulfilled(recruitmentId, env);

    return { success: true, playerName: player.player_name };
  } catch (e) {
    console.error("registerParticipant 内でエラー:", e.message);
    throw e; // 上位の interaction 処理でエラーを検知させるため
  }
}

// ==========================================
// 募集時のDiscord通知処理（復活＆スリム化）
// ==========================================
async function recruited(data, env) {
  try {
    // 1. 募集者名とシナリオ名をIDから取得する (sbFetchを使用)
    const [playerRes, scenarioRes] = await Promise.all([
      sbFetch(env, null, `/rest/v1/players?player_id=eq.${data.owner_player_id}&select=player_name`),
      data.scenario_id ? sbFetch(env, null, `/rest/v1/scenarios?id=eq.${data.scenario_id}&select=id,title`) : Promise.resolve(null)
    ]);

    const playerData = playerRes.res.ok ? JSON.parse(playerRes.text) : [];
    const scenarioData = (scenarioRes && scenarioRes.res.ok) ? JSON.parse(scenarioRes.text) : [];
    
    const scenarioId = data.scenario_id || "default";
    const scenarioImageUrl = `https://github.com/ronitoak/FCTZS-TRPG/blob/main/img/scenario/${scenarioId}.png?raw=true`;

    const recruiterName = playerData[0]?.player_name || data.owner_player_id || "不明な募集者";
    const scenarioTitle = scenarioData[0]?.title || data.scenario_id || "シナリオ未設定";
    
    const role = data.recruit_role === 'PL' ? 'プレイヤー(PL)' : 'ゲームマスター(GM)';
    const count = data.target_count;
    const memo = data.memo || "詳細情報なし";
    const detailUrl = `https://ronitoak.github.io/FCTZS-TRPG/recruit/index.html`;

    // 2. Discordへ通知 (Bot Tokenを使用するためここは直接fetch)
    await fetch(`https://discord.com/api/v10/channels/${env.RECRUIT_CHANNEL_ID}/messages`, {
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
            color: 3447003,
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
    const recruitRes = await fetch(`${env.SUPABASE_URL}/rest/v1/recruitments?id=eq.${recruitmentId}&select=target_count,owner_player_id,scenario_id,status`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` }
    });
    
    // 2. 現在の応募者リストを取得
    const applicantsRes = await fetch(`${env.SUPABASE_URL}/rest/v1/recruitment_applicants?recruitment_id=eq.${recruitmentId}&select=player_id`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` }
    });

    if (recruitRes.ok && applicantsRes.ok) {
      const recruits = await recruitRes.json();
      const applicants = await applicantsRes.json();

      if (recruits.length > 0) {
        const recruit = recruits[0];
        
        // ★ まだ「募集中 (open)」であり、かつ目標人数に達した場合のみ処理を実行
        if (recruit.status === "open" && applicants.length >= recruit.target_count) {
          
          // ① ステータスを「満員 (fulfilled)」に自動更新 (PATCH)
          await fetch(`${env.SUPABASE_URL}/rest/v1/recruitments?id=eq.${recruitmentId}`, {
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
          const playerRes = await fetch(`${env.SUPABASE_URL}/rest/v1/players?player_id=eq.${recruit.owner_player_id}&select=discord_id`, {
            headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` }
          });
          if (playerRes.ok) {
            const players = await playerRes.json();
            if (players.length > 0) ownerDiscordId = players[0].discord_id;
          }

          // ③ シナリオ名を取得
          let scenarioTitle = "未定・オリジナル";
          if (recruit.scenario_id) {
            const scRes = await fetch(`${env.SUPABASE_URL}/rest/v1/scenarios?id=eq.${recruit.scenario_id}&select=title`, {
              headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` }
            });
            if (scRes.ok) {
              const scData = await scRes.json();
              if (scData.length > 0) scenarioTitle = scData[0].title;
            }
          }

          // ④ ランダムキャラの取得とアイコン判定
          const availableCharacters = await getCharacterList(env);
          let randomChar = null;
          if (availableCharacters.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableCharacters.length);
            randomChar = availableCharacters[randomIndex];
          }

          let customName = "右坂 弦介"; // フォールバック固定値
          let customAvatar = "https://github.com/ronitoak/FCTZS-TRPG/blob/main/img/character/c-001.png?raw=true";
          
          if (randomChar) {
            const targetUrl = `https://github.com/ronitoak/FCTZS-TRPG/blob/main/img/character/${randomChar.id}.png?raw=true`;
            try {
              const imgCheck = await fetch(targetUrl, { method: 'HEAD' });
              if (imgCheck.ok) {
                customName = randomChar.name;
                customAvatar = targetUrl;
              }
            } catch (e) {
              console.error("画像チェックエラー:", e);
            }
          }

          // ⑤ Discordへ通知
          const mention = ownerDiscordId ? `<@${ownerDiscordId}>` : `(募集主様)`;
          await sendDiscordNotification(
            `${mention}\n🎉 **募集が満員になりました！**`,
            {
              title: `✅ 募集満員：${scenarioTitle}`,
              description: `目標人数（${recruit.target_count}人）に達したため、募集ステータスを「満員」に自動更新しました！\n詳細画面のコメント欄などで、メンバーと日程の調整を進めてください。`,
              color: 3066993 // 緑色
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