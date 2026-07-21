# FCTZS-TRPG データベース概要

最終更新: 2026-07-19  
関連ファイル: [`DB_info.txt`](./DB_info.txt)（列の機械可読一覧）、[`database-optimization.md`](./database-optimization.md)（移行・検証SQL）、[`security-checklist.md`](./security-checklist.md)（RLS/GRANT監査）、[`platform-roadmap.md`](./platform-roadmap.md) / [`api-contract.md`](./api-contract.md)（公開基盤・API正本）  
ファイル名: `DB-overview.md`（GitHub Pages / ツール互換のため ASCII 名）

この文書は、Supabase `public` スキーマの**全体像**を人間向けにまとめたものです。列の詳細は `DB_info.txt` を参照してください。

---

## 1. ひとことで言うと

TRPGコミュニティ向けの会員・キャラクター・シナリオ・卓（ラン）・セッション・募集・コメントを管理するDBです。

- **読み取り**は公開寄り（一覧・詳細の参照）
- **書き込み**は所有者（`user_id` / Auth）単位のRLS
- 卓の参加者は移行中、`runs` 上の配列が正で、junctionテーブルへ同期する
- シナリオ「気になる」は `scenario_interests`、GM可能・部活外通過は `player_profiles` 上の列で持つ

---

## 2. ドメインの中心構造

```text
players ──┬── player_profiles
          │     (推し / GM可能 / 部活外通過)
          ├── player_availability
          └── characters ──┬── character_attributes
                           ├── character_skills
                           └── character_scenarios ── scenarios
                                                        │
scenarios ◄── scenario_interests (気になる)              │
     ▲                                                  │
     └────────────────────────── runs ──────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
              run_players        run_characters       sessions
              (参加者junction)   (参加キャラjunction)   (日程・配信)
                    │                  │
                 players           characters

recruitments ── recruitment_applicants
     │
  scenarios / players

comments  … 任意対象 (run / session / recruitment / scenario / character / player / post)
posts     … なりきりチャット投稿
```

### 関係の読み方

| 関係 | 意味 |
|------|------|
| プレイヤー → キャラクター | 1人が複数キャラを所持（`characters.player_id`）。`user_id` は作成者（編集権限） |
| シナリオ → 卓 | 1シナリオに複数卓（`runs.scenario_id`） |
| 卓 → セッション | 1卓に複数回の開催予定/実績（`sessions.run_id`） |
| 卓 ↔ プレイヤー | 書込みは `runs.player_ids[]` が正。**読取 `/api/runs` は `run_players` 優先**（空なら配列フォールバック） |
| 卓 ↔ キャラクター | 書込みは `runs.characters[]` が正。**読取 `/api/runs` は `run_characters` 優先** |
| キャラ ↔ シナリオ | プレイ履歴・紐付け（`character_scenarios`） |
| プレイヤー ↔ シナリオ（気になる） | `scenario_interests`。初回ON時に GM可能登録者へ DM |
| 募集 | GM/PL募集。応募は `recruitment_applicants` |

---

## 3. テーブル一覧（本体）

| テーブル | 役割 |
|----------|------|
| **players** | プレイヤーマスタ。`player_id` が業務キー。`user_id` で Auth と紐付け |
| **player_profiles** | アイコン・自己紹介・志向・ティア・推し・GM可能・部活外通過 |
| **player_availability** | 日付×時間帯の空き状況 |
| **characters** | キャラクター本体（`player_id`=所有者、`user_id`=作成者） |
| **character_attributes** | 能力値・感情などキー値属性 |
| **character_skills** | スキル値 |
| **character_scenarios** | キャラが関わったシナリオ |
| **scenarios** | シナリオマスタ（傾向・人数・所要時間など） |
| **scenario_interests** | シナリオへの「気になる」（player×scenario） |
| **runs** | 卓。タイトル・GM・状態・参加者配列を保持 |
| **run_players** | 卓×プレイヤーの順序付きjunction（同期先） |
| **run_characters** | 卓×キャラクターの順序付きjunction（同期先） |
| **sessions** | セッション（開始時刻・状態・配信/リプレイURL） |
| **recruitments** | 募集投稿 |
| **recruitment_applicants** | 募集への応募 |
| **comments** | 各画面へのコメント |
| **posts** | なりきりチャット投稿 |
| **system_attributes** | システム別属性マスタ |
| **system_skill_bases** | システム別スキル基礎値マスタ |

---

## 4. ビュー一覧

### 4.1 軽量ビュー（最適化後・API推奨）

いずれも `security_invoker = true`（基底テーブルのRLSを尊重）。

| ビュー | 用途 | 主な出力 |
|--------|------|----------|
| **character_last_session** | キャラの最終セッション日 | `character_id`, `last_session_start`（`run_characters` 経由） |
| **recruitment_list** | 募集カード一覧 | 募集列 + 主催者名 + シナリオ名・画像 + 応募数 |
| **scenario_summary** | シナリオ一覧 | 一覧表示列 + `run_count`（長文descriptionなし） |
| **recent_comments_with_names** | 最近コメント | コメント列 + 解決済み `target_name` |
| **player_detail_summary** | プレイヤー詳細ヘッダ | プロフィール要約 + `character_count` |

### 4.2 レガシービュー（互換・フォールバック）

| ビュー | 用途 |
|--------|------|
| **scenario_list** | 旧シナリオ一覧（集計列あり。詳細文も含む） |
| **session_list** | 旧セッション一覧 |
| **character_skill_list** / **character_skill_basecalc** | スキル表示用 |
| **v_character_details** / **v_character_list** | キャラ集約（巨大JSONを含む） |

