"use strict";

let currentDate = new Date(); // 現在表示している月を保持する変数
let allSessions = [];         // 取得した全セッションデータを保持
let compareMode = false;
let comparisonData = {};

let globalPlayers = [];
let parsedCsvData = null;
// 卓データを保持する変数
let globalRuns = [];

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

        if (match && match.symbol === "○") { // ○（全員OK）の時だけ遷移可能にする
          const matchBadge = document.createElement("div");
          matchBadge.className = `match-badge ${match.color}`;
          matchBadge.style.cursor = "pointer"; // クリック可能であることを示す
          
          let titleText = match.label || "";
          matchBadge.innerHTML = `<span title="${titleText}">${TIME_SLOT_LABELS[slot]}:${match.symbol}</span>`;

          // ★ ここにクリックイベントを移動します
          matchBadge.onclick = () => {
            const runSelect = document.getElementById("compare-run-select");
            const selectedRunId = runSelect ? runSelect.value : null;
            
            if (!selectedRunId) {
              alert("セッションを登録する「卓」を比較モーダルのプルダウンから選択してください。");
              return;
            }

            const params = new URLSearchParams({
              id: selectedRunId,
              date: targetDateStr,
              slot: slot
            });
            window.location.href = `../sessions/detail.html?${params.toString()}`;
          };
          
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

// シンボル取得用のヘルパー関数
function getStatusSymbol(status) {
    const symbols = { "ok": "○", "maybe": "△", "ng": "×" };
    return symbols[status] || "-";
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
    slotDiv.className = "bulk-slot-toggle";
    slotDiv.dataset.date = dateStr;
    slotDiv.dataset.slot = slot;

    const exist = existingData.find(ex => ex.target_date === dateStr && ex.time_slot === slot);
    const initialVal = exist ? exist.status : "";
    
    slotDiv.dataset.status = initialVal;     // 現在の値
    slotDiv.dataset.initial = initialVal;    // 保存判定用の初期値
    slotDiv.textContent = getStatusSymbol(initialVal);
    if (initialVal) slotDiv.classList.add(`select-${initialVal}`);

    slotDiv.addEventListener("click", () => {
        const statusOrder = ["", "ok", "maybe", "ng"];
        let currentIndex = statusOrder.indexOf(slotDiv.dataset.status);
        let nextIndex = (currentIndex + 1) % statusOrder.length;
        
        const nextStatus = statusOrder[nextIndex];
        slotDiv.dataset.status = nextStatus;
        slotDiv.textContent = getStatusSymbol(nextStatus);
        
        // クラスの付け替え
        slotDiv.className = "bulk-slot-toggle"; 
        if (nextStatus) slotDiv.classList.add(`select-${nextStatus}`);
    });

    const wrapper = document.createElement("div");
    wrapper.className = "bulk-slot";
    wrapper.appendChild(slotDiv);
    row.appendChild(wrapper);
    });

    container.appendChild(row);
  }
}

