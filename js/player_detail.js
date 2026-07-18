"use strict";

// プレイヤーのプロフィール・参加履歴・所持キャラクター・予定を集約し、閲覧と本人編集を担う。
(() => {

const availabilityRequestToken = Utils.createLatestRequestToken();

async function main() {
  const root = document.getElementById("player-detail-root");
  if (!root) return;

  await Utils.initAuthAndHeader('common-nav', '../');

  const playerId = Utils.getQueryParam("id");
  if (!playerId) {
    root.innerHTML = "<p>プレイヤーIDが指定されていません</p>";
    return;
  }

  try {
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth();

    const bundle = await Utils.apiGetWithFallback(
      async () => {
        const [summaries, profiles, characters, runs] = await Promise.all([
          Utils.apiGet(`player_detail_summary?player_id=${encodeURIComponent(playerId)}`),
          Utils.apiGet(`player_profiles?player_id=eq.${encodeURIComponent(playerId)}`),
          Utils.apiGet(`characters?player_id=${encodeURIComponent(playerId)}`),
          Utils.apiGet(`runs?participant_id=${encodeURIComponent(playerId)}`)
        ]);
        const basePlayer = Array.isArray(summaries) ? summaries[0] : null;
        const profileData = Array.isArray(profiles) ? profiles[0] : null;
        const runRows = Array.isArray(runs) ? runs : [];
        const runIds = [...new Set(runRows.map(run => run.id).filter(Boolean))];
        const scenarioIds = [...new Set([
          ...runRows.map(run => run.scenario_id),
          ...((profileData?.favorite_scenario_ids) || []),
          ...((profileData?.gmable_scenario_ids) || [])
        ].filter(Boolean))];
        const [sessions, scenarios, availabilities] = await Promise.all([
          runIds.length > 0
            ? Utils.apiGet(`sessions/detail?run_ids=${encodeURIComponent(runIds.join(","))}`)
            : [],
          scenarioIds.length > 0
            ? Utils.apiGet(`scenarios?ids=${encodeURIComponent(scenarioIds.join(","))}`)
            : [],
          Utils.fetchPlayerAvailabilities(playerId, currentYear, currentMonth)
        ]);
        return {
          basePlayer,
          profileData,
          characters: Array.isArray(characters) ? characters : [],
          runs: runRows,
          sessions: Array.isArray(sessions) ? sessions : [],
          availabilities,
          scenarios: Array.isArray(scenarios) ? scenarios : []
        };
      },
      async () => {
        const [players, profiles, characters, runs, sessions, availabilities, scenarios] = await Promise.all([
          Utils.apiGet("players"),
          Utils.apiGet("player_profiles"),
          Utils.apiGet("characters"),
          Utils.apiGet("runs"),
          Utils.apiGet("sessions"),
          Utils.apiGet("player_availability"),
          Utils.apiGet("scenarios")
        ]);
        return {
          basePlayer: (players || []).find(player => player.player_id === playerId),
          profileData: (profiles || []).find(profile => profile.player_id === playerId),
          characters: Array.isArray(characters) ? characters : [],
          runs: Array.isArray(runs) ? runs : [],
          sessions: Array.isArray(sessions) ? sessions : [],
          availabilities: (availabilities || []).filter(row => row.player_id === playerId),
          scenarios: Array.isArray(scenarios) ? scenarios : []
        };
      }
    );

    const { basePlayer, profileData, characters, runs, sessions, availabilities, scenarios } = bundle;
    if (!basePlayer) {
      root.innerHTML = "<p>プレイヤーが見つかりません</p>";
      return;
    }

    // お気に入り操作後の再描画で最新プロフィールへ差し替えるため、参照を更新可能に保つ。
    let hasProfileRecord = profileData != null;

    // 厳密な型比較(Map)による不一致を防ぐため、キーをStringに統一
    const charactersMap = new Map(characters.map(c => [String(c.id), c]));
    const iconCharObj = (profileData && profileData.icon_url) ? charactersMap.get(String(profileData.icon_url)) : null;

    const player = {
      ...basePlayer,
      ...(profileData || {}),
      icon_image_url: iconCharObj ? iconCharObj.image_url : null
    };

    const myCharacters = characters
      .filter(c => c.player_id === playerId || c.player === player.player_name)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const myAvailabilities = availabilities.filter(a => a.player_id === playerId);
    const myRunsGM = runs.filter(r => String(r.gm_id) === String(playerId));
    const myRunsPL = runs.filter(r => {
      let isPL = false;
      if (Array.isArray(r.player_ids)) {
        isPL = r.player_ids.some(id => String(id) === String(playerId));
      } else if (typeof r.player_ids === 'string') {
        isPL = r.player_ids.includes(String(playerId));
      }
      return isPL;
    });

    const myRunsAll = [...myRunsGM, ...myRunsPL];
    const myRunIds = myRunsAll.map(r => String(r.id));
    const mySessions = sessions.filter(s => s.start && myRunIds.includes(String(s.run_id)));

    const passedRuns = myRunsPL.filter(r => r.status === "done" && r.scenario_id);
    const passedScenarioIds = [...new Set(passedRuns.map(r => r.scenario_id))];
    const passedScenarios = (scenarios || []).filter(s => passedScenarioIds.includes(s.id));

    const gmRuns = myRunsGM.filter(r => r.scenario_id);
    const gmScenarioIds = [...new Set(gmRuns.map(r => r.scenario_id))];
    const gmScenarios = (scenarios || []).filter(s => gmScenarioIds.includes(s.id));

    function renderSchedule() {
      const wrapper = document.getElementById("schedule-wrapper");
      if (!wrapper) return;

      wrapper.innerHTML = buildScheduleShellHtml(currentYear, currentMonth);
      const calendarEl = document.getElementById("player-schedule-calendar");
      Utils.renderCalendar(calendarEl, currentYear, currentMonth, {
        events: mySessions,
        availabilities: myAvailabilities,
        getEventTitle: session => {
          const run = myRunsAll.find(item => String(item.id) === String(session.run_id));
          return run?.title || session.title || "不明な卓";
        },
        getEventHref: session => `../sessions/detail.html?id=${encodeURIComponent(session.run_id || session.id)}`
      });
    }

    async function refreshMonthlyAvailability() {
      const token = availabilityRequestToken.issue();
      const rows = await Utils.fetchPlayerAvailabilities(playerId, currentYear, currentMonth);
      if (!availabilityRequestToken.isLatest(token)) return;
      myAvailabilities.splice(0, myAvailabilities.length, ...rows);
      renderSchedule();
    }

    let favChars = player.favorite_character_ids || [];
    let favScenarios = player.favorite_scenario_ids || [];
    let gmableScenarios = Array.isArray(player.gmable_scenario_ids)
      ? player.gmable_scenario_ids.map(String)
      : [];
    let externalPassed = normalizeExternalPassedScenarios(player.external_passed_scenarios);

    const { player: viewerPlayer } = await Utils.getCurrentUserPlayerContext({
      loadProfile: false
    });
    const isOwner = !!(viewerPlayer && String(viewerPlayer.player_id) === String(playerId));

    const gmableScenarioRows = (scenarios || []).filter(s => gmableScenarios.includes(String(s.id)));
    // 通過・経験外でも GM可能に登録したシナリオを表示できるよう候補をまとめる
    const gmableCandidates = [...scenarios];
    const knownIds = new Set(gmableCandidates.map(s => String(s.id)));
    for (const s of [...passedScenarios, ...gmScenarios]) {
      if (!knownIds.has(String(s.id))) {
        gmableCandidates.push(s);
        knownIds.add(String(s.id));
      }
    }

    root.innerHTML = `
      <div class="player-detail-grid" style="display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start;">
        <div style="flex: 1 1 300px; max-width: 450px;">
          ${buildPlayerProfileHtml(player)}
        </div>
        <div id="schedule-wrapper" style="flex: 2 1 500px;">
        </div>
      </div>

      ${buildCustomAreaHtml(player, characters, scenarios)}

      <div style="margin-top: 20px;">
        ${buildMyCharactersHtml(myCharacters, favChars)}
      </div>

      <div class="player-detail-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px;">
        ${buildPassedScenariosHtml(passedScenarios, externalPassed, favScenarios, {
          gmableIds: gmableScenarios,
          showGmableToggle: isOwner,
          isOwner
        })}
        ${buildScenariosHtml("GM経験済シナリオ", gmScenarios, favScenarios, "GM履歴はまだありません。", {
          gmableIds: gmableScenarios,
          showGmableToggle: isOwner
        })}
      </div>

      <div style="margin-top: 20px;">
        ${buildGmableScenariosHtml(gmableScenarioRows, gmableCandidates, isOwner)}
      </div>
    `;

    renderSchedule();

    async function updateFavoritesSilent(column, arrayData) {
      const payload = { [column]: arrayData };
      try {
        if (!hasProfileRecord) {
          payload.player_id = playerId;
          await Utils.apiPost("player_profiles", payload);
          hasProfileRecord = true;
        } else {
          await Utils.apiPatch("player_profiles", payload, `player_id=eq.${playerId}`);
        }
        const toastMessage = column === "gmable_scenario_ids"
          ? "GM可能シナリオを更新しました！"
          : column === "external_passed_scenarios"
            ? "部活外の通過シナリオを更新しました！"
            : "お気に入りを更新しました！";
        Utils.showToast(toastMessage);
      } catch(err) {
        console.error("プロフィール配列の保存エラー", err);
        Utils.showToast("保存に失敗しました: " + err.message, "error");
      }
    }

    function refreshExternalPassedList() {
      const listEl = document.getElementById("external-passed-list");
      const countEl = document.getElementById("passed-scenarios-count");
      if (countEl) {
        countEl.textContent = String(passedScenarios.length + externalPassed.length);
      }
      if (!listEl) return;
      listEl.innerHTML = buildExternalPassedListHtml(externalPassed, isOwner);
    }

    function refreshGmableRegisteredList() {
      const gmableList = document.getElementById("gmable-scenarios-list");
      const countEl = document.getElementById("gmable-scenarios-count");
      const rows = gmableCandidates.filter(s => gmableScenarios.includes(String(s.id)));
      if (countEl) countEl.textContent = String(rows.length);
      if (!gmableList) return;
      gmableList.innerHTML = rows.length
        ? `<ul style="margin: 0; padding: 0; list-style: none;">${rows.map(s => `
            <li style="display: flex; align-items: center; gap: 8px; padding: 4px 0;">
              ${isOwner
                ? `<button type="button" class="btn-gmable-scenario is-active" data-id="${Utils.escapeHtml(String(s.id))}">GM可✓</button>`
                : `<span class="gmable-badge">GM可</span>`}
              <a href="../scenarios/detail.html?id=${encodeURIComponent(s.id)}">${Utils.escapeHtml(s.title || s.id)}</a>
            </li>
          `).join("")}</ul>`
        : `<p class="u-muted" style="text-align: center;">まだ GM可能シナリオがありません。「登録」ボタンまたはシナリオ詳細から追加できます。</p>`;
    }

    function refreshGmableModalCandidates() {
      const container = document.getElementById("gmable-modal-candidates");
      if (!container) return;
      const unregistered = gmableCandidates.filter(s => !gmableScenarios.includes(String(s.id)));
      container.innerHTML = unregistered.length
        ? `<ul style="margin: 0; padding: 0; list-style: none;">${unregistered.map(s => `
            <li style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #edf2f7;">
              <button type="button" class="btn-gmable-scenario" data-id="${Utils.escapeHtml(String(s.id))}">GM可</button>
              <span style="font-weight: bold;">${Utils.escapeHtml(s.title || s.id)}</span>
              ${s.system ? `<span style="font-size: 0.75rem; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${Utils.escapeHtml(s.system)}</span>` : ""}
            </li>
          `).join("")}</ul>`
        : `<p class="u-muted">追加候補はありません。通過済・GM経験があるか、シナリオ詳細で登録してください。</p>`;
    }

    root.addEventListener("click", async (e) => {
      if (e.target.closest("#btn-prev-month")) {
        currentMonth--;
        if (currentMonth < 0) { currentMonth = 11; currentYear--; }
        await refreshMonthlyAvailability();
      } else if (e.target.closest("#btn-next-month")) {
        currentMonth++;
        if (currentMonth > 11) { currentMonth = 0; currentYear++; }
        await refreshMonthlyAvailability();
      }

      if (e.target.closest("#bulk-input-btn")) {
        const modal = document.getElementById("availability-modal");
        if (modal) {
          // 後続のボタン登録が未生成DOMを参照しないよう、グリッド描画の完了を待つ。
          await renderBulkInputGrid(playerId, currentYear, currentMonth);
          modal.showModal();
        }
      }

      const favCharBtn = e.target.closest(".btn-fav-char");
      if (favCharBtn) {
        e.preventDefault();
        const id = favCharBtn.getAttribute("data-id");
        if (favChars.includes(id)) {
          favChars = favChars.filter(x => x !== id);
          favCharBtn.style.color = "#e2e8f0";
        } else {
          favChars.push(id);
          favCharBtn.style.color = "#ecc94b";
        }
        updateFavoritesSilent("favorite_character_ids", favChars);
      }

      const favScenarioBtn = e.target.closest(".btn-fav-scenario");
      if (favScenarioBtn) {
        e.preventDefault();
        const id = favScenarioBtn.getAttribute("data-id");
        if (favScenarios.includes(id)) {
          favScenarios = favScenarios.filter(x => x !== id);
          favScenarioBtn.style.color = "#e2e8f0";
        } else {
          favScenarios.push(id);
          favScenarioBtn.style.color = "#ecc94b";
        }
        updateFavoritesSilent("favorite_scenario_ids", favScenarios);
      }

      const gmableBtn = e.target.closest(".btn-gmable-scenario");
      if (gmableBtn) {
        e.preventDefault();
        if (!isOwner) return;
        const id = String(gmableBtn.getAttribute("data-id") || "");
        if (!id) return;
        if (gmableScenarios.includes(id)) {
          gmableScenarios = gmableScenarios.filter(x => x !== id);
          gmableBtn.classList.remove("is-active");
          gmableBtn.textContent = "GM可";
        } else {
          gmableScenarios = [...gmableScenarios, id];
          gmableBtn.classList.add("is-active");
          gmableBtn.textContent = "GM可✓";
        }
        // 一覧・モーダル内の同IDボタンを同期し、登録一覧／候補を更新する
        document.querySelectorAll(".btn-gmable-scenario").forEach(btn => {
          if (String(btn.getAttribute("data-id")) !== id) return;
          const on = gmableScenarios.includes(id);
          btn.classList.toggle("is-active", on);
          btn.textContent = on ? "GM可✓" : "GM可";
        });
        refreshGmableRegisteredList();
        refreshGmableModalCandidates();
        updateFavoritesSilent("gmable_scenario_ids", gmableScenarios);
      }

      if (e.target.closest("#btn-open-external-passed-modal")) {
        document.getElementById("external-passed-modal")?.showModal();
      }
      if (e.target.closest("#btn-open-gmable-modal")) {
        refreshGmableModalCandidates();
        document.getElementById("gmable-register-modal")?.showModal();
      }

      const removeExternalBtn = e.target.closest(".btn-remove-external-passed");
      if (removeExternalBtn) {
        e.preventDefault();
        if (!isOwner) return;
        const id = String(removeExternalBtn.getAttribute("data-id") || "");
        if (!id) return;
        externalPassed = externalPassed.filter(item => String(item.id) !== id);
        refreshExternalPassedList();
        updateFavoritesSilent("external_passed_scenarios", externalPassed);
      }
    });

    const externalForm = document.getElementById("external-passed-form");
    const externalModal = document.getElementById("external-passed-modal");
    const gmableModal = document.getElementById("gmable-register-modal");

    document.getElementById("close-external-passed-modal")?.addEventListener("click", () => {
      externalModal?.close();
    });
    document.getElementById("close-gmable-register-modal")?.addEventListener("click", () => {
      gmableModal?.close();
    });
    externalModal?.addEventListener("click", (e) => {
      if (e.target === externalModal) externalModal.close();
    });
    gmableModal?.addEventListener("click", (e) => {
      if (e.target === gmableModal) gmableModal.close();
    });

    // モーダル内の GM可ボタンも root 外なので document 委譲で拾う
    gmableModal?.addEventListener("click", (e) => {
      const gmableBtn = e.target.closest(".btn-gmable-scenario");
      if (!gmableBtn || !isOwner) return;
      e.preventDefault();
      const id = String(gmableBtn.getAttribute("data-id") || "");
      if (!id) return;
      if (gmableScenarios.includes(id)) {
        gmableScenarios = gmableScenarios.filter(x => x !== id);
      } else {
        gmableScenarios = [...gmableScenarios, id];
      }
      document.querySelectorAll(".btn-gmable-scenario").forEach(btn => {
        if (String(btn.getAttribute("data-id")) !== id) return;
        const on = gmableScenarios.includes(id);
        btn.classList.toggle("is-active", on);
        btn.textContent = on ? "GM可✓" : "GM可";
      });
      refreshGmableRegisteredList();
      refreshGmableModalCandidates();
      updateFavoritesSilent("gmable_scenario_ids", gmableScenarios);
    });

    externalForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isOwner) return;
      const titleInput = externalForm.querySelector('[name="external_title"]');
      const systemInput = externalForm.querySelector('[name="external_system"]');
      const noteInput = externalForm.querySelector('[name="external_note"]');
      const title = (titleInput?.value || "").trim();
      if (!title) {
        alert("シナリオ名を入力してください。");
        return;
      }
      if (externalPassed.length >= 100) {
        alert("部活外シナリオは最大100件までです。");
        return;
      }
      externalPassed = [
        ...externalPassed,
        {
          id: createExternalPassedId(),
          title,
          system: (systemInput?.value || "").trim(),
          note: (noteInput?.value || "").trim()
        }
      ];
      refreshExternalPassedList();
      externalForm.reset();
      await updateFavoritesSilent("external_passed_scenarios", externalPassed);
      externalModal?.close();
    });

    Utils.renderRadarChart(player, "desire-radar-chart");

    const charSelect = document.getElementById('icon-character-select');
    const editBtn = document.getElementById("btn-edit-profile");
    const editModal = document.getElementById("edit-profile-modal");
    const closeBtn = document.getElementById("close-profile-modal");
    const form = document.getElementById("edit-profile-form");

    if (charSelect) {
      charSelect.innerHTML = '<option value="">-- キャラクターを選択 --</option>' +
      myCharacters.map(c =>
        `<option value="${c.id}" data-name="${Utils.escapeHtml(c.name)}">
            ${Utils.escapeHtml(c.name)}
        </option>`
      ).join('');
    }

    if (editBtn && editModal) {
      editBtn.addEventListener("click", () => {
        form.tier_list_first.value = player.tier_list_first || "";
        form.tier_list_second.value = player.tier_list_second || "";
        form.tier_list_third.value = player.tier_list_third || "";
        charSelect.value = player.icon_url || "";
        form.desire_avatar.value = player.desire_avatar || 3;
        form.desire_active.value = player.desire_active || 3;
        form.desire_chaos.value = player.desire_chaos || 3;
        form.desire_story.value = player.desire_story || 3;
        form.desire_harmony.value = player.desire_harmony || 3;
        form.desire_clear.value = player.desire_clear || 3;

        editModal.showModal();
      });

      closeBtn.addEventListener("click", () => editModal.close());

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type='submit']");
        submitBtn.disabled = true;

        const payload = {
          player_id: playerId,
          icon_url: form.icon_url.value || null,
          tier_list_first: form.tier_list_first.value.trim(),
          tier_list_second: form.tier_list_second.value.trim(),
          tier_list_third: form.tier_list_third.value.trim(),
          desire_avatar: parseInt(form.desire_avatar.value, 10),
          desire_active: parseInt(form.desire_active.value, 10),
          desire_chaos: parseInt(form.desire_chaos.value, 10),
          desire_story: parseInt(form.desire_story.value, 10),
          desire_harmony: parseInt(form.desire_harmony.value, 10),
          desire_clear: parseInt(form.desire_clear.value, 10)
        };

        try {
          if (hasProfileRecord) {
            await Utils.apiPatch("player_profiles", payload, `player_id=eq.${playerId}`);
          } else {
            await Utils.apiPost("player_profiles", payload);
          }
          alert("プロフィールを更新しました！");
          location.reload();
        } catch (err) {
          console.error(err);
          alert("更新に失敗しました: " + err.message);
          submitBtn.disabled = false;
        }
      });
    }

    document.getElementById("save-availability-btn")?.addEventListener("click", saveBulkAvailability);
    document.getElementById("close-modal-btn")?.addEventListener("click", () => {
      document.getElementById("availability-modal")?.close();
    });

    if (window.Comments && typeof window.Comments.mount === "function") {
      window.Comments.mount("comments-root", "player", playerId);
    }

  } catch (err) {
    console.error(err);
    root.innerHTML = "<p>データの読み込みに失敗しました。</p>";
  }
}

