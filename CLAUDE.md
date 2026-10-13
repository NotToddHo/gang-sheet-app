# Project: Print-and-Cut Gang Sheet Engine
- Stack: Next.js 15 (App Router), Tailwind CSS, react-konva, konva, binpackingjs, clipper-lib
- Architecture: 100% Client-Side. No expensive server rendering. The user's browser calculates layouts and exports files.
- Critical Specs:
  - DPI: 300 DPI (1 inch = 300 px, 1 mm = 11.811 px).
  - Cut Spacing: Strict 2.0 mm gap between cut vectors.
  - Bleed: 1.5 mm outward bleed expansion.
  - Registration Marks: Silhouette Cameo (0.5-inch inset, top-left square, corner L-brackets) and Cricut presets.
  - Exports:
    1. Print File: 300 DPI raster (PNG/PDF) with artwork, bleed, and marks.
    2. Cut File: 1:1 Vector SVG/DXF containing only the cut loops, matching origin (0,0).
