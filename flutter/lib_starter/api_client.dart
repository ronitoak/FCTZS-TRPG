/// Worker API の最小クライアント（コピーして flutter create 後の lib/ で使う）。
/// 依存: package:http
import 'dart:convert';
import 'package:http/http.dart' as http;

class FctzsApiClient {
  FctzsApiClient({
    String? apiBase,
    http.Client? httpClient,
  })  : apiBase = (apiBase ??
                const String.fromEnvironment(
                  'API_BASE',
                  defaultValue: 'https://fctzs-trpg.daruji.workers.dev',
                ))
            .replaceAll(RegExp(r'/+$'), ''),
        _http = httpClient ?? http.Client();

  final String apiBase;
  final http.Client _http;

  Uri _uri(String path, [Map<String, String>? query]) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$apiBase$normalized').replace(queryParameters: query);
  }

  Future<List<dynamic>> getList(String path, {Map<String, String>? query}) async {
    final response = await _http.get(
      _uri(path, query),
      headers: const {'Accept': 'application/json'},
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('GET $path failed: ${response.statusCode} ${response.body}');
    }
    final decoded = jsonDecode(response.body);
    if (decoded is List) return decoded;
    throw Exception('Expected JSON array from $path');
  }

  /// シナリオ一覧: 軽量API優先、失敗時は従来APIへ。
  Future<List<dynamic>> fetchScenarios() async {
    try {
      return await getList('/api/scenario_summary');
    } catch (_) {
      return getList('/api/scenarios');
    }
  }

  Future<List<dynamic>> fetchPlayers() => getList('/api/players');

  Future<List<dynamic>> fetchRecruitments() async {
    try {
      return await getList('/api/recruitment_list');
    } catch (_) {
      return getList('/api/recruitments');
    }
  }
}