function buildPlayerProfileHtml(player) {
  const profileImage = player.icon_url  ? Utils.getCharacterImagePath(player.icon_url, player.icon_image_url) : Utils.DEFAULT_CHARACTER_IMAGE;

  return `
    <section class="player-profile" style="position: relative; display: flex; flex-direction: column; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); height: 550px; ">
      <div style="display: flex; align-items: center; gap: 20px;">
        <img src="${profileImage}" alt="アイコン" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;">
        <div>
          <h1 style="margin: 0; font-size: 1.8rem; color: #2d3748;">${Utils.escapeHtml(player.player_name)}</h1>
          <p style="margin: 5px 0 0 0; color: #718096; font-size: 0.9rem;">ID: ${Utils.escapeHtml(player.player_id)}</p>
        </div>
      </div>

      <div style="margin-top: 20px; width: 100%; max-width: 320px; align-self: center;">
        <canvas id="desire-radar-chart"></canvas>
      </div>

      <button id="btn-edit-profile" style="position: absolute; top: 20px; right: 20px; padding: 8px 16px; background: #4a5568; color: #fff; border: none; border-radius: 4px; cursor: pointer;">📝</button>
    </section>
  `;
}

function buildCustomAreaHtml(player, allCharacters, allScenarios) {
  const favCharIds = player.favorite_character_ids || [];
  const favScenIds = player.favorite_scenario_ids || [];

  const favChars = (allCharacters || []).filter(c => favCharIds.includes(String(c.id)));
  const favScens = (allScenarios || []).filter(s => favScenIds.includes(String(s.id)));

  if (favChars.length === 0 && favScens.length === 0) {
    return `
      <section class="player-custom-area" style="margin-top: 20px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center;">
        <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">最強キャラランキング</h2>
        <p style="color: #a0aec0; margin-top: 20px; font-weight: bold;">まだ最強キャラが登録されていません。</p>
      </section>
    `;
  }

  let charsHtml = "";
  if (favChars.length > 0) {
    charsHtml = `
      <h3 style="margin: 15px 0 10px; font-size: 1.1rem; color: #2d3748; padding-left: 8px;">最強キャラ</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 15px;">
        ${favChars.map(c => `
          <a href="../character/detail.html?id=${c.id}" style="display: flex; flex-direction: column; align-items: center; text-decoration: none; color: inherit; width: 90px; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
            <img src="${Utils.getCharacterImagePath(c.id, c.image_url)}" onerror="this.onerror=null; this.src='${Utils.DEFAULT_CHARACTER_IMAGE}';" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <span style="font-size: 0.85rem; font-weight: bold; text-align: center; margin-top: 8px; word-break: break-all; line-height: 1.2;">${Utils.escapeHtml(c.name)}</span>
          </a>
        `).join("")}
      </div>
    `;
  }

  let scensHtml = "";
  if (favScens.length > 0) {
    scensHtml = `
      <h3 style="margin: 25px 0 10px; font-size: 1.1rem; color: #2d3748; padding-left: 8px;">最強シナリオ</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 10px;">
        ${favScens.map(s => `
          <a href="../scenario/detail.html?id=${s.id}" style="font-size: 0.9rem; background: #daebf0; border: 1px solid #5c97ff; color: #2d3748; padding: 6px 12px; border-radius: 20px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            ★ ${Utils.escapeHtml(s.title)}
          </a>
        `).join("")}
      </div>
    `;
  }

  return `
    <section class="player-custom-area" style="margin-top: 20px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">最強キャラランキング</h2>
      ${charsHtml}
      ${scensHtml}
    </section>
  `;
}

