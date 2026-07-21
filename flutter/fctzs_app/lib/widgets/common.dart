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
    this.padding = const EdgeInsets.fromLTRB(12, 8, 12, 16),
    /// 特設サイトの `minmax(320px, 1fr)` 相当。狭い画面では1列、広い画面では複数列。
    this.maxCrossAxisExtent = 340,
    this.childAspectRatio = 0.82,
    this.crossAxisSpacing = 12,
    this.mainAxisSpacing = 12,
  });

  final Future<void> Function() onRefresh;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final String emptyText;
  final Widget? header;
  final EdgeInsetsGeometry padding;
  final double maxCrossAxisExtent;
  final double childAspectRatio;
  final double crossAxisSpacing;
  final double mainAxisSpacing;

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
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          if (header != null) SliverToBoxAdapter(child: header),
          SliverPadding(
            padding: padding,
            sliver: SliverGrid(
              gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: maxCrossAxisExtent,
                mainAxisSpacing: mainAxisSpacing,
                crossAxisSpacing: crossAxisSpacing,
                childAspectRatio: childAspectRatio,
              ),
              delegate: SliverChildBuilderDelegate(
                itemBuilder,
                childCount: itemCount,
              ),
            ),
          ),
        ],
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
    this.containInBounds = false,
  });

  /// キャラクター用（デフォルト画像が異なる）。
  const CoverImage.character(
    this.url, {
    super.key,
    this.height = 160,
    this.fit = BoxFit.cover,
    this.containInBounds = false,
  }) : fallback = FctzsImages.characterDefault;

  /// 詳細画面向け: 全体が見えるよう contain、画面高の約1/3に収める。
  const CoverImage.detail(
    this.url, {
    super.key,
    this.height = 200,
    this.fallback = FctzsImages.scenarioDefault,
  })  : fit = BoxFit.contain,
        containInBounds = true;

  /// 詳細画面のキャラクター画像向け。
  const CoverImage.detailCharacter(
    this.url, {
    super.key,
    this.height = 220,
  })  : fit = BoxFit.contain,
        containInBounds = true,
        fallback = FctzsImages.characterDefault;

  final String? url;
  /// null のときは親の制約いっぱいに広げる（グリッドカード向け）。
  final double? height;
  final BoxFit fit;
  final String fallback;
  /// true のとき画面高で cap し、はみ出しを Clip する（詳細ヒーロー用）。
  final bool containInBounds;

  Widget _placeholder(double? h) {
    return Container(
      height: h,
      width: double.infinity,
      color: FctzsColors.bg,
      alignment: Alignment.center,
      child: const Icon(Icons.image_not_supported_outlined, color: FctzsColors.textMuted),
    );
  }

  /// CanvasKit のバイト取得が失敗しても、特設サイトの <img> と同様に表示できるよう
  /// Web では HTML 要素へフォールバックする（CORS / 一部コーデック差の回避）。
  static const _webStrategy = WebHtmlElementStrategy.fallback;

  double? _effectiveHeight(BuildContext context) {
    final requested = height;
    if (!containInBounds) return requested;
    final cap = MediaQuery.sizeOf(context).height * 0.32;
    final base = requested ?? 200;
    return base < cap ? base : cap;
  }

  Widget _networkImage(String src, double? h) {
    return Image.network(
      src,
      height: h,
      width: double.infinity,
      fit: fit,
      alignment: Alignment.center,
      webHtmlElementStrategy: _webStrategy,
      errorBuilder: (_, _, _) {
        if (src == fallback) return _placeholder(h);
        return Image.network(
          fallback,
          height: h,
          width: double.infinity,
          fit: fit,
          alignment: Alignment.center,
          webHtmlElementStrategy: _webStrategy,
          errorBuilder: (_, _, _) => _placeholder(h),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // Web と同様: DBのURLが404でも onerror 相当でデフォルト画像へ落とす。
    final primary = FctzsImages.absoluteUrl(url) ?? fallback;
    final h = _effectiveHeight(context);
    final image = _networkImage(primary, h);
    if (!containInBounds) return image;
    return ColoredBox(
      color: FctzsColors.bg,
      child: ClipRect(
        child: SizedBox(
          width: double.infinity,
          height: h,
          child: image,
        ),
      ),
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
    final media = showCover || leading != null;
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
            if (media)
              Expanded(
                flex: 5,
                child: leading != null
                    ? ColoredBox(
                        color: FctzsColors.bg,
                        child: Center(child: leading),
                      )
                    : Stack(
                        fit: StackFit.expand,
                        children: [
                          Positioned.fill(
                            child: useCharacterFallback
                                ? CoverImage.character(
                                    imageUrl,
                                    height: null,
                                    fit: BoxFit.cover,
                                  )
                                : CoverImage(
                                    imageUrl,
                                    height: null,
                                    fit: BoxFit.cover,
                                  ),
                          ),
                          if (badge != null)
                            Positioned(top: 8, right: 8, child: badge!),
                        ],
                      ),
              ),
            Expanded(
              flex: media ? 3 : 1,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment:
                      media ? MainAxisAlignment.start : MainAxisAlignment.center,
                  children: [
                    if (badge != null && !media) ...[
                      Align(alignment: Alignment.centerRight, child: badge!),
                      const SizedBox(height: 6),
                    ],
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: FctzsColors.textMain,
                      ),
                    ),
                    if (subtitle != null && subtitle!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        subtitle!,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          height: 1.4,
                          color: FctzsColors.textMuted,
                        ),
                      ),
                    ],
                    if (footer != null) ...[
                      const SizedBox(height: 8),
                      footer!,
                    ],
                  ],
                ),
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
