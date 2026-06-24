import { decodeHtmlText } from "@/lib/decodeHtmlText";

/** Parsed Open Graph / Twitter Card fields for embedding saved links (issue #2). */

export interface OpenGraphFields {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
}

/** Match head section when present — keeps parsing noise down. */
function sliceForMarkup(html: string): string {
  const lower = html.toLowerCase();
  const headOpen = lower.indexOf("<head");
  const headClose = lower.indexOf("</head>");
  if (headOpen >= 0 && headClose > headOpen) {
    return html.slice(headOpen, headClose + "</head>".length);
  }
  return html;
}

function escapeRegExp(s: string): string {
  return s.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
}

function stripWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function decodeMinimalEntities(s: string): string {
  return decodeHtmlText(s);
}

function normalizeMetaValue(s: string): string | undefined {
  const t = stripWhitespace(s);
  return t.length ? t : undefined;
}

function metaTagContent(
  scope: string,
  kind: "property" | "name",
  key: string
): string | undefined {
  const escaped = escapeRegExp(key);
  const patterns = [
    new RegExp(
      `<meta\\s[^>]*?${kind}=["']${escaped}["'][^>]*?content=["']([^"']*)["'][^>]*?>`,
      "i"
    ),
    new RegExp(
      `<meta\\s[^>]*?content=["']([^"']*)["'][^>]*?${kind}=["']${escaped}["'][^>]*?>`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(scope);
    if (m?.[1]) return normalizeMetaValue(decodeMinimalEntities(m[1]));
  }
  return undefined;
}

function linkTagAttribute(
  scope: string,
  rel: string,
  attribute: "href" | "title"
): string | undefined {
  const escapedRel = escapeRegExp(rel);
  const patterns = [
    new RegExp(
      `<link\\s[^>]*?rel=["']${escapedRel}["'][^>]*?${attribute}=["']([^"']*)["'][^>]*?>`,
      "i"
    ),
    new RegExp(
      `<link\\s[^>]*?${attribute}=["']([^"']*)["'][^>]*?rel=["']${escapedRel}["'][^>]*?>`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = re.exec(scope);
    if (m?.[1]) return normalizeMetaValue(decodeMinimalEntities(m[1]));
  }
  return undefined;
}

/** Drop URL-only author values (common for article:author). */
function normalizeAuthorValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = stripWhitespace(raw);
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return undefined;
  return trimmed;
}

function firstDefined<T>(values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}

/** First capturing group inside <title>...</title>. */
function parseDocumentTitle(html: string): string | undefined {
  const m =
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) ??
    /<title[^>]*>([\s\S]*?)<\/title[^>]*>/i.exec(html);
  if (!m?.[1]) return undefined;
  return normalizeMetaValue(
    decodeMinimalEntities(m[1].replace(/<[^>]+>/g, ""))
  );
}

function parseJsonLdAuthor(html: string): string | undefined {
  const scriptRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const authorPatterns = [
    /"author"\s*:\s*\[\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i,
    /"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i,
    /"author"\s*:\s*"([^"]+)"/i,
  ];

  for (const match of html.matchAll(scriptRe)) {
    const block = match[1];
    if (!block) continue;
    for (const pattern of authorPatterns) {
      const authorMatch = pattern.exec(block);
      const name = normalizeAuthorValue(authorMatch?.[1]);
      if (name) return name;
    }
  }
  return undefined;
}

function toAbsoluteHref(resolvedPageUrl: string, raw: string): string | undefined {
  const t = normalizeMetaValue(decodeMinimalEntities(stripWhitespace(raw)));
  if (!t) return undefined;
  try {
    return new URL(t, resolvedPageUrl).href;
  } catch {
    return undefined;
  }
}

function parseImage(scope: string, resolvedPageUrl: string): string | undefined {
  const imgRaw = firstDefined([
    metaTagContent(scope, "property", "og:image"),
    metaTagContent(scope, "property", "og:image:secure_url"),
    metaTagContent(scope, "property", "og:image:url"),
    metaTagContent(scope, "name", "twitter:image"),
    metaTagContent(scope, "name", "twitter:image:src"),
    linkTagAttribute(scope, "image_src", "href"),
  ]);
  return imgRaw ? toAbsoluteHref(resolvedPageUrl, imgRaw) ?? imgRaw : undefined;
}

