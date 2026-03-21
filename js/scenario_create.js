"use strict";

Utils.domReady(() => {
    const form = document.getElementById("scenario-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type=submit]");
        submitBtn.disabled = true;

        const payload = {
            title: form.title.value,
            system: form.system.value,
            author: form.author.value || null,
            description: form.description.value || null,
            notes: form.notes.value || null
        };

        try {
            await Utils.apiPost("scenarios", payload);
            alert("シナリオを登録しました");
            location.href = "index.html"; // シナリオ一覧へ
        } catch (err) {
            console.error(err);
            alert("登録失敗: " + err.message);
            submitBtn.disabled = false;
        }
    });
});