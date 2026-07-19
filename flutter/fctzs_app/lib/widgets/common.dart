import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../media/image_urls.dart';
import '../theme/app_theme.dart';

String str(dynamic value, [String fallback = '—']) {
  if (value == null) return fallback;
  final text = value.toString().trim();
  return text.isEmpty ? fallback : text;
}

String formatDateTime(dynamic value) {
  if (value == null) return '—';
  final parsed = DateTime.tryParse(value.toString());
  if (parsed == null) return value.toString();
  final local = parsed.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${local.year}-${two(local.month)}-${two(local.day)} '
      '${two(local.hour)}:${two(local.minute)}';
}

class ApiScope extends InheritedWidget {
  const ApiScope({super.key, required this.api, required super.child});

  final FctzsApiClient api;

  static FctzsApiClient of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<ApiScope>();
    assert(scope != null, 'ApiScope not found');
    return scope!.api;
  }

  @override
  bool updateShouldNotify(ApiScope oldWidget) => api != oldWidget.api;
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.status, {super.key, this.label});

  final String? status;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final color = statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label ?? statusLabel(status),
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

class SearchField extends StatelessWidget {
  const SearchField({
    super.key,
    required this.controller,
    required this.hintText,
    required this.onChanged,
  });

  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
      child: TextField(
        controller: controller,
        decoration: InputDecoration(
          hintText: hintText,
          prefixIcon: const Icon(Icons.search, color: FctzsColors.textMuted),
          suffixIcon: controller.text.isEmpty
              ? null
              : IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () {
                    controller.clear();
                    onChanged('');
                  },
                ),
          isDense: true,
        ),
        onChanged: onChanged,
      ),
    );
  }
}

class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({
    super.key,
    required this.future,
    required this.onRefresh,
    required this.builder,
  });

  final Future<T> future;
  final Future<void> Function() onRefresh;
  final Widget Function(BuildContext context, T data) builder;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return RefreshIndicator(
            onRefresh: onRefresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const SizedBox(height: 80),
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    '読み込み失敗\n${snapshot.error}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: FctzsColors.textMuted),
                  ),
                ),
              ],
            ),
          );
        }
        return builder(context, snapshot.data as T);
      },
    );
  }
}

class RefreshList extends StatelessWidget {
  const RefreshList({
    super.key,
    required this.onRefresh,
    required this.itemCount,
    required this.itemBuilder,
    this.emptyText = '0件',
    this.header,
    this.padding = const EdgeInsets.fromLTRB(12, 4, 12, 16),
  });

  final Future<void> Function() onRefresh;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final String emptyText;
  final Widget? header;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    if (itemCount == 0) {
      return RefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: padding,
          children: [
            ?header,
            const SizedBox(height: 80),
            Center(
              child: Text(
                emptyText,
                style: const TextStyle(color: FctzsColors.textMuted),
              ),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: padding,
        itemCount: itemCount + (header != null ? 1 : 0),
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          if (header != null) {
            if (index == 0) return header!;
            return itemBuilder(context, index - 1);
          }
          return itemBuilder(context, index);
        },
      ),
    );
  }
}

class CoverImage extends StatelessWidget {
  const CoverImage(
    this.url, {
    super.key,
    this.height = 160,
    this.fit = BoxFit.cover,
    this.fallback = FctzsImages.scenarioDefault,
  });

  /// キャラクター用（デフォルト画像が異なる）。
  const CoverImage.character(
    this.url, {
    super.key,
    this.height = 160,
    this.fit = BoxFit.cover,
  }) : fallback = FctzsImages.characterDefault;

  final String? url;
  final double height;
  final BoxFit fit;
  final String fallback;

  Widget _placeholder() {
    return Container(
      height: height,
      width: double.infinity,
      color: FctzsColors.bg,
      alignment: Alignment.center,
      child: const Icon(Icons.image_not_supported_outlined, color: FctzsColors.textMuted),
    );
  }

  /// CanvasKit のバイト取得が失敗しても、特設サイトの <img> と同様に表示できるよう
  /// Web では HTML 要素へフォールバックする（CORS / 一部コーデック差の回避）。
  static const _webStrategy = WebHtmlElementStrategy.fallback;

  @override
  Widget build(BuildContext context) {
    // Web と同様: DBのURLが404でも onerror 相当でデフォルト画像へ落とす。
    final primary = FctzsImages.absoluteUrl(url) ?? fallback;
    return Image.network(
      primary,
      height: height,
      width: double.infinity,
      fit: fit,
      webHtmlElementStrategy: _webStrategy,
      errorBuilder: (_, _, _) {
        if (primary == fallback) return _placeholder();
        return Image.network(
          fallback,
          height: height,
          width: double.infinity,
          fit: fit,
          webHtmlElementStrategy: _webStrategy,
          errorBuilder: (_, _, _) => _placeholder(),
        );
      },
    );
  }
}

/// 特設サイトのカード相当。
class EntityCard extends StatelessWidget {
  const EntityCard({
    super.key,
    required this.onTap,
    this.imageUrl,
    this.imageHeight = 140,
    this.showCover = false,
    this.useCharacterFallback = false,
    this.badge,
    required this.title,
    this.subtitle,
    this.footer,
    this.leading,
  });

  final VoidCallback? onTap;
  final String? imageUrl;
  final double imageHeight;
  /// true のとき画像枠を出し、URLが空/404ならデフォルト画像へフォールバックする。
  final bool showCover;
  final bool useCharacterFallback;
  final Widget? badge;
  final String title;
  final String? subtitle;
  final Widget? footer;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: FctzsColors.surface,
      elevation: 2,
      shadowColor: const Color(0x14000000),
      borderRadius: BorderRadius.circular(FctzsColors.radius),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (leading != null)
              leading!
            else if (showCover)
              Stack(
                children: [
                  useCharacterFallback
                      ? CoverImage.character(imageUrl, height: imageHeight)
                      : CoverImage(imageUrl, height: imageHeight),
                  if (badge != null)
                    Positioned(top: 8, right: 8, child: badge!),
                ],
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (badge != null && leading == null && !showCover) ...[
                    Align(alignment: Alignment.centerRight, child: badge!),
                    const SizedBox(height: 6),
                  ],
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: FctzsColors.textMain,
                    ),
                  ),
                  if (subtitle != null && subtitle!.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      subtitle!,
                      style: const TextStyle(
                        fontSize: 13,
                        height: 1.45,
                        color: FctzsColors.textMuted,
                      ),
                    ),
                  ],
                  if (footer != null) ...[
                    const SizedBox(height: 10),
                    footer!,
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class DetailPanel extends StatelessWidget {
  const DetailPanel({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: FctzsColors.surface,
        borderRadius: BorderRadius.circular(FctzsColors.radius),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 8,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}

class KvTile extends StatelessWidget {
  const KvTile(this.label, this.value, {super.key});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(
                color: FctzsColors.textMuted,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: FctzsColors.textMain,
                fontSize: 14,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(12, 16, 12, 8),
      padding: const EdgeInsets.only(bottom: 8),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: FctzsColors.headingLine, width: 2),
        ),
      ),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: FctzsColors.textMain,
        ),
      ),
    );
  }
}

class MutedText extends StatelessWidget {
  const MutedText(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(color: FctzsColors.textMuted, fontSize: 13),
    );
  }
}
