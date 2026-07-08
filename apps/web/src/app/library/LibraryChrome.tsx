"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";

import {
  Archive,
  Beaker,
  ChevronDown,
  Inbox,
  LogOut,
  Menu,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";

import { BrandLockup } from "@/components/BrandLockup";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { EmbeddedReaderPortal } from "@/contexts/embeddedReader";
import { useAuth } from "@/hooks/useAuth";
import { useSavedLibrary } from "@/hooks/useSavedLibrary";
import { useViewerProfile } from "@/hooks/useViewerProfile";
import { DEMO_HANDLE, isLatrDemoDataEnabled } from "@/lib/demoMode";
import { cn } from "@/lib/utils";

const LIBRARY_NAV_ID = "library-primary-nav";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
};

function ProfileSkeleton() {
  return (
    <div className="flex min-w-0 items-center gap-2 px-2 py-1.5">
      <Skeleton className="size-9 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-36" />
      </div>
    </div>
  );
}

function useLibraryNav(): NavItem[] {
  const { data } = useSavedLibrary();
  return useMemo(() => {
    const unread =
      data?.filter((row) => (row.rec.value.state ?? "unread") !== "archived")
        .length ?? undefined;
    return [
      { href: "/library", label: "Unread", icon: Inbox, count: unread },
      { href: "/library/archive", label: "Archive", icon: Archive },
      { href: "/library/settings", label: "Settings", icon: Settings },
    ];
  }, [data]);
}

function SidebarNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const nav = useLibraryNav();

  return (
    <nav id={LIBRARY_NAV_ID} className="flex flex-col gap-0.5" aria-label="Library">
      {nav.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground"
            )}
          >
            <item.icon className="size-4" aria-hidden strokeWidth={1.9} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBrand() {
  return (
    <BrandLockup
      href="/library"
      iconSize={30}
      className="px-2 py-1"
      textClassName="text-xl"
    />
  );
}

function DemoStatus() {
  if (!isLatrDemoDataEnabled()) return null;
  return (
    <div className="rounded-lg border border-primary/15 bg-accent p-2.5 text-sm">
      <div className="flex items-center gap-2 font-medium text-primary">
        <Beaker className="size-4" aria-hidden strokeWidth={1.9} />
        <span>Local Data Mode</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>Using Local Data</span>
        <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
      </div>
    </div>
  );
}

function ProfileBlock({
  closeMobileNav,
}: {
  closeMobileNav?: () => void;
}) {
  const { session, signOut } = useAuth();
  const { data: profile, isLoading } = useViewerProfile();
  const demoMode = isLatrDemoDataEnabled();

  const avatarAlt =
    profile?.displayName?.trim() ||
    profile?.handle ||
    session?.did ||
    "Account";
  const primaryLine =
    profile?.displayName?.trim() ||
    profile?.handle ||
    (demoMode ? DEMO_HANDLE : session?.did) ||
    "Reader";
  const secondaryLine = profile?.handle || (demoMode ? DEMO_HANDLE : session?.did);

  if (isLoading && session?.did) return <ProfileSkeleton />;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1">
      <UserAvatar
        src={profile?.avatar}
        alt={avatarAlt}
        size={36}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">
          {primaryLine}
        </p>
        <p className="truncate text-xs leading-tight text-muted-foreground">
          {secondaryLine}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Sign Out"
        title="Sign Out"
        onClick={() => {
          closeMobileNav?.();
          void signOut();
        }}
      >
        {demoMode ? (
          <ChevronDown className="size-4" aria-hidden strokeWidth={1.9} />
        ) : (
          <LogOut className="size-4" aria-hidden strokeWidth={1.9} />
        )}
      </Button>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <SidebarBrand />
      <SidebarNav pathname={pathname} onNavigate={onNavigate} />
      <div className="mt-auto flex flex-col gap-3">
        <DemoStatus />
        <Separator />
        <ProfileBlock closeMobileNav={onNavigate} />
      </div>
    </div>
  );
}

export function LibraryChrome({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="app-appearance-scope flex h-app max-h-app min-h-0 overflow-hidden bg-background">
      <aside className="hidden h-full max-h-app w-56 shrink-0 border-r border-border bg-card lg:block">
        <SidebarBody />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-expanded={mobileNavOpen}
                aria-controls={LIBRARY_NAV_ID}
                aria-label="Open Menu"
              >
                <Menu className="size-5" aria-hidden strokeWidth={2} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Library Navigation</SheetTitle>
              </SheetHeader>
              <div className="absolute right-3 top-3 z-10">
                <SheetClose asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Close Menu">
                    <X className="size-5" aria-hidden strokeWidth={2} />
                  </Button>
                </SheetClose>
              </div>
              <SidebarBody onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>
          <BrandLockup
            href="/library"
            iconSize={24}
            textClassName="text-sm"
          />
          <Link
            href="/library/settings"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Settings
          </Link>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          <EmbeddedReaderPortal>{children}</EmbeddedReaderPortal>
        </div>
      </div>
    </div>
  );
}
