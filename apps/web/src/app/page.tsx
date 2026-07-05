import Image from "next/image";
import Link from "next/link";
import {
  Archive,
  ArrowRight,
  Bookmark,
  BookOpen,
  Boxes,
  FileJson,
  FolderOpen,
  Globe2,
  KeyRound,
  Library,
  Link2,
  LockKeyhole,
  type LucideIcon,
} from "lucide-react";

import iconSrc from "@/app/icon.png";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Capability = {
  icon: LucideIcon;
  title: string;
  body: string;
  status?: string;
};

type Audience = {
  title: string;
  body: string;
  action: string;
};

type FlowStep = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const capabilities: Capability[] = [
  {
    icon: Link2,
    title: "Save links and posts",
    body: "Paste an article, recipe, shopping guide, post, or thread and keep it in one reading queue.",
  },
  {
    icon: Bookmark,
    title: "Keep useful previews",
    body: "L@tr stores the saved record with the title, source, and preview context needed to find it again.",
  },
  {
    icon: Archive,
    title: "Triage without losing history",
    body: "Archive, delete, and export your saved items when your queue turns into a reference library.",
  },
  {
    icon: Globe2,
    title: "Browser extension",
    body: "The extension will use the same account and gateway path, so the active tab lands in your web library.",
    status: "Coming Soon",
  },
];

const audiences: Audience[] = [
  {
    title: "Article readers",
    body: "Keep essays, docs, newsletters, and posts in one calm queue instead of a pile of forgotten tabs.",
    action: "Save the article",
  },
  {
    title: "Tab closers",
    body: "Capture the thing you meant to come back to, close the tab, and return when you actually have time.",
    action: "Clear the tab",
  },
  {
    title: "Bluesky readers",
    body: "Save posts and threads alongside normal links, without turning your bookmarks into another feed.",
    action: "Read it later",
  },
];

const flowSteps: FlowStep[] = [
  {
    icon: KeyRound,
    title: "Sign in with your handle",
    body: "Use an ATProto or Bluesky handle and approve the L@tr read-later permissions.",
  },
  {
    icon: LockKeyhole,
    title: "L@tr saves for you",
    body: "The web app and extension send save requests through the L@tr gateway.",
  },
  {
    icon: FileJson,
    title: "Records live on your PDS",
    body: "Saved items are written as L@tr records in your Personal Data Server.",
  },
  {
    icon: Boxes,
    title: "Portable by design",
    body: "Because the records are on your repo, your library can move as the ATProto ecosystem grows.",
  },
];

function SectionHeading({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="min-w-0 max-w-3xl">
      <h2 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-7 text-zinc-600 dark:text-zinc-400 sm:text-lg">
        {body}
      </p>
    </div>
  );
}

function BetaChip() {
  return (
    <span className="inline-flex shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium leading-none text-blue-700 dark:border-blue-500/40 dark:bg-blue-950/55 dark:text-blue-200">
      Beta
    </span>
  );
}

function StatusChip({ children }: { children: string }) {
  return (
    <span className="inline-flex shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium leading-none text-blue-700 dark:border-blue-500/40 dark:bg-blue-950/55 dark:text-blue-200">
      {children}
    </span>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-2">
          <Image
            src={iconSrc}
            alt=""
            width={28}
            height={28}
            className="shrink-0 rounded-md"
            priority
          />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                L@tr.link
              </p>
              <BetaChip />
            </div>
            <p className="truncate text-xs text-zinc-500">Unread</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Archive</span>
          <span>Settings</span>
        </div>
      </div>

      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950/70">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Save Link or Post
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <div className="flex h-10 min-w-0 flex-1 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500">
            https://example.com/story or a Bluesky post
          </div>
          <div className="flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-950">
            Save
          </div>
        </div>
      </div>

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        <SavedItemMockup
          title="Sunday dinner recipes worth trying"
          source="Food & Home"
          detail="Saved recipe"
          tone="blue"
        />
        <SavedItemMockup
          title="A weekend guide to neighborhood parks"
          source="City Magazine"
          detail="Saved article"
          tone="green"
        />
        <SavedItemMockup
          title="Gift ideas to revisit before Friday"
          source="Shopping Guide"
          detail="Saved list"
          tone="amber"
        />
      </div>
    </div>
  );
}

function SavedItemMockup({
  title,
  source,
  detail,
  tone,
}: {
  title: string;
  source: string;
  detail: string;
  tone: "amber" | "blue" | "green";
}) {
  const toneClass = {
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    green:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  }[tone];

  return (
    <div className="flex gap-3 px-4 py-4">
      <div
        className={cn(
          "flex h-16 w-16 shrink-0 items-center justify-center rounded-md",
          toneClass
        )}
      >
        <BookOpen className="h-6 w-6" aria-hidden strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
          {title}
        </p>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
          {source} - {detail}
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <div className="flex size-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          <Archive className="h-4 w-4" aria-hidden strokeWidth={1.8} />
        </div>
      </div>
    </div>
  );
}

