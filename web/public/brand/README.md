# Brand assets

The Explorer carries the house style of the Pakistan Air Quality Initiative's deployed app,
https://emissions.web.app/ ("Transport Emissions — Pakistan"). Two files are copied from it,
byte for byte, and nothing else of theirs is vendored.

| File | Origin | Shape | SHA-256 |
| --- | --- | --- | --- |
| `paqi-logo.png` | https://emissions.web.app/logo.png | 755 × 330, RGBA PNG: the wordmark "Pakistan / Air Quality / Initiative" beside the golden Urdu mark | `26c7d276729a7bf050b7068b322cbcaecf7023b014e032464c46add4ae7c81a7` |
| `../favicon.svg` (also `src/app/icon.svg`) | https://emissions.web.app/favicon.svg | the purple bolt | `61bc9a161de58248288e6905425d7180f0624c2865007b97d763fdac12043a66` |

Verify with `shasum -a 256 web/public/brand/paqi-logo.png web/public/favicon.svg`.

Where the logo appears: the loading screen (`h-20`, floating), the top navigation (`h-8`
before a hairline and the "PakEmis" wordmark), the Overview's header block (`h-10` above the
eyebrow) and its footer (`h-6`, "A Pakistan Air Quality Initiative product"). One component
renders it: `src/components/shell/BrandLogo.tsx`.