function buildMyCharactersHtml(characters, favoriteIds = []) {
  const charsList = characters.length > 0
    ? characters.map(c => {
        const isFav = favoriteIds.includes(String(c.id));
        const starColor = isFav ? "#ecc94b" : "#e2e8f0";
        return `
        <div style="display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; transition: background 0.2s;">
          <button class="btn-fav-char" data-id="${c.id}" style="background: none; border: none; cursor: pointer; font-size: 1.5rem; color: ${starColor}; padding: 0; outline: none; transition: transform 0.1s;">★</button>
          <a href="../character/detail.html?id=${c.id}" style="display: flex; align-items: center; gap: 10px; flex-grow: 1; text-decoration: none; color: inherit;">
            <img src="${Utils.getCharacterImagePath(c.id, c.image_url)}" onerror="this.onerror=null; this.src='${Utils.DEFAULT_CHARACTER_IMAGE}';" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
            <span style="font-weight: bold;">${Utils.escapeHtml(c.name)}</span>
            <span style="font-size: 0.9rem; color: #718096;">${Utils.escapeHtml(c.job || '')}</span>
            <span style="font-size: 0.8rem; background: #edf2f7; padding: 2px 6px; border-radius: 4px;">${Utils.escapeHtml(c.system || '')}</span>
          </a>
        </div>
      `}).join("")
    : "<p style='color: #a0aec0;'>作成したキャラクターはまだありません。</p>";

  return `
    <section class="player-characters" style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">作成キャラクター</h2>
      <div style="display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto;">
        ${charsList}
      </div>
    </section>
  `;
}

