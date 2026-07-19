/// 現行 Web（`js/utils.js`）と同じ R2 公開URL・デフォルト画像。
abstract final class FctzsImages {
  static const r2Public =
      'https://pub-b7f067c04745438680b7ed7adebbba6b.r2.dev';

  static const characterDefault =
      '$r2Public/_default/character_default.png';

  static const scenarioDefault =
      '$r2Public/_default/scenario_default.png';

  /// http(s) の絶対URLだけを通す。空・相対・キャラID（c-xxx）は null。
  static String? absoluteUrl(dynamic value) {
    final text = value?.toString().trim() ?? '';
    if (text.isEmpty || text == '—') return null;
    if (text.startsWith('http://') || text.startsWith('https://')) return text;
    return null;
  }

  /// 卓カバー: 卓画像 → シナリオ画像 → デフォルト（Web の sessions と同様）。
  static String resolveRunCover({
    dynamic runImageUrl,
    dynamic scenarioImageUrl,
  }) {
    return absoluteUrl(runImageUrl) ??
        absoluteUrl(scenarioImageUrl) ??
        scenarioDefault;
  }

  /// シナリオ一覧から id → image_url の辞書を作る。
  static Map<String, String?> scenarioImageMap(Iterable<dynamic> scenarios) {
    final map = <String, String?>{};
    for (final row in scenarios) {
      if (row is! Map) continue;
      final id = row['id']?.toString();
      if (id == null || id.isEmpty) continue;
      map[id] = absoluteUrl(row['image_url']);
    }
    return map;
  }

  static String coverForRun(
    Map<String, dynamic> run,
    Map<String, String?> scenarioImages,
  ) {
    final scenarioId = run['scenario_id']?.toString();
    return resolveRunCover(
      runImageUrl: run['image_url'],
      scenarioImageUrl: scenarioId == null ? null : scenarioImages[scenarioId],
    );
  }

  /// キャラ画像: image_url（絶対URL）→ id が URL ならそれ → デフォルト。
  static String characterImage({
    dynamic characterId,
    dynamic imageUrl,
  }) {
    return absoluteUrl(imageUrl) ??
        absoluteUrl(characterId) ??
        characterDefault;
  }
}
