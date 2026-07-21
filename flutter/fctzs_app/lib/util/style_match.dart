/// Web のプレイスタイルおすすめ・経験済み除外ロジック相当。
library;

import 'dart:convert';

bool isDefaultDesireProfile(Map<String, dynamic>? profile) {
  if (profile == null) return true;
  const keys = [
    'desire_avatar',
    'desire_active',
    'desire_chaos',
    'desire_story',
    'desire_harmony',
    'desire_clear',
  ];
  return keys.every((key) {
    final raw = profile[key];
    if (raw == null) return true;
    final value = raw is num ? raw.toInt() : int.tryParse(raw.toString());
    return value == null || value == 3;
  });
}

int calculateMatchScore(
  Map<String, dynamic> scenario,
  Map<String, dynamic> profile,
) {
  const axes = <(String, String, String)>[
    ('trend_story_chaos', 'story', 'desire_story'),
    ('trend_story_chaos', 'chaos', 'desire_chaos'),
    ('trend_avatar_clear', 'avatar', 'desire_avatar'),
    ('trend_avatar_clear', 'clear', 'desire_clear'),
    ('trend_harmony_active', 'harmony', 'desire_harmony'),
    ('trend_harmony_active', 'active', 'desire_active'),
  ];
  var score = 0;
  for (final axis in axes) {
    final desire = profile[axis.$3];
    final desireValue = desire is num ? desire.toInt() : int.tryParse('$desire');
    if (scenario[axis.$1]?.toString() == axis.$2 &&
        (desireValue == 4 || desireValue == 5)) {
      score++;
    }
  }
  return score;
}

bool runIncludesPlayer(Map<String, dynamic> run, String playerId) {
  if (run['gm_id']?.toString() == playerId) return true;
  final ids = run['player_ids'];
  if (ids is List) {
    return ids.any((id) => id.toString() == playerId);
  }
  if (ids is String) {
    try {
      // JSON 配列文字列の簡易判定
      if (ids.trimLeft().startsWith('[')) {
        return ids.contains('"$playerId"') || ids.contains(playerId);
      }
    } catch (_) {}
    return ids.contains(playerId);
  }
  return false;
}

Set<String> collectExperiencedScenarioIds({
  required String playerId,
  required List<Map<String, dynamic>> runs,
  Map<String, dynamic>? profile,
}) {
  final excluded = <String>{};
  for (final run in runs) {
    final sid = run['scenario_id']?.toString();
    if (sid == null || sid.isEmpty) continue;
    if (run['gm_id']?.toString() == playerId) {
      excluded.add(sid);
      continue;
    }
    if (run['status']?.toString().toLowerCase() != 'done') continue;
    final ids = run['player_ids'];
    var isPl = false;
    if (ids is List) {
      isPl = ids.any((id) => id.toString() == playerId);
    } else if (ids is String) {
      isPl = ids.contains(playerId);
    }
    if (isPl) excluded.add(sid);
  }

  dynamic external = profile?['external_passed_scenarios'];
  if (external is String) {
    try {
      external = jsonDecode(external);
    } catch (_) {
      external = null;
    }
  }
  if (external is List) {
    for (final item in external) {
      if (item is! Map) continue;
      final id = item['id']?.toString();
      if (id != null && id.isNotEmpty) excluded.add(id);
      final title = item['title']?.toString().trim().toLowerCase() ?? '';
      if (title.isNotEmpty) excluded.add('title:$title');
    }
  }
  return excluded;
}

class StyleMatch {
  StyleMatch({
    required this.scenario,
    required this.score,
    this.openRecruitmentId,
  });

  final Map<String, dynamic> scenario;
  final int score;
  final String? openRecruitmentId;
}

List<StyleMatch> rankStyleMatches({
  required Map<String, dynamic> profile,
  required List<Map<String, dynamic>> scenarios,
  required List<Map<String, dynamic>> runs,
  required List<Map<String, dynamic>> openRecruitments,
  required String playerId,
  int limit = 5,
}) {
  if (isDefaultDesireProfile(profile)) return const [];

  final excluded = collectExperiencedScenarioIds(
    playerId: playerId,
    runs: runs,
    profile: profile,
  );

  final recruitingByScenario = <String, String>{};
  for (final recruitment in openRecruitments) {
    final sid = recruitment['scenario_id']?.toString();
    if (sid == null || sid.isEmpty) continue;
    final status = recruitment['status']?.toString().toLowerCase() ?? '';
    if (status.isNotEmpty && status != 'open' && status != 'recruiting') continue;
    recruitingByScenario.putIfAbsent(sid, () => recruitment['id']?.toString() ?? '');
  }

  final ranked = <StyleMatch>[];
  for (final scenario in scenarios) {
    final sid = scenario['id']?.toString();
    if (sid == null || sid.isEmpty) continue;
    if (excluded.contains(sid)) continue;
    final titleKey =
        'title:${(scenario['title']?.toString() ?? '').trim().toLowerCase()}';
    if (titleKey != 'title:' && excluded.contains(titleKey)) continue;
    final score = calculateMatchScore(scenario, profile);
    if (score < 1) continue;
    ranked.add(StyleMatch(
      scenario: scenario,
      score: score,
      openRecruitmentId: recruitingByScenario[sid],
    ));
  }

  ranked.sort((a, b) {
    if (b.score != a.score) return b.score.compareTo(a.score);
    final aRecruit = (a.openRecruitmentId != null && a.openRecruitmentId!.isNotEmpty) ? 1 : 0;
    final bRecruit = (b.openRecruitmentId != null && b.openRecruitmentId!.isNotEmpty) ? 1 : 0;
    if (bRecruit != aRecruit) return bRecruit.compareTo(aRecruit);
    return (a.scenario['title']?.toString() ?? '')
        .compareTo(b.scenario['title']?.toString() ?? '');
  });
  return ranked.take(limit).toList();
}

String matchScoreLabel(int score) {
  switch (score.clamp(1, 3)) {
    case 3:
      return '相性抜群';
    case 2:
      return '好相性';
    default:
      return '相性良';
  }
}
