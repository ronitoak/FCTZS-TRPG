import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'auth_config.dart';

/// Discord（Supabase Auth）セッションを保持し、API に Bearer を渡す。
class AuthController extends ChangeNotifier {
  AuthController();

  StreamSubscription<AuthState>? _sub;
  var _ready = false;

  bool get isReady => _ready;
  bool get isSignedIn => session != null;
  Session? get session {
    if (!_ready) return null;
    return Supabase.instance.client.auth.currentSession;
  }

  User? get user {
    if (!_ready) return null;
    return Supabase.instance.client.auth.currentUser;
  }

  String? get accessToken => session?.accessToken;

  String get displayName {
    if (!_ready) return 'ゲスト';
    final meta = user?.userMetadata;
    if (meta == null) return 'ログイン中';
    final name = meta['full_name'] ?? meta['name'] ?? meta['preferred_username'];
    if (name != null && name.toString().trim().isNotEmpty) {
      return name.toString().trim();
    }
    return user?.email ?? 'ログイン中';
  }

  Future<void> initialize() async {
    await Supabase.initialize(
      url: AuthConfig.supabaseUrl,
      publishableKey: AuthConfig.supabaseAnonKey,
    );
    _sub = Supabase.instance.client.auth.onAuthStateChange.listen((_) {
      notifyListeners();
    });
    _ready = true;
    notifyListeners();
  }

  Future<void> signInWithDiscord() async {
    if (!_ready) {
      throw StateError('AuthController が未初期化です');
    }
    await Supabase.instance.client.auth.signInWithOAuth(
      OAuthProvider.discord,
      redirectTo: AuthConfig.resolveRedirectUrl(),
      authScreenLaunchMode: kIsWeb
          ? LaunchMode.platformDefault
          : LaunchMode.externalApplication,
    );
  }

  Future<void> signOut() async {
    if (!_ready) return;
    await Supabase.instance.client.auth.signOut();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

class AuthScope extends InheritedNotifier<AuthController> {
  const AuthScope({
    super.key,
    required AuthController controller,
    required super.child,
  }) : super(notifier: controller);

  static AuthController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AuthScope>();
    assert(scope != null, 'AuthScope not found');
    return scope!.notifier!;
  }
}
