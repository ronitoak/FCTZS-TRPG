import 'package:flutter/material.dart';

import '../media/image_urls.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import '../widgets/desire_radar_chart.dart';
import 'player_detail_screen.dart';

class PlayersListScreen extends StatefulWidget {
  const PlayersListScreen({super.key});

  @override
  State<PlayersListScreen> createState() => _PlayersListScreenState();
}

class _PlayersListScreenState extends State<PlayersListScreen> {
  final _search = TextEditingController();
  late Future<List<_PlayerCardData>> _future;
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

  Future<List<_PlayerCardData>> _load() async {
    final api = ApiScope.of(context);
    final players = await api.fetchPlayers();
    final profiles = await api.fetchPlayerProfiles();
    final characters = await api.fetchCharacters();

    final playersById = <String, Map<String, dynamic>>{};
    for (final row in players) {
      if (row is! Map) continue;
      final map = Map<String, dynamic>.from(row);
      final id = map['player_id']?.toString();
      if (id != null && id.isNotEmpty) playersById[id] = map;
    }

    final charById = <String, Map<String, dynamic>>{};
    for (final row in characters) {
      if (row is! Map) continue;
      final map = Map<String, dynamic>.from(row);
      final id = map['id']?.toString();
      if (id != null && id.isNotEmpty) charById[id] = map;
    }

    final list = <_PlayerCardData>[];
    for (final row in profiles) {
      if (row is! Map) continue;
      final profile = Map<String, dynamic>.from(row);
      final playerId = profile['player_id']?.toString();
      if (playerId == null || !playersById.containsKey(playerId)) continue;
      if (_isAllDefaultDesire(profile)) continue;

      final player = playersById[playerId]!;
      final iconId = profile['icon_url']?.toString();
      final iconChar = (iconId == null || iconId.isEmpty) ? null : charById[iconId];
      list.add(
        _PlayerCardData(
          playerId: playerId,
          playerName: str(player['player_name'], playerId),
          iconImageUrl: FctzsImages.characterImage(
            characterId: iconId,
            imageUrl: iconChar?['image_url'],
          ),
          profile: profile,
        ),
      );
    }

    list.sort((a, b) => a.playerName.compareTo(b.playerName));
    return list;
  }

  /// Web の player.js と同様、欲求がすべて初期値(3)のプロフィールは一覧から除外。
  bool _isAllDefaultDesire(Map<String, dynamic> p) {
    int v(String key) {
      final raw = p[key];
      if (raw is num) return raw.round();
      return int.tryParse(raw?.toString() ?? '') ?? 3;
    }

    return v('desire_avatar') == 3 &&
        v('desire_active') == 3 &&
        v('desire_chaos') == 3 &&
        v('desire_story') == 3 &&
        v('desire_harmony') == 3 &&
        v('desire_clear') == 3;
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
      appBar: AppBar(title: const Text('プレイヤー一覧')),
      body: Column(
        children: [
          SearchField(
            controller: _search,
            hintText: '名前で検索',
            onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
          ),
          Expanded(
            child: AsyncBody<List<_PlayerCardData>>(
              future: _future,
              onRefresh: _refresh,
              builder: (context, rows) {
                final filtered = _query.isEmpty
                    ? rows
                    : rows
                        .where((r) => r.playerName.toLowerCase().contains(_query))
                        .toList();
                return RefreshList(
                  onRefresh: _refresh,
                  itemCount: filtered.length,
                  childAspectRatio: 0.72,
                  itemBuilder: (context, index) {
                    final row = filtered[index];
                    return Material(
                      color: FctzsColors.surface,
                      elevation: 2,
                      shadowColor: const Color(0x14000000),
                      borderRadius: BorderRadius.circular(FctzsColors.radius),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => PlayerDetailScreen(
                              playerId: row.playerId,
                            ),
                          ),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(10, 14, 10, 8),
                          child: Column(
                            children: [
                              ClipOval(
                                child: SizedBox(
                                  width: 72,
                                  height: 72,
                                  child: CoverImage.character(
                                    row.iconImageUrl,
                                    height: 72,
                                    fit: BoxFit.cover,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                row.playerName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: FctzsColors.textMain,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Expanded(
                                child: Center(
                                  child: DesireRadarChart.fromProfile(
                                    row.profile,
                                    size: 150,
                                  ),
                                ),
                              ),
                            ],
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

class _PlayerCardData {
  _PlayerCardData({
    required this.playerId,
    required this.playerName,
    required this.iconImageUrl,
    required this.profile,
  });

  final String playerId;
  final String playerName;
  final String iconImageUrl;
  final Map<String, dynamic> profile;
}
