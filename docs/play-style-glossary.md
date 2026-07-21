# プレイスタイル用語表

最終更新: 2026-07-21  
Web（`js/utils.js` / `player/detail.html`）と Flutter（レーダー・詳細）の表示名の正本。

## プレイヤー欲求（`player_profiles`）

| DB カラム | 表示名 | レーダー短縮 | 説明（編集UI） |
|-----------|--------|--------------|----------------|
| `desire_story` | 物語欲 | 物語 | 物語の起伏・ドラマを楽しむ |
| `desire_avatar` | 没入欲 | 没入 | キャラの感情をRPで表現する |
| `desire_harmony` | 協調欲（詳細では調和欲表記あり） | 協調 | 他PCとの掛け合い・卓の空気 |
| `desire_chaos` | 混沌欲 | 混沌 | 予定外・事故や脱線を面白がる |
| `desire_clear` | 攻略欲 | 攻略 | 難所突破・システム的有利 |
| `desire_active` | 主体欲 | 主体 | 主人公のように見せ場を作る |

レーダー軸順（Chart / Flutter 共通）: 物語 → 没入 → 協調 → 混沌 → 攻略 → 主体

## シナリオ傾向（`scenarios`）

| カラム | 値 | 表示タグ |
|--------|-----|----------|
| `trend_story_chaos` | `story` | 物語重視 |
| `trend_story_chaos` | `chaos` | 混沌歓迎 |
| `trend_avatar_clear` | `avatar` | RP・没入 |
| `trend_avatar_clear` | `clear` | 攻略重視 |
| `trend_harmony_active` | `harmony` | 協調重視 |
| `trend_harmony_active` | `active` | 主体推奨 |

プレイヤーの「主体欲」とシナリオの「主体推奨」は同じ軸（`desire_active` / `trend_harmony_active=active`）に対応する。

## アイコン

| 項目 | 内容 |
|------|------|
| DB カラム | `player_profiles.icon_url`（歴史的名称） |
| 実体 | **キャラクター ID**（URL ではない） |
| UI ラベル | 「アイコンキャラ」 |
| 将来案 | `icon_character_id` へリネーム（互換期間で両方保持） |

## 変更時のルール

1. 本ファイルを先に更新する  
2. Web: `js/utils.js` の `TREND_TAG_DEFINITIONS` / `renderRadarChart`、`player/detail.html`  
3. Flutter: `desire_radar_chart.dart`、プレイヤー詳細の KvTile  
4. シナリオ作成・詳細・一覧のラジオ／チェックラベル  
5. パッチノート（`js/patch-notes-data.js`）に利用者向け or improvement を追記  
