class Scenario {
  final String id; 
  final String title;
  final String system;
  final String author;
  final String? description;     
  final String? notes;     

  Scenario({
    required this.id,
    required this.title,
    required this.system,
    required this.author,
    this.description,
    this.notes,
  });

  factory Scenario.fromJson(Map<String, dynamic> json) {
    return Scenario(
      id: json['id'],
      title: json['title'],
      system: json['system'],
      author: json['author'],
      description: json['description'],
      notes: json['notes'],
    );
  }
}