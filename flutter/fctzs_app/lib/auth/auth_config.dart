import 'package:flutter/foundation.dart';

/// Web `js/init-supabase.js` / `js/site-config.js` と同じ既定値。
/// 上書きは `--dart-define=SUPABASE_URL=...` 等。
abstract final class AuthConfig {
  static const supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://bcmxaqrjpelpfxafrtqu.supabase.co',
  );

  static const supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjbXhhcXJqcGVscGZ4YWZydHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDExNzgsImV4cCI6MjA4MzUxNzE3OH0.3CtMMsv2c7fbLgC8-wd17ppyfhK31WRnhBT2CIVGyYY',
  );

  static const productionRedirectUrl = 'https://fctzs-flutter.daruji.workers.dev/';

  /// `--dart-define=AUTH_REDIRECT_URL=...`（未指定時は空）。
  static const _redirectOverride = String.fromEnvironment('AUTH_REDIRECT_URL');

  /// 互換用。明示 override または本番 URL。
  static String get authRedirectUrl =>
      _redirectOverride.isNotEmpty ? _redirectOverride : productionRedirectUrl;

  /// Web では「今開いているオリジン」を優先（ローカル run 後に古い公開版へ飛ばない）。
  static String resolveRedirectUrl() {
    if (_redirectOverride.isNotEmpty) {
      return _redirectOverride.endsWith('/')
          ? _redirectOverride
          : '$_redirectOverride/';
    }
    if (kIsWeb) {
      final origin = Uri.base.origin;
      if (origin.isNotEmpty && origin != 'null') {
        return origin.endsWith('/') ? origin : '$origin/';
      }
    }
    return productionRedirectUrl;
  }
}
