"use strict";

Utils.domReady(() => {
    const form = document.getElementById("scenario-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type=submit]");
        submitBtn.disabled = true;

        // FormDataを使えば、HTMLに存在しない要素を読もうとしてもエラーにならず null を返します
        const fd = new FormData(form);
        const payload = {
            title: fd.get("title"),
            system: fd.get("system"),
            author: fd.get("author") || null,
            description: fd.get("description") || null,
            notes: fd.get("notes") || null
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