import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../repositories/api_repository.dart';
import '../models/session.dart';

// 1. API Repositoryのインスタンスを提供するプロバイダー（DIコンテナの役割）
final apiRepositoryProvider = Provider((ref) => ApiRepository());

// 2. APIからセッション一覧を非同期で取得するプロバイダー
// FutureProviderを使うと、「ローディング中」「成功」「失敗」の状態を自動で管理してくれます
final sessionsProvider = FutureProvider<List<Session>>((ref) async {
  // apiRepositoryProvider からインスタンスを取得
  final repository = ref.watch(apiRepositoryProvider);
  // API通信を実行して結果を返す
  return repository.fetchSessions();
});