// Worker API クライアント（ゲスト GET + 認証付き POST）。
import 'dart:convert';

import 'package:http/http.dart' as http;

class FctzsApiClient {
  FctzsApiClient({
    String? apiBase,
    http.Client? httpClient,
    this.accessTokenProvider,
  })  : apiBase = (apiBase ??
                const String.fromEnvironment(
                  'API_BASE',
                  defaultValue: 'https://fctzs-trpg.daruji.workers.dev',
                ))
            .replaceAll(RegExp(r'/+$'), ''),
        _http = httpClient ?? http.Client();

  final String apiBase;
  final http.Client _http;
  String? Function()? accessTokenProvider;

  Uri _uri(String path, [Map<String, String>? query]) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$apiBase$normalized').replace(queryParameters: query);
  }

  Map<String, String> _headers({bool authRequired = false}) {
    final headers = <String, String>{
      'Accept': 'application/json',
    };
    final token = accessTokenProvider?.call();
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    } else if (authRequired) {
      throw Exception('この操作にはDiscordログインが必要です');
    }
    return headers;
  }

  Future<dynamic> getJson(String path, {Map<String, String>? query}) async {
    final response = await _http.get(
      _uri(path, query),
      headers: _headers(),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('GET $path failed: ${response.statusCode} ${response.body}');
    }
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> getList(String path, {Map<String, String>? query}) async {
    final decoded = await getJson(path, query: query);
    if (decoded is List) return decoded;
    throw Exception('Expected JSON array from $path');
  }

  Future<Map<String, dynamic>?> getFirst(String path, {Map<String, String>? query}) async {
    final list = await getList(path, query: query);
    if (list.isEmpty) return null;
    return Map<String, dynamic>.from(list.first as Map);
  }

  Future<dynamic> postJson(
    String path, {
    required Object body,
    bool authRequired = true,
  }) async {
    final response = await _http.post(
      _uri(path),
      headers: {
        ..._headers(authRequired: authRequired),
        'Content-Type': 'application/json',
      },
      body: jsonEncode(body),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('POST $path failed: ${response.statusCode} ${response.body}');
    }
    if (response.body.isEmpty) return null;
    return jsonDecode(response.body);
  }

  Future<List<dynamic>> fetchPlayers() => getList('/api/players');

  Future<List<dynamic>> fetchPlayerProfiles() => getList('/api/player_profiles');

  Future<Map<String, dynamic>?> fetchPlayerDetailSummary(String playerId) =>
      getFirst('/api/player_detail_summary', query: {'player_id': playerId});

  Future<Map<String, dynamic>?> fetchPlayerProfile(String playerId) => getFirst(
        '/api/player_profiles',
        query: {
          'player_id': 'eq.$playerId',
          'select': '*',
        },
      );

  Future<Map<String, dynamic>> fetchScheduleMatch({
    required List<String> playerIds,
    required String startDate,
    required String endDate,
  }) async {
    if (playerIds.isEmpty) {
      throw Exception('player_ids required');
    }
    final decoded = await getJson('/api/schedule_match', query: {
      'player_ids': playerIds.join(','),
      'start_date': startDate,
      'end_date': endDate,
    });
    if (decoded is Map<String, dynamic>) return decoded;
    if (decoded is Map) return Map<String, dynamic>.from(decoded);
    throw Exception('Expected object from /api/schedule_match');
  }

  Future<List<dynamic>> fetchScenarios() async {
    try {
      return await getList('/api/scenario_summary');
    } catch (_) {
      return getList('/api/scenarios');
    }
  }

  Future<Map<String, dynamic>?> fetchScenario(String id) =>
      getFirst('/api/scenarios', query: {'id': id});

  Future<List<dynamic>> fetchRecruitments() async {
    try {
      return await getList('/api/recruitment_list');
    } catch (_) {
      return getList('/api/recruitments');
    }
  }

  Future<Map<String, dynamic>?> fetchRecruitment(String id) async {
    try {
      return await getFirst('/api/recruitment_list', query: {'id': id});
    } catch (_) {
      return getFirst('/api/recruitments', query: {'id': 'eq.$id'});
    }
  }

  Future<List<dynamic>> fetchRecruitmentApplicants(String recruitmentId) => getList(
        '/api/recruitment_applicants',
        query: {
          'recruitment_id': 'eq.$recruitmentId',
          'select': '*',
        },
      );

  Future<List<dynamic>> fetchRuns({
    String? id,
    String? scenarioId,
    String? participantId,
    String? characterId,
    String? keyword,
  }) {
    final query = <String, String>{};
    if (id != null) query['id'] = id;
    if (scenarioId != null) query['scenario_id'] = scenarioId;
    if (participantId != null) query['participant_id'] = participantId;
    if (characterId != null) query['character_id'] = characterId;
    if (keyword != null && keyword.isNotEmpty) query['keyword'] = keyword;
    return getList('/api/runs', query: query.isEmpty ? null : query);
  }

  Future<List<dynamic>> fetchSessions() async {
    try {
      return await getList('/api/session_list');
    } catch (_) {
      return getList('/api/sessions');
    }
  }

  Future<List<dynamic>> fetchSessionsForRun(String runId) =>
      getList('/api/sessions/detail', query: {'run_id': runId});

  Future<List<dynamic>> fetchCharacters({
    String? id,
    String? playerId,
    String? scenarioId,
    String? keyword,
  }) {
    final query = <String, String>{};
    if (id != null) query['id'] = id;
    if (playerId != null) query['player_id'] = playerId;
    if (scenarioId != null) query['scenario_id'] = scenarioId;
    if (keyword != null && keyword.isNotEmpty) query['keyword'] = keyword;
    return getList('/api/characters', query: query.isEmpty ? null : query);
  }

  Future<Map<String, dynamic>?> fetchCharacterDetails(String id) =>
      getFirst('/api/character_details', query: {'id': id});

  Future<List<dynamic>> fetchRecentComments() async {
    try {
      return await getList('/api/comments/recent/with_names');
    } catch (_) {
      return getList('/api/comments/recent');
    }
  }

  Future<List<dynamic>> fetchComments({
    required String targetType,
    required String targetId,
  }) =>
      getList('/api/comments', query: {
        'target_type': targetType,
        'target_id': targetId,
      });

  /// Web `Utils.apiPost('comments', …)` 相当。author は Worker 側で上書きされうる。
  Future<void> postComment({
    required String targetType,
    required String targetId,
    required String author,
    required String body,
    String? userId,
  }) async {
    final payload = <String, dynamic>{
      'target_type': targetType,
      'target_id': targetId,
      'author': author,
      'body': body,
    };
    if (userId != null && userId.isNotEmpty) {
      payload['user_id'] = userId;
    }
    await postJson('/api/comments', body: payload);
  }

  Future<Map<String, dynamic>> fetchScenarioInterests(String scenarioId) async {
    final decoded = await getJson(
      '/api/scenario_interests',
      query: {'scenario_id': scenarioId},
    );
    if (decoded is Map<String, dynamic>) return decoded;
    if (decoded is Map) return Map<String, dynamic>.from(decoded);
    throw Exception('Expected object from /api/scenario_interests');
  }
}
