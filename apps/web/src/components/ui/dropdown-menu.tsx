"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const detailsRef = React.useRef<HTMLDetailsElement>(null);

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
    <details ref={detailsRef} className="group/dropdown relative">
      {children}
    </details>
  );
}

function DropdownMenuTrigger({
  children,
  className,
  ...props
}: React.ComponentProps<"summary">) {
  return (
    <summary
      className={cn("list-none [&::-webkit-details-marker]:hidden", className)}
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
  ...props
}: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
  return (
    <div
      className={cn(
        "absolute top-full z-50 mt-2 min-w-48 rounded-md border border-border bg-background p-1 text-foreground shadow-2xl",
        align === "end" ? "right-0" : "left-0",
        className
      )}
      style={{ backgroundColor: "var(--background)", ...style }}
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
      className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
