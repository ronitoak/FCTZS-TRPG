import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/common.dart';

/// Web の Schedule 比較（`/api/schedule_match`）のゲスト閲覧版。
class ScheduleMatchScreen extends StatefulWidget {
  const ScheduleMatchScreen({super.key});

  @override
  State<ScheduleMatchScreen> createState() => _ScheduleMatchScreenState();
}

class _ScheduleMatchScreenState extends State<ScheduleMatchScreen> {
  late Future<List<Map<String, dynamic>>> _playersFuture;
  var _ready = false;
  final _selected = <String>{};
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  Future<Map<String, dynamic>>? _matchFuture;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    _playersFuture = _loadPlayers();
  }

  Future<List<Map<String, dynamic>>> _loadPlayers() async {
    final rows = await ApiScope.of(context).fetchPlayers();
    final list = rows.map((e) => Map<String, dynamic>.from(e as Map)).toList()
      ..sort((a, b) => str(a['player_name']).compareTo(str(b['player_name'])));
    return list;
  }

  String _ymd(DateTime d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${two(d.month)}-${two(d.day)}';
  }

  void _runMatch() {
    if (_selected.isEmpty) {
      setState(() {
        _error = 'プレイヤーを1人以上選んでください';
        _matchFuture = null;
      });
      return;
    }
    final start = DateTime(_month.year, _month.month, 1);
    final end = DateTime(_month.year, _month.month + 1, 0);
    setState(() {
      _error = null;
      _matchFuture = ApiScope.of(context).fetchScheduleMatch(
        playerIds: _selected.toList(),
        startDate: _ymd(start),
        endDate: _ymd(end),
      );
    });
  }

  Color _matchColor(String? color) {
    switch (color) {
      case 'green':
        return FctzsColors.success;
      case 'yellow':
        return const Color(0xFFD69E2E);
      case 'red':
        return FctzsColors.danger;
      default:
        return FctzsColors.textMuted;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: FctzsColors.bg,
      appBar: AppBar(title: const Text('スケジュール照合')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Text(
              '複数人の空きを照合します（ゲスト閲覧可・書込みなし）。',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: FctzsColors.textMuted,
                  ),
            ),
          ),
          Expanded(
            child: AsyncBody<List<Map<String, dynamic>>>(
              future: _playersFuture,
              onRefresh: () async {
                final next = _loadPlayers();
                setState(() => _playersFuture = next);
                await next;
              },
              builder: (context, players) {
                return ListView(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
                  children: [
                    const SectionTitle('プレイヤー選択'),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: players.map((p) {
                        final id = str(p['player_id']);
                        final name = str(p['player_name'], id);
                        final selected = _selected.contains(id);
                        return FilterChip(
                          label: Text(name),
                          selected: selected,
                          onSelected: (v) {
                            setState(() {
                              if (v) {
                                _selected.add(id);
                              } else {
                                _selected.remove(id);
                              }
                            });
                          },
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        IconButton(
                          onPressed: () {
                            setState(() {
                              _month = DateTime(_month.year, _month.month - 1);
                            });
                          },
                          icon: const Icon(Icons.chevron_left),
                        ),
                        Expanded(
                          child: Text(
                            '${_month.year}年 ${_month.month}月',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () {
                            setState(() {
                              _month = DateTime(_month.year, _month.month + 1);
                            });
                          },
                          icon: const Icon(Icons.chevron_right),
                        ),
                      ],
                    ),
                    FilledButton(
                      onPressed: _runMatch,
                      child: const Text('この月で照合する'),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      Text(_error!, style: const TextStyle(color: FctzsColors.danger)),
                    ],
                    if (_matchFuture != null) ...[
                      const SizedBox(height: 16),
                      const SectionTitle('照合結果'),
                      FutureBuilder<Map<String, dynamic>>(
                        future: _matchFuture,
                        builder: (context, snap) {
                          if (snap.connectionState != ConnectionState.done) {
                            return const Padding(
                              padding: EdgeInsets.all(24),
                              child: Center(child: CircularProgressIndicator()),
                            );
                          }
                          if (snap.hasError) {
                            return Text(
                              '照合に失敗しました: ${snap.error}',
                              style: const TextStyle(color: FctzsColors.danger),
                            );
                          }
                          final data = snap.data ?? {};
                          final daysInMonth =
                              DateTime(_month.year, _month.month + 1, 0).day;
                          return Column(
                            children: List.generate(daysInMonth, (i) {
                              final day = i + 1;
                              final dateStr =
                                  '${_month.year}-${_month.month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
                              final afternoon = data['${dateStr}_afternoon'];
                              final night = data['${dateStr}_night'];
                              Map<String, dynamic>? asMap(dynamic v) =>
                                  v is Map ? Map<String, dynamic>.from(v) : null;
                              final a = asMap(afternoon);
                              final n = asMap(night);
                              return Card(
                                margin: const EdgeInsets.only(bottom: 8),
                                child: ListTile(
                                  title: Text('$day日（$dateStr）'),
                                  subtitle: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      if (a != null)
                                        Text(
                                          '昼 ${a['symbol'] ?? ''} ${a['label'] ?? ''}',
                                          style: TextStyle(
                                            color: _matchColor(a['color']?.toString()),
                                          ),
                                        ),
                                      if (n != null)
                                        Text(
                                          '夜 ${n['symbol'] ?? ''} ${n['label'] ?? ''}',
                                          style: TextStyle(
                                            color: _matchColor(n['color']?.toString()),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              );
                            }),
                          );
                        },
                      ),
                    ],
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
