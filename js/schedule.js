"use strict";

let currentDate = new Date(); // 現在表示している月を保持する変数
let allSessions = [];         // 取得した全セッションデータを保持

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
      const badge = document.createElement("a");
      badge.className = "calendar-session-badge";
      // クリックしたら詳細ページへ飛ぶように
      badge.href = `../sessions/detail.html?id=${encodeURIComponent(session.run_id || session.id)}`;
      badge.style.textDecoration = "none";
      badge.style.display = "block";
      badge.textContent = `${timeStr} ${session.title || "名称未設定"}`;
      
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

  // 初回データ取得＆描画
  await fetchSessions();
}

document.addEventListener("DOMContentLoaded", main);