import 'package:flutter/material.dart';

import '../widgets/common.dart';
import 'player_detail_screen.dart';

class PlayersListScreen extends StatefulWidget {
  const PlayersListScreen({super.key});

  @override
  State<PlayersListScreen> createState() => _PlayersListScreenState();
}

class _PlayersListScreenState extends State<PlayersListScreen> {
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
    final rows = await ApiScope.of(context).fetchPlayers();
    final list = rows.map((e) => Map<String, dynamic>.from(e as Map)).toList()
      ..sort((a, b) => str(a['player_name']).compareTo(str(b['player_name'])));
    return list;
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('プレイヤー')),
      body: Column(
        children: [
          SearchField(
            controller: _search,
            hintText: '名前で検索',
            onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
          ),
          Expanded(
            child: AsyncBody<List<Map<String, dynamic>>>(
              future: _future,
              onRefresh: _refresh,
              builder: (context, rows) {
                final filtered = _query.isEmpty
                    ? rows
                    : rows
                        .where((r) =>
                            str(r['player_name']).toLowerCase().contains(_query) ||
                            str(r['player_id']).toLowerCase().contains(_query))
                        .toList();
                return RefreshList(
                  onRefresh: _refresh,
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final row = filtered[index];
                    return ListTile(
                      title: Text(str(row['player_name'])),
                      subtitle: Text(str(row['player_id'])),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => PlayerDetailScreen(
                            playerId: str(row['player_id']),
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
