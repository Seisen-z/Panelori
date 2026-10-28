# MihonPC: a compact reading desk

Audience: one person managing and reading a manga collection. The first viewport must show books and useful controls, not development status or a marketing introduction.

## Direction and critique
Considered an editorial oversized-title treatment and a dense desktop shelf. The editorial direction repeated the existing wasted-space problem, so the reading desk wins. Unequal split: 188px navigation rail / remaining width for content. Covers, not fabricated hero artwork or statistics, carry the visual weight.

```
[ MihonPC ] | Library                         local version
[ Library ] | title count
[ Updates ] | category tabs / search + compact filters
[ History ] | selection / category management
[ Browse  ] | cover  cover  cover ... (never >180px)
[ More    ] | title  title  title
```

Palette: graphite #141414, board #1d1d1d, raised #252525, paper ink #f3f1ed, secondary ink #a6a4a0, bookmark gold #e6ba75. Light counterpart uses #f6f4f0, #fffefb, #25231f, #69655f and #8a5925. Text contrast checked in verification. Warm gold comes from a physical bookmark, not a generic tech accent.

Type: Bahnschrift for the compact wordmark and restrained headings, Segoe UI Variable Text for controls and reading metadata, Consolas for actual paths. All system-local; no font/network dependency.

Signature: a flat bookmark-shaped brand block and a narrow bookmark stripe on the current navigation destination. A reader-specific decision: the quiet frame never competes with the colorful manga covers. This would be wrong on a generic analytics dashboard.

Surfaces: one-pixel edges, 6px corners, no gradients, glass, glow or decorative dashboard cards. 34px controls, 48px topbar, 24px main inset. Cards/List remain independent for History and Updates. Library cards remain capped at180px. Source/package icons remain actual package assets. Keyboard focus, hover, disabled, empty/error states and reduced motion are part of the system.

All routes share the same control vocabulary. Reader overlays stay dark and compact without altering pager/virtualization behavior. More becomes settings and tools, with technical diagnostics secondary. Old CMDs route to a stable workspace launcher, preserving the existing portable data directory.
