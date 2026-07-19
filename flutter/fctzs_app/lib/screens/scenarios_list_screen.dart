import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'scenario_detail_screen.dart';

class ScenariosListScreen extends StatefulWidget {
  const ScenariosListScreen({super.key});

  @override
  State<ScenariosListScreen> createState() => _ScenariosListScreenState();
}

class _ScenariosListScreenState extends State<ScenariosListScreen> {
  final _search = TextEditingController();
  late Future<List<Map<String, dynamic>>> _future;
  var _ready = false;
  String _query = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    _future = _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final rows = await ApiScope.of(context).fetchScenarios();
    return rows.map((e) => Map<String, dynamic>.from(e as Map)).toList();
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
      appBar: AppBar(title: const Text('シナリオ一覧')),
      body: Column(
        children: [
          SearchField(
            controller: _search,
            hintText: 'タイトル・作者・システム',
            onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
          ),
          Expanded(
            child: AsyncBody<List<Map<String, dynamic>>>(
              future: _future,
              onRefresh: _refresh,
              builder: (context, rows) {
                final filtered = _query.isEmpty
                    ? rows
                    : rows.where((r) {
                        final hay = [
                          str(r['title']),
                          str(r['author']),
                          str(r['system']),
                        ].join(' ').toLowerCase();
                        return hay.contains(_query);
                      }).toList();
                return RefreshList(
                  onRefresh: _refresh,
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final row = filtered[index];
                    final minP = row['min_players'];
                    final maxP = row['max_players'];
                    final players = (minP == null && maxP == null)
                        ? '人数未設定'
                        : '${minP ?? '?'}〜${maxP ?? '?'}人';
                    return EntityCard(
                      showCover: true,
                      imageUrl: str(row['image_url'], ''),
                      imageHeight: 160,
                      title: str(row['title']),
                      subtitle:
                          '${str(row['system'])} / ${str(row['author'])}\n$players'
                          '${row['run_count'] != null ? ' / 卓${row['run_count']}回' : ''}',
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => ScenarioDetailScreen(
                            scenarioId: str(row['id']),
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
