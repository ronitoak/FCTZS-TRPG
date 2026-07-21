import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../media/image_urls.dart';
import '../theme/app_theme.dart';
import '../util/style_match.dart';
import '../widgets/common.dart';
import '../widgets/my_availability_calendar.dart';
import 'player_detail_screen.dart';
import 'recruit_detail_screen.dart';
import 'run_detail_screen.dart';
import 'scenario_detail_screen.dart';
import 'schedule_match_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeBundle {
  _HomeBundle({
    required this.signedIn,
    required this.myPlayerId,
    required this.myPlayerName,
    required this.myNextSession,
    required this.myNextRunId,
    required this.myRecruitments,
    required this.styleMatches,
    required this.desiresUnset,
    required this.upcoming,
    required this.ongoingRuns,
    required this.comments,
    required this.scenarioImages,
  });

  final bool signedIn;
  final String? myPlayerId;
  final String? myPlayerName;
  final Map<String, dynamic>? myNextSession;
  final String? myNextRunId;
  final List<Map<String, dynamic>> myRecruitments;
  final List<StyleMatch> styleMatches;
  final bool desiresUnset;
  final List<Map<String, dynamic>> upcoming;
  final List<Map<String, dynamic>> ongoingRuns;
  final List<Map<String, dynamic>> comments;
  final Map<String, String?> scenarioImages;
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<_HomeBundle> _future;
  var _ready = false;
  String? _authKey;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final auth = AuthScope.of(context);
    final key = '${auth.isSignedIn}:${auth.user?.id ?? ''}';
    if (!_ready) {
      _ready = true;
      _authKey = key;
      _future = _load();
      return;
    }
    if (_authKey != key) {
      _authKey = key;
      _future = _load();
    }
  }

  Future<_HomeBundle> _load() async {
    final api = ApiScope.of(context);
    final auth = AuthScope.of(context);

    List<dynamic> sessions = const [];
    List<dynamic> runsRaw = const [];
    List<dynamic> scenariosRaw = const [];
    List<dynamic> comments = const [];
    try {
      sessions = await api.fetchSessions();
    } catch (_) {}
    try {
      runsRaw = await api.fetchRuns();
    } catch (_) {}
    try {
      scenariosRaw = await api.fetchScenarios();
    } catch (_) {}
    try {
      comments = await api.fetchRecentComments();
    } catch (_) {}

    final runs = runsRaw.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final scenarios =
        scenariosRaw.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final sessionMaps =
        sessions.map((e) => Map<String, dynamic>.from(e as Map)).toList();

    final now = DateTime.now();
    final upcoming = sessionMaps.where((s) {
      final start = DateTime.tryParse(str(s['start'], ''));
      final status = str(s['status'], '').toLowerCase();
      if (start == null) return false;
      return start.isAfter(now.subtract(const Duration(hours: 6))) &&
          status != 'done' &&
          status != 'cancelled';
    }).toList()
      ..sort((a, b) => str(a['start']).compareTo(str(b['start'])));

    final ongoing = runs
        .where((r) => str(r['status'], '').toLowerCase() == 'active')
        .toList();

    String? myPlayerId;
    String? myPlayerName;
    Map<String, dynamic>? myNextSession;
    String? myNextRunId;
    var myRecruitments = <Map<String, dynamic>>[];
    var styleMatches = <StyleMatch>[];
    var desiresUnset = false;

    if (auth.isSignedIn) {
      try {
        final me = await api.fetchMyPlayer(auth.user);
        if (me != null) {
          final pid = me['player_id']?.toString();
          if (pid != null && pid.isNotEmpty) {
            myPlayerId = pid;
            myPlayerName = str(me['player_name'], pid);
            final myRunIds = runs
                .where((r) => runIncludesPlayer(r, pid))
                .map((r) => r['id']?.toString())
                .whereType<String>()
                .toSet();

            final myUpcoming = sessionMaps.where((s) {
              final runId = s['run_id']?.toString();
              if (runId == null || !myRunIds.contains(runId)) return false;
              final status = str(s['status'], '').toLowerCase();
              if (status != 'scheduled') return false;
              final start = DateTime.tryParse(str(s['start'], ''));
              return start != null && start.isAfter(now);
            }).toList()
              ..sort((a, b) => str(a['start']).compareTo(str(b['start'])));

            if (myUpcoming.isNotEmpty) {
              myNextSession = myUpcoming.first;
              myNextRunId = myNextSession['run_id']?.toString();
            }

            try {
              final allRecruitments = await api.fetchRecruitments();
              myRecruitments = allRecruitments
                  .map((e) => Map<String, dynamic>.from(e as Map))
                  .where((r) => r['owner_player_id']?.toString() == pid)
                  .toList();
              final openRecruitments = allRecruitments
                  .map((e) => Map<String, dynamic>.from(e as Map))
                  .where((r) {
                    final status = str(r['status'], '').toLowerCase();
                    return status == 'open' || status == 'recruiting';
                  })
                  .toList();

              Map<String, dynamic>? profile;
              try {
                profile = await api.fetchPlayerProfile(pid);
              } catch (_) {}
              desiresUnset = isDefaultDesireProfile(profile);
              if (profile != null && !desiresUnset) {
                styleMatches = rankStyleMatches(
                  profile: profile,
                  scenarios: scenarios,
                  runs: runs,
                  openRecruitments: openRecruitments,
                  playerId: pid,
                );
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }

    return _HomeBundle(
      signedIn: auth.isSignedIn,
      myPlayerId: myPlayerId,
      myPlayerName: myPlayerName,
      myNextSession: myNextSession,
      myNextRunId: myNextRunId,
      myRecruitments: myRecruitments,
      styleMatches: styleMatches,
      desiresUnset: desiresUnset,
      upcoming: upcoming.take(12).toList(),
      ongoingRuns: ongoing.take(12).toList(),
      comments: comments
          .map((e) => Map<String, dynamic>.from(e as Map))
          .take(15)
          .toList(),
      scenarioImages: FctzsImages.scenarioImageMap(scenariosRaw),
    );
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  String _recruitStatusLabel(String status) {
    switch (status.toLowerCase()) {
      case 'open':
        return '募集中';
      case 'fulfilled':
        return '満員';
      case 'closed':
        return '終了';
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    final api = ApiScope.of(context);
    final auth = AuthScope.of(context);
    return Scaffold(
      backgroundColor: FctzsColors.bg,
      appBar: AppBar(
        title: const Text('FCTZS TRPG部'),
        actions: [
          IconButton(
            tooltip: 'スケジュール照合',
            icon: const Icon(Icons.calendar_month_outlined),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ScheduleMatchScreen()),
            ),
          ),
          if (auth.isSignedIn)
            PopupMenuButton<String>(
              tooltip: auth.displayName,
              onSelected: (value) async {
                if (value == 'logout') {
                  await auth.signOut();
                  if (mounted) await _refresh();
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'logout', child: Text('ログアウト')),
              ],
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Center(
                  child: Text(
                    auth.displayName,
                    style: const TextStyle(fontSize: 13),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            )
          else
            TextButton(
              onPressed: () async {
                try {
                  await auth.signInWithDiscord();
                } catch (e) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('ログイン開始に失敗しました: $e')),
                  );
                }
              },
              child: const Text('ログイン'),
            ),
        ],
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
                if (!data.signedIn)
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: MutedText('Discordログインすると、自分の予定・募集・おすすめが表示されます。'),
                  )
                else if (data.myPlayerId == null)
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: MutedText(
                      'プレイヤー名簿との連携がありません（discord_id 未登録の可能性）。部全体の予定は閲覧できます。',
                    ),
                  )
                else ...[
                  SectionTitle('${data.myPlayerName ?? data.myPlayerId} のダッシュボード'),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 0, 16, 4),
                    child: MutedText('自分の次回予定'),
                  ),
                  if (data.myNextSession == null)
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 16),
                      child: MutedText('予定なし'),
                    )
                  else
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                      child: EntityCard(
                        title: str(data.myNextSession!['title'], '無題セッション'),
                        subtitle: formatDateTime(data.myNextSession!['start']),
                        badge: StatusBadge(str(data.myNextSession!['status'])),
                        onTap: (data.myNextRunId == null || data.myNextRunId == '—')
                            ? null
                            : () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        RunDetailScreen(runId: data.myNextRunId!),
                                  ),
                                ),
                      ),
                    ),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 8, 16, 4),
                    child: MutedText('自分の募集'),
                  ),
                  if (data.myRecruitments.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 16),
                      child: MutedText('自分が立てた募集はありません'),
                    )
                  else
                    ...data.myRecruitments.map((r) {
                      final count = str(
                        r['applicant_count'],
                        '0',
                      );
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                        child: EntityCard(
                          title: str(r['scenario_title'], 'シナリオ未定'),
                          subtitle:
                              '${_recruitStatusLabel(str(r['status']))} · $count / ${str(r['target_count'], '0')}人',
                          badge: StatusBadge(str(r['status'])),
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => RecruitDetailScreen(
                                recruitmentId: str(r['id']),
                              ),
                            ),
                          ),
                        ),
                      );
                    }),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 8, 16, 4),
                    child: MutedText('プレイスタイルおすすめ'),
                  ),
                  if (data.desiresUnset)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const MutedText('プレイスタイル傾向が未設定です。プロフィールで欲求を調整すると表示されます。'),
                          TextButton(
                            onPressed: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => PlayerDetailScreen(
                                  playerId: data.myPlayerId!,
                                ),
                              ),
                            ),
                            child: const Text('自分のプロフィールを見る'),
                          ),
                        ],
                      ),
                    )
                  else if (data.styleMatches.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 16),
                      child: MutedText('いま一致する未経験のシナリオはありません'),
                    )
                  else
                    ...data.styleMatches.map((m) {
                      final s = m.scenario;
                      final sid = str(s['id']);
                      final recruitId = m.openRecruitmentId;
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                        child: EntityCard(
                          title: str(s['title'], sid),
                          subtitle: recruitId != null && recruitId.isNotEmpty
                              ? '${matchScoreLabel(m.score)} · 募集中あり'
                              : matchScoreLabel(m.score),
                          showCover: true,
                          imageUrl: str(s['image_url'], ''),
                          imageHeight: 100,
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => ScenarioDetailScreen(scenarioId: sid),
                            ),
                          ),
                        ),
                      );
                    }),
                  MyAvailabilityCalendar(playerId: data.myPlayerId!),
                  const SectionTitle('部の予定'),
                ],
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
                        showCover: true,
                        imageUrl: FctzsImages.coverForRun(r, data.scenarioImages),
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
