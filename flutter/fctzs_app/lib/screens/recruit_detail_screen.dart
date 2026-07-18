import 'package:flutter/material.dart';

import '../widgets/common.dart';
import 'player_detail_screen.dart';
import 'scenario_detail_screen.dart';

class RecruitDetailScreen extends StatefulWidget {
  const RecruitDetailScreen({super.key, required this.recruitmentId});

  final String recruitmentId;

  @override
  State<RecruitDetailScreen> createState() => _RecruitDetailScreenState();
}

class _RecruitDetailBundle {
  _RecruitDetailBundle({
    required this.recruitment,
    required this.applicants,
    required this.playerNames,
  });

  final Map<String, dynamic>? recruitment;
  final List<Map<String, dynamic>> applicants;
  final Map<String, String> playerNames;
}

class _RecruitDetailScreenState extends State<RecruitDetailScreen> {
  late Future<_RecruitDetailBundle> _future;
  var _ready = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    _future = _load();
  }

  Future<_RecruitDetailBundle> _load() async {
    final api = ApiScope.of(context);
    final recruitment = await api.fetchRecruitment(widget.recruitmentId);
    final applicants = await api.fetchRecruitmentApplicants(widget.recruitmentId);
    final players = await api.fetchPlayers();
    final names = <String, String>{
      for (final p in players)
        str((p as Map)['player_id']): str(p['player_name']),
    };
    return _RecruitDetailBundle(
      recruitment: recruitment,
      applicants: applicants.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
      playerNames: names,
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
      appBar: AppBar(title: Text(widget.recruitmentId)),
      body: AsyncBody<_RecruitDetailBundle>(
        future: _future,
        onRefresh: _refresh,
        builder: (context, data) {
          final r = data.recruitment;
          if (r == null) {
            return RefreshIndicator(
              onRefresh: _refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 80),
                  Center(child: Text('募集が見つかりません')),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                CoverImage(str(r['scenario_image_url'], ''), height: 180),
                ListTile(
                  title: Text(
                    str(r['scenario_title'], 'シナリオ未設定'),
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  subtitle: Text('${str(r['recruit_role'])}募集 / ${str(r['status'])}'),
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
                  title: const Text('募集主'),
                  subtitle: Text(str(r['owner_player_name'], r['owner_player_id'])),
                  onTap: str(r['owner_player_id'], '') == '—'
                      ? null
                      : () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => PlayerDetailScreen(
                                playerId: str(r['owner_player_id']),
                              ),
                            ),
                          ),
                ),
                KvTile('目標人数', str(r['target_count'])),
                KvTile('応募数', str(r['applicant_count'], '${data.applicants.length}')),
                KvTile('作成', formatDateTime(r['created_at'])),
                const SectionTitle('メモ'),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(str(r['memo'], '（メモなし）')),
                ),
                const SectionTitle('応募者'),
                if (data.applicants.isEmpty)
                  const ListTile(title: Text('なし'))
                else
                  ...data.applicants.map((a) {
                    final pid = str(a['player_id']);
                    return ListTile(
                      title: Text(data.playerNames[pid] ?? pid),
                      subtitle: Text(formatDateTime(a['created_at'])),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => PlayerDetailScreen(playerId: pid),
                        ),
                      ),
                    );
                  }),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }
}
