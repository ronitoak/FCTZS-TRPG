// FCTZS 特設サイト 閲覧クライアント（ゲスト GET + Discord ログインコメント）。
import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'auth/auth_controller.dart';
import 'screens/app_shell.dart';
import 'theme/app_theme.dart';
import 'widgets/common.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final auth = AuthController();
  await auth.initialize();
  final api = FctzsApiClient(accessTokenProvider: () => auth.accessToken);
  runApp(FctzsApp(auth: auth, api: api));
}

class FctzsApp extends StatelessWidget {
  const FctzsApp({super.key, required this.auth, required this.api});

  final AuthController auth;
  final FctzsApiClient api;

  @override
  Widget build(BuildContext context) {
    return AuthScope(
      controller: auth,
      child: ApiScope(
        api: api,
        child: MaterialApp(
          title: 'FCTZS TRPG部',
          theme: buildFctzsTheme(),
          home: const AppShell(),
        ),
      ),
    );
  }
}

/// 互換: 旧テスト名向けエイリアス
typedef FctzsStarterApp = FctzsApp;
