import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// RootScreenをインポート
import 'views/root_screen.dart'; 

void main() {
  runApp(const ProviderScope(child: TrpgApp()));
}

class TrpgApp extends StatelessWidget {
  const TrpgApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FCTZS TRPG',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
      ),
      // 先ほど作った RootScreen を初期画面に設定！
      home: const RootScreen(), 
    );
  }
}