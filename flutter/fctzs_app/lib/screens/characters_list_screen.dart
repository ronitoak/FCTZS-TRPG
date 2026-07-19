import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
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

  Color? _cardBg(String state) {
    switch (state.toLowerCase()) {
      case 'lost':
        return FctzsColors.lostBg;
      case 'rescued':
        return FctzsColors.rescuedBg;
      default:
        return null;
    }
  }

  Color? _cardFg(String state) {
    switch (state.toLowerCase()) {
      case 'lost':
        return FctzsColors.lostText;
      case 'rescued':
        return FctzsColors.rescuedText;
      default:
        return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: FctzsColors.bg,
      appBar: AppBar(title: const Text('キャラクター一覧')),
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
                  childAspectRatio: 0.8,
                  itemBuilder: (context, index) {
                    final row = filtered[index];
                    final state = str(row['state'], '');
                    final bg = _cardBg(state);
                    final fg = _cardFg(state);
                    return Material(
                      color: bg ?? FctzsColors.surface,
                      elevation: 2,
                      shadowColor: const Color(0x14000000),
                      borderRadius: BorderRadius.circular(FctzsColors.radius),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => CharacterDetailScreen(
                              characterId: str(row['id']),
                            ),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              flex: 5,
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  Positioned.fill(
                                    child: CoverImage.character(
                                      str(row['image_url'], ''),
                                      height: null,
                                      fit: BoxFit.cover,
                                    ),
                                  ),
                                  Positioned(
                                    top: 8,
                                    right: 8,
                                    child: StatusBadge(state),
                                  ),
                                ],
                              ),
                            ),
                            Expanded(
                              flex: 3,
                              child: Padding(
                                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      str(row['name']),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w700,
                                        color: fg ?? FctzsColors.textMain,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${str(row['system'])} / ${str(row['job'])}\nPL: ${_playerName(row)}',
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontSize: 12,
                                        height: 1.4,
                                        color: fg ?? FctzsColors.textMuted,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
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
