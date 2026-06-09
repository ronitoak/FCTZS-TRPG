class Session {
  final String id; 
  final String title;
  final String runId;
  final String? streamUrl;
  final DateTime? start; 
  final String status;
  final String? notes;

  Session({
    required this.id,
    required this.title,
    required this.runId,
    this.streamUrl,
    this.start,
    this.status = 'scheduled',
    this.notes,
  });

  factory Session.fromJson(Map<String, dynamic> json) {
    return Session(
      id: json['id'],
      title: json['title'],
      runId: json['run_id'],
      streamUrl: json['stream_url'],
      start: json['start'] != null ? DateTime.parse(json['start']) : null,
      status: json['status'] ?? 'scheduled',
      notes: json['notes'],
    );
  }
}