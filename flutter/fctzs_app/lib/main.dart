// FCTZS 特設サイト 閲覧クライアント（ゲスト GET）。
import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'screens/app_shell.dart';
import 'theme/app_theme.dart';
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
        title: 'FCTZS TRPG部',
        theme: buildFctzsTheme(),
        home: const AppShell(),
      ),
    );
  }
}

/// 互換: 旧テスト名向けエイリアス
typedef FctzsStarterApp = FctzsApp;
