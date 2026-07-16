"use strict";

let currentDate = new Date(); // 現在表示している月を保持する変数
let allSessions = [];         // 取得した全セッションデータを保持
let compareMode = false;
let comparisonData = {};

let globalPlayers = [];
let parsedCsvData = null;
// 卓データを保持する変数
let globalRuns = [];

// 時間帯表示用の辞書
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
  const month = currentDate.getMonth();

  const titleEl = document.getElementById("calendar-month-title");
  if (titleEl) titleEl.textContent = `${year}年 ${month + 1}月`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
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

    // 比較モードの描画（○以外もすべて表示する）
    if (compareMode) {
      const slots = ["afternoon", "night"];
      slots.forEach(slot => {
        const key = `${targetDateStr}_${slot}`;
        const match = comparisonData[key];

        if (match) { 
          const matchBadge = document.createElement("div");
          matchBadge.className = `match-badge ${match.color}`;
          matchBadge.style.cursor = "pointer"; 
          
          // CSSが未整備でも見やすいようにインラインで色を補強
          const colorCodes = { "green": "#38a169", "yellow": "#d69e2e", "red": "#e53e3e" };
          const bgCodes = { "green": "#f0fff4", "yellow": "#fffff0", "red": "#fff5f5" };
          matchBadge.style.color = colorCodes[match.color] || "#333";
          matchBadge.style.backgroundColor = bgCodes[match.color] || "#fff";
          matchBadge.style.border = `1px solid ${colorCodes[match.color] || "#ccc"}`;
          matchBadge.style.borderRadius = "4px";
          matchBadge.style.padding = "2px";
          matchBadge.style.marginTop = "2px";
          matchBadge.style.fontSize = "0.75rem";
          matchBadge.style.textAlign = "center";
          matchBadge.style.fontWeight = "bold";
          
          let titleText = match.label || "";
          matchBadge.innerHTML = `<span title="${titleText}">${TIME_SLOT_LABELS[slot]}:${match.symbol}</span>`;

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

function getStatusSymbol(status) {
    const symbols = { "ok": "○", "maybe": "△", "ng": "×" };
    return symbols[status] || "-";
}

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
      const initialVal = (exist && exist.status !== "none") ? exist.status : "";
      
      slotDiv.dataset.status = initialVal;
      slotDiv.dataset.initial = initialVal;
      slotDiv.textContent = getStatusSymbol(initialVal);
      if (initialVal) slotDiv.classList.add(`select-${initialVal}`);

      slotDiv.addEventListener("click", () => {
          const statusOrder = ["", "ok", "maybe", "ng"];
          let currentIndex = statusOrder.indexOf(slotDiv.dataset.status);
          let nextIndex = (currentIndex + 1) % statusOrder.length;
          
          const nextStatus = statusOrder[nextIndex];
          slotDiv.dataset.status = nextStatus;
          slotDiv.textContent = getStatusSymbol(nextStatus);
          
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

async function saveBulkAvailability() {
  const playerId = document.getElementById("modal-player-id")?.value;
  if (!playerId) return alert("プレイヤーを選択してください");

  const toggles = document.querySelectorAll(".bulk-slot-toggle");
  const payload = [];

  toggles.forEach(el => {
    if (el.dataset.status !== el.dataset.initial) {
      const finalStatus = el.dataset.status === "" ? "none" : el.dataset.status;
      payload.push({
        player_id: playerId,
        target_date: el.dataset.date,
        time_slot: el.dataset.slot,
        status: finalStatus
      });
    }
  });

  if (payload.length === 0) {
     alert("変更された予定データがありません。");
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

async function initPlayerList() {
  try {
    const data = await Utils.getPlayers();
    globalPlayers = Array.isArray(data) ? data : [];
    
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

    if (inputPlayerSelect) {
        await Utils.setupPlayerSelect(inputPlayerSelect);
    }
  } catch (err) {
    console.error("プレイヤー一覧初期化エラー:", err);
  }
}

// 照合処理をフロントエンド側で完全に処理するように改修
async function runComparison() {
  const selectedIds = Array.from(document.querySelectorAll('input[name="compare-player"]:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) return alert("プレイヤーを選択してください");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  try {
    // APIを直接叩き、全員分の1ヶ月のデータを取得する
    const encodedIds = selectedIds.map(id => encodeURIComponent(id)).join(",");
    const raw = await Utils.apiGet(`player_availability?select=*,players(player_name)&player_id=in.(${encodedIds})&target_date=gte.${start}&target_date=lte.${end}`);
    
    if (Array.isArray(raw)) {
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
      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        ["afternoon", "night"].forEach(slot => {
            const key = `${dateStr}_${slot}`;
            const playerMap = grouped[key] || {};
            const pList = Object.values(playerMap);
            const statuses = pList.map(p => p.status);
            
            // 選択された人数のうち、予定を入力していない人の数
            const missingCount = selectedIds.length - pList.length;
            // "none" は空白扱い（未入力・NGと同義）
            const hasNg = statuses.includes("ng") || statuses.includes("none");
            const hasMaybe = statuses.includes("maybe");
            
            if (hasNg) {
              results[key] = { color: "red", symbol: "×", label: "不可あり" };
            } else if (missingCount > 0) {
              results[key] = { color: "yellow", symbol: "△", label: `未入力: ${missingCount}人` };
            } else if (hasMaybe) {
              const maybeNames = pList.filter(p => p.status === "maybe").map(p => p.name);
              results[key] = { color: "yellow", symbol: "△", label: `△: ${maybeNames.join(", ")}` };
            } else if (statuses.length === selectedIds.length && statuses.every(s => s === "ok")) {
              results[key] = { color: "green", symbol: "○", label: "全員空き" };
            } else {
              results[key] = { color: "red", symbol: "×", label: "不可" }; // フォールバック
            }
        });
      }

      comparisonData = results;
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
  if (modal && typeof modal.close === "function") modal.close();
}

async function initCompareModalData() {
  try {
    const playersData = await Utils.getPlayers();
    globalPlayers = Array.isArray(playersData) ? playersData : [];
    renderPlayerCheckboxes();

    const runs = await Utils.apiGet("runs");
    globalRuns = Array.isArray(runs) ? runs.filter(r => r.status === 'active' || r.status === 'planning') : [];

    const runSelect = document.getElementById("compare-run-select");
    const addSessionRunSelect = document.getElementById("add-session-run-id"); 

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

    if (addSessionRunSelect) {
      addSessionRunSelect.innerHTML = '<option value="">-- 卓を選択 --</option>';
      globalRuns.forEach(run => {
        const option = document.createElement("option");
        option.value = run.id;
        option.textContent = `${run.title} (${run.status === 'active' ? '進行中' : '計画中'})`;
        addSessionRunSelect.appendChild(option);
      });
    }

  } catch (err) {
    console.error("比較モーダルの初期化に失敗:", err);
  }
}

function renderPlayerCheckboxes() {
  const listEl = document.getElementById("player-checkbox-list");
  const modalSelect = document.getElementById("modal-player-id");

  if (listEl) {
    listEl.innerHTML = "";
    globalPlayers.forEach(p => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" name="compare-player" value="${p.player_id}" data-name="${p.player_name}"> ${p.player_name}`;
      listEl.appendChild(label);
    });
  }

  if (modalSelect) {
    modalSelect.innerHTML = '<option value="">-- プレイヤーを選択 --</option>';
    globalPlayers.forEach(p => {
      const option = document.createElement("option");
      option.value = p.player_id;
      option.textContent = p.player_name;
      modalSelect.appendChild(option);
    });
  }
}

function handleRunSelection(e) {
  const runId = e.target.value;
  if (!runId) return;

  const selectedRun = globalRuns.find(r => r.id == runId);
  if (!selectedRun) return;

  const checkboxes = document.querySelectorAll('input[name="compare-player"]');
  checkboxes.forEach(cb => cb.checked = false);

  const targetIds = [];
  if (selectedRun.gm_id) targetIds.push(selectedRun.gm_id);
  if (Array.isArray(selectedRun.player_ids)) targetIds.push(...selectedRun.player_ids);

  const targetNames = [];
  if (selectedRun.gm_name) targetNames.push(selectedRun.gm_name);
  else if (selectedRun.gm) targetNames.push(selectedRun.gm);

  if (Array.isArray(selectedRun.player_names)) targetNames.push(...selectedRun.player_names);
  else if (Array.isArray(selectedRun.players)) targetNames.push(...selectedRun.players);

  checkboxes.forEach(cb => {
    const pName = cb.getAttribute("data-name");
    const pId = cb.value;
    if (targetIds.includes(pId) || targetNames.includes(pName)) {
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
    document.getElementById("availability-modal")?.showModal();
    renderBulkInputGrid();
  });

  document.getElementById("compare-btn")?.addEventListener("click", () => {
    document.getElementById("compare-modal")?.showModal();
  });

  document.getElementById("close-modal-btn")?.addEventListener("click", () => closeModal("availability-modal"));
  document.getElementById("save-availability-btn")?.addEventListener("click", saveBulkAvailability);
  document.getElementById("run-compare-btn")?.addEventListener("click", runComparison);
  document.getElementById("modal-player-id")?.addEventListener("change", () => {
    renderBulkInputGrid();
  });

  document.getElementById("btn-add-session")?.addEventListener("click", () => {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      document.getElementById("add-session-start").value = now.toISOString().slice(0, 16);
      
      document.getElementById("add-session-modal")?.showModal();
  });

  document.getElementById("close-add-session-btn")?.addEventListener("click", () => {
      closeModal("add-session-modal");
  });

  document.getElementById("add-session-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const runId = document.getElementById("add-session-run-id").value;
      const title = document.getElementById("add-session-title").value;
      const startStr = document.getElementById("add-session-start").value;
      
      const streamUrl = document.getElementById("add-session-stream")?.value || null;
      const notes = document.getElementById("add-session-notes")?.value || null;

      if (!runId || !startStr) return alert("必須項目が入力されていません。");

      const isoStart = new Date(startStr).toISOString();

      try {
          const btn = e.target.querySelector('button[type="submit"]');
          btn.disabled = true;

          const payload = {
              run_id: runId,
              title: title || null,
              start: isoStart,
              stream_url: streamUrl,
              status: "scheduled"
          };

          await Utils.apiPost("sessions", payload);
          alert("セッション予定を追加しました！");
          window.location.href = `../sessions/detail.html?id=${encodeURIComponent(runId)}`;

      } catch (err) {
          console.error("セッション追加エラー:", err);
          alert("セッションの追加に失敗しました。コンソールを確認してください。");
          e.target.querySelector('button[type="submit"]').disabled = false;
      }
  });


  // ==========================================
  // 調整さんCSV スマートインポート機能
  // ==========================================

  document.getElementById("btn-import-csv")?.addEventListener("click", () => {
      document.getElementById("csv-upload").value = ""; 
      document.getElementById("csv-upload").click();
  });

  document.getElementById("csv-upload")?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.readAsText(file, 'Shift_JIS'); 
      
      reader.onload = (event) => {
          const text = event.target.result;
          const lines = text.split('\n').filter(l => l.trim() !== '');
          
          const headerIndex = lines.findIndex(line => line.replace(/^"|"$/g, '').startsWith("日程"));
          
          if (headerIndex === -1) {
              return alert("CSV内に「日程」の行が見つかりません。正しい調整さんのCSVか確認してください。");
          }

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

      const statusMap = { "○": "ok", "△": "maybe", "×": "ng", "◯": "ok" };

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
              if (hour < 18) timeSlot = "afternoon";
              else timeSlot = "night";
          } else {
              if (rawDateStr.includes("昼")) timeSlot = "afternoon";
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
  await fetchScheduleData(); 
}

// モーダルの背景（外側）をクリックした時に閉じる処理
window.addEventListener("click", (e) => {
  if (e.target.tagName === "DIALOG" && e.target.classList.contains("modal")) {
    e.target.close();
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

    document.getElementById("csv-mapping-modal")?.showModal();
}