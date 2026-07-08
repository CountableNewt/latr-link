"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const DropdownMenuContext = React.createContext<{ open: boolean } | null>(null);

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const detailsRef = React.useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function closeIfOutside(event: PointerEvent | FocusEvent) {
      const details = detailsRef.current;
      const target = event.target;
      if (!details?.open || !(target instanceof Node)) return;
      if (details.contains(target)) return;
      details.removeAttribute("open");
    }

    function closeOnEscape(event: KeyboardEvent) {
      const details = detailsRef.current;
      if (!details?.open || event.key !== "Escape") return;
      details.removeAttribute("open");
      details.querySelector("summary")?.focus();
    }

    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("focusin", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("focusin", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <DropdownMenuContext.Provider value={{ open }}>
      <details
        ref={detailsRef}
        className="group/dropdown relative"
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        {children}
      </details>
    </DropdownMenuContext.Provider>
  );
}

function DropdownMenuTrigger({
  children,
  className,
  ...props
}: React.ComponentProps<"summary">) {
  const context = React.useContext(DropdownMenuContext);
  return (
    <summary
      className={cn("list-none [&::-webkit-details-marker]:hidden", className)}
      aria-expanded={context?.open ?? undefined}
      aria-haspopup="menu"
      {...props}
    >
      {children}
    </summary>
  );
}

function DropdownMenuContent({
  className,
  align = "end",
  style,
  onKeyDown,
  ...props
}: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
  function focusMenuItem(container: HTMLDivElement, index: number) {
    const items = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled]), [role='menuitem']:not([aria-disabled='true']), [role='menuitemradio']:not([aria-disabled='true'])"
      )
    );
    items[index]?.focus();
  }

  return (
    <div
      role="menu"
      className={cn(
        "absolute top-full z-50 mt-2 min-w-48 rounded-md border border-border bg-background p-1 text-foreground shadow-2xl",
        align === "end" ? "right-0" : "left-0",
        className
      )}
      style={{ backgroundColor: "var(--background)", ...style }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;

        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not([disabled]), [role='menuitem']:not([aria-disabled='true']), [role='menuitemradio']:not([aria-disabled='true'])"
          )
        );
        if (items.length === 0) return;
        const currentIndex = items.findIndex((item) => item === document.activeElement);

        if (event.key === "ArrowDown") {
          event.preventDefault();
          focusMenuItem(
            event.currentTarget,
            currentIndex >= 0 ? (currentIndex + 1) % items.length : 0
          );
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          focusMenuItem(
            event.currentTarget,
            currentIndex >= 0
              ? (currentIndex - 1 + items.length) % items.length
              : items.length - 1
          );
        } else if (event.key === "Home") {
          event.preventDefault();
          focusMenuItem(event.currentTarget, 0);
        } else if (event.key === "End") {
          event.preventDefault();
          focusMenuItem(event.currentTarget, items.length - 1);
        }
      }}
      {...props}
    />
  );
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="presentation"
      className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="presentation"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
