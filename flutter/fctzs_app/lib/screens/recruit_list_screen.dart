import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/common.dart';
import 'recruit_detail_screen.dart';

class RecruitListScreen extends StatefulWidget {
  const RecruitListScreen({super.key});

  @override
  State<RecruitListScreen> createState() => _RecruitListScreenState();
}

class _RecruitListScreenState extends State<RecruitListScreen> {
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
    final rows = await ApiScope.of(context).fetchRecruitments();
    return rows.map((e) => Map<String, dynamic>.from(e as Map)).toList();
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
      appBar: AppBar(title: const Text('募集一覧')),
      body: Column(
        children: [
          SearchField(
            controller: _search,
            hintText: 'シナリオ・募集主・ステータス',
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
                          str(r['scenario_title']),
                          str(r['owner_player_name']),
                          str(r['status']),
                          str(r['recruit_role']),
                        ].join(' ').toLowerCase();
                        return hay.contains(_query);
                      }).toList();
                return RefreshList(
                  onRefresh: _refresh,
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final row = filtered[index];
                    final count = row['applicant_count'] ?? 0;
                    final target = row['target_count'] ?? '?';
                    return EntityCard(
                      showCover: true,
                      imageUrl: str(row['scenario_image_url'], ''),
                      imageHeight: 140,
                      badge: StatusBadge(str(row['status'])),
                      title: str(row['scenario_title'], 'シナリオ未設定'),
                      subtitle:
                          '${str(row['recruit_role'])}募集\n'
                          '主: ${str(row['owner_player_name'])} / $count/$target人',
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => RecruitDetailScreen(
                            recruitmentId: str(row['id']),
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
