# Web / Flutter 機能パリティ表

最終更新: 2026-07-22  
方針: **Web = 管理・書込みの正本**。Flutter の追加パリティは **DB / Worker / Web のタスク完了後**（[`platform-roadmap.md`](./platform-roadmap.md)）。

凡例: ○ あり / △ 一部 / × なし / — 対象外

| 画面・操作 | Web | Flutter | 備考 |
|------------|-----|---------|------|
| ホーム（公開予定・進行中） | ○ | ○ | |
| ホーム（個人ダッシュボード） | ○ | ○ | 要 Discord ログイン＋ players 連携。カレンダー編集は未移植 |
| プレイヤー自己連携（未連携バナー） | ○ | △ | Web は `GET /api/me` / `POST /api/me/link`。Flutter は `/api/players` のクライアント照合のみ（下記） |
| スケジュール照合（閲覧） | ○ | ○ | ホーム AppBar → `ScheduleMatchScreen` |
| 予定の一括入力 | ○ | ○ | ホームの予定カレンダー（昼/夜）。照合画面は閲覧専用のまま |
| プレイヤー一覧（レーダー） | ○ | ○ | |
| プレイヤー詳細（閲覧） | ○ | ○ | |
| プレイヤープロフィール編集 | ○ | × | |
| キャラ一覧・詳細（閲覧） | ○ | ○ | |
| キャラ作成・編集 | ○ | × | |
| シナリオ一覧・詳細（閲覧） | ○ | ○ | |
| シナリオ作成・編集 | ○ | × | |
| 気になる（トグル） | ○ | ○ | 要 Discord ログイン＋ players 連携 |
| セッション（卓）一覧・詳細 | ○ | ○ | 進行中／終了済タブ |
| 卓・開催の作成編集 | ○ | × | |
| 募集一覧・詳細（閲覧） | ○ | ○ | |
| 募集作成 | ○ | × | |
| 募集応募／取消 | ○ | ○ | 要 Discord ログイン＋ players 連携 |
| コメント閲覧 | ○ | ○ | 詳細画面 |
| コメント投稿 | ○ | ○ | シナリオ／キャラ／PL／卓／募集 |
| なりチャ（BBS） | ○ | × | |
| Discord ログイン | ○ | ○ | Flutter Web は `fctzs-flutter` の Redirect URL 登録が必要 |
| R2 画像アップロード | ○ | × | |
| favicon / 用語（没入・主体） | ○ | ○ | [`play-style-glossary.md`](./play-style-glossary.md) |

## 意図的な差分（バグではない）

1. Flutter の書込みはコメント・気になる・募集応募まで。作成系・プロフィール編集・なりチャは未移植  
2. Web ヘッダの Schedule / なりチャは Flutter 下部タブに載せない（ホームから照合へ）  
3. 部活外シナリオのログインなし編集は Web のみの方針を維持  
4. 募集の削除・延長は Web のみ（募集主向け管理）  
5. **プレイヤー本人解決:** Web は `GET /api/me`（サーバー側 Discord 自動連携・claim 候補）と `POST /api/me/link`（自己選択連携）が正本。Flutter は従来どおり `GET /api/players` を取得してクライアント側で `user_id` / `discord_id` 照合する（`/api/me` 未使用）。パリティ再開時は Web と同じ `/api/me` へ寄せる候補

## Discord ログイン（Flutter Web）セットアップ

1. Supabase Dashboard → Authentication → URL Configuration  
2. Redirect URLs に以下を追加  
   - `https://fctzs-flutter.daruji.workers.dev/`  
   - ローカル: `http://localhost:56123/`（`flutter run -d chrome --web-port=56123` と揃える）  
3. Flutter Web を再デプロイ（`docs/flutter-web-deploy.md`）  
4. ホーム「ログイン」→ Discord → 気になる／応募／コメント投稿  

※ ローカルでログインすると、戻り先は localhost のまま（古い公開版へ飛ばない）。

## 次に埋める候補（Flutter 再開後）

DB / Worker / Web の残り（Phase C RLS 等）が片付いてから着手する。配列列 DROP は **適用済（2026-07-21）**。

1. プレイヤー本人解決を `/api/me` / `/api/me/link` に揃える  
2. プロフィール編集  
3. キャラ／シナリオ作成  
4. なりチャ（BBS）  
