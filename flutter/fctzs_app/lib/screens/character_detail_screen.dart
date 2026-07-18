import 'package:flutter/material.dart';

import '../widgets/common.dart';
import 'player_detail_screen.dart';
import 'run_detail_screen.dart';
import 'scenario_detail_screen.dart';

class CharacterDetailScreen extends StatefulWidget {
  const CharacterDetailScreen({super.key, required this.characterId});

  final String characterId;

  @override
  State<CharacterDetailScreen> createState() => _CharacterDetailScreenState();
}

class _CharacterDetailBundle {
  _CharacterDetailBundle({
    required this.character,
    required this.details,
    required this.runs,
  });

  final Map<String, dynamic>? character;
  final Map<String, dynamic>? details;
  final List<Map<String, dynamic>> runs;
}

class _CharacterDetailScreenState extends State<CharacterDetailScreen> {
  late Future<_CharacterDetailBundle> _future;
  var _ready = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    _future = _load();
  }

  Future<_CharacterDetailBundle> _load() async {
    final api = ApiScope.of(context);
    final character = await api.getFirst('/api/characters', query: {'id': widget.characterId});
    Map<String, dynamic>? details;
    try {
      details = await api.fetchCharacterDetails(widget.characterId);
    } catch (_) {}
    final runs = await api.fetchRuns(characterId: widget.characterId);
    return _CharacterDetailBundle(
      character: character,
      details: details,
      runs: runs.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
    );
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  List<Map<String, dynamic>> _asMapList(dynamic value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.characterId)),
      body: AsyncBody<_CharacterDetailBundle>(
        future: _future,
        onRefresh: _refresh,
        builder: (context, data) {
          final c = data.details ?? data.character;
          if (c == null) {
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 80),
                  Center(child: Text('キャラクターが見つかりません')),
                ],
              ),
            );
          }
          final playerName = str(
            c['player_name'] ??
                (c['players'] is Map ? (c['players'] as Map)['player_name'] : null),
          );
          final skills = _asMapList(c['skills']);
          final scenarios = _asMapList(c['scenarios']);
          final attributes = c['attributes'];

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                CoverImage(str(c['image_url'] ?? data.character?['image_url'], ''), height: 200),
                ListTile(
                  title: Text(str(c['name']), style: Theme.of(context).textTheme.headlineSmall),
                  subtitle: Text('${str(c['system'])} / ${str(c['state'])}'),
                ),
                ListTile(
                  title: const Text('プレイヤー'),
                  subtitle: Text(playerName == '—' ? str(c['player_id']) : playerName),
                  onTap: str(c['player_id'], '') == '—'
                      ? null
                      : () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => PlayerDetailScreen(playerId: str(c['player_id'])),
                            ),
                          ),
                ),
                KvTile('読み', str(c['reading'])),
                KvTile('職業', str(c['job'])),
                KvTile('年齢 / 性別', '${str(c['age'])} / ${str(c['gender'])}'),
                KvTile('身長 / 体重', '${str(c['height'])} / ${str(c['weight'])}'),
                KvTile('出自', str(c['origin'])),
                if (str(c['memo'], '') != '—' && str(c['memo']).isNotEmpty) ...[
                  const SectionTitle('メモ'),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text(str(c['memo'])),
                  ),
                ],
                if (attributes is Map && attributes.isNotEmpty) ...[
                  const SectionTitle('能力値'),
                  ...attributes.entries.map(
                    (e) => KvTile(e.key.toString(), str(e.value)),
                  ),
                ],
                if (skills.isNotEmpty) ...[
                  const SectionTitle('技能'),
                  ...skills.take(40).map((sk) {
                    final name = str(sk['name'] ?? sk['label'] ?? sk['skill_key']);
                    final value = str(sk['value'] ?? sk['display_value']);
                    return KvTile(name, value);
                  }),
                  if (skills.length > 40)
                    ListTile(title: Text('…他 ${skills.length - 40} 件')),
                ],
                if (scenarios.isNotEmpty) ...[
                  const SectionTitle('通過シナリオ'),
                  ...scenarios.map((sc) {
                    final id = str(sc['scenario_id'] ?? sc['id']);
                    final title = str(sc['title'] ?? sc['scenario_title'], id);
                    return ListTile(
                      title: Text(title),
                      onTap: id == '—'
                          ? null
                          : () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => ScenarioDetailScreen(scenarioId: id),
                                ),
                              ),
                    );
                  }),
                ],
                const SectionTitle('参加卓'),
                if (data.runs.isEmpty)
                  const ListTile(title: Text('なし'))
                else
                  ...data.runs.map((r) => ListTile(
                        title: Text(str(r['title'], r['id'])),
                        subtitle: Text(str(r['status'])),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => RunDetailScreen(runId: str(r['id'])),
                          ),
                        ),
                      )),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }
}
