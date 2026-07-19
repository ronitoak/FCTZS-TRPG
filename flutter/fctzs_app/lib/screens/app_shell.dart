import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'characters_list_screen.dart';
import 'home_screen.dart';
import 'players_list_screen.dart';
import 'recruit_list_screen.dart';
import 'scenarios_list_screen.dart';
import 'sessions_list_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  // Web ヘッダ（utils.js）と同じ順: Home | Characters | Sessions | Scenarios | Recruit | Players
  static const _pages = <Widget>[
    HomeScreen(),
    CharactersListScreen(),
    SessionsListScreen(),
    ScenariosListScreen(),
    RecruitListScreen(),
    PlayersListScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: FctzsColors.bg,
      body: IndexedStack(
        index: _index,
        children: _pages,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'ホーム',
          ),
          NavigationDestination(
            icon: Icon(Icons.badge_outlined),
            selectedIcon: Icon(Icons.badge),
            label: 'キャラ',
          ),
          NavigationDestination(
            icon: Icon(Icons.event_outlined),
            selectedIcon: Icon(Icons.event),
            label: 'セッション',
          ),
          NavigationDestination(
            icon: Icon(Icons.menu_book_outlined),
            selectedIcon: Icon(Icons.menu_book),
            label: 'シナリオ',
          ),
          NavigationDestination(
            icon: Icon(Icons.campaign_outlined),
            selectedIcon: Icon(Icons.campaign),
            label: '募集',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'PL',
          ),
        ],
      ),
    );
  }
}
