"use strict";

// 月間予定の閲覧・一括入力・複数人比較・CSV取込・開催登録を同じカレンダー状態で調整する。
(() => {

let currentDate = new Date(); // 再描画や前後月移動でも表示月を共有する。
let allSessions = [];         // フィルタ変更ごとの再取得を避けるため、取得結果を保持する。
let compareMode = false;
let comparisonData = {};
const comparisonRequestToken = Utils.createLatestRequestToken();

let globalPlayers = [];
let parsedCsvData = null;
// 比較モーダル用（進行中・計画中のみ）
let globalRuns = [];
// カレンダー表示用（全卓。セッションの卓名解決に使う）
let allRunsById = new Map();

// 時間帯表示用の辞書
const TIME_SLOT_LABELS = { afternoon: "昼", night: "夜"};

// 取得完了後だけ描画し、通信中の古い状態をカレンダーへ混在させない。
async function fetchScheduleData() {
  try {
    const [sessions, runs] = await Promise.all([
      Utils.apiGet("sessions"),
      Utils.apiGet("runs")
    ]);
    allSessions = Array.isArray(sessions) ? sessions : [];
    allRunsById = new Map(
      (Array.isArray(runs) ? runs : [])
        .filter(run => run?.id != null)
        .map(run => [String(run.id), run])
    );
    renderCalendar();
  } catch (err) {
    console.error("セッションの取得に失敗しました", err);
  }
}

// 通常表示と比較表示が同じ月境界・曜日配置を使うよう、描画を一か所に集約する。
function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const titleEl = document.getElementById("calendar-month-title");
  if (titleEl) titleEl.textContent = `${year}年 ${month + 1}月`;
  const grid = document.getElementById("calendar-grid");
  if (!grid) return;

  Utils.renderCalendar(grid, year, month, {
    events: allSessions,
    // ホームと同じく卓タイトルを優先（セッション個別タイトルはフォールバック）
    getEventTitle: session => {
      const run = allRunsById.get(String(session.run_id));
      return run?.title || session.title || "名称未設定";
    },
    getEventHref: session => `../sessions/detail.html?id=${encodeURIComponent(session.run_id || session.id)}`,
    onCellRender: (cell, context) => {
      if (!compareMode) return;

      ["afternoon", "night"].forEach(slot => {
        const key = `${context.dateStr}_${slot}`;
        const match = comparisonData[key];
        if (!match) return;

        const matchBadge = document.createElement("button");
        matchBadge.type = "button";
        matchBadge.className = `schedule-match-badge ${match.color}`;
        matchBadge.title = match.label || "";
        matchBadge.textContent = `${TIME_SLOT_LABELS[slot]}:${match.symbol}`;
        matchBadge.addEventListener("click", () => {
          const selectedRunId = document.getElementById("compare-run-select")?.value;
          if (!selectedRunId) {
            alert("セッションを登録する「卓」を比較モーダルのプルダウンから選択してください。");
            return;
          }

          const params = new URLSearchParams({
            id: selectedRunId,
            date: context.dateStr,
            slot
          });
          window.location.href = `../sessions/detail.html?${params.toString()}`;
        });
        cell.appendChild(matchBadge);
      });
    }
  });
}

async function renderBulkInputGrid() {
  const playerId = document.getElementById("modal-player-id")?.value;
  if (!playerId) return;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthLabel = document.getElementById("bulk-month-label");
  if (monthLabel) monthLabel.textContent = `${year}年 ${month + 1}月`;

  let existingData = [];
  try {
    existingData = await Utils.fetchPlayerAvailabilities(playerId, year, month);
  } catch (e) {
    console.error("既存予定の取得に失敗:", e);
  }

  const container = document.getElementById("bulk-input-container");
  Utils.renderAvailabilityGrid(container, year, month, existingData);
}

async function saveBulkAvailability() {
  const playerId = document.getElementById("modal-player-id")?.value;
  if (!playerId) return alert("プレイヤーを選択してください");

  const container = document.getElementById("bulk-input-container");
  const payload = Utils.collectAvailabilityChanges(container, playerId);

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
    alert("保存に失敗しました: " + err.message);
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
  const requestToken = comparisonRequestToken.issue();

  try {
    const encodedIds = selectedIds.map(id => encodeURIComponent(id)).join(",");
    const nextComparisonData = await Utils.apiGetWithFallback(
      `schedule_match?player_ids=${encodedIds}&start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`,
      async () => {
        const raw = await Utils.apiGet(`player_availability?select=*,players(player_name)&player_id=in.(${encodedIds})&target_date=gte.${start}&target_date=lte.${end}`);
        return Utils.aggregateScheduleMatches(raw, selectedIds, year, month);
      }
    );
    if (!comparisonRequestToken.isLatest(requestToken)) return false;
    comparisonData = nextComparisonData;
    compareMode = true;
    closeModal('compare-modal');
    renderCalendar();
    return true;
  } catch (err) {
    if (!comparisonRequestToken.isLatest(requestToken)) return false;
    console.error("比較エラー:", err);
    alert("比較データの取得に失敗しました");
    return false;
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal && typeof modal.close === "function") modal.close();
}
// HTML のインライン onclick から呼ばれる公開契約のため、明示的に window へ残す。
window.closeModal = closeModal;

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

  // 表示名は Worker が付与する player_names / gm_name を使う。
  const targetNames = [];
  if (selectedRun.gm_name) targetNames.push(selectedRun.gm_name);
  if (Array.isArray(selectedRun.player_names)) targetNames.push(...selectedRun.player_names);

  checkboxes.forEach(cb => {
    const pName = cb.getAttribute("data-name");
    const pId = cb.value;
    if (targetIds.includes(pId) || targetNames.includes(pName)) {
      cb.checked = true;
    }
  });
}

async function handleAddSessionSubmit(e) {
  e.preventDefault();

  const runId = document.getElementById("add-session-run-id").value;
  const title = document.getElementById("add-session-title").value;
  const startStr = document.getElementById("add-session-start").value;
  const streamUrl = document.getElementById("add-session-stream")?.value || null;

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
    alert("セッションの追加に失敗しました: " + err.message);
    e.target.querySelector('button[type="submit"]').disabled = false;
  }
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

  document.getElementById("bulk-input-btn")?.addEventListener("click", async () => {
    await renderBulkInputGrid();
    document.getElementById("availability-modal")?.showModal();
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

  document.getElementById("add-session-form")?.addEventListener("submit", handleAddSessionSubmit);


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

      // 同一プレイヤー・日付・時間帯がCSV内で重複しても1件に畳む（後勝ち）。
      const dedupedPayload = [...payload.reduce((map, row) => {
          map.set(`${row.player_id}|${row.target_date}|${row.time_slot}`, row);
          return map;
      }, new Map()).values()];

      if (dedupedPayload.length === 0) {
          alert("取り込む予定データがありませんでした");
          return closeModal("csv-mapping-modal");
      }

      try {
          const btn = document.getElementById("btn-execute-import");
          btn.disabled = true;
          btn.textContent = "インポート中...";

          const res = await Utils.apiPost("player_availability", dedupedPayload);
          if (res) {
              closeModal("csv-mapping-modal");
              alert(`${dedupedPayload.length}件の予定データをインポートしました！`);
              if (compareMode) await runComparison();
              else await fetchScheduleData();
          }
      } catch (err) {
          console.error("CSVインポートエラー:", err);
          alert("インポートに失敗しました: " + err.message);
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
})();