"use strict";

let currentDate = new Date(); // 現在表示している月を保持する変数
let allSessions = [];         // 取得した全セッションデータを保持
let compareMode = false;
let comparisonData = {};

let globalPlayers = [];
let parsedCsvData = null;

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
      const slots = ["afternoon", "night",];
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

  const monthLabel = document.getElementById("bulk-month-label");
  if (monthLabel) monthLabel.textContent = `${year}年 ${month + 1}月`;

  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;

  let existingData = [];
  try {
    const res = await Utils.apiGet(`player_availability?select=*&player_id=eq.${encodeURIComponent(playerId)}&target_date=gte.${startDate}&target_date=lte.${endDate}`);
    if (Array.isArray(res)) existingData = res;
  } catch (e) {
    console.error("既存予定の取得に失敗:", e);
  }

  const container = document.getElementById("bulk-input-container");
  if (!container) return;
  container.innerHTML = "";

  const dayOfWeekStr = ["日", "月", "火", "水", "木", "金", "土"];
  const slots = ["afternoon", "night"];

  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dateObj = new Date(year, month, d);
    const dowIndex = dateObj.getDay();

    const row = document.createElement("div");
    row.className = "bulk-row";

    const dateLabel = document.createElement("div");
    dateLabel.className = "bulk-date";
    if (dowIndex === 0) dateLabel.style.color = "#c62828";
    if (dowIndex === 6) dateLabel.style.color = "#1565c0";
    dateLabel.textContent = `${d}日(${dayOfWeekStr[dowIndex]})`;
    row.appendChild(dateLabel);

    slots.forEach(slot => {
      const slotDiv = document.createElement("div");
      slotDiv.className = "bulk-slot";

      const select = document.createElement("select");
      select.dataset.date = dateStr;
      select.dataset.slot = slot;
      
      select.innerHTML = `
        <option value="">-</option>
        <option value="ok">○</option>
        <option value="maybe">△</option>
        <option value="ng">×</option>
      `;

      const exist = existingData.find(ex => ex.target_date === dateStr && ex.time_slot === slot);
      // ★ 変更点1：初期値を記憶させる（何もない場合は空文字）
      const initialVal = exist ? exist.status : "";
      select.value = initialVal;
      select.dataset.initial = initialVal;
      
      if (initialVal) select.className = `select-${initialVal}`;

      select.addEventListener("change", (e) => {
        select.className = e.target.value ? `select-${e.target.value}` : "";
      });

      slotDiv.appendChild(select);
      row.appendChild(slotDiv);
    });

    container.appendChild(row);
  }
}

// 一括保存処理
async function saveBulkAvailability() {
  const playerId = document.getElementById("modal-player-id")?.value;
  if (!playerId) return alert("プレイヤーを選択してください");

  const selects = document.querySelectorAll("#bulk-input-container select");
  const payload = [];

  selects.forEach(sel => {
    // ★ 変更点2：初期値から「変更されたものだけ」を対象にする
    if (sel.value !== sel.dataset.initial) {
      // ※ もし「空文字（未設定）」に変更された場合（＝予定を消したい場合）の処理は、
      // Supabaseのupsertの仕様上少し厄介なので、今回は「一度入れた予定は未設定に戻せず、必ず○△×のどれかにする」仕様とします。
      // もし消せるようにしたい場合は、API側で DELETE メソッドを実装する必要があります。
      if (sel.value !== "") {
        payload.push({
          player_id: playerId,
          target_date: sel.dataset.date,
          time_slot: sel.dataset.slot,
          status: sel.value
        });
      }
    }
  });

  if (payload.length === 0) {
     alert("変更された予定データがありません。");
     // 変更がなくてもモーダルは閉じるのが親切
     closeModal('availability-modal');
     return;
  }

  try {
    const res = await Utils.apiPost("player_availability", payload);
    if (res) {
      closeModal('availability-modal');
      
      if (compareMode) {
        await runComparison();
      } else {
        await fetchScheduleData();
      }
      
      alert("予定を保存しました");
    }
  } catch (err) {
    console.error("一括保存エラー:", err);
    alert("保存に失敗しました");
  }
}

