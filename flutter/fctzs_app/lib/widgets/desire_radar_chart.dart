import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Web（`Utils.renderRadarChart`）と同じ軸順・0〜5スケールのプレイスタイルレーダー。
class DesireRadarChart extends StatelessWidget {
  const DesireRadarChart({
    super.key,
    required this.values,
    this.size = 160,
  });

  /// [物語欲, 没入欲, 協調欲, 混沌欲, 攻略欲, 主体欲]
  final List<double> values;
  final double size;

  static const labels = ['物語', '没入', '協調', '混沌', '攻略', '主体'];

  /// player_profiles の desire_* から値を取り出す（未設定は 3）。
  factory DesireRadarChart.fromProfile(
    Map<String, dynamic> profile, {
    Key? key,
    double size = 160,
  }) {
    double v(String key) {
      final raw = profile[key];
      if (raw is num) return raw.toDouble().clamp(0, 5);
      return double.tryParse(raw?.toString() ?? '')?.clamp(0, 5) ?? 3;
    }

    return DesireRadarChart(
      key: key,
      size: size,
      values: [
        v('desire_story'),
        v('desire_avatar'),
        v('desire_harmony'),
        v('desire_chaos'),
        v('desire_clear'),
        v('desire_active'),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _DesireRadarPainter(values: values),
      ),
    );
  }
}

class _DesireRadarPainter extends CustomPainter {
  _DesireRadarPainter({required this.values});

  final List<double> values;
  static const _max = 5.0;
  static const _levels = 5;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.min(size.width, size.height) * 0.32;
    final n = DesireRadarChart.labels.length;
    final angles = List.generate(n, (i) => -math.pi / 2 + (2 * math.pi * i / n));

    Offset pointAt(int i, double value) {
      final t = (value / _max).clamp(0.0, 1.0);
      return Offset(
        center.dx + math.cos(angles[i]) * radius * t,
        center.dy + math.sin(angles[i]) * radius * t,
      );
    }

    final gridPaint = Paint()
      ..color = const Color(0xFFE2E8F0)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;

    final axisPaint = Paint()
      ..color = const Color(0xFFCBD5E0)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;

    for (var level = 1; level <= _levels; level++) {
      final path = Path();
      for (var i = 0; i < n; i++) {
        final p = pointAt(i, level.toDouble());
        if (i == 0) {
          path.moveTo(p.dx, p.dy);
        } else {
          path.lineTo(p.dx, p.dy);
        }
      }
      path.close();
      canvas.drawPath(path, gridPaint);
    }

    for (var i = 0; i < n; i++) {
      canvas.drawLine(center, pointAt(i, _max), axisPaint);
    }

    final dataPath = Path();
    for (var i = 0; i < n; i++) {
      final value = i < values.length ? values[i] : 0.0;
      final p = pointAt(i, value);
      if (i == 0) {
        dataPath.moveTo(p.dx, p.dy);
      } else {
        dataPath.lineTo(p.dx, p.dy);
      }
    }
    dataPath.close();

    canvas.drawPath(
      dataPath,
      Paint()
        ..color = const Color(0x334299E1)
        ..style = PaintingStyle.fill,
    );
    canvas.drawPath(
      dataPath,
      Paint()
        ..color = const Color(0xFF4299E1)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );

    final pointPaint = Paint()..color = const Color(0xFF4299E1);
    final pointBorder = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    for (var i = 0; i < n; i++) {
      final value = i < values.length ? values[i] : 0.0;
      final p = pointAt(i, value);
      canvas.drawCircle(p, 3, pointPaint);
      canvas.drawCircle(p, 3, pointBorder);
    }

    final textStyle = const TextStyle(
      color: FctzsColors.textMain,
      fontSize: 9,
      fontWeight: FontWeight.w700,
    );
    for (var i = 0; i < n; i++) {
      final labelPoint = pointAt(i, _max * 1.28);
      final tp = TextPainter(
        text: TextSpan(text: DesireRadarChart.labels[i], style: textStyle),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(
        canvas,
        Offset(labelPoint.dx - tp.width / 2, labelPoint.dy - tp.height / 2),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _DesireRadarPainter oldDelegate) {
    if (oldDelegate.values.length != values.length) return true;
    for (var i = 0; i < values.length; i++) {
      if (oldDelegate.values[i] != values[i]) return true;
    }
    return false;
  }
}
