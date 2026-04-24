// /js/home.js
"use strict";
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// 1. Supabaseの初期化
const supabase = createClient(
  'https://bcmxaqrjpelpfxafrtqu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjbXhhcXJqcGVscGZ4YWZydHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDExNzgsImV4cCI6MjA4MzUxNzE3OH0.3CtMMsv2c7fbLgC8-wd17ppyfhK31WRnhBT2CIVGyYY'
);

// リダイレクト先の固定URL（あなたの環境に合わせて1箇所で管理）
const REDIRECT_URL = 'https://ronitoak.github.io/FCTZS-TRPG/';

// 2. ログイン関数（SDKに頼らずURLを直接生成して遷移する）
async function loginWithDiscord() {
  const projectID = 'bcmxaqrjpelpfxafrtqu';
  const encodedRedirect = encodeURIComponent(REDIRECT_URL);
  
  // 認証用URLを強制的に組み立て
  const authUrl = `https://${projectID}.supabase.co/auth/v1/authorize?provider=discord&redirect_to=${encodedRedirect}`;
  
  window.location.href = authUrl;
}

// 3. ログイン状態の監視
supabase.auth.onAuthStateChange((event, session) => {
  const loginBtn = document.getElementById('login-btn');
  const userInfo = document.getElementById('user-info');

  if (session) {
    loginBtn.style.display = 'none';
    userInfo.style.display = 'block';
    
    const user = session.user.user_metadata;
    // user_metadata の構造に合わせてフォールバックを設定
    document.getElementById('user-name').innerText = user.full_name || user.name || "User";
    document.getElementById('user-avatar').src = user.avatar_url;
    
    console.log("ログイン成功！ユーザーID:", session.user.id);
  } else {
    loginBtn.style.display = 'block';
    userInfo.style.display = 'none';
  }
});

// 4. イベントリスナーの登録
// ログインボタンをクリックしたら、上で作った「loginWithDiscord」を呼ぶように修正
document.getElementById('login-btn').addEventListener('click', loginWithDiscord);

// ログアウト処理
document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = REDIRECT_URL; // ログアウト後もトップへ戻す
});

function toValidDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Next Session
 * - sessions.json から status==="scheduled" かつ未来のうち最短1件
 * - run_id -> runs 参照（卓名）
 * - scenario_id -> scenarios 参照（シナリオ名）
 */
function renderNextSession(container, sessions, runsById, scenariosById) {
  const now = new Date();

  const upcoming = (Array.isArray(sessions) ? sessions : [])
    .filter(s => s && s.status === "scheduled")
    .map(s => ({ ...s, _start: toValidDate(s.start) }))
    .filter(s => s._start && s._start > now)
    .sort((a, b) => a._start - b._start);

  if (upcoming.length === 0) {
    container.innerHTML = `<p>直近の予定はありません</p>`;
    return;
  }

  const ses = upcoming[0];
  const runs = runsById.get(ses.run_id);
  const scenario = runs ? scenariosById.get(runs.scenario_id) : null;

  const dateStr = ses._start.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const timeStr = ses._start.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const duration = (typeof ses.durationHours === "number" && ses.durationHours > 0)
    ? `${ses.durationHours}h`
    : "";

  const scenarioTitle = Utils.escapeHtml(scenario?.title || "（シナリオ未設定）");
  const runTitle = Utils.escapeHtml(runs?.title || runs?.id || "（卓未設定）");
  const sessionTitle = Utils.escapeHtml(ses.title || "");


  // 詳細連携はしない方針なので、リンクは貼らず表示だけ
  container.innerHTML = `
    
    <p><strong>${dateStr} ${timeStr}</strong> ${duration ? `(${duration})` : ""}</p>
    <ul><li><p>${runTitle} ${sessionTitle}</p>
    ${ses.notes ? `<p><small>${Utils.escapeHtml(ses.notes)}</small></p>` : ""}
    </li></ul>
  `;
}

