import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/session.dart';

class ApiRepository {
  // Cloudflare WorkersのベースURL
  final String baseUrl = 'https://fctzs-trpg.daruji.workers.dev/api';

  // セッション（スケジュール）一覧を取得するメソッド
  Future<List<Session>> fetchSessions() async {
    final response = await http.get(Uri.parse('$baseUrl/sessions'));

    if (response.statusCode == 200) {
      // Dartでは json.decode で文字列を Map や List に変換します
      final List<dynamic> data = json.decode(response.body);
      
      // Javaの stream().map().collect() に相当する処理
      return data.map((json) => Session.fromJson(json)).toList();
    } else {
      throw Exception('セッションデータの取得に失敗しました: ${response.statusCode}');
    }
  }
}