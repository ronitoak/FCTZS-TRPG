import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/session_provider.dart';

// StatelessWidget ではなく ConsumerWidget を継承することで、状態(Riverpod)を監視できます
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // sessionsProvider の状態を監視します
    final sessionsAsyncValue = ref.watch(sessionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('直近のスケジュール'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      // .when() を使うことで、非同期処理の3つの状態（データあり、ローディング中、エラー）を強制的に網羅させます
      body: sessionsAsyncValue.when(
        data: (sessions) {
          // データが空の場合
          if (sessions.isEmpty) {
            return const Center(child: Text('予定されているセッションはありません'));
          }
          // リスト表示（JavaのRecyclerViewのようなものです）
          return ListView.builder(
            itemCount: sessions.length,
            itemBuilder: (context, index) {
              final session = sessions[index];
              // 日時の簡単なフォーマット
              final dateStr = session.start != null 
                  ? '${session.start!.month}/${session.start!.day} ${session.start!.hour}:${session.start!.minute.toString().padLeft(2, '0')}'
                  : '日時未定';

              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: ListTile(
                  leading: const Icon(Icons.event, color: Colors.blue),
                  title: Text(session.title),
                  subtitle: Text('日時: $dateStr\n状態: ${session.status}'),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                  onTap: () {
                    // TODO: 後で詳細画面への遷移を実装します
                    debugPrint('${session.title} がタップされました');
                  },
                ),
              );
            },
          );
        },
        // 読み込み中（くるくるアニメーションを表示）
        loading: () => const Center(child: CircularProgressIndicator()),
        // エラー発生時
        error: (error, stack) => Center(child: Text('エラーが発生しました\n$error')),
      ),
    );
  }
}