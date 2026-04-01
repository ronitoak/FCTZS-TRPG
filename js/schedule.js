"use strict";

let currentDate = new Date(); // 現在表示している月を保持する変数
let allSessions = [];         // 取得した全セッションデータを保持
let compareMode = false;
let comparisonData = {};

// APIからセッション一覧を取得する
async function fetchSessions() {
  try {
    // セッション一覧（session_listビュー等）を取得
    const data = await Utils.apiGet("session_list");
    allSessions = Array.isArray(data) ? data : [];
    renderCalendar();
  } catch (err) {
    console.error("セッションの取得に失敗しました", err);
  }
}

// カレンダーを描画する関数
function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0が1月, 11が12月

  // ヘッダーのタイトル更新
  const titleEl = document.getElementById("calendar-month-title");
  if (titleEl) titleEl.textContent = `${year}年 ${month + 1}月`;

  // カレンダーの計算
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay(); // 1日の曜日 (0:日, 6:土)
  const totalDays = lastDay.getDate();

  const grid = document.getElementById("calendar-grid");
  if (!grid) return;

  // 曜日ヘッダーは残して、日付マスだけをクリアする
  const headers = grid.querySelectorAll(".calendar-day-header");
  grid.innerHTML = "";
  headers.forEach(h => grid.appendChild(h));

  // --- カレンダーのマスを生成 ---
  // 1. 前月の余白マス
  for (let i = 0; i < startDayOfWeek; i++) {
    const cell = createCalendarCell("", true);
    grid.appendChild(cell);
  }

  // 2. 当月のマス
  const today = new Date();
  for (let day = 1; day <= totalDays; day++) {
    const targetDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isToday = (year === today.getFullYear() && month === today.getMonth() && day === today.getDate());
    
    const cell = createCalendarCell(day, false, isToday);

    // ★ この日のセッションを探してマスに追加
    const daySessions = allSessions.filter(s => {
      if (!s.start) return false;
      // ISO形式（2026-04-15T21:00:00Z）から日付部分だけを抽出して比較
      return s.start.startsWith(targetDateStr);
    });

    // 時間順にソート
    daySessions.sort((a, b) => new Date(a.start) - new Date(b.start));

    // マスにセッションのバッジを追加
    daySessions.forEach(session => {
      const timeStr = new Date(session.start).toLocaleTimeString("ja-JP", { hour: '2-digit', minute: '2-digit' });
      const titleStr = session.title || "名称未設定";
      
      const badge = document.createElement("a");
      badge.className = "calendar-session-badge";
      // クリックしたら詳細ページへ飛ぶように
      badge.href = `../sessions/detail.html?id=${encodeURIComponent(session.run_id || session.id)}`;
      
      // ★ 時間とタイトルを別々のdivに分け、安全に挿入
      const safeTitle = Utils.escapeHtml ? Utils.escapeHtml(titleStr) : titleStr.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      badge.innerHTML = `
        <div class="badge-time">${timeStr}</div>
        <div class="badge-title">${safeTitle}</div>
      `;
      
      cell.appendChild(badge);
    });

    grid.appendChild(cell);
  }

  // 3. 翌月の余白マス（最後の週の空きを埋める）
  const totalCells = startDayOfWeek + totalDays;
  const remainingCells = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < remainingCells; i++) {
    const cell = createCalendarCell("", true);
    grid.appendChild(cell);
  }
}

// プレイヤー一覧を取得してチェックボックスを生成
async function initPlayerList() {
  const players = await Utils.apiGet("players?select=player_id,player_name");
  const listEl = document.getElementById("player-checkbox-list");
  const inputPlayerSelect = document.getElementById("modal-player-id"); // 入力モーダル用
  
  if (!listEl) return;
  listEl.innerHTML = "";
  
  players.forEach(p => {
    // 比較用チェックボックス
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" name="compare-player" value="${p.player_id}"> ${p.player_name}`;
    listEl.appendChild(label);
    
    // 入力モーダル用のセレクトボックスもここで同期
    const opt = document.createElement("option");
    opt.value = p.player_id;
    opt.textContent = p.player_name;
    inputPlayerSelect?.appendChild(opt);
  });
}

