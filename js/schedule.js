"use strict";

let currentDate = new Date(); // 現在表示している月を保持する変数
let allSessions = [];         // 取得した全セッションデータを保持
let compareMode = false;
let comparisonData = {};

// ★今回追加：時間帯表示用の辞書
const TIME_SLOT_LABELS = { afternoon: "昼", night: "夜"};

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

// ★追加：一括入力用のマトリックスを生成する関数
async function renderBulkInputGrid() {
  const playerId = document.getElementById("modal-player-id")?.value;
  if (!playerId) return;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  // 対象月の表示
  const monthLabel = document.getElementById("bulk-month-label");
  if (monthLabel) monthLabel.textContent = `${year}年 ${month + 1}月`;

  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;

  // 1. 選択されたプレイヤーの「今月の既存の予定」を取得
  let existingData = [];
  try {
    const res = await Utils.apiGet(`player_availability?select=*&player_id=eq.${encodeURIComponent(playerId)}&target_date=gte.${startDate}&target_date=lte.${endDate}`);
    if (Array.isArray(res)) existingData = res;
  } catch (e) {
    console.error("既存予定の取得に失敗:", e);
  }

  const container = document.getElementById("bulk-input-container");
  if (!container) return;
  container.innerHTML = ""; // クリア

  const dayOfWeekStr = ["日", "月", "火", "水", "木", "金", "土"];
  const slots = ["morning", "afternoon", "night", "midnight"];

  // 2. 日付ごとに1行ずつ（マトリックス）生成
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dateObj = new Date(year, month, d);
    const dowIndex = dateObj.getDay();

    const row = document.createElement("div");
    row.className = "bulk-row";

    // 日付ラベル
    const dateLabel = document.createElement("div");
    dateLabel.className = "bulk-date";
    if (dowIndex === 0) dateLabel.style.color = "#c62828"; // 日曜は赤
    if (dowIndex === 6) dateLabel.style.color = "#1565c0"; // 土曜は青
    dateLabel.textContent = `${d}日(${dayOfWeekStr[dowIndex]})`;
    row.appendChild(dateLabel);

    // 時間帯ごとのセレクトボックス
    slots.forEach(slot => {
      const slotDiv = document.createElement("div");
      slotDiv.className = "bulk-slot";

      const select = document.createElement("select");
      select.dataset.date = dateStr;
      select.dataset.slot = slot;
      
      // 未設定（ハイフン）をデフォルトとする
      select.innerHTML = `
        <option value="">-</option>
        <option value="ok">○</option>
        <option value="maybe">△</option>
        <option value="ng">×</option>
      `;

      // 既存の予定データがあれば、その値をセットする
      const exist = existingData.find(ex => ex.target_date === dateStr && ex.time_slot === slot);
      if (exist) {
        select.value = exist.status;
        select.className = `select-${exist.status}`;
      }

      // 値が変わったら背景色を変える
      select.addEventListener("change", (e) => {
        select.className = e.target.value ? `select-${e.target.value}` : "";
      });

      slotDiv.appendChild(select);
      row.appendChild(slotDiv);
    });

    container.appendChild(row);
  }
}

// ★修正：一括保存処理
async function saveBulkAvailability() {
  const playerId = document.getElementById("modal-player-id")?.value;
  if (!playerId) return alert("プレイヤーを選択してください");

  const selects = document.querySelectorAll("#bulk-input-container select");
  const payload = [];

  // 「未設定（-）」以外の選択肢をすべて集める
  selects.forEach(sel => {
    if (sel.value !== "") {
      payload.push({
        player_id: playerId,
        target_date: sel.dataset.date,
        time_slot: sel.dataset.slot,
        status: sel.value
      });
    }
  });

  if (payload.length === 0) {
     alert("保存する予定データがありません。（全て「-」になっています）");
     return;
  }

  try {
    const res = await Utils.apiPost("player_availability", payload);
    if (res) {
      closeModal('availability-modal');
      
      // 保存後、比較モード中なら比較をやり直し、そうでなければセッションを再取得
      if (compareMode) await runComparison();
      else await fetchScheduleData();
      
      alert("予定を一括保存しました");
    }
  } catch (err) {
    console.error("一括保存エラー:", err);
    alert("保存に失敗しました");
  }
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
    document.getElementById("availability-modal").style.display = "flex";
    // モーダルを開いた時に、現在の月と選択中プレイヤーのグリッドを生成する
    renderBulkInputGrid();
  });

  document.getElementById("open-compare-btn")?.addEventListener("click", () => {
    document.getElementById("compare-modal").style.display = "flex";
  });

  document.getElementById("close-modal-btn")?.addEventListener("click", () => closeModal("availability-modal"));
  document.getElementById("save-availability-btn")?.addEventListener("click", saveBulkAvailability);
  document.getElementById("run-compare-btn")?.addEventListener("click", runComparison);
  document.getElementById("modal-player-id")?.addEventListener("change", () => {
    renderBulkInputGrid();
  });

  // 初回読み込み
  await initPlayerList();    
  await fetchScheduleData(); // ここでデータを取得し、カレンダーを描画する
}

// --- 追加：モーダルの背景（外側）をクリックした時に閉じる処理 ---
window.addEventListener("click", (e) => {
  // クリックした要素自体が「modal」クラスを持っている場合（＝中身の白枠ではなく、外側の黒背景の場合）
  if (e.target.classList.contains("modal")) {
    e.target.style.display = "none";
  }
});

document.addEventListener("DOMContentLoaded", main);