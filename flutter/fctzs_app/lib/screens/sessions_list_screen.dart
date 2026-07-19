import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'run_detail_screen.dart';

class SessionsListScreen extends StatefulWidget {
  const SessionsListScreen({super.key});

  @override
  State<SessionsListScreen> createState() => _SessionsListScreenState();
}

class _SessionsListScreenState extends State<SessionsListScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _search = TextEditingController();
  late Future<_SessionsBundle> _future;
  var _ready = false;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    _future = _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    _search.dispose();
    super.dispose();
  }

  Future<_SessionsBundle> _load() async {
    final api = ApiScope.of(context);
    final runs = await api.fetchRuns();
    final sessions = await api.fetchSessions();
    return _SessionsBundle(
      runs: runs.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
      sessions: sessions.map((e) => Map<String, dynamic>.from(e as Map)).toList()
        ..sort((a, b) => str(b['start']).compareTo(str(a['start']))),
    );
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  bool _match(String hay) =>
      _query.isEmpty || hay.toLowerCase().contains(_query.toLowerCase());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: FctzsColors.bg,
      appBar: AppBar(
        title: const Text('セッション一覧'),
        bottom: TabBar(
          controller: _tabs,
          labelColor: FctzsColors.primary,
          unselectedLabelColor: FctzsColors.textMuted,
          indicatorColor: FctzsColors.primary,
          tabs: const [
            Tab(text: '卓'),
            Tab(text: '開催'),
          ],
        ),
      ),
      body: Column(
        children: [
          SearchField(
            controller: _search,
            hintText: 'タイトル・GM・ステータス',
            onChanged: (v) => setState(() => _query = v.trim()),
          ),
          Expanded(
            child: AsyncBody<_SessionsBundle>(
              future: _future,
              onRefresh: _refresh,
              builder: (context, data) {
                final runs = data.runs.where((r) {
                  final hay = [
                    str(r['title']),
                    str(r['gm_name']),
                    str(r['status']),
                    ...(r['player_names'] is List
                        ? (r['player_names'] as List).map((e) => e.toString())
                        : const <String>[]),
                  ].join(' ');
                  return _match(hay);
                }).toList();
                final sessions = data.sessions.where((s) {
                  final hay = [str(s['title']), str(s['status']), str(s['run_id'])].join(' ');
                  return _match(hay);
                }).toList();

                return TabBarView(
                  controller: _tabs,
                  children: [
                    RefreshList(
                      onRefresh: _refresh,
                      itemCount: runs.length,
                      itemBuilder: (context, index) {
                        final r = runs[index];
                        final pl = r['player_names'] is List
                            ? (r['player_names'] as List).join(', ')
                            : '';
                        return EntityCard(
                          imageUrl: str(r['image_url'], ''),
                          imageHeight: 130,
                          badge: StatusBadge(str(r['status'])),
                          title: str(r['title'], r['id']),
                          subtitle:
                              'GM: ${str(r['gm_name'])}\nPL: ${pl.isEmpty ? '—' : pl}',
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => RunDetailScreen(runId: str(r['id'])),
                            ),
                          ),
                        );
                      },
                    ),
                    RefreshList(
                      onRefresh: _refresh,
                      itemCount: sessions.length,
                      itemBuilder: (context, index) {
                        final s = sessions[index];
                        final runId = str(s['run_id'], '');
                        return EntityCard(
                          badge: StatusBadge(str(s['status'])),
                          title: str(s['title'], '無題'),
                          subtitle: formatDateTime(s['start']),
                          onTap: runId == '—'
                              ? null
                              : () => Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => RunDetailScreen(runId: runId),
                                    ),
                                  ),
                        );
                      },
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _SessionsBundle {
  _SessionsBundle({required this.runs, required this.sessions});
  final List<Map<String, dynamic>> runs;
  final List<Map<String, dynamic>> sessions;
}
