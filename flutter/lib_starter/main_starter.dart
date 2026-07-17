/// 一覧GETだけの最小 UI 例。
/// 使い方:
/// 1. flutter create fctzs_app
/// 2. flutter pub add http
/// 3. 本ファイルと api_client.dart を lib/ へコピーし、main.dart を置き換える
import 'package:flutter/material.dart';
import 'api_client.dart';

void main() {
  runApp(const FctzsStarterApp());
}

class FctzsStarterApp extends StatelessWidget {
  const FctzsStarterApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FCTZS Starter',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2B6CB0)),
        useMaterial3: true,
      ),
      home: const HomeListsPage(),
    );
  }
}

class HomeListsPage extends StatefulWidget {
  const HomeListsPage({super.key});

  @override
  State<HomeListsPage> createState() => _HomeListsPageState();
}

class _HomeListsPageState extends State<HomeListsPage> {
  final _api = FctzsApiClient();
  late Future<_Bundle> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_Bundle> _load() async {
    final players = await _api.fetchPlayers();
    final scenarios = await _api.fetchScenarios();
    return _Bundle(players: players, scenarios: scenarios);
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('FCTZS（並列学習）'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Players'),
              Tab(text: 'Scenarios'),
            ],
          ),
        ),
        body: FutureBuilder<_Bundle>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return Center(child: Text('読み込み失敗\n${snapshot.error}'));
            }
            final data = snapshot.data!;
            return TabBarView(
              children: [
                _JsonList(
                  items: data.players,
                  titleOf: (row) => '${row['player_name'] ?? row['player_id']}',
                ),
                _JsonList(
                  items: data.scenarios,
                  titleOf: (row) => '${row['title'] ?? row['id']}',
                ),
              ],
            );
          },
        ),
        floatingActionButton: FloatingActionButton(
          onPressed: () => setState(() => _future = _load()),
          child: const Icon(Icons.refresh),
        ),
      ),
    );
  }
}

class _Bundle {
  _Bundle({required this.players, required this.scenarios});
  final List<dynamic> players;
  final List<dynamic> scenarios;
}

class _JsonList extends StatelessWidget {
  const _JsonList({required this.items, required this.titleOf});

  final List<dynamic> items;
  final String Function(Map<String, dynamic> row) titleOf;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const Center(child: Text('0件'));
    }
    return ListView.separated(
      itemCount: items.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final row = Map<String, dynamic>.from(items[index] as Map);
        return ListTile(title: Text(titleOf(row)));
      },
    );
  }
}
