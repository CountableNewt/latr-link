import { describe, expect, test } from "bun:test";

import { parseOpenGraphMarkup } from "./openGraph";

describe("parseOpenGraphMarkup", () => {
  test("reads og:title, description, image, site_name", () => {
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content=" Hello   world ">
      <meta property="og:description" content="A page &amp; stuff" />
      <meta property="og:image" content="https://cdn.example/foo.png"/>
      <meta property="og:site_name" content="Example Org" />
    </head></html>`;

    expect(parseOpenGraphMarkup(html, "https://news.example/item")).toEqual({
      title: "Hello world",
      description: "A page & stuff",
      image: "https://cdn.example/foo.png",
      siteName: "Example Org",
    });
  });

  test("resolves relative og:image against resolved page URL", () => {
    const html = `<head>
      <meta property="og:image" content="/images/card.png"/>
    </head>`;
    expect(parseOpenGraphMarkup(html, "https://articles.example/posts/9")).toEqual({
      image: "https://articles.example/images/card.png",
    });
  });

  test("Twitter fallbacks fill missing og fields", () => {
    const html = `<head>
      <meta name="twitter:title" content="Tw title"/>
      <meta name="twitter:description" content="Tw desc"/>
      <meta name="twitter:image" content="https://img.example/z.jpg"/>
    </head>`;

    expect(parseOpenGraphMarkup(html, "https://x.example/")).toEqual({
      title: "Tw title",
      description: "Tw desc",
      image: "https://img.example/z.jpg",
    });
  });

  test("falls back to document title", () => {
    const html = `<head><title>Plain &gt; Doc</title></head>`;
    expect(parseOpenGraphMarkup(html, "https://plain.example/a")).toEqual({
      title: "Plain > Doc",
    });
  });

  test("reads article author", () => {
    const html = `<head><meta property="article:author" content="Ada"/></head>`;
    expect(parseOpenGraphMarkup(html, "https://z.example")).toEqual({
      author: "Ada",
    });
  });

  test("reads og:author and twitter:creator fallbacks", () => {
    const html = `<head>
      <meta property="article:author" content="https://facebook.com/pages/example"/>
      <meta name="twitter:creator" content="@ada"/>
    </head>`;
    expect(parseOpenGraphMarkup(html, "https://z.example")).toEqual({
      author: "@ada",
    });
  });

  test("reads og:image secure/url and image_src fallbacks", () => {
    const html = `<head>
      <meta property="og:image:secure_url" content="https://cdn.example/secure.png"/>
      <link rel="image_src" href="https://cdn.example/legacy.png"/>
    </head>`;
    expect(parseOpenGraphMarkup(html, "https://z.example")).toEqual({
      image: "https://cdn.example/secure.png",
    });
  });

  test("reads JSON-LD author", () => {
    const html = `<head>
      <script type="application/ld+json">
        {"@type":"Article","author":{"@type":"Person","name":"Grace Hopper"}}
      </script>
    </head>`;
    expect(parseOpenGraphMarkup(html, "https://z.example")).toEqual({
      author: "Grace Hopper",
    });
  });

  test("decodes apostrophe entities in metadata", () => {
    const html = `<head>
      <meta property="og:title" content="Tom&amp;#39;s Guide"/>
      <meta property="og:description" content="It&apos;s \\u0027great\\u0027"/>
    </head>`;

    expect(parseOpenGraphMarkup(html, "https://news.example/item")).toEqual({
      title: "Tom's Guide",
      description: "It's 'great'",
    });
  });
});
