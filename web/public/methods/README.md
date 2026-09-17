# Methods illustrations

Seven hand-drawn, editable SVG illustrations for the Methods story (`/methods`), one per chapter of
the mock-up: the opening figure (public records → emissions record → national picture) and the six
steps Sources, Calculations, Sectors, Totals, Time & place, Limits. Copied on 2026-09-18 from the
designer's delivery folder `PakEmis_Methods_SVGs/` (kept beside the engine repository, with its
PNG previews and comparison sheets, which do not ship). `06-limits.svg` was
`06-uncertainty-coverage.svg` there; its font stack was aligned to the other six
(`Arial, Helvetica, sans-serif`). Nothing else was edited.

All seven share a transparent 960 × 440 viewBox, embed no raster, font, script or external
reference, and carry ids prefixed `m00-`…`m06-`. They are referenced by path from
`src/components/methods/Story.tsx` as plain `<img>` elements with the alt text written in
`src/components/methods/copy.ts`; a test holds every referenced path to a file here and every file
here to a reference.

The drawings are conceptual examples, not quantitative figures: they introduce no emissions value,
seasonal pattern or confidence limit; the census year reads "Reporting year"; the activity ×
emission factor picture is the livestock example, not a universal equation; greenhouse-gas totals in
CO₂ equivalent are separate from the air-pollutant totals; missing coverage is distinct from
uncertainty and is never zero.

The Pakistan silhouette derives from Natural Earth's public-domain 1:110m Admin 0 Countries data
(https://www.naturalearthdata.com/about/terms-of-use/). It is a simplified outline; interior fills
and marks are schematic, not administrative boundaries or measured data.
