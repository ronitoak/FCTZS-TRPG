// 卓・シナリオ向け感想欄。閲覧は参加者（＋本人投稿）限定。投稿はログイン＋名簿連携者。
"use strict";

(function () {
  function loginPromptHtml() {
    return `
      <div class="impressions__login">
        <p class="impressions__warn">感想の閲覧・投稿には Discord ログインと名簿連携が必要です。</p>
        <p class="u-muted">右上からログインし、ホームの案内に従って名簿と連携してください。</p>
      </div>`;
  }

  function formatBodyHtml(body, isSpoiler) {
    const escaped = Utils.escapeHtml(String(body ?? "")).replaceAll("\n", "<br>");
    if (!isSpoiler) {
      return `<div class="impressions__body">${escaped}</div>`;
    }
    return `
      <div class="impressions__spoiler" data-spoiler>
        <button type="button" class="btn-small btn-secondary impressions__spoiler-btn">ネタバレを表示</button>
        <div class="impressions__body impressions__body--hidden" hidden>${escaped}</div>
      </div>`;
  }

  function bindSpoilerButtons(root) {
    root.querySelectorAll("[data-spoiler]").forEach((wrap) => {
      const btn = wrap.querySelector(".impressions__spoiler-btn");
      const body = wrap.querySelector(".impressions__body");
      if (!btn || !body) return;
      btn.addEventListener("click", () => {
        body.hidden = false;
        btn.hidden = true;
      });
    });
  }

  async function mountForRun(containerId, runId) {
    const root = document.getElementById(containerId);
    if (!root || !runId) return;

    root.innerHTML = `
      <section class="impressions" id="impressions-section">
        <h2>感想</h2>
        <p class="impressions__hint u-muted">この卓の参加者、または同シナリオの通過者（部内・部活外）が感想を読めます。ネタバレは既定で隠します。公開コメント欄とは別です。</p>
        <div class="impressions__msg" aria-live="polite"></div>
        <div class="impressions__form-wrap"></div>
        <ul class="impressions__list"></ul>
      </section>`;

    const msg = root.querySelector(".impressions__msg");
    const formWrap = root.querySelector(".impressions__form-wrap");
    const list = root.querySelector(".impressions__list");

    async function refresh() {
      msg.textContent = "読み込み中…";
      try {
        const session = (await window.supabase?.auth?.getSession())?.data?.session;
        if (!session) {
          formWrap.innerHTML = loginPromptHtml();
          list.innerHTML = "";
          msg.textContent = "";
          return;
        }

        const data = await Utils.apiGet("impressions", `run_id=${encodeURIComponent(runId)}`);
        const items = Array.isArray(data?.items) ? data.items : [];

        if (!data?.can_view_all) {
          msg.textContent = items.length
            ? "この卓の未参加・未通過のため、自分が書いた感想のみ表示しています。"
            : "この卓の参加者／同シナリオ通過者ではありません。投稿はできますが、他の人の感想は通過後に見えます。";
        } else {
          msg.textContent = "";
        }

        formWrap.innerHTML = `
          <form class="impressions__form">
            <div class="impressions__row">
              <label>本文</label>
              <textarea name="body" maxlength="4000" rows="4" required placeholder="プレイの感想など"></textarea>
            </div>
            <label class="impressions__check">
              <input type="checkbox" name="is_spoiler" checked>
              <span>ネタバレを含む（クリックするまで本文を隠す）</span>
            </label>
            <button type="submit" class="btn-primary">感想を投稿</button>
          </form>`;

        const form = formWrap.querySelector("form");
        form.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const body = form.body.value.trim();
          if (!body) {
            msg.textContent = "本文は必須です";
            return;
          }
          if (!form.is_spoiler.checked) {
            if (!confirm("ネタバレ無しとして投稿します。本当によろしいですか？")) return;
          }
          msg.textContent = "投稿中…";
          try {
            await Utils.apiPost("impressions", {
              run_id: runId,
              body,
              is_spoiler: form.is_spoiler.checked
            });
            form.body.value = "";
            form.is_spoiler.checked = true;
            await refresh();
            msg.textContent = "投稿しました";
          } catch (e) {
            msg.textContent = `投稿に失敗しました: ${e.message}`;
          }
        });

        list.innerHTML = "";
        if (items.length === 0) {
          list.innerHTML = `<li class="impressions__empty u-muted">まだ感想はありません</li>`;
        } else {
          for (const item of items) {
            const li = document.createElement("li");
            const when = item.created_at ? new Date(item.created_at).toLocaleString("ja-JP") : "";
            li.innerHTML = `
              <div class="impressions__meta">
                <strong>${Utils.escapeHtml(String(item.author || ""))}</strong>
                <span>${Utils.escapeHtml(when)}</span>
                ${item.is_spoiler ? '<span class="impressions__badge">ネタバレ</span>' : ""}
              </div>
              ${formatBodyHtml(item.body, item.is_spoiler)}`;
            list.appendChild(li);
          }
          bindSpoilerButtons(list);
        }
      } catch (e) {
        const statusMatch = String(e.message || "").match(/^(\d+)/);
        const status = statusMatch ? Number(statusMatch[1]) : 0;
        if (status === 403) {
          formWrap.innerHTML = loginPromptHtml();
          list.innerHTML = "";
          msg.textContent = "名簿連携が必要です。ホームの案内から自分のプレイヤーを連携してください。";
        } else {
          msg.textContent = `読み込み失敗: ${e.message}`;
        }
      }
    }

    await refresh();
  }

  async function mountForScenario(containerId, scenarioId) {
    const root = document.getElementById(containerId);
    if (!root || !scenarioId) return;

    root.innerHTML = `
      <section class="impressions" id="impressions-section">
        <h2>感想</h2>
        <p class="impressions__hint u-muted">通過済み（部内の卓参加・キャラ通過履歴・部活外登録）の人に感想が表示されます。投稿時に卓を選ぶか、「卓なし」を選べます。</p>
        <div class="impressions__msg" aria-live="polite"></div>
        <div class="impressions__form-wrap"></div>
        <ul class="impressions__list"></ul>
      </section>`;

    const msg = root.querySelector(".impressions__msg");
    const formWrap = root.querySelector(".impressions__form-wrap");
    const list = root.querySelector(".impressions__list");

    async function refresh() {
      msg.textContent = "読み込み中…";
      try {
        const session = (await window.supabase?.auth?.getSession())?.data?.session;
        if (!session) {
          formWrap.innerHTML = loginPromptHtml();
          list.innerHTML = "";
          msg.textContent = "";
          return;
        }

        const data = await Utils.apiGet("impressions", `scenario_id=${encodeURIComponent(scenarioId)}`);
        const items = Array.isArray(data?.items) ? data.items : [];
        const runs = Array.isArray(data?.runs) ? data.runs : [];

        msg.textContent = "";

        const runOptions = runs.map((r) => {
          const label = `${r.title || r.id}${r.is_participant ? "（参加）" : ""}`;
          return `<option value="${Utils.escapeHtml(String(r.id))}">${Utils.escapeHtml(label)}</option>`;
        }).join("");

        formWrap.innerHTML = `
          <form class="impressions__form">
            <div class="impressions__row">
              <label>対象の卓</label>
              <select name="run_id">
                <option value="">卓なし（部活外・シナリオ全体）</option>
                ${runOptions}
              </select>
            </div>
            <div class="impressions__row">
              <label>本文</label>
              <textarea name="body" maxlength="4000" rows="4" required placeholder="プレイの感想など"></textarea>
            </div>
            <label class="impressions__check">
              <input type="checkbox" name="is_spoiler" checked>
              <span>ネタバレを含む（クリックするまで本文を隠す）</span>
            </label>
            <button type="submit" class="btn-primary">感想を投稿</button>
          </form>`;

        const form = formWrap.querySelector("form");
        if (form) {
          const preferred = runs.find((r) => r.is_participant);
          if (preferred) form.run_id.value = preferred.id;

          form.addEventListener("submit", async (ev) => {
            ev.preventDefault();
            const selectedRunId = form.run_id.value.trim();
            const body = form.body.value.trim();
            if (!body) {
              msg.textContent = "本文は必須です";
              return;
            }
            if (!form.is_spoiler.checked) {
              if (!confirm("ネタバレ無しとして投稿します。本当によろしいですか？")) return;
            }
            msg.textContent = "投稿中…";
            try {
              const payload = {
                body,
                is_spoiler: form.is_spoiler.checked
              };
              if (selectedRunId) {
                payload.run_id = selectedRunId;
              } else {
                payload.scenario_id = scenarioId;
              }
              await Utils.apiPost("impressions", payload);
              form.body.value = "";
              form.is_spoiler.checked = true;
              await refresh();
              msg.textContent = "投稿しました";
            } catch (e) {
              msg.textContent = `投稿に失敗しました: ${e.message}`;
            }
          });
        }

        list.innerHTML = "";
        if (items.length === 0) {
          list.innerHTML = `<li class="impressions__empty u-muted">表示できる感想はまだありません</li>`;
        } else {
          for (const item of items) {
            const li = document.createElement("li");
            const when = item.created_at ? new Date(item.created_at).toLocaleString("ja-JP") : "";
            let scopeLabel = "";
            if (item.run_title) {
              scopeLabel = ` / ${item.run_title}`;
            } else if (!item.run_id) {
              scopeLabel = " / 卓なし（部活外など）";
            }
            li.innerHTML = `
              <div class="impressions__meta">
                <strong>${Utils.escapeHtml(String(item.author || ""))}</strong>
                <span>${Utils.escapeHtml(when)}${Utils.escapeHtml(scopeLabel)}</span>
                ${item.is_spoiler ? '<span class="impressions__badge">ネタバレ</span>' : ""}
              </div>
              ${formatBodyHtml(item.body, item.is_spoiler)}`;
            list.appendChild(li);
          }
          bindSpoilerButtons(list);
        }
      } catch (e) {
        const statusMatch = String(e.message || "").match(/^(\d+)/);
        const status = statusMatch ? Number(statusMatch[1]) : 0;
        if (status === 403) {
          formWrap.innerHTML = loginPromptHtml();
          list.innerHTML = "";
          msg.textContent = "名簿連携が必要です。";
        } else {
          msg.textContent = `読み込み失敗: ${e.message}`;
        }
      }
    }

    await refresh();
  }

  window.Impressions = {
    mountForRun,
    mountForScenario,
    formatBodyHtml,
    bindSpoilerButtons,
    loginPromptHtml
  };
})();
