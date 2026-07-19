/// 現行 Web（`js/utils.js`）と同じ R2 公開URL・デフォルト画像。
abstract final class FctzsImages {
  static const r2Public =
      'https://pub-b7f067c04745438680b7ed7adebbba6b.r2.dev';

  static const characterDefault =
      '$r2Public/_default/character_default.png';

  static const scenarioDefault =
      '$r2Public/_default/scenario_default.webp';

  /// http(s) の絶対URLだけを通す。空・相対・キャラID（c-xxx）は null。
  static String? absoluteUrl(dynamic value) {
    final text = value?.toString().trim() ?? '';
    if (text.isEmpty || text == '—') return null;
    if (text.startsWith('http://') || text.startsWith('https://')) return text;
    return null;
  }
}
