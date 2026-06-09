import 'package:flutter/material.dart';
import 'home_screen.dart';

// タブの切り替えという「状態」を持つため、StatefulWidgetを使います
class RootScreen extends StatefulWidget {
  const RootScreen({super.key});

  @override
  State<RootScreen> createState() => _RootScreenState();
}

class _RootScreenState extends State<RootScreen> {
  // 現在選択されているタブのインデックス（初期値は0＝ホーム）
  int _currentIndex = 0;

  // 各タブに対応する画面のリスト
  final List<Widget> _screens = [
    const HomeScreen(),                           // 0: ホーム（完成済み）
    const Center(child: Text('募集画面 (準備中)')),    // 1: 募集
    const Center(child: Text('卓画面 (準備中)')),      // 2: セッション(卓)
    const SizedBox(),                             // 3: データ（※画面遷移しないので空でOK）
    const Center(child: Text('マイページ (準備中)')),  // 4: マイページ
  ];

  // タブがタップされた時の処理
  void _onItemTapped(int index) {
    if (index == 3) {
      // ★机上設計で決めた「データ」タブの処理
      // 画面は切り替えず、下からボトムシート（メニュー）を出す
      showModalBottomSheet(
        context: context,
        builder: (context) {
          return SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min, // 中身の高さに合わせる
              children: [
                const Padding(
                  padding: EdgeInsets.all(16.0),
                  child: Text('データ管理', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ),
                ListTile(
                  leading: const Icon(Icons.person),
                  title: const Text('キャラクター一覧'),
                  onTap: () {
                    Navigator.pop(context); // シートを閉じる
                    // TODO: キャラクター画面への遷移を後で実装
                    debugPrint('キャラクター一覧へ');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.book),
                  title: const Text('シナリオ一覧'),
                  onTap: () {
                    Navigator.pop(context); // シートを閉じる
                    // TODO: シナリオ画面への遷移を後で実装
                    debugPrint('シナリオ一覧へ');
                  },
                ),
              ],
            ),
          );
        },
      );
    } else {
      // 3以外のタブなら、普通に画面を切り替える（setStateで再描画）
      setState(() {
        _currentIndex = index;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // 現在のインデックスに対応する画面を表示
      body: _screens[_currentIndex],
      
      // アプリ下部のナビゲーションバー
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: _onItemTapped,
        type: BottomNavigationBarType.fixed, // タブが4つ以上の場合はfixedにするのが一般的
        selectedItemColor: Colors.blue,
        unselectedItemColor: Colors.grey,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'ホーム'),
          BottomNavigationBarItem(icon: Icon(Icons.campaign), label: '募集'),
          BottomNavigationBarItem(icon: Icon(Icons.casino), label: '卓'),
          BottomNavigationBarItem(icon: Icon(Icons.folder), label: 'データ'),
          BottomNavigationBarItem(icon: Icon(Icons.settings), label: 'マイページ'),
        ],
      ),
    );
  }
}