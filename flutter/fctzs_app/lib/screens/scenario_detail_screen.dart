import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/comments_section.dart';
import '../widgets/common.dart';
import 'character_detail_screen.dart';
import 'run_detail_screen.dart';

class ScenarioDetailScreen extends StatefulWidget {
  const ScenarioDetailScreen({super.key, required this.scenarioId});

  final String scenarioId;

  @override
  State<ScenarioDetailScreen> createState() => _ScenarioDetailScreenState();
}

class _ScenarioDetailBundle {
  _ScenarioDetailBundle({
    required this.scenario,
    required this.runs,
    required this.characters,
    required this.interestCount,
    required this.comments,
  });

  final Map<String, dynamic>? scenario;
  final List<Map<String, dynamic>> runs;
  final List<Map<String, dynamic>> characters;
  final int interestCount;
  final List<Map<String, dynamic>> comments;
}

class _ScenarioDetailScreenState extends State<ScenarioDetailScreen> {
  late Future<_ScenarioDetailBundle> _future;
  var _ready = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    _future = _load();
  }

  Future<_ScenarioDetailBundle> _load() async {
    final api = ApiScope.of(context);
    final scenario = await api.fetchScenario(widget.scenarioId);
    final runs = await api.fetchRuns(scenarioId: widget.scenarioId);
    final characters = await api.fetchCharacters(scenarioId: widget.scenarioId);
    var interestCount = 0;
    try {
      final interests = await api.fetchScenarioInterests(widget.scenarioId);
      interestCount = (interests['count'] as num?)?.toInt() ?? 0;
    } catch (_) {}
    final comments = await api.fetchComments(
      targetType: 'scenario',
      targetId: widget.scenarioId,
    );
    return _ScenarioDetailBundle(
      scenario: scenario,
      runs: runs.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
      characters: characters.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
      interestCount: interestCount,
      comments: comments.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
    );
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: FctzsColors.bg,
      appBar: AppBar(title: Text(widget.scenarioId)),
      body: AsyncBody<_ScenarioDetailBundle>(
        future: _future,
        onRefresh: _refresh,
        builder: (context, data) {
          final s = data.scenario;
          if (s == null) {
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 80),
                  Center(child: MutedText('シナリオが見つかりません')),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(top: 12, bottom: 24),
              children: [
                DetailPanel(
                  padding: EdgeInsets.zero,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ClipRRect(
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(FctzsColors.radius),
                        ),
                        child: CoverImage(str(s['image_url'], ''), height: 200),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              str(s['title']),
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            const SizedBox(height: 4),
                            MutedText('${str(s['system'])} / ${str(s['author'])}'),
                            const SizedBox(height: 12),
                            KvTile('人数', '${str(s['min_players'], '?')}〜${str(s['max_players'], '?')}'),
                            KvTile('想定時間(分)', str(s['play_time_minutes'])),
                            KvTile('ロスト率', str(s['lost_rate'])),
                            KvTile('気になる', '${data.interestCount}人'),
                            KvTile('傾向(物語-混沌)', str(s['trend_story_chaos'])),
                            KvTile('傾向(没入-攻略)', str(s['trend_avatar_clear'])),
                            KvTile('傾向(調和-主体)', str(s['trend_harmony_active'])),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SectionTitle('紹介'),
                DetailPanel(child: Text(str(s['description'], '（説明なし）'))),
                if (str(s['notes'], '') != '—' && str(s['notes']).isNotEmpty) ...[
                  const SectionTitle('メモ'),
                  DetailPanel(child: Text(str(s['notes']))),
                ],
                const SectionTitle('関連卓'),
                if (data.runs.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: MutedText('なし'),
                  )
                else
                  ...data.runs.map((r) => Padding(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                        child: EntityCard(
                          title: str(r['title'], r['id']),
                          subtitle: 'GM: ${str(r['gm_name'])}',
                          badge: StatusBadge(str(r['status'])),
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => RunDetailScreen(runId: str(r['id'])),
                            ),
                          ),
                        ),
                      )),
                const SectionTitle('通過キャラクター'),
                if (data.characters.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: MutedText('なし'),
                  )
                else
                  ...data.characters.map((c) => Padding(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                        child: EntityCard(
                          title: str(c['name']),
                          subtitle: str(c['system']),
                          badge: StatusBadge(str(c['state'])),
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) =>
                                  CharacterDetailScreen(characterId: str(c['id'])),
                            ),
                          ),
                        ),
                      )),
                CommentsSection(
                  targetType: 'scenario',
                  targetId: widget.scenarioId,
                  comments: data.comments,
                  onPosted: _refresh,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
