# Web / Flutter 機能パリティ表

最終更新: 2026-07-21  
方針: **Web = 管理・書込みの正本**、**Flutter = スマホ閲覧 → 段階的に書込み**（[`platform-roadmap.md`](./platform-roadmap.md)）

凡例: ○ あり / △ 一部 / × なし / — 対象外

| 画面・操作 | Web | Flutter | 備考 |
|------------|-----|---------|------|
| ホーム（公開予定・進行中） | ○ | ○ | |
| ホーム（個人ダッシュボード） | ○ | ○ | Discordログイン＋players 連携。カレンダー編集は未移植 |
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

## Discord ログイン（Flutter Web）セットアップ

1. Supabase Dashboard → Authentication → URL Configuration  
2. Redirect URLs に以下を追加  
   - `https://fctzs-flutter.daruji.workers.dev/`  
   - ローカル: `http://localhost:56123/`（`flutter run -d chrome --web-port=56123` と揃える）  
3. Flutter Web を再デプロイ（`docs/flutter-web-deploy.md`）  
4. ホーム「ログイン」→ Discord → 気になる／応募／コメント投稿  

※ ローカルでログインすると、戻り先は localhost のまま（古い公開版へ飛ばない）。

## 次に埋める候補

1. プロフィール編集  
2. キャラ／シナリオ作成  
3. なりチャ（BBS）  
