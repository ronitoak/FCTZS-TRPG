import 'package:flutter/material.dart';

import '../widgets/common.dart';
import 'character_detail_screen.dart';

class CharactersListScreen extends StatefulWidget {
  const CharactersListScreen({super.key});

  @override
  State<CharactersListScreen> createState() => _CharactersListScreenState();
}

class _CharactersListScreenState extends State<CharactersListScreen> {
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
    final rows = await ApiScope.of(context).fetchCharacters();
    return rows.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  String _playerName(Map<String, dynamic> row) {
    final nested = row['players'];
    if (nested is Map) return str(nested['player_name']);
    return str(row['player_name']);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('キャラクター')),
      body: Column(
        children: [
          SearchField(
            controller: _search,
            hintText: '名前・職業・システム・PL',
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
                          str(r['name']),
                          str(r['job']),
                          str(r['system']),
                          str(r['state']),
                          _playerName(r),
                        ].join(' ').toLowerCase();
                        return hay.contains(_query);
                      }).toList();
                return RefreshList(
                  onRefresh: _refresh,
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final row = filtered[index];
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundImage: (str(row['image_url'], '') != '—' &&
                                str(row['image_url'], '').isNotEmpty)
                            ? NetworkImage(str(row['image_url']))
                            : null,
                        child: (str(row['image_url'], '') == '—' ||
                                str(row['image_url'], '').isEmpty)
                            ? const Icon(Icons.person)
                            : null,
                      ),
                      title: Text(str(row['name'])),
                      subtitle: Text(
                        '${str(row['system'])} / ${str(row['job'])} / ${str(row['state'])}\n'
                        'PL: ${_playerName(row)}',
                      ),
                      isThreeLine: true,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => CharacterDetailScreen(
                            characterId: str(row['id']),
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
