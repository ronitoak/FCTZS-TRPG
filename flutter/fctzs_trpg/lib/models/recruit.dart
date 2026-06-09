class RecruitmentApplicant {
  final String recruitmentId;
  final String playerId;

    RecruitmentApplicant({
        required this.recruitmentId,
        required this.playerId,
    });

    factory RecruitmentApplicant.fromJson(Map<String, dynamic> json) {
        return RecruitmentApplicant(
            recruitmentId: json['recruitment_id'],
            playerId: json['player_id'],
        );
    }
}

class Recruitment {
  final String id;
  final String ownerPlayerId;
  final String scenarioId;
  final int targetCount;
  final String? memo;
  final String status;

  final List<RecruitmentApplicant> applicants;

    Recruitment({
        required this.id,
        required this.ownerPlayerId,
        required this.scenarioId,
        required this.targetCount,
        this.memo,
        required this.status,
        this.applicants = const [],
    });

    factory Recruitment.fromJson(Map<String, dynamic> json) {
        var applicantsList = json['applicants'] as List?;
        List<RecruitmentApplicant> parsedApplicants = applicantsList != null
            ? applicantsList.map((a) => RecruitmentApplicant.fromJson(a)).toList()
            : [];

        return Recruitment(
            id: json['id'],
            ownerPlayerId: json['owner_player_id'],
            scenarioId: json['scenario_id'],
            targetCount: json['target_count'] ?? 0,
            memo: json['memo'],
            status: json['status'],
            applicants: parsedApplicants, // ここで applicants を適切にパースする必要があります
        );
    }
}