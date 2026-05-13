/**
 * Deterministic record keys:
 * - External wrapper: base32(sha256(normalizedUrl))
 * - Saved item: base32(sha256(subjectUri))
 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 (no padding), using the standard alphabet. */
export function bytesToBase32Upper(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32[(value << (5 - bits)) & 31];
  }
  return out;
}

export async function sha256Utf8(text: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(buf);
}

export async function rkeyFromNormalizedUrl(normalizedUrl: string): Promise<string> {
  const hash = await sha256Utf8(normalizedUrl);
  return bytesToBase32Upper(hash);
}

export async function rkeyFromSubjectUri(subjectUri: string): Promise<string> {
  const hash = await sha256Utf8(subjectUri);
  return bytesToBase32Upper(hash);
}

/** Hex fingerprint for human-readable debugging (lexicon `fingerprint` field). */
export function fingerprintHex(buf: Uint8Array): string {
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function fingerprintFromNormalizedUrl(
  normalizedUrl: string
): Promise<string> {
  const hash = await sha256Utf8(normalizedUrl);
  return fingerprintHex(hash);
}
