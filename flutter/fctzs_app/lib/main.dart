// FCTZS 特設サイト 閲覧クライアント（ゲスト GET）。
import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'screens/app_shell.dart';
import 'widgets/common.dart';

void main() {
  runApp(const FctzsApp());
}

class FctzsApp extends StatelessWidget {
  const FctzsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ApiScope(
      api: FctzsApiClient(),
      child: MaterialApp(
        title: 'FCTZS TRPG',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2B6CB0)),
          useMaterial3: true,
        ),
        home: const AppShell(),
      ),
    );
  }
}

/// 互換: 旧テスト名向けエイリアス
typedef FctzsStarterApp = FctzsApp;
