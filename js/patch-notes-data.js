"use strict";

// トップと履歴専用画面で内容が食い違わないよう、表示に依存しない変更履歴を単一の正本として提供する。
// type 規約:
//   release / feature / fix … トップ最新5件と詳細ページの両方
//   improvement … インフラ・内部改善など。詳細ページのみ（トップ非表示）
window.PATCH_NOTES = Object.freeze([
  {
    date: "2026-07-21",
    type: "improvement",
    title: "キャラ詳細の巨大ビューAPIを410で退役",
    detail: "GET /api/character_details は410 Goneになりました。詳細は characters / character_attributes / character_skill_list / character_scenarios の分割取得を使います。Flutterも同様に切り替え済みです。Worker・Flutter再デプロイ後に有効です。"
  },
  {
    date: "2026-07-21",
    type: "fix",
    title: "壊れた画像URLをクリア",
    detail: "R2上に存在しない404画像URL（キャラ22件・シナリオ3件）をNULLにし、デフォルト画像へフォールバックするようにしました。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "キャラ一覧の最終セッション取得を軽量化",
    detail: "キャラクター一覧の並び替え用に、毎回卓・セッション全件を取らず character_last_session ビューだけを使うようにしました（ビュー取得失敗時のみ従来の補完）。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "卓参加者の保存をjunctionのみに",
    detail: "卓の作成・更新で runs の参加者配列列へは書かず、run_players / run_characters だけを更新するようにしました。API応答の player_ids / characters は従来どおり junction から組み立てます。Worker再デプロイ後に有効です。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "卓参加者の読取をjunctionのみに",
    detail: "卓一覧・フィルタ・権限・通知で配列列へのフォールバックをやめ、run_players / run_characters だけを参照するようにしました。APIの応答形（player_ids / characters）は従来どおりです。Worker再デプロイ後に有効です。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "配列→junctionトリガー無効化手順を追加",
    detail: "Workerが卓参加者をjunction明示書込みする前提で、旧DBトリガーをDROPする手動SQLをdocsに追加しました。適用はSupabase Dashboardから行ってください。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "卓メンバー判定をjunction優先に",
    detail: "セッション通知・卓の編集権限・予定一日占有で、参加者判定を run_players 優先（配列はフォールバック）に切り替えました。Worker再デプロイ後に有効です。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "卓の参加者保存をjunction明示書込みへ",
    detail: "卓の作成・更新時に run_players / run_characters をWorkerが直接洗い替えるようにしました（配列列は互換のため同時更新）。APIレスポンス形式は従来どおりです。Worker再デプロイ後に有効です。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "旧シナリオ・セッション一覧APIを410で退役",
    detail: "GET /api/scenario_list と /api/session_list は410 Goneになりました。一覧は scenario_summary / sessions を使ってください。DBビューのDROPは任意の手動SQLです。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "シナリオ・セッション一覧を軽量APIへ一本化",
    detail: "Webのシナリオ一覧を scenario_summary、セッション／スケジュールを sessions のみ参照するよう変更しました（旧 scenario_list / session_list はフォールバック廃止）。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "スマホ版: 詳細画面の画像が見切れないよう調整",
    detail: "シナリオ・キャラ・卓・募集などの詳細で、カバー画像を画面内に収めて全体が見えるように表示するよう修正しました。"
  },
  {
    date: "2026-07-21",
    type: "feature",
    title: "スマホ版: 大量更新",
    detail: "スマホ版にいろんな機能を追加（web版の再現）"
  },  {
    date: "2026-07-21",
    type: "improvement",
    title: "スマホ版: 予定カレンダーと一括入力",
    detail: "スマホ版ホーム（ログイン＋プレイヤー連携時）に予定カレンダーを追加し、昼/夜の空きを一括入力・保存できるようにしました。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "スマホ版: ホームに個人ダッシュボード",
    detail: "Discordログインかつプレイヤー連携があると、スマホ版ホームに自分の次回予定・自分の募集・プレイスタイルおすすめを表示します。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "スマホ版: ログイン後に古い画面へ飛ばないよう修正",
    detail: "Discordログインの戻り先を、公開URL固定ではなくいま開いている画面のオリジンに合わせるようにしました（ローカル検証時など）。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "スマホ版: コメント展開・気になる・募集応募",
    detail: "スマホ版でシナリオ以外の詳細にもコメント投稿できるようにし、気になるトグルと募集の応募／取消にも対応しました。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "スマホ版: Discordログインとシナリオコメント投稿",
    detail: "スマホ版でDiscord（Supabase Auth）ログインができるようになり、シナリオ詳細からコメントを投稿できるようになりました。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "おすすめシナリオから経験済みを除外",
    detail: "ホームのプレイスタイルおすすめから、PL通過済・GM経験済・部活外として登録したシナリオを除くようにしました。"
  },
  {
    date: "2026-07-21",
    type: "feature",
    title: "ホームにおすすめシナリオを表示",
    detail: "ログイン後のダッシュボードに、自分のプレイスタイル傾向と合うシナリオ（最大5件）を表示するようにしました。募集中のものは「募集中」リンクも出ます。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "卓一覧APIの参加者をjunction優先で組み立て",
    detail: "GET /api/runs が run_players / run_characters から参加者と参加キャラを組み立てるようになりました（レスポンス形式は従来互換）。Worker再デプロイ後に有効です。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "画像差し替え時に旧R2ファイルを削除",
    detail: "キャラ・シナリオ編集で新しい画像をアップロードしたとき、差し替え前のR2オブジェクトを自動削除するようにしました（デフォルト画像は対象外）。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "画像URLの404監査を実施",
    detail: "キャラ・シナリオの公開画像URLを一括確認し、R2上で404の25件を洗い出しました。壊れたURLのNULL化用SQLを docs に用意しています。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "プレイスタイル用語の統一と改善ドキュメント整備",
    detail: "シナリオ傾向の「活躍推奨」を「主体推奨」に揃え、用語表・画像監査手順・データ掃除SQL・Web/Flutterパリティ表などを docs に追加しました。ホームのプレイヤー未連携時の案内も分かりやすくしました。"
  },
  {
    date: "2026-07-21",
    type: "improvement",
    title: "スマホ版にスケジュール照合を追加",
    detail: "ホーム画面から複数プレイヤーの空き予定を月単位で照合できるようにしました（ゲスト閲覧・書込みなし）。"
  },
  {
    date: "2026-07-19",
    type: "feature",
    title: "プレイスタイル用語を没入欲・主体欲に変更",
    detail: "プレイヤーのプレイスタイル傾向で、化身欲を没入欲、活躍欲を主体欲に名称変更しました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "スマホ版プレイヤー一覧をアイコン＋レーダー表示に変更",
    detail: "プレイヤー一覧を名前・アイコン（icon_url のキャラ画像）・プレイスタイルのレーダーチャート表示にし、IDは出さないようにしました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "スマホ版セッション一覧を進行中／終了済タブに変更",
    detail: "セッション一覧の上部タブを「進行中」「終了済」にし、完了（done）の卓は終了済、それ以外は進行中に表示するようにしました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "スマホ版下部タブの並びをWebヘッダに合わせた",
    detail: "下部ナビゲーションを「ホーム・キャラ・セッション・シナリオ・募集・PL」の順にし、特設サイトのヘッダと同じ並びにしました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "スマホ版 Webのfaviconを特設サイトと統一",
    detail: "スマホ版のファビコンを、特設サイトと同じ画像に揃えました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "スマホ版卓カバーをシナリオ画像へフォールバック",
    detail: "卓（セッション）に専用画像がないとき、紐づくシナリオのカバーを表示し、それもなければデフォルト画像を使うようにしました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "スマホ版一覧をカードグリッド表示に変更",
    detail: "プレイヤー・シナリオ・セッション・募集・キャラクターの一覧を、画面幅に応じて1行に複数並ぶタイル表示にしました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "部活外シナリオをログインなしで登録可能にした",
    detail: "プレイヤー詳細の「部活外を追加」を、Discordログインなしで利用できるようにしました。どのプレイヤーの部活外履歴も追加・削除できます。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "Flutter Webで一部のR2画像が表示されない問題を修正",
    detail: "CanvasKitの画像バイト取得に失敗するケース向けに、特設サイトのimgタグと同様のHTML要素表示へフォールバックするようにしました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "Flutterで欠落したR2画像をデフォルト画像にフォールバック",
    detail: "DB上のimage_urlが404のとき、特設サイトと同様にR2のデフォルト画像へ切り替えるようにしました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "Flutter WebからR2画像が読めないCORSエラーを解消",
    detail: "公開アセット用R2バケットにGET/HEAD向けCORSを設定し、fctzs-flutter など別オリジンからの画像表示を可能にしました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "スマホ版閲覧アプリの見た目を特設サイトに寄せた",
    detail: "配色・カード・ステータスバッジ・見出し下線など、css/style.css のトーンに合わせて一覧と詳細のUIを調整しました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "Flutter Webを別Workerで限定公開できる経路を追加",
    detail: "Worker fctzs-flutter（https://fctzs-flutter.daruji.workers.dev/）向けのビルド・デプロイと GitHub Actions を用意しました。手順は docs/flutter-web-deploy.md です。"
  },
  {
    date: "2026-07-19",
    type: "feature",
    title: "全員の部活外通過シナリオを一覧で確認できるようにした",
    detail: "シナリオ一覧の「部活外シナリオ」ボタンから、各メンバーが登録した部活外の通過シナリオをまとめて確認できます。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "スマホ版並列クライアントで特設サイトをゲスト閲覧できるようにした",
    detail: "ホーム・プレイヤー・シナリオ・セッション・募集・キャラクターの一覧/詳細と相互遷移を実装しました（書込み・ログインは未対応）。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "スマホ版並列クライアントの最初のマイルストーンを開始",
    detail: "flutter/fctzs_app を作成し、API Base表示・Players/Scenarios一覧・プルリフレッシュ（ゲストGET）まで実装しました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "プラットフォーム方針ドキュメントを現行構成に整合",
    detail: "ロードマップのPhase進捗とWorkers静的配信の表記を揃え、移行締めのコード完了と運用チェックを分離しました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "リポジトリ内の不要ファイルを整理",
    detail: "空ファイル・実験用Worker雛形・陳腐化した仕様ドラフト・未使用スクリプトを削除し、readmeの構成説明を現行運用に合わせました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "システム説明書とDBドキュメントを現行スキーマに更新",
    detail: "docs.htmlとdocs配下を、気になる・GM可能・部活外通過・ホーム再配置・セッション検索・代理作成を含む現行仕様とinformation_schema準拠の列一覧に合わせました。"
  },
  {
    date: "2026-07-19",
    type: "improvement",
    title: "プレイヤー詳細の部活外・GM可能登録をモーダル化",
    detail: "PL通過済の「部活外を追加」とGM可能の「登録」を見出し横ボタン＋モーダル操作に変更し、一覧を見やすくしました。"
  },
  {
    date: "2026-07-19",
    type: "feature",
    title: "部活外シナリオを個人の通過済として登録できるようにした",
    detail: "プレイヤー詳細のPL通過済に、サイト未登録のシナリオを個人履歴として追加・削除できます。シナリオ一覧には出ません。"
  },

  {
    date: "2026-07-19",
    type: "fix",
    title: "キャラクター作成時の所有者上書きを修正",
    detail: "代理作成でプレイヤー欄を別メンバーにしても作成者へ上書きされていました。フォームで選んだ所有者を保存し、編集権限は作成者の Auth に紐づけます。"
  },

  {
    date: "2026-07-19",
    type: "feature",
    title: "シナリオの「気になる」とGM可能登録を追加",
    detail: "シナリオ詳細で気になるをトグルでき、初回ON時のみGM可能登録者へDiscord DMで通知します。プレイヤー詳細とシナリオ詳細からGM可能シナリオを登録できます。"
  },

  {
    date: "2026-07-18",
    type: "feature",
    title: "Homeダッシュボードのレイアウトを再配置",
    detail: "ログイン後は左に自分の次回予定・募集、右に予定カレンダー、下段に部全体の直近予定と進行中セッションを表示するようにしました。"
  },

  {
    date: "2026-07-18",
    type: "feature",
    title: "セッション一覧に検索・絞り込みを追加",
    detail: "キーワード（タイトル・シナリオ・GM・PL）、ステータス、システムで卓一覧をリアルタイムに絞り込めるようにしました。"
  },

  {
    date: "2026-07-18",
    type: "improvement",
    title: "卓情報更新の Forbidden を緩和",
    detail: "Service Role 経由の卓更新で Auth所有者のみ許可していたため、GM・参加プレイヤーや user_id 未設定の旧卓が更新できませんでした。メンバー編集を許可し、未所有卓は更新時に所有者を紐付けます。"
  },
  {
    date: "2026-07-17",
    type: "improvement",
    title: "調整さんCSVインポートの Upsert 重複エラーを修正",
    detail: "複数プレイヤー分の予定をログイン中本人のIDへ上書きしていたため複合キーが衝突していました。本人のみ／複数人取込を分岐し、同一キーは後勝ちで畳むよう修正しました。"
  },
  {
    date: "2026-07-17",
    type: "improvement",
    title: "卓作成時の run_players RLS エラーを解消",
    detail: "junction同期トリガーが利用者JWTのRLSに掛かっていたため、所有者の Auth UUID を明示したうえで Service Role 経由で卓を作成・更新するよう変更しました。"
  },
  {
    date: "2026-07-17",
    type: "fix",
    title: "ログイン本人のプレイヤー解決を Auth UUID / Discord ID で分離",
    detail: "Auth UUID と Discord snowflake を混同しないよう、players.user_id と players.discord_id を別経路で解決し、未連携時は discord_id から user_id を自動紐付けします。募集応募はログイン中の自分のみになりました。"
  },
  {
    date: "2026-07-17",
    type: "fix",
    title: "ココフォリア出力をシステム別の参照形式へ寄せた",
    detail: "能力値キー解決、公式の技能→能力マップ（複数対応時は最大判定値）、CoC7のCC記法・MOV・幸運、システム別の参照形式へ寄せました。"
  },
  {
    date: "2026-07-17",
    type: "fix",
    title: "新規作成後の遷移先を詳細画面へ統一",
    detail: "卓・シナリオの新規作成後にトップや一覧へ戻っていた遷移を、作成したレコードの詳細画面へ変更しました。キャラクター・募集は従来どおり詳細へ遷移します。"
  },
  {
    date: "2026-07-17",
    type: "fix",
    title: "セッション通知に観戦希望者メンションを反映",
    detail: "定期Discord通知が sessions.notes の観戦希望（<@ID>）を読んでいなかったため、Cron通知のメンションと埋め込み【観戦】へ含めるよう修正しました。"
  },
  {
    date: "2026-07-17",
    type: "improvement",
    title: "Cloudflare Pages移行とFlutter並列の土台を整備",
    detail: "公開URLをsite-configへ集約し、Pages用dist生成とデプロイworkflowを追加しました。Worker API契約とFlutter学習用スケルトンもdocs/flutterへ用意しています。"
  },
  {
    date: "2026-07-17",
    type: "improvement",
    title: "書込み認証と所有権の防御を強化",
    detail: "全書込みのJWT実検証、募集・応募・予定の所有者サーバー解決、予定一日占有のWorker化、R2アップロード制限、nightreign API削除を行いました。DiscordはテストWebhook切替に対応しています。"
  },
  {
    date: "2026-07-17",
    type: "improvement",
    title: "認証・データ所有権の境界を強化",
    detail: "画像アップロードのJWT検証、卓参加者だけの通過履歴同期、関連データの所有者RLS、予定比較の通信競合、募集削除時の応募CASCADEを修正しました。"
  },
  {
    date: "2026-07-17",
    type: "improvement",
    title: "DB/API軽量化へ段階移行",
    detail: "一覧・詳細・予定比較を必要範囲だけ取得する新APIへ切り替え、junction/ビュー/RLSの手動適用手順と、ビュー未適用時の旧APIフォールバックを整備しました。"
  },
  {
    date: "2026-07-17",
    type: "improvement",
    title: "プロジェクト内部を保守しやすく整理",
    detail: "画面間の共通処理を集約し、各画面とAPIの処理を責務ごとに整理しました。表示・操作・API仕様は維持したまま、回帰チェックと意図コメントも整備しています。"
  },
  {
    date: "2026-07-17",
    type: "feature",
    title: "ホーム画面をマイダッシュボード化",
    detail: "ログイン中は自分の次回セッション、募集状況、予定未入力日が分かるミニカレンダーを表示し、ホームから予定を入力できるようにしました。各画面のカレンダー描画も共通化しています。"
  },
  {
    date: "2026-07-17",
    type: "feature",
    title: "パッチノート専用ページを公開",
    detail: "Gitのコミット差分から過去の更新内容を日付別に整理し、トップの最新5件と全履歴を共通データから確認できるようにしました。"
  },
  {
    date: "2026-07-17",
    type: "feature",
    title: "募集カードに傾向マッチング機能を追加",
    detail: "新着順を維持したまま、ログイン中プレイヤーの欲求と募集シナリオの傾向から相性を判定してマッチ度を表示します。"
  },
  {
    date: "2026-07-16",
    type: "fix",
    title: "予定比較結果のカレンダー表示を修正",
    detail: "予定比較とシナリオ一覧で重複していたバッジのスタイルを分離し、比較結果の○・△・×が各日付に表示されるようにしました。"
  },
  {
    date: "2026-07-16",
    type: "feature",
    title: "シナリオ一覧に高度な検索とマッチ度表示を追加",
    detail: "人数、時間、ロスト率、プレイスタイル傾向による検索と、自身の欲求パラメータに基づく相性表示に対応しました。"
  },
  {
    date: "2026-07-16",
    type: "feature",
    title: "シナリオ情報を構造化",
    detail: "プレイ人数、プレイ時間、ロスト率を登録・編集できるようにし、一覧画面の絞り込み条件として利用できるようにしました。"
  },
  {
    date: "2026-07-15",
    type: "feature",
    title: "プレイスタイル傾向タグを追加",
    detail: "シナリオごとに3軸のプレイスタイル傾向を登録し、シナリオ一覧・詳細画面・募集カードで確認できるようにしました。"
  },
  {
    date: "2026-07-14",
    type: "improvement",
    title: "モーダル操作とスマートフォン表示を改善",
    detail: "各画面のモーダルをネイティブなdialog要素へ統一し、背景スクロールのロック、ESCキーでの終了、スマートフォン向け表示に対応しました。"
  },
  {
    date: "2026-07-14",
    type: "improvement",
    title: "各詳細画面のUIを調整",
    detail: "キャラクター、シナリオ、セッション、募集、予定比較の情報配置と操作性を見直しました。"
  },
  {
    date: "2026-07-13",
    type: "improvement",
    title: "画像アップロード時の自動圧縮に対応",
    detail: "キャラクター、シナリオ、卓の画像を送信前にブラウザ側でリサイズし、WebP形式へ圧縮するようにしました。"
  },
  {
    date: "2026-07-12",
    type: "feature",
    title: "セッション観戦希望機能を追加",
    detail: "セッション詳細画面から観戦希望を登録し、対象メンバーをDiscordの定期通知へ含められるようにしました。"
  },
  {
    date: "2026-07-12",
    type: "feature",
    title: "詳細画面のコメント機能を拡充",
    detail: "キャラクター、シナリオ、セッション、募集、プレイヤーの各詳細画面でコメントを投稿・表示できるようにしました。"
  },
  {
    date: "2026-07-12",
    type: "improvement",
    title: "システム使用手順書を更新",
    detail: "画像アップロード、プレイヤー詳細、コメントなどの新機能をdocs.htmlへ反映しました。"
  },
  {
    date: "2026-07-12",
    type: "fix",
    title: "セッション詳細画面の表示エラーを修正",
    detail: "JavaScriptの重複宣言による構文エラーを解消し、セッション詳細を正常に表示できるようにしました。"
  },
  {
    date: "2026-07-11",
    type: "release",
    title: "FCTZS TRPG部 特設サイト開発チームにエージェントAIが参加",
    detail: "AIが開発チームに参加し、面倒なものも簡単に作れるようになりました。"
  },
  {
    date: "2026-07-11",
    type: "feature",
    title: "Cloudflare R2画像アップロードに対応",
    detail: "キャラクター、シナリオ、卓のカバー画像をWeb画面から直接アップロードし、各詳細画面へ反映できるようにしました。"
  }
]);
