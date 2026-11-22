# Native L@tr.link mark

`mark.svg` is the shared flat vector tracing of the canonical cursive L and outer loop from the existing L@tr.link brand artwork. The foreground is white on transparency, with no tile, outer frame or baked shadow. Platform icon systems provide their backgrounds, masks, lighting and theme colors.

The SVG uses a 1024-unit viewport, one continuous path, a 56-unit stroke and round caps/joins. Apple Icon Composer uses an outlined copy as its foreground source. Run this from the repository root on macOS with Xcode selected:

```sh
xcrun swift apps/apple/tools/export-apple-mark.swift
```

The app-owned exporter writes `apps/apple/Resources/AppIcon.icon/Assets/l-mark-outlined.svg`. Outlining preserves the open interior when Icon Composer applies dark-mode fill overrides. The checked-in output lets other build hosts compile without running the exporter. Keep the shared mark and generated Apple foreground synchronized when changing the artwork. There is no Android application source in this checkout.
