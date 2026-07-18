import 'package:flutter/material.dart';

import '../widgets/common.dart';
import 'character_detail_screen.dart';
import 'run_detail_screen.dart';
import 'scenario_detail_screen.dart';

class PlayerDetailScreen extends StatefulWidget {
  const PlayerDetailScreen({super.key, required this.playerId});

  final String playerId;

  @override
  State<PlayerDetailScreen> createState() => _PlayerDetailScreenState();
}

class _PlayerDetailBundle {
  _PlayerDetailBundle({
    required this.summary,
    required this.profile,
    required this.characters,
    required this.runs,
  });

  final Map<String, dynamic>? summary;
  final Map<String, dynamic>? profile;
  final List<Map<String, dynamic>> characters;
  final List<Map<String, dynamic>> runs;
}

class _PlayerDetailScreenState extends State<PlayerDetailScreen> {
  late Future<_PlayerDetailBundle> _future;
  var _ready = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    _future = _load();
  }

  Future<_PlayerDetailBundle> _load() async {
    final api = ApiScope.of(context);
    final summary = await api.fetchPlayerDetailSummary(widget.playerId);
    final profile = await api.fetchPlayerProfile(widget.playerId);
    final characters = await api.fetchCharacters(playerId: widget.playerId);
    final runs = await api.fetchRuns(participantId: widget.playerId);
    return _PlayerDetailBundle(
      summary: summary,
      profile: profile,
      characters: characters.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
      runs: runs.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
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
      appBar: AppBar(title: Text(widget.playerId)),
      body: AsyncBody<_PlayerDetailBundle>(
        future: _future,
        onRefresh: _refresh,
        builder: (context, data) {
          final s = data.summary ?? {};
          final p = data.profile ?? {};
          final name = str(s['player_name'], widget.playerId);
          final favorites = (p['favorite_scenario_ids'] is List)
              ? (p['favorite_scenario_ids'] as List).map((e) => e.toString()).toList()
              : <String>[];
          final gmable = (p['gmable_scenario_ids'] is List)
              ? (p['gmable_scenario_ids'] as List).map((e) => e.toString()).toList()
              : <String>[];

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                ListTile(
                  title: Text(name, style: Theme.of(context).textTheme.headlineSmall),
                  subtitle: Text(widget.playerId),
                ),
                if (str(s['profile_text'], '') != '—' && str(s['profile_text']).isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text(str(s['profile_text'])),
                  ),
                KvTile('キャラ数', str(s['character_count'], '0')),
                KvTile('推し1', str(s['tier_list_first'])),
                KvTile('推し2', str(s['tier_list_second'])),
                KvTile('推し3', str(s['tier_list_third'])),
                const SectionTitle('プレイスタイル'),
                KvTile('化身欲', str(s['desire_avatar'])),
                KvTile('物語欲', str(s['desire_story'])),
                KvTile('攻略欲', str(s['desire_clear'])),
                KvTile('混沌欲', str(s['desire_chaos'])),
                KvTile('活躍欲', str(s['desire_active'])),
                KvTile('調和欲', str(s['desire_harmony'])),
                const SectionTitle('所持キャラクター'),
                if (data.characters.isEmpty)
                  const ListTile(title: Text('なし'))
                else
                  ...data.characters.map((c) => ListTile(
                        title: Text(str(c['name'])),
                        subtitle: Text('${str(c['system'])} / ${str(c['state'])}'),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => CharacterDetailScreen(characterId: str(c['id'])),
                          ),
                        ),
                      )),
                const SectionTitle('参加卓'),
                if (data.runs.isEmpty)
                  const ListTile(title: Text('なし'))
                else
                  ...data.runs.map((r) => ListTile(
                        title: Text(str(r['title'], r['id'])),
                        subtitle: Text('GM: ${str(r['gm_name'])} / ${str(r['status'])}'),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => RunDetailScreen(runId: str(r['id'])),
                          ),
                        ),
                      )),
                if (favorites.isNotEmpty) ...[
                  const SectionTitle('最強シナリオ'),
                  ...favorites.map((id) => ListTile(
                        title: Text(id),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => ScenarioDetailScreen(scenarioId: id),
                          ),
                        ),
                      )),
                ],
                if (gmable.isNotEmpty) ...[
                  const SectionTitle('GM可能シナリオ'),
                  ...gmable.map((id) => ListTile(
                        title: Text(id),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => ScenarioDetailScreen(scenarioId: id),
                          ),
                        ),
                      )),
                ],
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }
}