新規画面は軽量ビュー優先。レガシーはフォールバックや詳細用途に残しています。

---

## 5. 配列とjunction（移行中の重要ルール）

```text
書き込み経路:
  アプリ → runs.player_ids / runs.characters を更新
           └─ trigger → run_players / run_characters を洗い替え

読み取り経路（推奨）:
  一覧・結合 → run_players / run_characters / 軽量ビュー
```

| 項目 | 内容 |
|------|------|
| 正（互換期間） | `runs.player_ids`, `runs.characters` |
| 同期先 | `run_players`, `run_characters` |
| 順序 | `sort_order`（配列の ordinality。同一IDは先頭のみ） |
| 所有者列 | junction の `user_id` は DEFAULT `auth.uid()`。同期時は親runの `user_id` をコピー |

配列列は互換期間中は削除しません。正をjunctionへ逆転させるのは別フェーズです。

---

## 6. トリガー / 関数

| 名前 | 種別 | 内容 |
|------|------|------|
| **sync_run_arrays_to_junctions** | FUNCTION | `runs` の配列変更をjunctionへ同期 |
| **trg_runs_sync_arrays_to_junctions** | TRIGGER | `runs` の INSERT / `player_ids`・`characters`・`user_id` UPDATE 後に上記関数を実行 |

注意: トリガー有効化前に、通常のrun書込みが利用者JWT（authenticated）で行われるWorker/フロントをデプロイしておく必要があります。anonにはjunctionのDML権限がありません。

---

## 7. インデックス（最適化で追加）

| インデックス | 対象 | 目的 |
|--------------|------|------|
| `idx_sessions_status_start` | `sessions(status, start)` | 状態×日程の絞り込み |
| `idx_characters_player_id` | `characters(player_id)` | プレイヤー配下キャラ一覧 |
| `idx_character_scenarios_scenario_character` | `character_scenarios(scenario_id, character_id)` | シナリオ側からの参照 |
| `idx_recruitments_owner_status_created` | `recruitments(owner_player_id, status, created_at DESC)` | 自分の募集一覧 |
| `idx_posts_created_at_desc` | `posts(created_at DESC)` | 新着投稿 |
| `uq_players_user_id_not_null` | `players(user_id) WHERE user_id IS NOT NULL` | Auth紐付けの一意性 |

これ以外にも、主キー・既存の `sessions(run_id, …)` / `runs(scenario_id, status)` / `comments(target_type, target_id, …)` などがあります。詳細な作成手順は `database-optimization.md` を参照してください。

---

## 8. 外部キー・制約（移行関連）

| 制約 | 内容 |
|------|------|
| `run_players` / `run_characters` | 親 `runs` は CASCADE、プレイヤー/キャラは RESTRICT |
| `sessions_run_id_fkey_restrict` | `sessions.run_id` → `runs.id` ON DELETE RESTRICT（移行で追加しうる） |
| `runs_scenario_id_fkey_restrict` | `runs.scenario_id` → `scenarios.id` ON DELETE RESTRICT（同上） |

既存FKと同列に二重になる場合があるため、適用時は名前を確認してから整理します。

---

## 9. 権限・RLSの考え方

| 操作 | 方針 |
|------|------|
| SELECT | 主要業務テーブルは公開SELECT（一覧閲覧） |
| INSERT/UPDATE/DELETE | 所有者のみ。親テーブルは `user_id = auth.uid()`、子は親行の所有者を `EXISTS` で確認 |
| Discord / 内部同期 | Worker の Service Role。利用者JWTとは分離 |
| junction | SELECTは公開。DMLは authenticated（trigger経由含む） |

ポリシー名は `fctzs_*` プレフィックス。詳細SQLは `database-optimization.md` Phase C。

---

## 10. APIとの対応（ざっくり）

| 画面・用途 | 主な参照先 |
|------------|------------|
| ホーム / コメント | `runs`/`sessions`（予定）、`player_profiles`（カレンダー）、`recent_comments_with_names` |
| なりきりチャット | `posts` |
| プレイヤー詳細 | `player_detail_summary` + `player_profiles`（推し/GM可能/部活外） |
| キャラ一覧/詳細 | `characters` (+ attributes/skills)、`character_last_session` |
| シナリオ一覧 | `scenario_summary` |
| シナリオ詳細（気になる） | `scenario_interests` + `player_profiles.gmable_scenario_ids` |
| 卓・セッション | `runs`, `sessions` |
| 募集一覧 | `recruitment_list` |
| 予定合わせ | `player_availability`（年月スコープ） |

Worker は列限定 `select=` と IDスコープを基本とし、`select=*` の全件結合を避けます。

---

## 11. `DB_info.txt` のメンテ方法

1. Supabase Dashboard → SQL Editor で `DB_info.txt` 先頭の再取得SQLを実行する  
2. 結果をCSV/表でコピーし、`docs/DB_info.txt` の表部分を置き換える  
3. スキーマ変更（テーブル/ビュー/列追加）があったら、この概要の該当節もあわせて更新する  
4. 大きな移行手順そのものは `database-optimization.md` に残す（本ファイルは「地図」、最適化文書は「工事手順書」）

---

## 12. 用語メモ

| 用語 | 意味 |
|------|------|
| 卓 / run | シナリオを遊ぶ単位。参加者・キャラ・複数セッションを束ねる |
| junction | 多対多を行で持つ中間表（配列の正規化先） |
| 軽量ビュー | 画面カード用に必要列だけ返すビュー |
| security_invoker | ビュー実行時に呼び出し側の権限・RLSを使う設定 |
| 互換期間 | 配列を正のまま、junctionとAPIを段階導入している期間 |
