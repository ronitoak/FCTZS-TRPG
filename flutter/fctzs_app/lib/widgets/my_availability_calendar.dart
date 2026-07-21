import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'common.dart';

const availabilitySlots = ['afternoon', 'night'];

String slotLabel(String slot) => slot == 'night' ? '夜' : '昼';

String statusSymbol(String? status) {
  switch (status) {
    case 'ok':
      return '○';
    case 'maybe':
      return '△';
    case 'ng':
      return '×';
    default:
      return '−';
  }
}

/// Web と同じ: 空 → ok → maybe → ng → 空
String? cycleAvailabilityStatus(String? current) {
  switch (current) {
    case null:
    case '':
    case 'none':
      return 'ok';
    case 'ok':
      return 'maybe';
    case 'maybe':
      return 'ng';
    case 'ng':
      return null;
    default:
      return 'ok';
  }
}

String ymd(DateTime d) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${two(d.month)}-${two(d.day)}';
}

/// ログイン済みホーム向け: 月カレンダー＋一括入力シート。
class MyAvailabilityCalendar extends StatefulWidget {
  const MyAvailabilityCalendar({super.key, required this.playerId});

  final String playerId;

  @override
  State<MyAvailabilityCalendar> createState() => _MyAvailabilityCalendarState();
}

class _MyAvailabilityCalendarState extends State<MyAvailabilityCalendar> {
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  Future<List<Map<String, dynamic>>>? _future;
  var _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load();
  }

  Future<List<Map<String, dynamic>>> _load() {
    return ApiScope.of(context).fetchPlayerAvailabilities(
      playerId: widget.playerId,
      year: _month.year,
      month: _month.month,
    );
  }

  Future<void> _reload() async {
    final next = _load();
    setState(() => _future = next);
    await next;
  }

  void _shiftMonth(int delta) {
    setState(() {
      _month = DateTime(_month.year, _month.month + delta);
      _future = _load();
    });
  }

  Map<String, Map<String, String>> _indexRows(List<Map<String, dynamic>> rows) {
    final map = <String, Map<String, String>>{};
    for (final row in rows) {
      final date = row['target_date']?.toString() ?? '';
      final slot = row['time_slot']?.toString() ?? '';
      final status = row['status']?.toString() ?? '';
      if (date.isEmpty || slot.isEmpty) continue;
      if (status == 'none' || status.isEmpty) continue;
      map.putIfAbsent(date, () => {});
      map[date]![slot] = status;
    }
    return map;
  }

  bool _needsInput(Map<String, String>? day) {
    if (day == null || day.isEmpty) return true;
    return !day.values.any((s) => s == 'ok' || s == 'maybe' || s == 'ng');
  }

  Future<void> _openEditor(List<Map<String, dynamic>> rows) async {
    final indexed = _indexRows(rows);
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _AvailabilityEditorSheet(
        playerId: widget.playerId,
        month: _month,
        initial: indexed,
      ),
    );
    if (saved == true && mounted) {
      await _reload();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('予定を保存しました')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final future = _future;
    if (future == null) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: MutedText('予定カレンダー（タップで一括入力）'),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: [
              IconButton(
                onPressed: _busy ? null : () => _shiftMonth(-1),
                icon: const Icon(Icons.chevron_left),
              ),
              Expanded(
                child: Text(
                  '${_month.year}年 ${_month.month}月',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              IconButton(
                onPressed: _busy ? null : () => _shiftMonth(1),
                icon: const Icon(Icons.chevron_right),
              ),
              TextButton(
                onPressed: _busy
                    ? null
                    : () async {
                        setState(() => _busy = true);
                        try {
                          final rows = await future;
                          if (!mounted) return;
                          await _openEditor(rows);
                        } finally {
                          if (mounted) setState(() => _busy = false);
                        }
                      },
                child: const Text('一括入力'),
              ),
            ],
          ),
        ),
        FutureBuilder<List<Map<String, dynamic>>>(
          future: future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            if (snapshot.hasError) {
              return Padding(
                padding: const EdgeInsets.all(16),
                child: MutedText('予定の読み込みに失敗: ${snapshot.error}'),
              );
            }
            final indexed = _indexRows(snapshot.data ?? const []);
            final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
            return Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Column(
                children: [
                  for (var day = 1; day <= daysInMonth; day++)
                    Builder(builder: (context) {
                      final date = DateTime(_month.year, _month.month, day);
                      final key = ymd(date);
                      final slots = indexed[key];
                      final missing = _needsInput(slots);
                      final afternoon = slots?['afternoon'];
                      final night = slots?['night'];
                      return Card(
                        color: missing
                            ? const Color(0xFFFFF5F5)
                            : FctzsColors.surface,
                        child: ListTile(
                          dense: true,
                          title: Text(
                            '${date.month}/${date.day}（${_weekday(date.weekday)}）',
                          ),
                          subtitle: Text(
                            '昼${statusSymbol(afternoon)}  夜${statusSymbol(night)}'
                            '${missing ? '  · 未入力' : ''}',
                          ),
                          trailing: const Icon(Icons.edit_outlined, size: 18),
                          onTap: () => _openEditor(snapshot.data ?? const []),
                        ),
                      );
                    }),
                ],
              ),
            );
          },
        ),
      ],
    );
  }

  String _weekday(int weekday) {
    const labels = ['月', '火', '水', '木', '金', '土', '日'];
    return labels[(weekday - 1).clamp(0, 6)];
  }
}

