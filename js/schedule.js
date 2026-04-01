"use strict";

let currentDate = new Date(); // 現在表示している月を保持する変数
let allSessions = [];         // 取得した全セッションデータを保持
let compareMode = false;
let comparisonData = {};

// ★今回追加：時間帯表示用の辞書
const TIME_SLOT_LABELS = { morning: "朝", afternoon: "昼", night: "夜", midnight: "深夜" };

// APIからセッション一覧を取得する
async function fetchScheduleData() {
  try {
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

  const titleEl = document.getElementById("calendar-month-title");
  if (titleEl) titleEl.textContent = `${year}年 ${month + 1}月`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay(); // 1日の曜日 (0:日, 6:土)
  const totalDays = lastDay.getDate();

  const grid = document.getElementById("calendar-grid");
  if (!grid) return;

  const headers = grid.querySelectorAll(".calendar-day-header");
  grid.innerHTML = "";
  headers.forEach(h => grid.appendChild(h));

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

    // --- セッション予定の表示 ---
    const daySessions = allSessions.filter(s => {
      if (!s.start) return false;
      return s.start.startsWith(targetDateStr);
    });

    daySessions.sort((a, b) => new Date(a.start) - new Date(b.start));

    daySessions.forEach(session => {
      const timeStr = new Date(session.start).toLocaleTimeString("ja-JP", { hour: '2-digit', minute: '2-digit' });
      const titleStr = session.title || "名称未設定";
      
      const badge = document.createElement("a");
      badge.className = "calendar-session-badge";
      badge.href = `../sessions/detail.html?id=${encodeURIComponent(session.run_id || session.id)}`;
      
      const safeTitle = Utils.escapeHtml ? Utils.escapeHtml(titleStr) : titleStr.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      badge.innerHTML = `
        <div class="badge-time">${timeStr}</div>
        <div class="badge-title">${safeTitle}</div>
      `;
      
      cell.appendChild(badge);
    });

    // --- ★修正：ここに「比較モード」のバッジ表示処理を正しく組み込みました ---
    if (compareMode) {
      const slots = ["morning", "afternoon", "night", "midnight"];
      slots.forEach(slot => {
        const key = `${targetDateStr}_${slot}`;
        const match = comparisonData[key];
        if (match) {
          const matchBadge = document.createElement("div");
          matchBadge.className = `match-badge ${match.color}`;
          
          let titleText = match.label || "";
          if (match.maybe_players) titleText = `△: ${match.maybe_players.join(", ")}`;
          
          matchBadge.innerHTML = `<span title="${titleText}">${TIME_SLOT_LABELS[slot]}:${match.symbol}</span>`;
          cell.appendChild(matchBadge);
        }
      });
    }

    grid.appendChild(cell);
  }

  // 3. 翌月の余白マス
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

// プレイヤー一覧を取得してチェックボックスを生成
async function initPlayerList() {
  try {
    const players = await Utils.apiGet("players?select=player_id,player_name");
    
    if (!Array.isArray(players)) {
      console.error("プレイヤー一覧の取得に失敗しました。");
      return;
    }

    const listEl = document.getElementById("player-checkbox-list");
    const inputPlayerSelect = document.getElementById("modal-player-id");
    
    if (listEl) listEl.innerHTML = "";
    if (inputPlayerSelect) inputPlayerSelect.innerHTML = "";
    
    players.forEach(p => {
      if (listEl) {
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" name="compare-player" value="${p.player_id}"> ${p.player_name}`;
        listEl.appendChild(label);
      }
      if (inputPlayerSelect) {
        const opt = document.createElement("option");
        opt.value = p.player_id;
        opt.textContent = p.player_name;
        inputPlayerSelect.appendChild(opt);
      }
    });
  } catch (err) {
    console.error("プレイヤー一覧初期化エラー:", err);
  }
}

// 比較実行
async function runComparison() {
  const selectedIds = Array.from(document.querySelectorAll('input[name="compare-player"]:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) return alert("プレイヤーを選択してください");

  const start = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-01`;
  const end = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-31`;

  try {
    const res = await Utils.apiGet(`schedule_match?player_ids=${selectedIds.join(",")}&start_date=${start}&end_date=${end}`);
    if (res) {
      comparisonData = res;
      compareMode = true;
      closeModal('compare-modal');
      renderCalendar(); 
    }
  } catch (err) {
    console.error("比較エラー:", err);
    alert("比較データの取得に失敗しました");
  }
}

// 予定の保存処理
async function saveAvailability() {
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
      
      // 保存後、比較モード中なら比較をやり直し、そうでなければセッションを再取得
      if (compareMode) {
        await runComparison();
      } else {
        await fetchScheduleData(); 
      }
      alert("予定を保存しました");
    }
  } catch (err) {
    console.error("保存エラー:", err);
    alert("保存に失敗しました");
  }
}

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
      // 月が変わった時、比較モード中ならデータを再取得する
      if (compareMode) runComparison(); 
      else renderCalendar();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      if (compareMode) runComparison();
      else renderCalendar();
    });
  }

  document.getElementById("open-input-btn")?.addEventListener("click", () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const dateInput = document.getElementById("modal-date");
    if (dateInput) dateInput.value = dateStr;
    
    document.getElementById("availability-modal").style.display = "flex";
  });

  document.getElementById("open-compare-btn")?.addEventListener("click", () => {
    document.getElementById("compare-modal").style.display = "flex";
  });

  document.getElementById("close-modal-btn")?.addEventListener("click", () => closeModal("availability-modal"));
  document.getElementById("save-availability-btn")?.addEventListener("click", saveAvailability);
  document.getElementById("run-compare-btn")?.addEventListener("click", runComparison);

  // 初回読み込み
  await initPlayerList();    
  await fetchScheduleData(); // ここでデータを取得し、カレンダーを描画する
}

document.addEventListener("DOMContentLoaded", main);