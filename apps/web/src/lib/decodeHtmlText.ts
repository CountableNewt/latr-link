const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  amp: "&",
  nbsp: "\u00a0",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  hellip: "\u2026",
};

function codePointFromInt(code: number): string | undefined {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return undefined;
  if (code >= 0xd800 && code <= 0xdfff) return undefined;
  try {
    return String.fromCodePoint(code);
  } catch {
    return undefined;
  }
}

function decodeOnce(input: string): string {
  let out = input.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return codePointFromInt(code) ?? match;
  });

  out = out.replace(/&#(\d+);/g, (match, dec: string) => {
    const code = Number.parseInt(dec, 10);
    return codePointFromInt(code) ?? match;
  });

  out = out.replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return codePointFromInt(code) ?? match;
  });

  out = out.replace(/&([a-z]+);/gi, (match, name: string) => {
    return NAMED_ENTITIES[name.toLowerCase()] ?? match;
  });

  return out;
}

/** Decode HTML entities and common `\uXXXX` escapes (may run multiple passes). */
export function decodeHtmlText(input: string, maxPasses = 3): string {
  let prev = "";
  let current = input;
  for (let pass = 0; pass < maxPasses && current !== prev; pass += 1) {
    prev = current;
    current = decodeOnce(current);
  }
  return current;
}
