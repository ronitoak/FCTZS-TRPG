import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../media/image_urls.dart';
import '../theme/app_theme.dart';
import '../widgets/comments_section.dart';
import '../widgets/common.dart';
import 'character_detail_screen.dart';
import 'player_detail_screen.dart';
import 'scenario_detail_screen.dart';

class RunDetailScreen extends StatefulWidget {
  const RunDetailScreen({super.key, required this.runId});

  final String runId;

  @override
  State<RunDetailScreen> createState() => _RunDetailScreenState();
}

class _RunDetailBundle {
  _RunDetailBundle({
    required this.run,
    required this.sessions,
    required this.characters,
    required this.scenarioTitle,
    required this.coverUrl,
    required this.comments,
  });

  final Map<String, dynamic>? run;
  final List<Map<String, dynamic>> sessions;
  final List<Map<String, dynamic>> characters;
  final String scenarioTitle;
  final String coverUrl;
  final List<Map<String, dynamic>> comments;
}

class _RunDetailScreenState extends State<RunDetailScreen> {
  late Future<_RunDetailBundle> _future;
  var _ready = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    _future = _load();
  }

  Future<_RunDetailBundle> _load() async {
    final api = ApiScope.of(context);
    final runs = await api.fetchRuns(id: widget.runId);
    final run = runs.isEmpty ? null : Map<String, dynamic>.from(runs.first as Map);
    final sessions = await api.fetchSessionsForRun(widget.runId);
    var scenarioTitle = '—';
    String? scenarioImageUrl;
    var characters = <Map<String, dynamic>>[];
    if (run != null) {
      final scenarioId = str(run['scenario_id'], '');
      if (scenarioId != '—') {
        final scenario = await api.fetchScenario(scenarioId);
        scenarioTitle = str(scenario?['title'], scenarioId);
        scenarioImageUrl = scenario?['image_url']?.toString();
      }
      final charIds = (run['characters'] is List)
          ? (run['characters'] as List).map((e) => e.toString()).where((e) => e.isNotEmpty).toList()
          : <String>[];
      if (charIds.isNotEmpty) {
        final byIds = await api.getList('/api/characters', query: {'ids': charIds.join(',')});
        characters = byIds.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
    }
    final coverUrl = FctzsImages.resolveRunCover(
      runImageUrl: run?['image_url'],
      scenarioImageUrl: scenarioImageUrl,
    );
    // Web の sessions/detail と同様、卓コメントの target_type は session（target_id は run_id）
    final comments = await api.fetchComments(
      targetType: 'session',
      targetId: widget.runId,
    );
    return _RunDetailBundle(
      run: run,
      sessions: sessions.map((e) => Map<String, dynamic>.from(e as Map)).toList()
        ..sort((a, b) => str(a['start']).compareTo(str(b['start']))),
      characters: characters,
      scenarioTitle: scenarioTitle,
      coverUrl: coverUrl,
      comments: comments.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
    );
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  void _copyUrl(String url) {
    Clipboard.setData(ClipboardData(text: url));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('URLをコピーしました')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: FctzsColors.bg,
      appBar: AppBar(title: Text(widget.runId)),
      body: AsyncBody<_RunDetailBundle>(
        future: _future,
        onRefresh: _refresh,
        builder: (context, data) {
          final r = data.run;
          if (r == null) {
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 80),
                  Center(child: Text('卓が見つかりません')),
                ],
              ),
            );
          }
          final playerIds = (r['player_ids'] is List)
              ? (r['player_ids'] as List).map((e) => e.toString()).toList()
              : <String>[];
          final playerNames = (r['player_names'] is List)
              ? (r['player_names'] as List).map((e) => e.toString()).toList()
              : <String>[];

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                CoverImage.detail(data.coverUrl),
                ListTile(
                  title: Text(str(r['title'], r['id']), style: Theme.of(context).textTheme.headlineSmall),
                  subtitle: Text(str(r['status'])),
                ),
                ListTile(
                  title: const Text('シナリオ'),
                  subtitle: Text(data.scenarioTitle),
                  onTap: str(r['scenario_id'], '') == '—'
                      ? null
                      : () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => ScenarioDetailScreen(
                                scenarioId: str(r['scenario_id']),
                              ),
                            ),
                          ),
                ),
                ListTile(
                  title: const Text('GM'),
                  subtitle: Text(str(r['gm_name'], r['gm_id'])),
                  onTap: str(r['gm_id'], '') == '—'
                      ? null
                      : () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => PlayerDetailScreen(playerId: str(r['gm_id'])),
                            ),
                          ),
                ),
                const SectionTitle('参加PL'),
                if (playerIds.isEmpty)
                  const ListTile(title: Text('なし'))
                else
                  for (var i = 0; i < playerIds.length; i++)
                    ListTile(
                      title: Text(i < playerNames.length ? playerNames[i] : playerIds[i]),
                      subtitle: Text(playerIds[i]),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => PlayerDetailScreen(playerId: playerIds[i]),
                        ),
                      ),
                    ),
                const SectionTitle('参加キャラクター'),
                if (data.characters.isEmpty)
                  const ListTile(title: Text('なし'))
                else
                  ...data.characters.map((c) => ListTile(
                        title: Text(str(c['name'])),
                        subtitle: Text(str(c['system'])),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => CharacterDetailScreen(characterId: str(c['id'])),
                          ),
                        ),
                      )),
                const SectionTitle('開催履歴'),
                if (data.sessions.isEmpty)
                  const ListTile(title: Text('なし'))
                else
                  ...data.sessions.map((s) {
                    final stream = str(s['stream_url'], '');
                    final replay = str(s['replay_url'], '');
                    return ListTile(
                      title: Text(str(s['title'], 'セッション')),
                      subtitle: Text(
                        '${formatDateTime(s['start'])} / ${str(s['status'])}'
                        '${stream != '—' ? '\n配信: $stream' : ''}'
                        '${replay != '—' ? '\nアーカイブ: $replay' : ''}',
                      ),
                      isThreeLine: stream != '—' || replay != '—',
                      onLongPress: () {
                        if (stream != '—') {
                          _copyUrl(stream);
                        } else if (replay != '—') {
                          _copyUrl(replay);
                        }
                      },
                    );
                  }),
                CommentsSection(
                  targetType: 'session',
                  targetId: widget.runId,
                  comments: data.comments,
                  onPosted: _refresh,
                ),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }
}
