import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../auth/player_lookup.dart';
import '../theme/app_theme.dart';
import '../widgets/comments_section.dart';
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
    required this.myPlayerId,
    required this.myPlayerName,
    required this.comments,
  });

  final Map<String, dynamic>? recruitment;
  final List<Map<String, dynamic>> applicants;
  final Map<String, String> playerNames;
  final String? myPlayerId;
  final String? myPlayerName;
  final List<Map<String, dynamic>> comments;
}

class _RecruitDetailScreenState extends State<RecruitDetailScreen> {
  late Future<_RecruitDetailBundle> _future;
  var _ready = false;
  var _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    _future = _load();
  }

  Future<_RecruitDetailBundle> _load() async {
    final api = ApiScope.of(context);
    final auth = AuthScope.of(context);
    final recruitment = await api.fetchRecruitment(widget.recruitmentId);
    final applicants = await api.fetchRecruitmentApplicants(widget.recruitmentId);
    final players = await api.fetchPlayers();
    final names = <String, String>{
      for (final p in players)
        str((p as Map)['player_id']): str(p['player_name']),
    };
    String? myPlayerId;
    String? myPlayerName;
    if (auth.isSignedIn) {
      final me = findPlayerForAuthUser(players, auth.user);
      final id = me?['player_id']?.toString().trim();
      if (id != null && id.isNotEmpty) {
        myPlayerId = id;
        myPlayerName = str(me?['player_name'], id);
      }
    }
    final comments = await api.fetchComments(
      targetType: 'recruitment',
      targetId: widget.recruitmentId,
    );
    return _RecruitDetailBundle(
      recruitment: recruitment,
      applicants: applicants.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
      playerNames: names,
      myPlayerId: myPlayerId,
      myPlayerName: myPlayerName,
      comments: comments.map((e) => Map<String, dynamic>.from(e as Map)).toList(),
    );
  }

  Future<void> _refresh() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  Future<void> _apply(AuthController auth, _RecruitDetailBundle data) async {
    final r = data.recruitment;
    if (r == null) return;
    if (str(r['status']) != 'open') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('この募集は現在受け付けていません')),
      );
      return;
    }
    if (data.myPlayerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            auth.isSignedIn
                ? 'プレイヤー名簿との連携がありません'
                : '応募にはDiscordログインが必要です',
          ),
        ),
      );
      return;
    }
    if (data.applicants.any((a) => str(a['player_id']) == data.myPlayerId)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('すでにこの募集に応募しています')),
      );
      return;
    }

    setState(() => _busy = true);
    try {
      await ApiScope.of(context).applyRecruitment(widget.recruitmentId);
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('応募しました')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('応募に失敗しました: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel(_RecruitDetailBundle data) async {
    final myId = data.myPlayerId;
    if (myId == null) return;
    if (!data.applicants.any((a) => str(a['player_id']) == myId)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('この募集には応募していません')),
      );
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('応募の取消'),
        content: const Text('本当に参加を取り消しますか？'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('やめる')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('取り消す')),
        ],
      ),
    );
    if (ok != true) return;
    if (!mounted) return;

    final api = ApiScope.of(context);
    setState(() => _busy = true);
    try {
      await api.cancelRecruitmentApplication(
        recruitmentId: widget.recruitmentId,
        playerId: myId,
      );
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('参加を取り消しました')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('取り消しに失敗しました: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    return Scaffold(
      backgroundColor: FctzsColors.bg,
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
          final status = str(r['status']);
          final isOpen = status == 'open';
          final alreadyApplied = data.myPlayerId != null &&
              data.applicants.any((a) => str(a['player_id']) == data.myPlayerId);

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
                  subtitle: Text('${str(r['recruit_role'])}募集 / $status'),
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
                const SectionTitle('応募'),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      MutedText(
                        !auth.isSignedIn
                            ? '応募にはホーム右上から Discord ログインしてください。'
                            : data.myPlayerId == null
                                ? 'プレイヤー名簿との連携がありません（discord_id未登録の可能性）。'
                                : '応募者: ${data.myPlayerName ?? data.myPlayerId}',
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton(
                              onPressed: (_busy ||
                                      !isOpen ||
                                      alreadyApplied ||
                                      data.myPlayerId == null)
                                  ? null
                                  : () => _apply(auth, data),
                              child: Text(_busy ? '処理中…' : '応募する'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton(
                              onPressed: (_busy || !alreadyApplied)
                                  ? null
                                  : () => _cancel(data),
                              child: const Text('取り消す'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
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
                CommentsSection(
                  targetType: 'recruitment',
                  targetId: widget.recruitmentId,
                  comments: data.comments,
                  onPosted: _refresh,
                ),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }
}
