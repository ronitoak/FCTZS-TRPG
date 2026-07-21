import 'package:flutter/material.dart';

import '../auth/auth_controller.dart';
import '../theme/app_theme.dart';
import 'common.dart';

/// シナリオ詳細の「気になる」トグル（要 Discord ログイン＋ players 連携）。
class InterestToggle extends StatefulWidget {
  const InterestToggle({
    super.key,
    required this.scenarioId,
    required this.interested,
    required this.count,
    required this.canToggle,
    required this.onChanged,
  });

  final String scenarioId;
  final bool interested;
  final int count;
  final bool canToggle;
  final Future<void> Function() onChanged;

  @override
  State<InterestToggle> createState() => _InterestToggleState();
}

class _InterestToggleState extends State<InterestToggle> {
  var _busy = false;

  Future<void> _toggle(AuthController auth) async {
    if (!widget.canToggle) {
      final message = !auth.isSignedIn
          ? '気になる登録にはDiscordログインが必要です'
          : 'プレイヤー名簿との連携がありません';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      return;
    }

    setState(() => _busy = true);
    try {
      final api = ApiScope.of(context);
      if (widget.interested) {
        await api.clearScenarioInterest(widget.scenarioId);
      } else {
        await api.setScenarioInterest(widget.scenarioId);
      }
      await widget.onChanged();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('更新に失敗しました: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final label = widget.interested ? '気になる解除' : '気になる';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '気になる ${widget.count}人'
              '${widget.interested ? '（登録済）' : ''}',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          OutlinedButton.icon(
            onPressed: _busy ? null : () => _toggle(auth),
            icon: Icon(
              widget.interested ? Icons.favorite : Icons.favorite_border,
              size: 18,
              color: widget.interested ? FctzsColors.danger : null,
            ),
            label: Text(_busy ? '更新中…' : label),
          ),
        ],
      ),
    );
  }
}
