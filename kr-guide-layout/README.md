# KR Guide Layout (Workshop tool)

An independent K-Labs Studio tool that lays out a **starting** guide train for a spinning rod from chart measurements the builder types in (or invented demonstration values), then checks and adjusts it. It is not affiliated with or endorsed by Fuji; manufacturer names are used descriptively. Nothing it produces has been bench, static-load or casting tested.

## Where things are
- `index.html` is the served, self-contained document (no external requests; precached by the service worker). `src/` holds `engine.js` (pure calculations, no DOM), `app.js`, `styles.css`, `shell.html`, `build.js`, `tests.js`, `tests.html`, `browser-tests.py`. `VERIFICATION.md` records what was checked and what stays unverified.
- `js/kr-guide-layout-host.js` mounts the document in the Workshop card `#workshopToolKrGuide`, only while it is open. The tool has no storage, network or account access: it cannot read or change builds, customers, quotes, components, Guide Setup or synchronisation. Its settings are not saved; it starts from the reference each time.
- Rebuild the bundle with `node kr-guide-layout/src/build.js` (a Studio test fails if it is stale).

## Method (summary of the engine's header comments and `VERIFICATION.md`)
- Positions are the longitudinal distance from the blank tip to each guide **ring centre** projected on the blank axis, in millimetres, shown in mm, decimal inches or fractional inches. Reel-stem and spool-axle measurements are kept separate. Ring-centre-to-foot offsets are not modelled, so the numbers must not be used to mark foot placement.
- The reference layout is the spacing between guides from the builder's chart. An optional choke-distance figure is kept as a separate cross-check and is never merged with the spacing chain.
- Every guide can be moved or locked; its reference position can always be restored; adjacent spacings update. A guide the builder has moved is tagged manual.
- Guide count is counted along the blank, excluding the tip-top; blank guides, tip-top and total are shown separately. When the rod length or stem position makes the reference layout not fit, the tool flags out-of-range guides and spacings and never shows an invalid layout as valid.
- **Guide-count comparison is a K-Labs heuristic, not a Fuji method.** It compares candidate counts while keeping the reduction train and the builder's locked or manual positions, and recommends only with a preview and the builder's explicit approval. Where no defensible candidate exists it says so.
- **Proportional compression of the runner gaps is experimental**, off by default, and never overrides the published reference.
- The 15 mm minimum guide clearance and the 1.3 mm fit tolerance (chart precision) are working assumptions, not manufacturer values.
- The "Stripped / Cast tested" confirmations are builder-attested only; the tool cannot verify them.

## What is calculated, specified, or unverified
| Kind | Items |
|---|---|
| Manufacturer specifications | **None are included.** The builder types their own chart measurements; the tool does not know which chart they came from. |
| Invented | The demonstration values shown on first open, labelled "invented" in the tool. |
| Calculated by this tool | Positions from the tip, from the stem and from the butt; spacings; fit and clearance checks; guide-count candidates; compression preview. |
| Unverified, shown as such | Ring base versus ring centre; blank versus finished length; the guide role order; the runner-gap envelope (only if typed); the demonstration unverified-guide flag; the correctness of anything the builder types. |
| Needs physical verification | Everything: a static-load and casting test is the only way to confirm a layout. The tool never claims a layout is final or optimal. |

## Limitations
- **Licensing:** no Fuji chart data is distributed. Do not add chart values to this repository without confirmed redistribution rights.
- Builder-entered measurements are not saved; they are entered again each time.
- Guide schematic heights show role order only; no verified frame heights are held, so none are drawn to scale.
- Tested in headless Chromium only; no real iPhone or Android device and no Safari.

## Tests
- `cd kr-guide-layout/src && node tests.js`: 71 engine tests.
- `python3 kr-guide-layout/src/browser-tests.py`: 40 standalone browser checks (Playwright Chromium, 390 px).
- `node --test tests/kr-guide-layout-integration.test.cjs` (13) and `PLAYWRIGHT_MODULE=... node tests/kr-guide-layout-browser.cjs` (29: Workshop wiring, six viewport widths, offline with a real service worker, neighbouring tools).
