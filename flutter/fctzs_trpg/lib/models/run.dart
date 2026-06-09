class Run {
  final String id; 
  final String title;
  final String scenarioId;
  final String status;
  final String? gmId;     
  final List<String> playerIds; 
  final List<String>? characters; 

  Run({
    required this.id,
    required this.title,
    required this.scenarioId,
    this.status = 'planning',
    this.gmId,
    required this.playerIds,
    this.characters,
  });

  factory Run.fromJson(Map<String, dynamic> json) {
    return Run(
      id: json['id'],
      title: json['title'] ?? '名称未設定の卓',
      scenarioId: json['scenario_id'],
      status: json['status'] ?? 'planning',
      gmId: json['gm_id'],
      playerIds: List<String>.from(json['player_ids'] ?? []),
      characters: List<String>.from(json['characters'] ?? []),
    );
  }
}