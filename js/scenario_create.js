"use strict";

// シナリオ登録フォームの画像確認と入力値整形を行い、一覧・詳細で扱える共通形式へ保存する。
(() => {

Utils.domReady(async () => {
    const form = document.getElementById("scenario-form");
    if (!form) return;

    await Utils.initAuthAndHeader('common-nav', '../');

    const imageFileInput = document.getElementById("image-file");
    const imagePreviewContainer = document.getElementById("image-preview-container");
    const imagePreview = document.getElementById("image-preview");

    Utils.setupImagePreview(imageFileInput, imagePreview, imagePreviewContainer);

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type=submit]");
        submitBtn.disabled = true;

        const fd = new FormData(form);

        let imageUrl = null;
        if (imageFileInput?.files[0]) {
            imageUrl = await Utils.uploadImageAsWebp(imageFileInput.files[0], "scenario");
        }

        const payload = {
            title: fd.get("title"),
            system: fd.get("system"),
            author: fd.get("author") || null,
            description: fd.get("description") || null,
            notes: fd.get("notes") || null,
            image_url: imageUrl,
            trend_story_chaos: fd.get("trend_story_chaos") || null,
            trend_avatar_clear: fd.get("trend_avatar_clear") || null,
            trend_harmony_active: fd.get("trend_harmony_active") || null,
            min_players: fd.get("min_players") ? parseInt(fd.get("min_players"), 10) : 1,
            max_players: fd.get("max_players") ? parseInt(fd.get("max_players"), 10) : 4,
            play_time_minutes: fd.get("play_time_minutes") ? parseInt(fd.get("play_time_minutes"), 10) : 180,
            lost_rate: fd.get("lost_rate") || 'low'
        };

        try {
            const result = await Utils.apiPost("scenarios", payload);
            const row = Array.isArray(result) ? result[0] : result;
            Utils.showToast("シナリオを登録しました", "success");
            if (row?.id) {
                location.href = `detail.html?id=${encodeURIComponent(row.id)}`;
            } else {
                location.href = "index.html";
            }
        } catch (err) {
            console.error(err);
            Utils.showToast("登録失敗: " + err.message, "error");
            submitBtn.disabled = false;
        }
    });
});
})();