class _AvailabilityEditorSheet extends StatefulWidget {
  const _AvailabilityEditorSheet({
    required this.playerId,
    required this.month,
    required this.initial,
  });

  final String playerId;
  final DateTime month;
  final Map<String, Map<String, String>> initial;

  @override
  State<_AvailabilityEditorSheet> createState() =>
      _AvailabilityEditorSheetState();
}

class _AvailabilityEditorSheetState extends State<_AvailabilityEditorSheet> {
  late Map<String, Map<String, String?>> _draft;
  var _saving = false;

  @override
  void initState() {
    super.initState();
    _draft = {};
    final days = DateTime(widget.month.year, widget.month.month + 1, 0).day;
    for (var day = 1; day <= days; day++) {
      final key = ymd(DateTime(widget.month.year, widget.month.month, day));
      final src = widget.initial[key] ?? const {};
      _draft[key] = {
        'afternoon': src['afternoon'],
        'night': src['night'],
      };
    }
  }

  void _cycle(String date, String slot) {
    setState(() {
      final day = _draft.putIfAbsent(date, () => {});
      day[slot] = cycleAvailabilityStatus(day[slot]);
    });
  }

  List<Map<String, dynamic>> _collectChanges() {
    final changes = <Map<String, dynamic>>[];
    for (final entry in _draft.entries) {
      final date = entry.key;
      final initialDay = widget.initial[date] ?? const <String, String>{};
      for (final slot in availabilitySlots) {
        final next = entry.value[slot];
        final prev = initialDay[slot];
        final nextNorm = (next == null || next.isEmpty) ? 'none' : next;
        final prevNorm = (prev == null || prev.isEmpty) ? 'none' : prev;
        if (nextNorm == prevNorm) continue;
        changes.add({
          'player_id': widget.playerId,
          'target_date': date,
          'time_slot': slot,
          'status': nextNorm,
        });
      }
    }
    return changes;
  }

  Future<void> _save() async {
    final changes = _collectChanges();
    if (changes.isEmpty) {
      Navigator.of(context).pop(false);
      return;
    }
    setState(() => _saving = true);
    try {
      await ApiScope.of(context).upsertPlayerAvailability(changes);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('保存に失敗しました: $e')),
      );
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, controller) {
          return Column(
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: FctzsColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${widget.month.year}年${widget.month.month}月の予定',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    TextButton(
                      onPressed: _saving ? null : () => Navigator.pop(context, false),
                      child: const Text('閉じる'),
                    ),
                    FilledButton(
                      onPressed: _saving ? null : _save,
                      child: Text(_saving ? '保存中…' : '保存'),
                    ),
                  ],
                ),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: MutedText('タップで ○ → △ → × → − と切り替わります。変更分だけ保存します。'),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: ListView.builder(
                  controller: controller,
                  itemCount: _draft.length,
                  itemBuilder: (context, index) {
                    final date = _draft.keys.elementAt(index);
                    final day = _draft[date]!;
                    final parsed = DateTime.tryParse(date);
                    final label = parsed == null
                        ? date
                        : '${parsed.month}/${parsed.day}';
                    return ListTile(
                      title: Text(label),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          for (final slot in availabilitySlots) ...[
                            if (slot != availabilitySlots.first)
                              const SizedBox(width: 8),
                            OutlinedButton(
                              onPressed: _saving ? null : () => _cycle(date, slot),
                              child: Text(
                                '${slotLabel(slot)}${statusSymbol(day[slot])}',
                              ),
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
