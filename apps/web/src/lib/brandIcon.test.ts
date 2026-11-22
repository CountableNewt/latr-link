import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLockup } from "@/components/BrandLockup";

test("brand lockup renders the directly served icon at its requested size", () => {
  const html = renderToStaticMarkup(createElement(BrandLockup, { iconSize: 32 }));
  expect(html).toContain('src="/icon.png"');
  expect(html).toContain('width="32"');
  expect(html).not.toContain('/_next/image');
});
