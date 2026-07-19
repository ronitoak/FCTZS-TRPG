import 'package:flutter_test/flutter_test.dart';

import 'package:fctzs_app/main.dart';

void main() {
  testWidgets('起動時にホームとナビゲーションを表示する', (WidgetTester tester) async {
    await tester.pumpWidget(const FctzsApp());

    expect(find.text('FCTZS TRPG部'), findsOneWidget);
    expect(find.text('ホーム'), findsWidgets);
    expect(find.textContaining('API: https://fctzs-trpg.daruji.workers.dev'), findsOneWidget);
    expect(find.text('PL'), findsOneWidget);
    expect(find.text('シナリオ'), findsOneWidget);

    await tester.pump();
  });
}
