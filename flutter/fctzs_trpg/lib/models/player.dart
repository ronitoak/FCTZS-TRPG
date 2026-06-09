class Player {
  final String id;
  final String name;
  final String? discordId;

    Player({
        required this.id,
        required this.name,
        this.discordId,
    });

    factory Player.fromJson(Map<String, dynamic> json) {
        return Player(
            id: json['player_id'],
            name: json['player_name'],
            discordId: json['discord_id'],
        );
    }
}