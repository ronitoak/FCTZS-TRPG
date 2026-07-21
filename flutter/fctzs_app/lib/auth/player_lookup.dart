import 'package:supabase_flutter/supabase_flutter.dart';

/// Web `Utils.extractDiscordIdFromUser` 相当。
String? extractDiscordIdFromUser(User? user) {
  if (user == null) return null;
  final meta = user.userMetadata ?? const <String, dynamic>{};
  final candidates = <dynamic>[
    meta['provider_id'],
    meta['sub'],
    ...(user.identities ?? const <UserIdentity>[]).expand((identity) {
      if (identity.provider != 'discord') return const <dynamic>[];
      final data = identity.identityData ?? const <String, dynamic>{};
      return <dynamic>[
        identity.id,
        data['provider_id'],
        data['sub'],
        data['id'],
      ];
    }),
  ];
  for (final candidate in candidates) {
    final value = candidate?.toString().trim() ?? '';
    if (RegExp(r'^\d{17,20}$').hasMatch(value)) return value;
  }
  return null;
}

/// Auth UUID（user_id）または Discord snowflake（discord_id）で players を探す。
Map<String, dynamic>? findPlayerForAuthUser(
  List<dynamic> playerList,
  User? user,
) {
  if (user == null) return null;
  for (final raw in playerList) {
    if (raw is! Map) continue;
    final item = Map<String, dynamic>.from(raw);
    final userId = item['user_id']?.toString();
    if (userId != null && userId == user.id) return item;
  }
  final discordId = extractDiscordIdFromUser(user);
  if (discordId == null) return null;
  for (final raw in playerList) {
    if (raw is! Map) continue;
    final item = Map<String, dynamic>.from(raw);
    final id = item['discord_id']?.toString();
    if (id != null && id == discordId) return item;
  }
  return null;
}