function ExtensionPreview() {
  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <Image src={iconSrc} alt="" width={24} height={24} className="rounded-md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            L@tr.link Extension
          </p>
        </div>
        <StatusChip>Coming Soon</StatusChip>
      </div>
      <div className="space-y-3 pt-4">
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/70">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Current tab
          </p>
          <p className="mt-1 truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
            A guide to easy weeknight dinners
          </p>
        </div>
        <div className="flex h-10 items-center justify-center rounded-md bg-blue-600/75 text-sm font-medium text-white">
          Save current tab
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-app bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Image
              src={iconSrc}
              alt=""
              width={32}
              height={32}
              className="shrink-0 rounded-lg"
              priority
            />
            <span className="truncate text-lg font-semibold tracking-tight">
              L@tr.link
            </span>
            <BetaChip />
          </Link>
          <nav
            aria-label="Landing page"
            className="hidden items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400 md:flex"
          >
            <Link
              href="#capabilities"
              className="hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              Capabilities
            </Link>
            <Link
              href="#for-people"
              className="hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              For People
            </Link>
            <Link
              href="#atproto"
              className="hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              ATProto
            </Link>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/library"
              className="hidden text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50 sm:inline-flex"
            >
              Open library
            </Link>
            <Link href="/login" className={buttonVariants({ size: "sm" })}>
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <section className="overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-24">
          <div className="min-w-0 max-w-2xl">
            <h1 className="text-5xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-6xl lg:text-7xl">
              L@tr.link
            </h1>
            <p className="mt-6 max-w-xl text-2xl font-medium leading-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              Save now. Read later. Yours everywhere.
            </p>
            <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              A read-later library for articles, posts, recipes, and anything
              else worth coming back to. Sign in with your handle and keep your
              saved list attached to your account.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
                )}
              >
                Start Saving
                <ArrowRight className="h-4 w-4" aria-hidden strokeWidth={2} />
              </Link>
              <Link
                href="#atproto"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                )}
              >
                How It Works
              </Link>
            </div>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section
        id="capabilities"
        className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/45"
      >
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <SectionHeading
            title="Save links and posts into a library you own"
            body="L@tr is designed for the ordinary act of saving something for later, with enough protocol awareness to keep your list portable."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {capabilities.map((item) => (
              <div
                key={item.title}
                className="relative rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                {item.status ? (
                  <div className="absolute right-4 top-4">
                    <StatusChip>{item.status}</StatusChip>
                  </div>
                ) : null}
                <item.icon
                  className="h-5 w-5 text-blue-600"
                  aria-hidden
                  strokeWidth={1.8}
                />
                <h3
                  className={cn(
                    "mt-4 text-base font-semibold text-zinc-950 dark:text-zinc-50",
                    item.status ? "pr-28" : ""
                  )}
                >
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
          <div className="lg:col-start-2">
            <ExtensionPreview />
          </div>
        </div>
      </section>

      <section id="for-people" className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="min-w-0">
            <SectionHeading
              title="Built for people who actually want to read it later"
              body="L@tr keeps the product simple on purpose: save the useful thing, close the distraction, and come back to a queue that still belongs to your account."
            />
            <div className="mt-10 space-y-4">
              {audiences.map((audience) => (
                <div
                  key={audience.title}
                  className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800 dark:bg-zinc-900/45"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                        {audience.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                        {audience.body}
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-sm font-medium text-blue-700 dark:text-blue-300 sm:inline">
                      {audience.action}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 items-center">
            <div className="w-full rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Library className="h-5 w-5 text-blue-600" aria-hidden />
                  <p className="font-semibold text-zinc-950 dark:text-zinc-50">
                    Portable library
                  </p>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Your PDS
                </p>
              </div>
              <div className="space-y-0 divide-y divide-zinc-200 dark:divide-zinc-800">
                {[
                  "Long read for after work",
                  "Recipe to try this weekend",
                  "Essay to read on the train",
                  "Post to revisit when the thread slows down",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 px-5 py-4">
                    <FolderOpen
                      className="h-5 w-5 shrink-0 text-zinc-400 dark:text-zinc-500"
                      aria-hidden
                      strokeWidth={1.8}
                    />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {item}
                    </p>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600"
                      aria-hidden
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                <span>Your account. Your PDS. Your archive.</span>
                <span className="font-medium text-zinc-950 dark:text-zinc-50">
                  Export anytime
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="atproto"
        className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/45"
      >
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeading
            title="A quick introduction to ATProto"
            body="ATProto is the open social web technology behind Bluesky. The important idea is simple: your identity and records can live with your account, not inside one app forever."
          />

          <div className="mt-12 grid gap-4 lg:grid-cols-4">
            {flowSteps.map((step, index) => (
              <div
                key={step.title}
                className="relative rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    <step.icon className="h-5 w-5" aria-hidden strokeWidth={1.8} />
                  </div>
                  <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-5 text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-zinc-950">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_auto] lg:px-8">
          <div className="min-w-0 max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-4xl">
              Start with your Bluesky handle
            </h2>
            <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              Connect in seconds, save the first thing you do not want to lose,
              and keep control of the record behind it.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
              )}
            >
              Continue with ATProto
              <ArrowRight className="h-4 w-4" aria-hidden strokeWidth={2} />
            </Link>
              <Link
                href="#atproto"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                )}
              >
              Learn about ATProto
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
