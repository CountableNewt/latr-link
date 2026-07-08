import {
  COLLECTION_SAVED_ITEM,
  type SavedItemRecord,
  type SavedItemState,
} from "@/lib/latrRecords";
import { rkeyFromAtUri } from "@/lib/rkey";
import type { SavedRow } from "@/lib/savedLibraryTypes";

const demoNow = "2026-07-07T14:00:00.000Z";

type DemoSeed = {
  rkey: string;
  title: string;
  excerpt: string;
  site: string;
  author?: string;
  url: string;
  savedAt: string;
  readMinutes: number;
  image?: string;
  kind?: SavedRow["preview"]["kind"];
  state?: SavedItemRecord["state"];
};

const demoSeeds: DemoSeed[] = [
  {
    rkey: "slower-technology",
    title: "The case for slower technology",
    excerpt:
      "Why intentionally slower technology can lead to better products, happier teams, and more sustainable businesses.",
    site: "The Verge",
    author: "Casey Newton",
    url: "https://example.com/slower-technology",
    savedAt: "2026-07-07T13:14:00.000Z",
    readMinutes: 6,
    image:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=320&q=80",
  },
  {
    rkey: "second-brain",
    title: "Building a second brain that actually works",
    excerpt:
      "A practical guide to capturing, organizing, and using knowledge so you can think more clearly and create more value.",
    site: "Farnam Street",
    author: "Shane Parrish",
    url: "https://example.com/second-brain",
    savedAt: "2026-07-07T12:38:00.000Z",
    readMinutes: 8,
    image:
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=320&q=80",
  },
  {
    rkey: "remote-work-collaboration",
    title: "How remote work reshaped collaboration",
    excerpt:
      "New research on what is working, what is not, and how teams can build better rhythms together.",
    site: "Harvard Business Review",
    url: "https://example.com/remote-work-collaboration",
    savedAt: "2026-07-06T20:28:00.000Z",
    readMinutes: 5,
    image:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=320&q=80",
  },
  {
    rkey: "tiny-habits",
    title: "The overlooked power of tiny habits",
    excerpt:
      "Small, consistent changes compound into remarkable results over time. Here is how to start.",
    site: "James Clear",
    url: "https://example.com/tiny-habits",
    savedAt: "2026-07-06T15:10:00.000Z",
    readMinutes: 4,
    image:
      "https://images.unsplash.com/photo-1512428813834-c702c7702b78?auto=format&fit=crop&w=320&q=80",
  },
  {
    rkey: "focus-thread",
    title: "A thread on focus in a noisy world",
    excerpt:
      "Some thoughts on protecting your attention and doing meaningful work.",
    site: "@jason.bsky.social",
    url: "https://bsky.app/profile/jason.bsky.social/post/focus",
    savedAt: "2026-07-05T18:42:00.000Z",
    readMinutes: 2,
    kind: "post",
  },
  {
    rkey: "free-software-costs",
    title: "The hidden costs of free software",
    excerpt:
      "When free tools come with a price: privacy, dependency, and long-term risk.",
    site: "The Atlantic",
    url: "https://example.com/free-software-costs",
    savedAt: "2026-07-05T11:19:00.000Z",
    readMinutes: 7,
    image:
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=320&q=80",
    state: "archived",
  },
  {
    rkey: "atproto-record",
    title: "ATProto record reference",
    excerpt:
      "A saved protocol record kept alongside normal links for later review.",
    site: "ATProto",
    url: "at://did:plc:example/app.bsky.feed.post/3demo",
    savedAt: "2026-07-04T19:03:00.000Z",
    readMinutes: 3,
    kind: "record",
  },
];

function savedItemRecord(seed: DemoSeed): SavedItemRecord {
  const isAtUri = seed.url.startsWith("at://");
  return {
    $type: COLLECTION_SAVED_ITEM,
    subjectUri: isAtUri
      ? seed.url
      : `at://did:plc:latrlocaldemo/link.latr.saved.external/${seed.rkey}`,
    linkedWebUrl: isAtUri ? undefined : seed.url,
    savedAt: seed.savedAt,
    state: seed.state ?? "unread",
    previewTitle: seed.title,
    previewExcerpt: seed.excerpt,
    previewSite: seed.site,
    previewImage: seed.image,
    previewAuthor: seed.author,
  };
}

function rowFromSeed(seed: DemoSeed): SavedRow {
  const value = savedItemRecord(seed);
  return {
    rec: {
      uri: `at://did:plc:latrlocaldemo/link.latr.saved.item/${seed.rkey}`,
      cid: `bafyreib${seed.rkey.replace(/-/g, "")}`,
      value,
    },
    preview: {
      kind: seed.kind ?? "external",
      title: seed.title,
      subtitle: seed.excerpt,
      href: seed.url,
      imageHref: seed.image,
      canonicalUrl: seed.url.startsWith("http") ? seed.url : undefined,
      siteLabel: seed.site,
      authorLabel: seed.author,
    },
  };
}

export function createDemoSavedRows(): SavedRow[] {
  return demoSeeds.map(rowFromSeed);
}

export function createDemoSavedRowFromPaste(paste: string): SavedRow {
  const trimmed = paste.trim();
  const isUrl = /^https?:\/\//i.test(trimmed);
  const host = (() => {
    if (!isUrl) return "ATProto";
    try {
      return new URL(trimmed).hostname.replace(/^www\./i, "");
    } catch {
      return "Saved Link";
    }
  })();
  const rkey = `demo-${Date.now().toString(36)}`;
  return rowFromSeed({
    rkey,
    title: isUrl ? `Saved from ${host}` : "Saved ATProto record",
    excerpt: isUrl
      ? "A locally added demo item. It stays in this browser session and never calls the gateway."
      : trimmed,
    site: host,
    url: trimmed,
    savedAt: demoNow,
    readMinutes: 3,
    kind: isUrl ? "external" : "record",
  });
}

export function readingMinutesForRow(row: SavedRow): number {
  const text = `${row.preview.title} ${row.preview.subtitle ?? ""}`;
  return Math.max(2, Math.min(12, Math.round(text.length / 140) + 2));
}

export function setSavedRowState(
  rows: SavedRow[],
  itemRkey: string,
  state: SavedItemState
): SavedRow[] {
  return rows.map((row) => {
    if (rkeyFromAtUri(row.rec.uri) !== itemRkey) return row;
    return {
      ...row,
      rec: {
        ...row.rec,
        value: { ...row.rec.value, state },
      },
    };
  });
}

export function removeSavedRow(rows: SavedRow[], itemRkey: string): SavedRow[] {
  return rows.filter((row) => rkeyFromAtUri(row.rec.uri) !== itemRkey);
}

