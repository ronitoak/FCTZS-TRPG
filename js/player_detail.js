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
    let externalPassed = Utils.normalizeExternalPassedScenarios(player.external_passed_scenarios, { withId: true, max: 100 });

    const { player: viewerPlayer } = await Utils.getCurrentUserPlayerContext({
      loadProfile: false
    });
    const isOwner = !!(viewerPlayer && String(viewerPlayer.player_id) === String(playerId));
    const canEditExternalPassed = true;

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
      <div class="player-detail-grid player-detail-grid--flex">
        <div class="player-detail-sidebar">
          ${buildPlayerProfileHtml(player)}
        </div>
        <div id="schedule-wrapper" class="player-detail-schedule-col">
        </div>
      </div>

      ${buildCustomAreaHtml(player, characters, scenarios)}

      <div class="player-detail-block-spaced">
        ${buildMyCharactersHtml(myCharacters, favChars)}
      </div>

      <div class="player-detail-grid player-detail-grid--columns">
        ${buildPassedScenariosHtml(passedScenarios, externalPassed, favScenarios, {
          gmableIds: gmableScenarios,
          showGmableToggle: isOwner,
          canEditExternalPassed
        })}
        ${buildScenariosHtml("GM経験済シナリオ", gmScenarios, favScenarios, "GM履歴はまだありません。", {
          gmableIds: gmableScenarios,
          showGmableToggle: isOwner
        })}
      </div>

      <div class="player-detail-block-spaced">
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

    async function updateExternalPassedSilent() {
      try {
        await Utils.apiPublicPatch("player_profiles/external_passed", {
          player_id: playerId,
          external_passed_scenarios: externalPassed
        });
        hasProfileRecord = true;
        Utils.showToast("部活外の通過シナリオを更新しました！");
      } catch (err) {
        console.error("部活外通過シナリオの保存エラー", err);
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
      listEl.innerHTML = buildExternalPassedListHtml(externalPassed, canEditExternalPassed);
    }

    function refreshGmableRegisteredList() {
      const gmableList = document.getElementById("gmable-scenarios-list");
      const countEl = document.getElementById("gmable-scenarios-count");
      const rows = gmableCandidates.filter(s => gmableScenarios.includes(String(s.id)));
      if (countEl) countEl.textContent = String(rows.length);
      if (!gmableList) return;
      gmableList.innerHTML = rows.length
        ? `<ul class="player-list-plain">${rows.map(s => `
            <li class="player-list-row">
              ${isOwner
                ? `<button type="button" class="btn-gmable-scenario is-active" data-id="${Utils.escapeHtml(String(s.id))}">GM可✓</button>`
                : `<span class="gmable-badge">GM可</span>`}
              <a href="../scenarios/detail.html?id=${encodeURIComponent(s.id)}">${Utils.escapeHtml(s.title || s.id)}</a>
            </li>
          `).join("")}</ul>`
        : `<p class="u-muted player-empty-muted--center">まだ GM可能シナリオがありません。「登録」ボタンまたはシナリオ詳細から追加できます。</p>`;
    }

    function refreshGmableModalCandidates() {
      const container = document.getElementById("gmable-modal-candidates");
      if (!container) return;
      const unregistered = gmableCandidates.filter(s => !gmableScenarios.includes(String(s.id)));
      container.innerHTML = unregistered.length
        ? `<ul class="player-list-plain">${unregistered.map(s => `
            <li class="player-list-row player-list-row--bordered">
              <button type="button" class="btn-gmable-scenario" data-id="${Utils.escapeHtml(String(s.id))}">GM可</button>
              <span class="player-scenario-link-title">${Utils.escapeHtml(s.title || s.id)}</span>
              ${s.system ? `<span class="player-system-tag">${Utils.escapeHtml(s.system)}</span>` : ""}
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
          favCharBtn.classList.remove("is-fav");
        } else {
          favChars.push(id);
          favCharBtn.classList.add("is-fav");
        }
        updateFavoritesSilent("favorite_character_ids", favChars);
      }

      const favScenarioBtn = e.target.closest(".btn-fav-scenario");
      if (favScenarioBtn) {
        e.preventDefault();
        const id = favScenarioBtn.getAttribute("data-id");
        if (favScenarios.includes(id)) {
          favScenarios = favScenarios.filter(x => x !== id);
          favScenarioBtn.classList.remove("is-fav");
        } else {
          favScenarios.push(id);
          favScenarioBtn.classList.add("is-fav");
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
        const id = String(removeExternalBtn.getAttribute("data-id") || "");
        if (!id) return;
        externalPassed = externalPassed.filter(item => String(item.id) !== id);
        refreshExternalPassedList();
        updateExternalPassedSilent();
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
      const titleInput = externalForm.querySelector('[name="external_title"]');
      const systemInput = externalForm.querySelector('[name="external_system"]');
      const noteInput = externalForm.querySelector('[name="external_note"]');
      const title = (titleInput?.value || "").trim();
      if (!title) {
        Utils.showToast("シナリオ名を入力してください。", "error");
        return;
      }
      if (externalPassed.length >= 100) {
        Utils.showToast("部活外シナリオは最大100件までです。", "info");
        return;
      }
      externalPassed = [
        ...externalPassed,
        {
          id: Utils.createExternalPassedId(),
          title,
          system: (systemInput?.value || "").trim(),
          note: (noteInput?.value || "").trim()
        }
      ];
      refreshExternalPassedList();
      externalForm.reset();
      await updateExternalPassedSilent();
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
          Utils.showToast("プロフィールを更新しました！", "success");
          location.reload();
        } catch (err) {
          console.error(err);
          Utils.showToast("更新に失敗しました: " + err.message, "error");
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
    <section class="player-profile player-section-card">
      <div class="player-profile-header">
        <img src="${profileImage}" alt="アイコン" class="player-profile-avatar">
        <div>
          <h1 class="player-profile-name">${Utils.escapeHtml(player.player_name)}</h1>
          <p class="player-profile-id">ID: ${Utils.escapeHtml(player.player_id)}</p>
        </div>
      </div>

      <div class="player-profile-chart-wrap">
        <canvas id="desire-radar-chart"></canvas>
      </div>

      <button id="btn-edit-profile" class="btn-edit-profile-floating">📝</button>
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
      <section class="player-custom-area player-section-card player-section-card--center player-detail-block-spaced">
        <h2 class="player-section-title">最強キャラランキング</h2>
        <p class="player-empty-muted player-empty-muted--bold">まだ最強キャラが登録されていません。</p>
      </section>
    `;
  }

  let charsHtml = "";
  if (favChars.length > 0) {
    charsHtml = `
      <h3 class="player-subsection-title">最強キャラ</h3>
      <div class="player-fav-chars-grid">
        ${favChars.map(c => `
          <a href="../character/detail.html?id=${c.id}" class="player-fav-char-link">
            <img src="${Utils.getCharacterImagePath(c.id, c.image_url)}" onerror="this.onerror=null; this.src='${Utils.DEFAULT_CHARACTER_IMAGE}';" class="player-fav-char-img">
            <span class="player-fav-char-name">${Utils.escapeHtml(c.name)}</span>
          </a>
        `).join("")}
      </div>
    `;
  }

  let scensHtml = "";
  if (favScens.length > 0) {
    scensHtml = `
      <h3 class="player-subsection-title player-subsection-title--scenarios">最強シナリオ</h3>
      <div class="player-fav-scenarios-grid">
        ${favScens.map(s => `
          <a href="../scenario/detail.html?id=${s.id}" class="player-fav-scenario-tag">
            ★ ${Utils.escapeHtml(s.title)}
          </a>
        `).join("")}
      </div>
    `;
  }

  return `
    <section class="player-custom-area player-section-card player-detail-block-spaced">
      <h2 class="player-section-title">最強キャラランキング</h2>
      ${charsHtml}
      ${scensHtml}
    </section>
  `;
}

function buildMyCharactersHtml(characters, favoriteIds = []) {
  const charsList = characters.length > 0
    ? characters.map(c => {
        const isFav = favoriteIds.includes(String(c.id));
        return `
        <div class="player-char-row">
          <button class="btn-fav-char${isFav ? " is-fav" : ""}" data-id="${c.id}">★</button>
          <a href="../character/detail.html?id=${c.id}" class="player-char-link-row">
            <img src="${Utils.getCharacterImagePath(c.id, c.image_url)}" onerror="this.onerror=null; this.src='${Utils.DEFAULT_CHARACTER_IMAGE}';" class="player-char-thumb">
            <span class="player-char-name">${Utils.escapeHtml(c.name)}</span>
            <span class="player-char-job">${Utils.escapeHtml(c.job || '')}</span>
            <span class="player-char-system-tag">${Utils.escapeHtml(c.system || '')}</span>
          </a>
        </div>
      `}).join("")
    : "<p class='player-empty-muted'>作成したキャラクターはまだありません。</p>";

  return `
    <section class="player-characters player-section-card">
      <h2 class="player-section-title">作成キャラクター</h2>
      <div class="player-char-list">
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

function buildExternalPassedListHtml(externalList, canEdit) {
  const items = Array.isArray(externalList) ? externalList : [];
  if (items.length === 0) {
    return `<p class="u-muted player-empty-muted--note">部活外の登録はまだありません。</p>`;
  }
  return `<ul class="player-list-plain">${items.map(item => {
    const systemTag = item.system
      ? `<span class="player-system-tag">${Utils.escapeHtml(item.system)}</span>`
      : "";
    const noteHtml = item.note
      ? `<small class="u-muted player-external-passed-note">${Utils.escapeHtml(item.note)}</small>`
      : "";
    const removeBtn = canEdit
      ? `<button type="button" class="btn-remove-external-passed" data-id="${Utils.escapeHtml(item.id)}" title="削除">削除</button>`
      : "";
    return `
      <li class="player-list-row player-list-row--wrap">
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
  const canEditExternalPassed = !!options.canEditExternalPassed;
  const siteHtml = buildScenariosHtml("PL通過済シナリオ", siteList, favoriteIds, "", {
    gmableIds: options.gmableIds,
    showGmableToggle: options.showGmableToggle,
    bareContent: true
  });

  const emptySite = siteList.length === 0
    ? `<p class="player-empty-muted player-empty-muted--site-gap">部内卓の通過履歴はまだありません。</p>`
    : "";

  const addBtn = canEditExternalPassed
    ? `<button type="button" id="btn-open-external-passed-modal" class="btn-secondary btn-compact-secondary">部活外を追加</button>`
    : "";

  const dividerClass = siteList.length
    ? "player-external-passed-divider"
    : "player-external-passed-divider player-external-passed-divider--first";

  return `
    <section class="player-scenarios player-section-card player-section-card--column">
      <h2 class="player-section-title player-section-title--split">
        <span>PL通過済シナリオ (<span id="passed-scenarios-count">${total}</span>)本</span>
        ${addBtn}
      </h2>
      <div class="player-scenarios-scroll player-scenarios-scroll--md">
        ${emptySite}
        ${siteHtml}
        <div class="${dividerClass}">
          <div id="external-passed-list">${buildExternalPassedListHtml(external, canEditExternalPassed)}</div>
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
    contentHtml = `<ul class="player-list-plain player-list-plain--indented">`;
    scenariosList.forEach(s => {
      const isFav = favoriteIds.includes(String(s.id));
      const isGmable = gmableIds.includes(String(s.id));
      const systemTag = s.system ? `<span class="player-system-tag player-system-tag--spaced">${Utils.escapeHtml(s.system)}</span>` : "";
      const gmableBtn = showGmableToggle
        ? `<button type="button" class="btn-gmable-scenario ${isGmable ? "is-active" : ""}" data-id="${Utils.escapeHtml(String(s.id))}" title="このシナリオをGM可能にする">${isGmable ? "GM可✓" : "GM可"}</button>`
        : (isGmable ? `<span class="gmable-badge">GM可</span>` : "");

      contentHtml += `
        <li class="player-list-row player-list-row--compact">
          <button class="btn-fav-scenario${isFav ? " is-fav" : ""}" data-id="${s.id}">★</button>
          ${gmableBtn}
          <a href="../scenarios/detail.html?id=${encodeURIComponent(s.id)}" class="player-scenario-link">${Utils.escapeHtml(s.title)}</a>${systemTag}
        </li>`;
    });
    contentHtml += `</ul>`;
  } else if (!bareContent) {
    contentHtml = `<p class="player-empty-muted player-empty-muted--center">${Utils.escapeHtml(fallbackText)}</p>`;
  }

  if (bareContent) return contentHtml;

  return `
    <section class="player-scenarios player-section-card player-section-card--column">
      <h2 class="player-section-title">${Utils.escapeHtml(title)} ${scenariosList ? `(${scenariosList.length})本` : ''}</h2>
      <div class="player-scenarios-scroll player-scenarios-scroll--sm">
        ${contentHtml}
      </div>
    </section>
  `;
}

function buildGmableScenariosHtml(registeredRows, candidateRows, isOwner) {
  const registered = Array.isArray(registeredRows) ? registeredRows : [];

  let listHtml = "";
  if (registered.length > 0) {
    listHtml = `<div id="gmable-scenarios-list"><ul class="player-list-plain">${registered.map(s => `
      <li class="player-list-row">
        ${isOwner
          ? `<button type="button" class="btn-gmable-scenario is-active" data-id="${Utils.escapeHtml(String(s.id))}">GM可✓</button>`
          : `<span class="gmable-badge">GM可</span>`}
        <a href="../scenarios/detail.html?id=${encodeURIComponent(s.id)}">${Utils.escapeHtml(s.title || s.id)}</a>
        ${s.system ? `<span class="player-system-tag">${Utils.escapeHtml(s.system)}</span>` : ""}
      </li>
    `).join("")}</ul></div>`;
  } else {
    listHtml = `<div id="gmable-scenarios-list"><p class="u-muted player-empty-muted--center">まだ GM可能シナリオがありません。「登録」ボタンまたはシナリオ詳細から追加できます。</p></div>`;
  }

  const registerBtn = isOwner
    ? `<button type="button" id="btn-open-gmable-modal" class="btn-secondary btn-compact-secondary">登録</button>`
    : "";

  return `
    <section class="player-gmable-scenarios player-section-card">
      <h2 class="player-section-title player-section-title--split">
        <span>GM可能シナリオ (<span id="gmable-scenarios-count">${registered.length}</span>)</span>
        ${registerBtn}
      </h2>
      <p class="u-muted player-gmable-hint">ここに登録したシナリオで、他プレイヤーが「気になる」を押すと Discord DM で通知されます。</p>
      ${listHtml}
    </section>
  `;
}

async function saveBulkAvailability() {
  const playerId = Utils.getQueryParam("id");
  if (!playerId) return;

  const modal = document.getElementById("availability-modal");
  try {
    const saved = await Utils.saveAvailabilityFromGrid(
      document.getElementById("bulk-input-container"),
      playerId,
      { successMessage: "予定を保存しました！" }
    );
    if (!saved) {
      modal?.close();
      return;
    }
    modal?.close();
    location.reload();
  } catch (err) {
    console.error("一括保存エラー:", err);
    Utils.showToast("保存に失敗しました: " + err.message, "error");
  }
}

async function renderBulkInputGrid(playerId, year, month) {
  await Utils.loadAndRenderAvailabilityGrid(
    document.getElementById("bulk-input-container"),
    playerId,
    year,
    month,
    { monthLabel: document.getElementById("bulk-month-label") }
  );
}

Utils.domReady(main);
})();