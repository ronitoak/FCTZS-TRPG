// character.dart という1つのファイルに書くイメージ

/// 子クラス：キャラクター技能（DBの character_skills テーブル相当）
class CharacterSkill {
  final String characterId; // 親のID
  final String name;        // 例："目星"
  final String skillKey;
  final int value;          // 技能値

  CharacterSkill({
    required this.characterId,
    required this.name,
    required this.skillKey,
    required this.value,
  });

  factory CharacterSkill.fromJson(Map<String, dynamic> json) {
    return CharacterSkill(
      characterId: json['character_id'],
      name: json['name'],
      skillKey: json['skill_key'],
      value: json['value'] ?? 0,
    );
  }
}

/// 親クラス：キャラクター（DBの characters テーブル相当）
class Character {
  final String id;
  final String name;
  final String system;
  final String state;
  final String? job;
  final int? age;
  final String? gender;
  final int? height;
  final int? weight;
  final String? origin;
  final String? memo;
  final String? iacharaUrl;
  final String? race;
  final String? originalSpecies;
  final String? playerId;
  
  // ★ ここで子（技能のリスト）を保持する！
  final List<CharacterSkill> skills; 

  Character({
    required this.id,
    required this.name,
    required this.system,
    required this.state,
    this.job,
    this.age,
    this.gender,
    this.height,
    this.weight,
    this.origin,
    this.memo,
    this.iacharaUrl,
    this.race,
    this.originalSpecies,
    this.playerId,
    this.skills = const [], // デフォルトは空リスト
  });

  factory Character.fromJson(Map<String, dynamic> json) {
    // APIから "skills" という配列が一緒に返ってきた場合のパース処理
    var skillsList = json['skills'] as List?;
    List<CharacterSkill> parsedSkills = skillsList != null
        ? skillsList.map((s) => CharacterSkill.fromJson(s)).toList()
        : [];

    return Character(
      id: json['id'],
      name: json['name'],
      system: json['system'],
      state: json['state'],
      job: json['job'],
      age: json['age'],
      gender: json['gender'],
      height: json['height'],
      weight: json['weight'],
      origin: json['origin'],
      memo: json['memo'],
      iacharaUrl: json['iachara_url'],
      race: json['race'],
      originalSpecies: json['original_species'],
      playerId: json['player_id'],
      skills: parsedSkills, // 子オブジェクトのリストをセット
    );
  }
}