function parseAuthor(scope: string, html: string): string | undefined {
  return firstDefined([
    normalizeAuthorValue(metaTagContent(scope, "property", "og:author")),
    normalizeAuthorValue(metaTagContent(scope, "name", "author")),
    normalizeAuthorValue(metaTagContent(scope, "property", "article:author")),
    normalizeAuthorValue(metaTagContent(scope, "name", "twitter:creator")),
    normalizeAuthorValue(metaTagContent(scope, "name", "dc.creator")),
    normalizeAuthorValue(metaTagContent(scope, "name", "DC.creator")),
    normalizeAuthorValue(linkTagAttribute(scope, "author", "title")),
    parseJsonLdAuthor(html),
  ]);
}

function parseJsonLdMetadata(html: string): { title?: string; image?: string } {
  const scriptRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const titlePatterns = [
    /"headline"\s*:\s*"([^"]+)"/i,
    /"title"\s*:\s*"([^"]+)"/i,
  ];
  const imagePatterns = [
    /"image"\s*:\s*"([^"]+)"/i,
    /"image"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/i,
    /"thumbnailUrl"\s*:\s*"([^"]+)"/i,
  ];

  let title: string | undefined;
  let image: string | undefined;

  for (const match of html.matchAll(scriptRe)) {
    const block = match[1];
    if (!block) continue;

    if (!title) {
      for (const pattern of titlePatterns) {
        const m = pattern.exec(block);
        const parsed = normalizeMetaValue(m?.[1] ?? "");
        if (parsed) {
          title = parsed;
          break;
        }
      }
    }

    if (!image) {
      for (const pattern of imagePatterns) {
        const m = pattern.exec(block);
        const parsed = normalizeMetaValue(m?.[1] ?? "");
        if (parsed) {
          image = parsed;
          break;
        }
      }
    }

    if (title && image) break;
  }

  return { title, image };
}

function parseOpenGraphFields(
  scope: string,
  html: string,
  resolvedPageUrl: string
): OpenGraphFields {
  const jsonLd = parseJsonLdMetadata(html);

  const title =
    metaTagContent(scope, "property", "og:title") ??
    metaTagContent(scope, "name", "twitter:title") ??
    jsonLd.title ??
    parseDocumentTitle(scope);

  const description =
    metaTagContent(scope, "property", "og:description") ??
    metaTagContent(scope, "name", "twitter:description") ??
    metaTagContent(scope, "name", "description");

  const siteName = metaTagContent(scope, "property", "og:site_name");
  const author = parseAuthor(scope, html);
  const image =
    parseImage(scope, resolvedPageUrl) ??
    (jsonLd.image
      ? toAbsoluteHref(resolvedPageUrl, jsonLd.image) ?? jsonLd.image
      : undefined);

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(siteName ? { siteName } : {}),
    ...(author ? { author } : {}),
  };
}

function mergeFields(
  primary: OpenGraphFields,
  fallback: OpenGraphFields
): OpenGraphFields {
  return {
    ...(primary.title ?? fallback.title ? { title: primary.title ?? fallback.title } : {}),
    ...(primary.description ?? fallback.description
      ? { description: primary.description ?? fallback.description }
      : {}),
    ...(primary.image ?? fallback.image
      ? { image: primary.image ?? fallback.image }
      : {}),
    ...(primary.siteName ?? fallback.siteName
      ? { siteName: primary.siteName ?? fallback.siteName }
      : {}),
    ...(primary.author ?? fallback.author
      ? { author: primary.author ?? fallback.author }
      : {}),
  };
}

/**
 * Parse Open Graph and Twitter fallback metadata from HTML.
 * Relative `og:image` values are resolved against `resolvedPageUrl` (typically the redirect-final URL).
 */
export function parseOpenGraphMarkup(
  html: string,
  resolvedPageUrl: string
): OpenGraphFields {
  const headSlice = sliceForMarkup(html);
  const fromHead = parseOpenGraphFields(headSlice, html, resolvedPageUrl);

  if (fromHead.title && fromHead.image) {
    return fromHead;
  }

  const fromDocument = parseOpenGraphFields(html, html, resolvedPageUrl);
  return mergeFields(fromHead, fromDocument);
}
