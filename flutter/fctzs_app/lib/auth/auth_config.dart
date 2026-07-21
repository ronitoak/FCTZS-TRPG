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

  /// Flutter Web 公開先。Supabase Dashboard の Redirect URLs に追加が必要。
  static const authRedirectUrl = String.fromEnvironment(
    'AUTH_REDIRECT_URL',
    defaultValue: 'https://fctzs-flutter.daruji.workers.dev/',
  );
}