// 一括保存処理
async function saveBulkAvailability() {
  const playerId = document.getElementById("modal-player-id")?.value;
  if (!playerId) return alert("プレイヤーを選択してください");

  // ここを .bulk-slot-toggle に変更
  const toggles = document.querySelectorAll(".bulk-slot-toggle");
  const payload = [];

  toggles.forEach(el => {
    // dataset.status と dataset.initial を比較
    if (el.dataset.status !== el.dataset.initial) {
      if (el.dataset.status !== "") {
        payload.push({
          player_id: playerId,
          target_date: el.dataset.date,
          time_slot: el.dataset.slot,
          status: el.dataset.status
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
    // Utils のキャッシュ機能を使ってプレイヤーを取得
    globalPlayers = await Utils.getPlayers(); 
    
    const listEl = document.getElementById("player-checkbox-list");
    const inputPlayerSelect = document.getElementById("modal-player-id");
    
    if (listEl) listEl.innerHTML = "";
    
    globalPlayers.forEach(p => {
      if (listEl) {
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" name="compare-player" value="${p.player_id}"> ${p.player_name}`;
        listEl.appendChild(label);
      }
    });

    // 選択プルダウンの生成は Utils の共通関数にお任せ
    if (inputPlayerSelect) {
        await Utils.setupPlayerSelect(inputPlayerSelect);
    }
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

async function initCompareModalData() {
  try {
    // 1. プレイヤー一覧を初期化（既存処理）
    globalPlayers = await Utils.getPlayers();
    renderPlayerCheckboxes();

    // 2. 卓一覧を取得（apiGet("runs")を使用）
    const runs = await Utils.apiGet("runs");
    // 進行中(active)や計画中(planning)のみにフロント側で絞り込む
    globalRuns = Array.isArray(runs) ? runs.filter(r => r.status === 'active' || r.status === 'planning') : [];

    const runSelect = document.getElementById("compare-run-select");
    if (runSelect) {
      runSelect.innerHTML = '<option value="">-- 卓を選択 --</option>';
      globalRuns.forEach(run => {
        const option = document.createElement("option");
        option.value = run.id;
        option.textContent = `${run.title} (${run.status === 'active' ? '進行中' : '計画中'})`;
        runSelect.appendChild(option);
      });
      runSelect.addEventListener("change", handleRunSelection);
    }
  } catch (err) {
    console.error("比較モーダルの初期化に失敗:", err);
  }
}

// 既存の initPlayerList 内の描画部分を関数化して整理
function renderPlayerCheckboxes() {
  const listEl = document.getElementById("player-checkbox-list");
  if (!listEl) return;
  listEl.innerHTML = "";
  
  globalPlayers.forEach(p => {
    const label = document.createElement("label");
    // フロント側での照合を容易にするため、valueはplayer_idのまま、テキストはplayer_name
    label.innerHTML = `<input type="checkbox" name="compare-player" value="${p.player_id}" data-name="${p.player_name}"> ${p.player_name}`;
    listEl.appendChild(label);
  });
}

function handleRunSelection(e) {
  const runId = e.target.value;
  if (!runId) return;

  const selectedRun = globalRuns.find(r => r.id == runId);
  if (!selectedRun) return;

  // すべてのチェックを一度外す
  const checkboxes = document.querySelectorAll('input[name="compare-player"]');
  checkboxes.forEach(cb => cb.checked = false);

  // 卓に含まれる名前のリストを作成
  const targetNames = [];
  if (selectedRun.gm) targetNames.push(selectedRun.gm);
  if (Array.isArray(selectedRun.players)) {
    targetNames.push(...selectedRun.players);
  }

  // 名前（data-name属性）が一致するチェックボックスをONにする
  checkboxes.forEach(cb => {
    const pName = cb.getAttribute("data-name");
    if (targetNames.includes(pName)) {
      cb.checked = true;
    }
  });
}

// 起動時の処理とイベントリスナー
async function main() {
  await Utils.initAuthAndHeader('common-nav', '../');
  
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
          // 空行を除外して行の配列にする
          const lines = text.split('\n').filter(l => l.trim() !== '');
          
          // ★修正：「日程」という文字から始まる行を探し、そこをヘッダー（列名）とする
          const headerIndex = lines.findIndex(line => line.replace(/^"|"$/g, '').startsWith("日程"));
          
          if (headerIndex === -1) {
              return alert("CSV内に「日程」の行が見つかりません。正しい調整さんのCSVか確認してください。");
          }

          // ヘッダー行と、それ以降のデータ行を正しく分割する
          const headers = lines[headerIndex].split(',').map(s => s.replace(/^"|"$/g, '').trim());
          const dataRows = lines.slice(headerIndex + 1).map(line => line.split(',').map(s => s.replace(/^"|"$/g, '').trim()));

          parsedCsvData = { headers, dataRows };
          showMappingModal();
      };
  });


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



  // 初回読み込み
  await initCompareModalData();    
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

