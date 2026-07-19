import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'player_detail_screen.dart';
import 'run_detail_screen.dart';
import 'scenario_detail_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeBundle {
  _HomeBundle({
    required this.upcoming,
    required this.ongoingRuns,
    required this.comments,
  });

  final List<Map<String, dynamic>> upcoming;
  final List<Map<String, dynamic>> ongoingRuns;
  final List<Map<String, dynamic>> comments;
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<_HomeBundle> _future;
  var _ready = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    _future = _load();
  }

  Future<_HomeBundle> _load() async {
    final api = ApiScope.of(context);
    final sessions = await api.fetchSessions();
    final runs = await api.fetchRuns();
    final comments = await api.fetchRecentComments();

    final now = DateTime.now();
    final upcoming = sessions
        .map((e) => Map<String, dynamic>.from(e as Map))
        .where((s) {
          final start = DateTime.tryParse(str(s['start'], ''));
          final status = str(s['status'], '').toLowerCase();
          if (start == null) return false;
          return start.isAfter(now.subtract(const Duration(hours: 6))) &&
              status != 'done' &&
              status != 'cancelled';
        })
        .toList()
      ..sort((a, b) => str(a['start']).compareTo(str(b['start'])));

    final ongoing = runs
        .map((e) => Map<String, dynamic>.from(e as Map))
        .where((r) => str(r['status'], '').toLowerCase() == 'active')
        .toList();

    return _HomeBundle(
      upcoming: upcoming.take(12).toList(),
      ongoingRuns: ongoing.take(12).toList(),
      comments: comments
          .map((e) => Map<String, dynamic>.from(e as Map))
          .take(15)
          .toList(),
    );
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  @override
  Widget build(BuildContext context) {
    final api = ApiScope.of(context);
    return Scaffold(
      backgroundColor: FctzsColors.bg,
      appBar: AppBar(
        title: const Text('FCTZS TRPG部'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(28),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'API: ${api.apiBase}',
                style: const TextStyle(color: FctzsColors.textMuted, fontSize: 12),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ),
      ),
      body: AsyncBody<_HomeBundle>(
        future: _future,
        onRefresh: _refresh,
        builder: (context, data) {
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                const SectionTitle('直近の予定'),
                if (data.upcoming.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: MutedText('予定なし'),
                  )
                else
                  ...data.upcoming.map((s) {
                    final runId = str(s['run_id'], '');
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                      child: EntityCard(
                        title: str(s['title'], '無題セッション'),
                        subtitle: formatDateTime(s['start']),
                        badge: StatusBadge(str(s['status'])),
                        onTap: runId == '—'
                            ? null
                            : () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => RunDetailScreen(runId: runId),
                                  ),
                                ),
                      ),
                    );
                  }),
                const SectionTitle('進行中のセッション'),
                if (data.ongoingRuns.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: MutedText('進行中なし'),
                  )
                else
                  ...data.ongoingRuns.map((r) {
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                      child: EntityCard(
                        title: str(r['title'], r['id']),
                        subtitle: 'GM: ${str(r['gm_name'])}',
                        badge: StatusBadge(str(r['status'])),
                        imageUrl: str(r['image_url'], ''),
                        imageHeight: 120,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => RunDetailScreen(runId: str(r['id'])),
                          ),
                        ),
                      ),
                    );
                  }),
                const SectionTitle('最近のコメント'),
                if (data.comments.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: MutedText('コメントなし'),
                  )
                else
                  ...data.comments.map((c) {
                    final type = str(c['target_type']);
                    final id = str(c['target_id']);
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                      child: EntityCard(
                        title: str(c['body']),
                        subtitle:
                            '${str(c['author'])} → ${str(c['target_name'], id)} ($type)\n${formatDateTime(c['created_at'])}',
                        onTap: () {
                          if (type == 'player') {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => PlayerDetailScreen(playerId: id),
                              ),
                            );
                          } else if (type == 'scenario') {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => ScenarioDetailScreen(scenarioId: id),
                              ),
                            );
                          } else if (type == 'run' || type == 'session') {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => RunDetailScreen(runId: id),
                              ),
                            );
                          }
                        },
                      ),
                    );
                  }),
              ],
            ),
          );
        },
      ),
    );
  }
}