/**
 * Ongoing Scenarios
 * - runs.json の status==="active" を「進行中」とみなす
 */
function renderOngoing(container, runs, scenariosById, sessionsByRunId) {
  const now = new Date();

  const activeRuns = (Array.isArray(runs) ? runs : [])
    .filter(r => r && r.status !== "done");

  if (activeRuns.length === 0) {
    container.innerHTML = `<p>進行中のシナリオはありません</p>`;
    return;
  }

  // 表示は最大5件
  const list = activeRuns.slice(0, 5).map(r => {

    const scenario = scenariosById.get(r.scenario_id);

    const scenarioTitle = Utils.escapeHtml(scenario?.title || r.scenario_id || "（不明）");
    const runTitle = Utils.escapeHtml(r.title || r.id || "（卓）");
    
    const players = Array.isArray(r.players) ? r.players : [];
    const playersText = players.length ? players.map(Utils.escapeHtml).join(" / ") : "";

    // このrunに紐づくsession一覧から「次回」を取る
    const runSessions = sessionsByRunId?.get(r.id) ?? [];
    const next = runSessions
      .filter(s => s && s.status === "scheduled")
      .map(s => ({ ...s, _start: toValidDate(s.start) }))
      .filter(s => s._start && s._start > now)
      .sort((a, b) => a._start - b._start)[0];

    let nextText = "未定";
    if (next && next._start) {
      const d = next._start;
      const dateStr = d.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
      });
      const timeStr = d.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      });
      nextText = `${dateStr} ${timeStr}`;
    }

    // 進行中シナリオ欄だけど、同一シナリオ複数卓を区別するため卓名も出す
    return `<li>
        <strong>${runTitle}</strong>
        <div><small>シナリオ: ${scenarioTitle}</small></div>
        <div><small>プレイヤー: ${playersText}</small></div>
        <div><small>次回予定: ${Utils.escapeHtml(nextText)}</small></div>
      </li>`;
  }).join("");

  container.innerHTML = `<ul>${list}</ul>`;
}

async function main() {
  const nextEl = document.getElementById("next-session");
  const ongoingEl = document.getElementById("ongoing-scenarios");
  if (!nextEl || !ongoingEl) return;

  nextEl.textContent = "";
  ongoingEl.textContent = "";

  try {
    const [scenarios, runs, sessions] = await Promise.all([
      Utils.apiGet("scenarios"),
      Utils.apiGet("runs"),
      Utils.apiGet("sessions"),
    ]);

    const scenariosById = new Map(
      (Array.isArray(scenarios) ? scenarios : [])
        .filter(s => s && s.id)
        .map(s => [s.id, s])
    );

    const runsById = new Map(
      (Array.isArray(runs) ? runs : [])
        .filter(r => r && r.id)
        .map(r => [r.id, r])
    );

    const sessionsByRunId = new Map();
    for (const s of (Array.isArray(sessions) ? sessions : [])) {
      if (!s || !s.run_id) continue;
      if (!sessionsByRunId.has(s.run_id)) sessionsByRunId.set(s.run_id, []);
      sessionsByRunId.get(s.run_id).push(s);
    }


    try {
    renderNextSession(nextEl, sessions, runsById, scenariosById);
  } catch (e) {
    nextEl.innerHTML = `<p>Next Session表示でエラー：${Utils.escapeHtml(e?.message || "")}</p>`;
  }

  try {
    renderOngoing(ongoingEl, runs, scenariosById, sessionsByRunId);
  } catch (e) {
    ongoingEl.innerHTML = `<p>進行中表示でエラー：${Utils.escapeHtml(e?.message || "")}</p>`;
  }

  } catch (err) {
    const msg = Utils.escapeHtml(err?.message || "読み込みエラー");
    nextEl.innerHTML = `<p>Next Sessionの読み込みに失敗しました：${msg}</p>`;
    ongoingEl.innerHTML = `<p>進行中情報の読み込みに失敗しました：${msg}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", main);

