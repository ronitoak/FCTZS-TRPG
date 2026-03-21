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

document.getElementById("character-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const form = e.target;

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
    return;
  }

  const res = await fetch("/api/character", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const text = await res.text();

  let result;
    try {
    result = JSON.parse(text);
    } catch (e) {
    console.error("parse error:", text);
    alert("サーバーから不正なレスポンス");
    return;
    }

    if (!res.ok) {
    console.error(result);
    alert("作成失敗");
    return;
    }

    // 配列じゃない場合も考慮
    const row = Array.isArray(result) ? result[0] : result;

    if (!row?.id) {
    console.error("invalid response:", result);
    alert("ID取得失敗");
    return;
    }

    location.href = `/character/detail.html?id=${row.id}`;
});