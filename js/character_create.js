"use strict";
Utils.domReady(() => {
    function toNull(v) {
        if (v == null) return null;
        const s = String(v).trim();
        return s === "" ? null : s;
    }

    function toNumberOrNull(v) {
        if (v === "" || v == null) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    const form = document.getElementById("character-form");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector("button[type=submit]");
        submitBtn.disabled = true;

        const data = {
            name: toNull(form.name.value),
            player: toNull(form.player.value),
            system: toNull(form.system.value),
            job: toNull(form.job.value),
            age: toNumberOrNull(form.age.value),
            gender: toNull(form.gender.value),
            height: toNumberOrNull(form.height.value),
            weight: toNumberOrNull(form.weight.value),
            origin: toNull(form.origin.value),
            memo: toNull(form.memo.value),
        };

        if (!data.name) {
            alert("名前は必須");
            submitBtn.disabled = false;
            return;
        }

        try {
            const result = await Utils.apiPost("character", data);

            const row = Array.isArray(result) ? result[0] : result;

            if (!row?.id) {
                console.error("invalid response", result);
                alert("作成成功したがID取得失敗");
                submitBtn.disabled = false;
                return;
            }

            location.href = `detail.html?id=${row.id}`;

        } catch (err) {
            console.error(err);
            alert("作成失敗");
            submitBtn.disabled = false;
        }
    });
});