// 比較実行
async function runComparison() {
  const selectedIds = Array.from(document.querySelectorAll('input[name="compare-player"]:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) return alert("プレイヤーを選択してください");

  // 表示中の月の範囲を取得
  const start = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-01`;
  const end = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-31`;

  const res = await Utils.apiGet(`schedule_match?player_ids=${selectedIds.join(",")}&start_date=${start}&end_date=${end}`);
  if (res) {
    comparisonData = res;
    compareMode = true;
    closeModal('compare-modal');
    renderCalendar(); // 比較モードで再描画
  }
}

// ★ renderCalendar 関数内での描画ロジックの追加
// (日付セル生成ループの中で)
if (compareMode) {
  const slots = ["morning", "afternoon", "night", "midnight"];
  slots.forEach(slot => {
    const key = `${targetDateStr}_${slot}`;
    const match = comparisonData[key];
    if (match) {
      const matchBadge = document.createElement("div");
      matchBadge.className = `match-badge ${match.color}`;
      
      // △の場合は、ホバーや注釈で名前を出せるように（今回はシンプルに記号）
      let titleText = match.label || "";
      if (match.maybe_players) titleText = `△: ${match.maybe_players.join(", ")}`;
      
      matchBadge.innerHTML = `<span title="${titleText}">${TIME_SLOT_LABELS[slot]}:${match.symbol}</span>`;
      cell.appendChild(matchBadge);
    }
  });
}

// 日付マス（DOM）を生成する補助関数
function createCalendarCell(dayNumber, isOtherMonth, isToday = false) {
  const cell = document.createElement("div");
  cell.className = "calendar-cell";
  if (isOtherMonth) cell.classList.add("other-month");
  if (isToday) cell.classList.add("today");

  if (dayNumber) {
    const numEl = document.createElement("div");
    numEl.className = "calendar-date-number";
    numEl.textContent = dayNumber;
    cell.appendChild(numEl);
  }
  return cell;
}

async function saveAvailability() {
  // モーダル内の入力項目から値を取得
  const playerId = document.getElementById("modal-player-id")?.value;
  const targetDate = document.getElementById("modal-date")?.value;
  const timeSlot = document.getElementById("modal-time-slot")?.value;
  const status = document.getElementById("modal-status")?.value;

  if (!playerId || !targetDate) {
    alert("プレイヤーと対象日を選択してください。");
    return;
  }

  const payload = [{
    player_id: playerId,
    target_date: targetDate,
    time_slot: timeSlot,
    status: status
  }];

  try {
    const res = await Utils.apiPost("player_availability", payload);
    if (res) {
      closeModal('availability-modal');
      // ★保存成功後、カレンダーのデータを再取得して画面を更新
      await fetchScheduleData(); 
    }
  } catch (err) {
    console.error("保存エラー:", err);
    alert("保存に失敗しました");
  }
}

// 汎用的なモーダルを閉じる関数
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = "none";
}

// 起動時の処理とイベントリスナー
async function main() {
  const prevBtn = document.getElementById("prev-month-btn");
  const nextBtn = document.getElementById("next-month-btn");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      renderCalendar();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      renderCalendar();
    });
  }

  // --- ★今回不足していた、ボタンとモーダルを繋ぐ処理 ---

  // 「予定を入力する」ボタンで入力モーダルを開く
  document.getElementById("open-input-btn")?.addEventListener("click", () => {
    // 日付入力欄に今日の日付をデフォルトでセットしておく
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const dateInput = document.getElementById("modal-date");
    if (dateInput) dateInput.value = dateStr;
    
    document.getElementById("availability-modal").style.display = "flex";
  });

  // 「予定を比較する」ボタンで比較モーダルを開く
  document.getElementById("open-compare-btn")?.addEventListener("click", () => {
    document.getElementById("compare-modal").style.display = "flex";
  });

  // 各種ボタンのイベント紐付け
  document.getElementById("close-modal-btn")?.addEventListener("click", () => closeModal("availability-modal"));
  document.getElementById("save-availability-btn")?.addEventListener("click", saveAvailability);
  document.getElementById("run-compare-btn")?.addEventListener("click", runComparison);

  // --- ★初回読み込み ---
  await initPlayerList();    // プレイヤー一覧を取得してセレクトボックス/チェックボックスを作成
  await fetchScheduleData(); // カレンダーを描画
}

document.addEventListener("DOMContentLoaded", main);