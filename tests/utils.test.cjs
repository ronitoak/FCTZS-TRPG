/**
 * ブラウザ依存を最小DOMで置き換え、Utilsの純粋ロジックとDOM契約を固定する。
 * 外部APIや実ブラウザには接続しない。
 */
const test = require("node:test");
const assert = require("node:assert/strict");

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.values = new Set();
  }

  add(...names) {
    names.forEach(name => this.values.add(name));
    this.owner._className = [...this.values].join(" ");
  }

  contains(name) {
    return this.values.has(name);
  }

  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
    this.owner._className = [...this.values].join(" ");
  }
}

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this._className = "";
    this.classList = new FakeClassList(this);
  }

  set className(value) {
    this._className = String(value);
    this.classList.values = new Set(this._className.split(/\s+/).filter(Boolean));
  }

  get className() {
    return this._className;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach(child => this.appendChild(child));
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }

  get childElementCount() {
    return this.children.length;
  }

  querySelectorAll(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : null;
    const matches = [];
    const visit = node => {
      node.children.forEach(child => {
        if (className && child.classList.contains(className)) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches;
  }
}

global.HTMLElement = FakeElement;
global.window = global;
global.location = {
  pathname: "/FCTZS-TRPG/index.html",
  search: "",
  reload() {}
};
global.document = {
  readyState: "complete",
  body: new FakeElement("body"),
  createElement: tag => new FakeElement(tag),
  getElementById: () => null
};

require("../js/utils.js");

test("escapeHtmlは危険な記号を既存形式でエスケープする", () => {
  assert.equal(
    Utils.escapeHtml(`<a href="'">&`),
    "&lt;a href=&quot;&#39;&quot;&gt;&amp;"
  );
});

test("シナリオ傾向タグと相性表示は既存HTMLを維持する", () => {
  const scenario = {
    trend_story_chaos: "story",
    trend_avatar_clear: "avatar",
    trend_harmony_active: "active"
  };
  const profile = {
    desire_story: 5,
    desire_avatar: 4,
    desire_active: 3
  };

  assert.equal(Utils.calculateMatchScore(scenario, profile), 2);
  assert.equal(
    Utils.getTrendTagsHtml(scenario),
    '<div class="trend-tags-container" style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; margin-bottom: 8px;"><span class="trend-tag trend-story">物語重視</span><span class="trend-tag trend-avatar">RP・没入</span><span class="trend-tag trend-active">活躍推奨</span></div>'
  );
  assert.deepEqual(Utils.getMatchPresentation(2), {
    cardClass: "match-medium",
    badgeHtml: '<div class="match-badge match-2">好相性！ ★★</div>'
  });
});

test("月間取得範囲はうるう年と月末を正しく扱う", () => {
  assert.deepEqual(Utils.getMonthDateRange(2024, 1), {
    start: "2024-02-01",
    end: "2024-02-29"
  });
});

test("renderCalendarは曜日を含む月間グリッドを生成する", () => {
  const calendar = new FakeElement("div");
  Utils.renderCalendar(calendar, 2026, 6, {
    events: [{ id: "s1", start: "2026-07-17T12:00:00+09:00", title: "テスト卓" }],
    availabilities: [{ target_date: "2026-07-17", time_slot: "night", status: "ok" }],
    highlightMissingAvailability: true,
    getEventHref: event => `/sessions/${event.id}`,
    onDateClick() {}
  });

  assert.equal(calendar.children.length, 42);
  const july17 = calendar.children.find(child => child.dataset.date === "2026-07-17");
  const july18 = calendar.children.find(child => child.dataset.date === "2026-07-18");
  assert.ok(july17);
  assert.equal(july17.classList.contains("date-needs-input"), false);
  assert.equal(july18.classList.contains("date-needs-input"), true);
  assert.ok(july17.children.some(child => child.classList.contains("calendar-session-badge")));
});

test("予定入力グリッドは変更されたスロットだけを保存形式へ変換する", () => {
  const bulk = new FakeElement("div");
  Utils.renderAvailabilityGrid(bulk, 2026, 6, [
    { target_date: "2026-07-01", time_slot: "afternoon", status: "ok" }
  ]);

  assert.equal(bulk.children.length, 31);
  const toggles = bulk.querySelectorAll(".bulk-slot-toggle");
  assert.equal(toggles.length, 62);

  toggles[0].dataset.status = "maybe";
  assert.deepEqual(Utils.collectAvailabilityChanges(bulk, "p1"), [{
    player_id: "p1",
    target_date: "2026-07-01",
    time_slot: "afternoon",
    status: "maybe"
  }]);
});

test("buildNextAndLastByRunIdは未来の最短と過去の最新を選ぶ", () => {
  const now = new Date("2026-07-17T00:00:00Z");
  const sessions = [
    { run_id: "r1", start: "2026-07-16T10:00:00Z", status: "done" },
    { run_id: "r1", start: "2026-07-20T10:00:00Z", status: "scheduled" },
    { run_id: "r1", start: "2026-07-18T10:00:00Z", status: "scheduled" }
  ];
  const result = Utils.buildNextAndLastByRunId(sessions, now);
  assert.equal(result.nextByRunId.get("r1").start, "2026-07-18T10:00:00Z");
  assert.equal(result.lastByRunId.get("r1").start, "2026-07-16T10:00:00Z");
});

test("apiGetWithFallbackは新APIの非2xx時だけ旧APIへ切り替える", async () => {
  window.supabase = {
    auth: {
      async getSession() {
        return { data: { session: null } };
      }
    }
  };
  const requested = [];
  global.fetch = async url => {
    requested.push(String(url));
    if (String(url).includes("/api/new_view")) {
      return { ok: false, status: 404, text: async () => "not found" };
    }
    return { ok: true, status: 200, text: async () => '[{"id":"legacy"}]' };
  };

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const rows = await Utils.apiGetWithFallback("new_view", "legacy_table");
    assert.deepEqual(rows, [{ id: "legacy" }]);
    assert.equal(requested.length, 2);
  } finally {
    console.warn = originalWarn;
  }
});

test("未ログインの書込みは通信前に明確なエラーになる", async () => {
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("呼ばれない");
  };
  await assert.rejects(
    Utils.apiPost("comments", { body: "test" }),
    /この操作にはDiscordログインが必要です。/
  );
  assert.equal(fetchCalled, false);
});

test("最新リクエストtokenだけが有効になる", () => {
  const guard = Utils.createLatestRequestToken();
  const first = guard.issue();
  const second = guard.issue();
  assert.equal(guard.isLatest(first), false);
  assert.equal(guard.isLatest(second), true);
});

test("予定比較adapterは未入力と全員空きを旧表示形式へ変換する", () => {
  const results = Utils.aggregateScheduleMatches([
    { player_id: "p1", target_date: "2026-07-01", time_slot: "night", status: "ok", players: { player_name: "一郎" } },
    { player_id: "p2", target_date: "2026-07-01", time_slot: "night", status: "ok", players: { player_name: "二郎" } }
  ], ["p1", "p2"], 2026, 6);

  assert.deepEqual(results["2026-07-01_night"], {
    color: "green",
    symbol: "○",
    label: "全員空き"
  });
  assert.equal(results["2026-07-02_night"].label, "未入力: 2人");
});
