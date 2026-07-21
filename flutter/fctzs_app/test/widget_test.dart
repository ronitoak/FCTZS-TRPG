import 'package:flutter_test/flutter_test.dart';

import 'package:fctzs_app/api/api_client.dart';
import 'package:fctzs_app/auth/auth_controller.dart';
import 'package:fctzs_app/main.dart';

void main() {
  testWidgets('起動時にホームとナビゲーションを表示する', (WidgetTester tester) async {
    final auth = AuthController();
    final api = FctzsApiClient();
    await tester.pumpWidget(FctzsApp(auth: auth, api: api));

    expect(find.text('FCTZS TRPG部'), findsOneWidget);
    expect(find.text('ホーム'), findsWidgets);
    expect(find.textContaining('API: https://fctzs-trpg.daruji.workers.dev'), findsOneWidget);
    expect(find.text('PL'), findsOneWidget);
    expect(find.text('シナリオ'), findsOneWidget);

    await tester.pump();
  });
}
