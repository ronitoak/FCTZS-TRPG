import 'package:flutter/material.dart';

/// 現行特設サイト `css/style.css` の :root に合わせた配色。
abstract final class FctzsColors {
  static const bg = Color(0xFFF2F2F2);
  static const surface = Color(0xFFFFFFFF);
  static const textMain = Color(0xFF333333);
  static const textMuted = Color(0xFF666666);
  static const border = Color(0xFFE2E8F0);
  static const primary = Color(0xFF3182CE);
  static const primaryHover = Color(0xFF2B6CB0);
  static const success = Color(0xFF38A169);
  static const danger = Color(0xFFE53E3E);
  static const cancel = Color(0xFF718096);
  static const headingLine = Color(0xFFCCCCCC);

  static const planning = Color(0xFF08B1FF);
  static const active = Color(0xFF006400); // darkgreen
  static const done = Color(0xFF777777);
  static const lostAccent = Color(0xFF8B0000);
  static const lostBg = Color(0xFF2A0F0F);
  static const lostText = Color(0xFFE0C0C0);
  static const rescuedAccent = Color(0xFFFF8C00);
  static const rescuedBg = Color(0xFF241A38);
  static const rescuedText = Color(0xFFE6DCFF);

  static const radius = 8.0;
}

ThemeData buildFctzsTheme() {
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    fontFamily: null, // システム sans-serif（Web: Segoe UI / モバイル: 標準）
    scaffoldBackgroundColor: FctzsColors.bg,
    colorScheme: const ColorScheme.light(
      primary: FctzsColors.primary,
      onPrimary: Colors.white,
      secondary: FctzsColors.primaryHover,
      onSecondary: Colors.white,
      surface: FctzsColors.surface,
      onSurface: FctzsColors.textMain,
      error: FctzsColors.danger,
      onError: Colors.white,
      outline: FctzsColors.border,
    ),
  );

  return base.copyWith(
    appBarTheme: const AppBarTheme(
      backgroundColor: FctzsColors.surface,
      foregroundColor: FctzsColors.textMain,
      elevation: 0,
      scrolledUnderElevation: 1,
      shadowColor: Color(0x14000000),
      titleTextStyle: TextStyle(
        color: FctzsColors.textMain,
        fontSize: 20,
        fontWeight: FontWeight.w700,
      ),
      centerTitle: false,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: FctzsColors.surface,
      indicatorColor: FctzsColors.primary.withValues(alpha: 0.15),
      elevation: 3,
      shadowColor: const Color(0x14000000),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 12,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          color: selected ? FctzsColors.primary : FctzsColors.textMuted,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          color: selected ? FctzsColors.primary : FctzsColors.textMuted,
        );
      }),
    ),
    cardTheme: CardThemeData(
      color: FctzsColors.surface,
      elevation: 2,
      shadowColor: const Color(0x14000000),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(FctzsColors.radius),
      ),
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
    ),
    dividerTheme: const DividerThemeData(
      color: FctzsColors.border,
      thickness: 1,
      space: 1,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: FctzsColors.surface,
      hintStyle: const TextStyle(color: FctzsColors.textMuted),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(4),
        borderSide: const BorderSide(color: FctzsColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(4),
        borderSide: const BorderSide(color: FctzsColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(4),
        borderSide: const BorderSide(color: FctzsColors.primary, width: 1.5),
      ),
    ),
    listTileTheme: const ListTileThemeData(
      iconColor: FctzsColors.textMuted,
      textColor: FctzsColors.textMain,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: FctzsColors.primary,
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: FctzsColors.primary,
      foregroundColor: Colors.white,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: FctzsColors.textMain,
      displayColor: FctzsColors.textMain,
    ).copyWith(
      titleLarge: const TextStyle(
        color: FctzsColors.textMain,
        fontSize: 22,
        fontWeight: FontWeight.w700,
      ),
      titleMedium: const TextStyle(
        color: FctzsColors.textMain,
        fontSize: 18,
        fontWeight: FontWeight.w700,
      ),
      bodyMedium: const TextStyle(
        color: FctzsColors.textMain,
        fontSize: 15,
        height: 1.55,
      ),
      bodySmall: const TextStyle(
        color: FctzsColors.textMuted,
        fontSize: 13,
        height: 1.45,
      ),
      labelMedium: const TextStyle(
        color: FctzsColors.textMuted,
        fontSize: 12,
        fontWeight: FontWeight.w600,
      ),
    ),
  );
}

Color statusColor(String? status) {
  switch ((status ?? '').toLowerCase()) {
    case 'active':
    case 'survived':
    case 'alive':
      return FctzsColors.active;
    case 'planning':
    case 'scheduled':
      return FctzsColors.planning;
    case 'done':
      return FctzsColors.done;
    case 'cancelled':
    case 'canceled':
    case 'lost':
      return FctzsColors.danger;
    case 'rescued':
      return FctzsColors.rescuedAccent;
    case 'open':
    case 'recruiting':
      return FctzsColors.success;
    case 'fulfilled':
    case 'full':
      return FctzsColors.cancel;
    default:
      return FctzsColors.cancel;
  }
}

String statusLabel(String? status) {
  final s = (status ?? '').toLowerCase();
  switch (s) {
    case 'active':
      return '進行中';
    case 'planning':
      return '準備中';
    case 'scheduled':
      return '予定';
    case 'done':
      return '完了';
    case 'cancelled':
    case 'canceled':
      return '中止';
    case 'survived':
      return 'ALIVE';
    case 'lost':
      return 'LOST';
    case 'rescued':
      return 'RESCUED';
    case 'open':
    case 'recruiting':
      return '募集中';
    case 'fulfilled':
    case 'full':
      return '満員';
    default:
      return status?.isNotEmpty == true ? status! : '—';
  }
}