// プレイヤー一覧を取得してチェックボックスを生成
async function initPlayerList() {
  try {
    globalPlayers = await Utils.apiGet("players?select=player_id,player_name"); // 変数を変更
    
    if (!Array.isArray(globalPlayers)) {
      console.error("プレイヤー一覧の取得に失敗しました。");
      return;
    }

    const listEl = document.getElementById("player-checkbox-list");
    const inputPlayerSelect = document.getElementById("modal-player-id");
    
    if (listEl) listEl.innerHTML = "";
    if (inputPlayerSelect) inputPlayerSelect.innerHTML = "";
    
    globalPlayers.forEach(p => { // 変数を変更
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

  // ★修正：対象月の正しい「末日」を計算する
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate(); // 4月なら30、2月なら28(29)が取得できる

  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

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

  document.getElementById("bulk-input-btn")?.addEventListener("click", () => {
    document.getElementById("availability-modal").style.display = "flex";
    renderBulkInputGrid();
  });

  document.getElementById("compare-btn")?.addEventListener("click", () => {
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

// ==========================================
// ★ 追加：調整さんCSV スマートインポート機能
// ==========================================

document.getElementById("btn-import-csv")?.addEventListener("click", () => {
    document.getElementById("csv-upload").value = ""; 
    document.getElementById("csv-upload").click();
});

document.getElementById("csv-upload")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsText(file, 'Shift_JIS'); // 調整さんの文字化け対策
    
    reader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split('\n').filter(l => l.trim() !== '');
        if (lines.length < 2) return alert("有効なCSVデータがありません");

        const headers = lines[0].split(',').map(s => s.replace(/^"|"$/g, '').trim());
        const dataRows = lines.slice(1).map(line => line.split(',').map(s => s.replace(/^"|"$/g, '').trim()));

        parsedCsvData = { headers, dataRows };
        showMappingModal();
    };
});

function showMappingModal() {
    const container = document.getElementById("csv-mapping-container");
    container.innerHTML = "";

    const csvNames = parsedCsvData.headers.slice(1);
    let playerOptionsHtml = `<option value="">-- 取り込まない --</option>`;
    globalPlayers.forEach(p => {
        playerOptionsHtml += `<option value="${Utils.escapeHtml(p.player_id)}">${Utils.escapeHtml(p.player_name)}</option>`;
    });

    csvNames.forEach((csvName, index) => {
        if (!csvName) return;
        
        // CSVの名前とDBの名前が一致したら自動選択する
        const matchedPlayer = globalPlayers.find(p => p.player_name === csvName);
        const selectedId = matchedPlayer ? matchedPlayer.player_id : "";

        const rowDiv = document.createElement("div");
        rowDiv.style.display = "flex";
        rowDiv.style.alignItems = "center";
        rowDiv.style.marginBottom = "10px";
        rowDiv.style.gap = "10px";

        rowDiv.innerHTML = `
            <div style="flex: 1; font-weight: bold;">${Utils.escapeHtml(csvName)}</div>
            <div style="flex: 1;">
                <select class="form-control csv-player-select" data-csv-index="${index + 1}">
                    ${playerOptionsHtml}
                </select>
            </div>
        `;
        
        container.appendChild(rowDiv);
        if (selectedId) rowDiv.querySelector("select").value = selectedId;
    });

    document.getElementById("csv-mapping-modal").style.display = "block";
}

document.getElementById("btn-execute-import")?.addEventListener("click", async () => {
    const selects = document.querySelectorAll(".csv-player-select");
    const payload = [];
    const currentYear = currentDate.getFullYear();
    const columnMap = {};

    selects.forEach(sel => {
        if (sel.value) columnMap[sel.dataset.csvIndex] = sel.value;
    });

    if (Object.keys(columnMap).length === 0) return alert("取り込むプレイヤーが選択されていません");

    const statusMap = { "○": "ok", "△": "maybe", "×": "ng", "◯": "ok" }; // ※調整さんは大きな丸「◯」の場合もあるため両方対応

    parsedCsvData.dataRows.forEach(row => {
        const rawDateStr = row[0]; 
        if (!rawDateStr) return;

        let targetDate = null;
        let timeSlot = "night";
        const rawText = rawDateStr.trim();

        const dateMatch = rawDateStr.match(/(\d{1,2})\/(\d{1,2})/);
        if (dateMatch) {
            targetDate = `${currentYear}-${String(dateMatch[1]).padStart(2, "0")}-${String(dateMatch[2]).padStart(2, "0")}`;
        }
        if (!targetDate) return; 

        const timeMatch = rawDateStr.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
            const hour = parseInt(timeMatch[1], 10);
            if (hour >= 5 && hour < 12) timeSlot = "morning";
            else if (hour >= 12 && hour < 18) timeSlot = "afternoon";
            else if (hour >= 18 && hour <= 23) timeSlot = "night";
            else timeSlot = "midnight";
        } else {
            if (rawDateStr.includes("朝")) timeSlot = "morning";
            else if (rawDateStr.includes("昼")) timeSlot = "afternoon";
            else if (rawDateStr.includes("深夜")) timeSlot = "midnight";
            else if (rawDateStr.includes("夜")) timeSlot = "night";
        }

        Object.entries(columnMap).forEach(([colIndex, playerId]) => {
            const rawStatus = row[colIndex];
            const status = statusMap[rawStatus]; 
            
            if (status) {
                payload.push({
                    player_id: playerId,
                    target_date: targetDate,
                    time_slot: timeSlot,
                    status: status,
                    raw_text: rawText
                });
            }
        });
    });

    if (payload.length === 0) {
        alert("取り込む予定データがありませんでした");
        return closeModal("csv-mapping-modal");
    }

    try {
        const btn = document.getElementById("btn-execute-import");
        btn.disabled = true;
        btn.textContent = "インポート中...";

        const res = await Utils.apiPost("player_availability", payload);
        if (res) {
            closeModal("csv-mapping-modal");
            alert(`${payload.length}件の予定データをインポートしました！`);
            if (compareMode) await runComparison();
            else await fetchScheduleData();
        }
    } catch (err) {
        console.error("CSVインポートエラー:", err);
        alert("インポートに失敗しました");
    } finally {
        const btn = document.getElementById("btn-execute-import");
        btn.disabled = false;
        btn.textContent = "インポート実行";
    }
});