"use strict";

Utils.domReady(() => {
    const form = document.getElementById("scenario-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type=submit]");
        submitBtn.disabled = true;

        // テーブル定義に基づいたペイロード
        // js/scenario_create.js の一部
        const payload = {
            title: form.title.value,
            system: form.system.value,
            author: form.author.value || null, // 直接authorカラムへ
            description: form.description.value || null,
            notes: form.notes.value || null
        };

        try {
            const result = await Utils.apiPost("scenarios", payload);
            alert("シナリオを登録しました");
            // 登録後はトップまたは一覧へ
            location.href = "../index.html"; 
        } catch (err) {
            console.error(err);
            alert("登録失敗: " + err.message);
            submitBtn.disabled = false;
        }
    });
});