function buildScheduleShellHtml(year, month) {
  return `
    <section class="player-schedule">
      <h2 class="player-schedule-header">
        <span>スケジュール</span>
        <button id="bulk-input-btn" class="btn-primary">予定を入力</button>
        <div class="player-schedule-navigation">
          <button id="btn-prev-month" type="button" aria-label="前月">◀</button>
          <span>${year}年${month + 1}月</span>
          <button id="btn-next-month" type="button" aria-label="翌月">▶</button>
        </div>
      </h2>
      <div id="player-schedule-calendar" class="calendar-grid"></div>
    </section>
  `;
}

function createExternalPassedId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ext-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeExternalPassedScenarios(raw) {
  let rows = raw;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map(item => {
      if (!item || typeof item !== "object") return null;
      const title = String(item.title || "").trim();
      if (!title) return null;
      return {
        id: String(item.id || createExternalPassedId()),
        title,
        system: String(item.system || "").trim(),
        note: String(item.note || "").trim()
      };
    })
    .filter(Boolean)
    .slice(0, 100);
}

function buildExternalPassedListHtml(externalList, isOwner) {
  const items = Array.isArray(externalList) ? externalList : [];
  if (items.length === 0) {
    return `<p class="u-muted" style="margin: 0; font-size: 0.85rem;">部活外の登録はまだありません。</p>`;
  }
  return `<ul style="margin: 0; padding: 0; list-style: none;">${items.map(item => {
    const systemTag = item.system
      ? `<span style="font-size: 0.75rem; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${Utils.escapeHtml(item.system)}</span>`
      : "";
    const noteHtml = item.note
      ? `<small class="u-muted" style="display: block; margin-left: 0;">${Utils.escapeHtml(item.note)}</small>`
      : "";
    const removeBtn = isOwner
      ? `<button type="button" class="btn-remove-external-passed" data-id="${Utils.escapeHtml(item.id)}" title="削除" style="margin-left: auto; background: none; border: none; color: #c53030; cursor: pointer; font-size: 0.85rem;">削除</button>`
      : "";
    return `
      <li style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 4px 0; border-bottom: 1px solid #edf2f7;">
        <span class="external-passed-badge">部活外</span>
        <strong>${Utils.escapeHtml(item.title)}</strong>
        ${systemTag}
        ${removeBtn}
        ${noteHtml}
      </li>
    `;
  }).join("")}</ul>`;
}

function buildPassedScenariosHtml(siteScenarios, externalList, favoriteIds = [], options = {}) {
  const siteList = Array.isArray(siteScenarios) ? siteScenarios : [];
  const external = Array.isArray(externalList) ? externalList : [];
  const total = siteList.length + external.length;
  const isOwner = !!options.isOwner;
  const siteHtml = buildScenariosHtml("PL通過済シナリオ", siteList, favoriteIds, "", {
    gmableIds: options.gmableIds,
    showGmableToggle: options.showGmableToggle,
    bareContent: true
  });

  const emptySite = siteList.length === 0
    ? `<p style="text-align: center; color: #a0aec0; margin: 0 0 8px;">部内卓の通過履歴はまだありません。</p>`
    : "";

  const addBtn = isOwner
    ? `<button type="button" id="btn-open-external-passed-modal" class="btn-secondary" style="font-size: 0.8rem; padding: 4px 10px;">部活外を追加</button>`
    : "";

  return `
    <section class="player-scenarios" style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); height: 100%; display: flex; flex-direction: column;">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
        <span>PL通過済シナリオ (<span id="passed-scenarios-count">${total}</span>)本</span>
        ${addBtn}
      </h2>
      <div style="padding: 10px 0; overflow-y: auto; flex-grow: 1; max-height: 320px;">
        ${emptySite}
        ${siteHtml}
        <div style="margin-top: ${siteList.length ? "12px" : "0"}; padding-top: ${siteList.length ? "10px" : "0"}; border-top: ${siteList.length ? "1px dashed #e2e8f0" : "none"};">
          <div id="external-passed-list">${buildExternalPassedListHtml(external, isOwner)}</div>
        </div>
      </div>
    </section>
  `;
}

function buildScenariosHtml(title, scenariosList, favoriteIds = [], fallbackText = "通過履歴はまだありません。", options = {}) {
  const gmableIds = Array.isArray(options.gmableIds) ? options.gmableIds.map(String) : [];
  const showGmableToggle = !!options.showGmableToggle;
  const bareContent = !!options.bareContent;
  let contentHtml = "";

  if (scenariosList && scenariosList.length > 0) {
    contentHtml = `<ul style="margin: 0; padding-left: 0; list-style-type: none; color: #4a5568; line-height: 1.8;">`;
    scenariosList.forEach(s => {
      const isFav = favoriteIds.includes(String(s.id));
      const starColor = isFav ? "#ecc94b" : "#e2e8f0";
      const isGmable = gmableIds.includes(String(s.id));
      const systemTag = s.system ? `<span style="font-size: 0.75rem; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; margin-left: 5px;">${Utils.escapeHtml(s.system)}</span>` : "";
      const gmableBtn = showGmableToggle
        ? `<button type="button" class="btn-gmable-scenario ${isGmable ? "is-active" : ""}" data-id="${Utils.escapeHtml(String(s.id))}" title="このシナリオをGM可能にする">${isGmable ? "GM可✓" : "GM可"}</button>`
        : (isGmable ? `<span class="gmable-badge">GM可</span>` : "");

      contentHtml += `
        <li style="display: flex; align-items: center; gap: 8px; padding: 2px 0;">
          <button class="btn-fav-scenario" data-id="${s.id}" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; color: ${starColor}; padding: 0; outline: none;">★</button>
          ${gmableBtn}
          <a href="../scenarios/detail.html?id=${encodeURIComponent(s.id)}" style="font-weight: bold; color: inherit; text-decoration: none;">${Utils.escapeHtml(s.title)}</a>${systemTag}
        </li>`;
    });
    contentHtml += `</ul>`;
  } else if (!bareContent) {
    contentHtml = `<p style="text-align: center; color: #a0aec0;">${Utils.escapeHtml(fallbackText)}</p>`;
  }

  if (bareContent) return contentHtml;

  return `
    <section class="player-scenarios" style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); height: 100%; display: flex; flex-direction: column;">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px;">${Utils.escapeHtml(title)} ${scenariosList ? `(${scenariosList.length})本` : ''}</h2>
      <div style="padding: 10px 0; overflow-y: auto; flex-grow: 1; max-height: 250px;">
        ${contentHtml}
      </div>
    </section>
  `;
}

function buildGmableScenariosHtml(registeredRows, candidateRows, isOwner) {
  const registered = Array.isArray(registeredRows) ? registeredRows : [];

  let listHtml = "";
  if (registered.length > 0) {
    listHtml = `<div id="gmable-scenarios-list"><ul style="margin: 0; padding: 0; list-style: none;">${registered.map(s => `
      <li style="display: flex; align-items: center; gap: 8px; padding: 4px 0;">
        ${isOwner
          ? `<button type="button" class="btn-gmable-scenario is-active" data-id="${Utils.escapeHtml(String(s.id))}">GM可✓</button>`
          : `<span class="gmable-badge">GM可</span>`}
        <a href="../scenarios/detail.html?id=${encodeURIComponent(s.id)}">${Utils.escapeHtml(s.title || s.id)}</a>
        ${s.system ? `<span style="font-size: 0.75rem; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${Utils.escapeHtml(s.system)}</span>` : ""}
      </li>
    `).join("")}</ul></div>`;
  } else {
    listHtml = `<div id="gmable-scenarios-list"><p class="u-muted" style="text-align: center;">まだ GM可能シナリオがありません。「登録」ボタンまたはシナリオ詳細から追加できます。</p></div>`;
  }

  const registerBtn = isOwner
    ? `<button type="button" id="btn-open-gmable-modal" class="btn-secondary" style="font-size: 0.8rem; padding: 4px 10px;">登録</button>`
    : "";

  return `
    <section class="player-gmable-scenarios" style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2 style="margin-top: 0; font-size: 1.2rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
        <span>GM可能シナリオ (<span id="gmable-scenarios-count">${registered.length}</span>)</span>
        ${registerBtn}
      </h2>
      <p class="u-muted" style="font-size: 0.85rem; margin-top: 0;">ここに登録したシナリオで、他プレイヤーが「気になる」を押すと Discord DM で通知されます。</p>
      ${listHtml}
    </section>
  `;
}

async function saveBulkAvailability() {
  const playerId = Utils.getQueryParam("id");
  if (!playerId) return;

  const container = document.getElementById("bulk-input-container");
  const payload = Utils.collectAvailabilityChanges(container, playerId);

  const modal = document.getElementById("availability-modal");

  if (payload.length === 0) {
     alert("変更された予定データがありません。");
     if (modal) modal.close();
     return;
  }

  try {
    const res = await Utils.apiPost("player_availability", payload);
    if (res) {
      if (modal) modal.close();
      alert("予定を保存しました！");
      location.reload();
    }
  } catch (err) {
    console.error("一括保存エラー:", err);
    alert("保存に失敗しました: " + err.message);
  }
}

async function renderBulkInputGrid(playerId, year, month) {
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

Utils.domReady(main);
})();