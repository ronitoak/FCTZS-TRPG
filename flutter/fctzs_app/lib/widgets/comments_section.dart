import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import 'common.dart';

/// シナリオ詳細向けのコメント一覧＋投稿（ログイン時のみ投稿可）。
class CommentsSection extends StatefulWidget {
  const CommentsSection({
    super.key,
    required this.targetType,
    required this.targetId,
    required this.comments,
    required this.onPosted,
  });

  final String targetType;
  final String targetId;
  final List<Map<String, dynamic>> comments;
  final Future<void> Function() onPosted;

  @override
  State<CommentsSection> createState() => _CommentsSectionState();
}

class _CommentsSectionState extends State<CommentsSection> {
  final _body = TextEditingController();
  var _posting = false;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit(AuthController auth) async {
    final text = _body.text.trim();
    if (text.isEmpty) return;
    if (!auth.isSignedIn) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('コメント投稿にはDiscordログインが必要です')),
      );
      return;
    }

    setState(() => _posting = true);
    try {
      final api = ApiScope.of(context);
      await api.postComment(
        targetType: widget.targetType,
        targetId: widget.targetId,
        author: auth.displayName,
        body: text,
        userId: auth.user?.id,
      );
      _body.clear();
      await widget.onPosted();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('コメントを投稿しました')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('投稿に失敗しました: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionTitle('コメント'),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!auth.isSignedIn)
                    const MutedText('投稿するにはホーム右上から Discord ログインしてください。')
                  else ...[
                    TextField(
                      controller: _body,
                      minLines: 2,
                      maxLines: 5,
                      maxLength: 4000,
                      decoration: const InputDecoration(
                        labelText: '本文',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton(
                        onPressed: _posting ? null : () => _submit(auth),
                        child: Text(_posting ? '投稿中…' : '投稿'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
        if (widget.comments.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: MutedText('なし'),
          )
        else
          ...widget.comments.map((c) => Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
                child: EntityCard(
                  title: str(c['body']),
                  subtitle: '${str(c['author'])} / ${formatDateTime(c['created_at'])}',
                  onTap: null,
                ),
              )),
      ],
    );
  }
}
