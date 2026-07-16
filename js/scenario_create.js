"use strict";

Utils.domReady(async () => {
    const form = document.getElementById("scenario-form");
    if (!form) return;

    await Utils.initAuthAndHeader('common-nav', '../');

    const imageFileInput = document.getElementById("image-file");
    const imagePreviewContainer = document.getElementById("image-preview-container");
    const imagePreview = document.getElementById("image-preview");

    if (imageFileInput && imagePreviewContainer && imagePreview) {
        imageFileInput.addEventListener("change", () => {
            const file = imageFileInput.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePreview.src = e.target.result;
                    imagePreviewContainer.style.display = "block";
                };
                reader.readAsDataURL(file);
            } else {
                imagePreview.src = "";
                imagePreviewContainer.style.display = "none";
            }
        });
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector("button[type=submit]");
        submitBtn.disabled = true;

        const fd = new FormData(form);

        let imageUrl = null;
        if (imageFileInput && imageFileInput.files[0]) {
            try {
                const originalFile = imageFileInput.files[0];
                const compressedBlob = await Utils.compressAndResizeImage(originalFile);

                const formData = new FormData();
                const fileBaseName = originalFile.name.includes('.') 
                    ? originalFile.name.substring(0, originalFile.name.lastIndexOf('.')) 
                    : originalFile.name;
                const fileName = `${fileBaseName}.webp`;

                formData.append("file", compressedBlob, fileName);
                formData.append("type", "scenario");

                const uploadRes = await fetch(`${API_BASE}/api/upload`, {
                    method: "POST",
                    body: formData
                });
                
                if (uploadRes.ok) {
                    const uploadResult = await uploadRes.json();
                    imageUrl = uploadResult.url;
                } else {
                    console.error("画像アップロード失敗:", await uploadRes.text());
                }
            } catch (err) {
                console.error("画像アップロードエラー:", err);
            }
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