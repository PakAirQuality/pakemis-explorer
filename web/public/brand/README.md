# Brand assets

The Explorer carries the house style of the Pakistan Air Quality Initiative's deployed app,
https://emissions.web.app/ ("Transport Emissions — Pakistan"). The logo is copied from it, byte
for byte, and the tab icon from hawanama.org; nothing else of theirs is vendored. The mark on its
own was supplied directly by the initiative and is the only file here that is not a verbatim copy.

| File | Origin | Shape | SHA-256 |
| --- | --- | --- | --- |
| `paqi-logo.png` | https://emissions.web.app/logo.png | 755 × 330, RGBA PNG: the wordmark "Pakistan / Air Quality / Initiative" beside the golden Urdu mark | `26c7d276729a7bf050b7068b322cbcaecf7023b014e032464c46add4ae7c81a7` |
| `../../src/app/icon.png` (also `apple-icon.png`) | https://hawanama.org/icon.png | 512 × 512, RGBA PNG: the golden Urdu mark on transparency — the tab icon hawanama.org carries | `5f04e751a91c90ad165b0e4e50ffd55534a089190b6ead46c946df6ac2357be2` |
| `../../src/app/favicon.ico` | https://hawanama.org/favicon.ico | the same mark as a nine-size `.ico` | `d3807a152f13276de9d6da285ceccf04ac2876deb6a146edc3099075ce81b92c` |
| `paqi-glyph.png` | `PAQI_final_4096.png`, supplied by the initiative (source sha256 `76fa86b4443ea890c8b8f697aa17ca856cac77892736b917cfac9ed0e787de29`) | 201 × 256, RGBA PNG: the white Urdu mark ALONE, on transparency | `6868199e3747aa1ae3dba17eddd4e0abac816f04feb4871d296dc550413954c3` |
| `paqi-tile.png` | the same `PAQI_final_4096.png`, downscaled only | 128 × 128, RGBA PNG: the mark AS SUPPLIED — white glyph on its oxblood rounded square, corners transparent | `3e717b0b7b315c1feb8502353fe59b7e80fb61cef1fa124b6a2f5842619fa902` |

Verify with `shasum -a 256 web/public/brand/paqi-logo.png web/src/app/icon.png web/src/app/favicon.ico`.

THE TAB ICON IS HAWANAMA'S. Until 2026-10 it was the transport app's purple bolt
(`favicon.svg`, copied with the logo). The site now lives at emissions.hawanama.org, beside
hawanama.org, and carries the same two files that site serves; they sit in `src/app/` because
Next's file convention writes the `<link>` tags from there, which is also how hawanama.org does it.

THE GLYPH IS THE MARK WITHOUT ITS TILE. The initiative supplies the mark as a finished badge —
white glyph already sitting on an oxblood rounded square — and the first version of this file kept
it that way. Clipping that square to a circle gave a circle whose glyph filled 58% of it, because
the glyph had been drawn to fill a SQUARE; it read cramped, and squarish. So the ground is keyed
out and the disc is drawn in CSS (`BrandBadge`, src/components/shell/BrandLogo.tsx), which lets the
glyph be sized against the disc rather than against a picture of one: 52% of its height, 41% of its
width, the brand's own proportion.

To re-derive it: for every pixel of the 4096 px original that is fully opaque (`a >= 250` — the
tile's rounded rim fades to transparent and keying those part-alpha pixels would trace the tile's
outline into the glyph), set the colour to white and the alpha to the pixel's distance from the
ground `rgb(122, 31, 52)` over 233, the distance from that ground to white. Then crop to the alpha
bounding box with a 3% margin and scale to 256 px tall. On the supplied original that keys 94.3% of
pixels out as ground, keeps 5.5% fully opaque, and leaves 0.14% as the anti-aliased edge.

THE TILE IS THE SAME ARTWORK, UNKEYED. `paqi-tile.png` is the supplied badge with nothing removed,
for the one place that wants a mark at a title's height: at 28 px a drawn disc with its glyph at 52%
would be illegible, where the finished tile still reads. It is rendered FLAT — no `rounded-` class —
because its corners are already cut; clipping a picture of a shape into another shape is the exact
mistake `BrandBadge` exists to avoid.

To re-derive it: crop the 4096 px original to its alpha bounding box (65, 84, 4021, 4018), pad that
3956 × 3934 crop to a 3956 px square so the resize cannot distort it, and scale to 128 px (Lanczos).

Where they appear: the lockup on the loading screen (`h-20`, floating) and in the top navigation
(`h-7`); the glyph in the assistant panel's hero badge (an 84 px disc); the tile in that panel's
header (28 px, beside the name). One file renders all three:
`src/components/shell/BrandLogo.tsx`.
