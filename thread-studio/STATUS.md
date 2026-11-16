# K-Labs Thread Design Studio: status

Vanilla HTML/CSS/JS, no dependencies, works offline as one file. Developed as a standalone prototype, then integrated into the K-Labs Studio Workshop (see Integration at the end). The calculations were not changed by the integration.

## Run
- Served bundle: `thread-studio/index.html` (self-contained, no external requests). Source and the studio's own tests are in `thread-studio/src/`.
- `node thread-studio/src/build.js` rebuilds the bundle from `src/` (a Studio test fails if the bundle is stale).
- `cd thread-studio/src && node tests.js` runs the engine and geometry suite (308 tests, including the golden diamond fingerprint). `python3 browser-tests.py` runs the 187 standalone browser checks (Playwright Chromium, 390 px and other sizes; opens `../index.html` from disk).
- Inside K-Labs Studio: `node --test tests/thread-studio-integration.test.cjs` and `PLAYWRIGHT_MODULE=... node tests/thread-studio-browser.cjs` (see Integration below).

## Assumption to check
The full Thread Design Studio brief was not in the session, only the Studio ethos and the one-action rule. This build follows those plus your five priorities. Anything the full brief specifies beyond that is not covered.

## Architecture
- `engine.js` pure logic, no DOM. Patterns, 5x7 lettering, layout, workshop steps, "describe" parser, undo history.
- `crosswrap.js` diamond cross-wrap geometry, steps, diagram, marking guide.
- `weave.js` decorative weaving engine (warp lines + weft helix + left lists), steps, chart/ring diagrams, marking guide. Not cross-wrapping; shares nothing with `crosswrap.js`.
- `app.js` screens (start, gallery, describe, editor, workshop), rod renderer, template, autosave.
- `styles.css` Studio tokens and 410 px shell, same values as the KR tool.

## How a design becomes thread
See `METHOD.md` for the diamond cross wrap (geometry, sources, evidence tiers, disagreements between sources).

Construction families, always shown in the status line:
1. **Diamond cross wrap** (new primary decorative method): helix paths crossing on marks, layered passes, one continuous thread per colour. Documented technique, geometry tested, not bench tested.
1b. **Woven designs** (Woven herringbone, Woven diamonds): warp lines lie along the blank, one weft thread goes under the lines that should show and over the rest. Principle documented in the builder glossary; drafts are standard weaving drafts; line counts, band lengths and thread quantities are engineering estimates. Not bench tested.
2. **Plain wrap** (bands) and **spiral** (barber pole, triple twist): unchanged.
3. **Experimental colour-change designs** (checks, chevrons, waves, dots, lettering): the old grid method with thousands of thread changes. Kept for reference behind "Experimental designs" and labelled as such; not a recognised decorative technique.

Preview and instructions: `crosswrap.js` builds one thread list (`layout.threads`). The rod preview (`slotAt`), the numbered steps, the unrolled diagram and the printable guide all read it; tests check they agree.

## Interaction counts (opening the tool)
- See a ready design: 2 taps (Choose a Design, design).
- Lettering preview: 1 tap, then type.
- Describe: type, 1 tap (or 1 tap on an example chip).
- Change a colour: 1 tap (palette), or 1 more to pick the colour area on the rod. Swap colours: 1.
- Make larger / smaller: 1 per step. Undo / redo: 1 each; typing is one undo step.
- Resume: 1 tap from the start screen. Back: 1 tap.
- Start wrapping: 1 tap; unmeasured designs add one confirm ("Use This Measurement").

## Not yet implemented / limits
- **No bench validation of anything.** The diamond cross wrap follows builder-published descriptions and tested geometry; spacing, band widths, pass order, end bands and thread allowances are experimental. Thread widths (A 0.18, D 0.25, E 0.30 mm) are typical values; colours on screen are approximate.
- Diamond cross wrap only (no chevron, no weave). Constant rod diameter (no taper).
- Lettering and grid patterns are experimental; a weave engine is the documented route for lettering and is not built.
- "Describe Your Design" is a local keyword parser, not a language model.
- Printable guide: first 270 mm, one page; grid-method template also still available for experimental designs.
- One autosaved design (no library). Not an installable PWA yet. Not integrated with Studio.

## Workshop mode refinement (this version)
Presentation only. The diamond maths (crossings, coordinates, spacing, colour order, turn-around) is untouched: `golden-cross.json` holds fingerprints of 60 designs taken from the engine before the change and `tests-workshop.js` (WS0) re-computes them.
- Pass step: `PASS k OF P` + colour, one action per leg ("Follow the butt-side edge of the previous Red thread."), key measurements as chips, tie-in/off notes, then the diagram, a band cross-section strip, and a closed "How to do this" (open on pass 1) holding the full method text.
- Diagram: active pass outlined, completed passes faint in real colours, START ring and TURN diamond at the actual path ends, direction arrows, A (filled) / C (hollow) lines, BUTT/TIP labels. Tap it to enlarge (scrolls sideways; Back / Close / Next stay in reach).
- Rod preview: the thread being laid is brighter, earlier passes dimmed, underwrap and end bands dimmed (`L.coverAt`, same coverage rule as `slotAt`). Rotation and drag unchanged.
- New read-only engine helpers: `L.coverAt`, `X.passView`, `X.ribbon`, `X.ribbonSVG`. Old step fields (`title`, `text`, `lines`) kept.
- Not done: no physical bench test, no Safari test (Chromium at 390 px only), the rod preview highlight is a brightness change, not a drawn outline. Unchanged limitations above still apply.

## Advanced diamond designs (this version)
Three designs added to the gallery, all built on the same cross-wrap mathematics. The engine was generalised from one lattice to an ordered list of lattice groups (pitch multiple, shift along the rod, offsets that may skip positions). The classic diamond is the one-group case; `golden-cross.json` (WS0) shows its threads, paths, marks and coverage are unchanged.
- Double Diamond: one lattice, core band, a one-thread gap, inner frame, a gap, outer frame. The underwrap shows through the gaps.
- Diamond Chain: two interlocked lattices of equal pitch, half a spacing apart, so one lattice crosses in the middle of the other's diamonds. Marks every half spacing on both lines.
- Multi-Layer Diamond: a banded fine lattice with a large lattice (three times the pitch) laid over it, using every third A mark and the C marks between. Wrap length is whole large diamonds.
- The preview, active-thread highlight, START/TURN markers, diagrams, workshop steps, colours, undo/redo, autosave and marking guide are the existing components reading the same thread list. Tests: `tests-patterns.js` (NP1–NP16) and 30 browser checks.
- One existing assertion was changed: the generic sweep test C1 bounded `slotAt` by 2; it is now bounded by the pattern's own slot count (the classic diamond already has four colour slots). The gallery-count check went from 8 to 11 designs.
- Limits: all three are labelled "Experimental arrangement". They apply the documented method (marks, up-and-back passes, tape turn-arounds) in arrangements that are the Studio's own; none has been found in a builder source or bench tested. Gap width, band widths, lattice shift and the 3x pitch are engineering choices. Chromium at 390 px only; no Safari test.

## Chevron cross wrap and all-device layout (this version)
- Chevron wrap (gallery, main grid). Same marks, up-and-back passes and tape turn-arounds as the diamond; the difference is the glossary's definition: each additional thread goes on the same side of the last (a diamond goes to each side). In the engine a lattice group has `same: true`, so a pass's back thread has the same offset as its up thread. Passes: N threads of the main colour, N of the second colour, then an outline thread past each end of the stack (2N+2 passes, N = 2, 3 or 4). The existing grid-based "Chevrons" stay under Experimental designs.
- The one engine fix needed: a one-sided band can be wider than half a pitch, so the coverage lookup is now centred on each band (a no-op for symmetric bands; the golden fingerprint still matches the classic diamond).
- Layout: phones keep the 410px shell; 600px and up widen it (bigger rod preview, more gallery columns); 900px and up is a two-column workspace with the rod preview pinned beside the controls or instructions. Same components, same calculations (a test compares them across nine viewports). Keyboard: arrows step the workshop and move a focused rod, Esc closes the enlarged diagram.
- Tests: `tests-chevron.js` (CH1-CH11), chevron added to the per-design browser loop, and 11 device/keyboard checks. Changed existing assertion: the gallery count (now 12 designs, 8 main).
- Limits: not bench tested. Evidence for the chevron is a one-line glossary definition plus the Studio's own geometry; the colour order, band widths and outline placement are engineering choices. Viewports were checked in headless Chromium at nine sizes; no real iPhone, Android, iPad, Mac or Windows device and no Safari/Firefox testing. Touch gestures were not tested on hardware.

## Decorative weaving job (latest)
- Tests: `node tests.js` 201/201 (131 existing unchanged + 70 new in `tests-weave.js`); `python3 browser-tests.py` 142/142 (113 existing, one gallery-count assertion updated 12 -> 14 designs, plus 29 new weave checks including nine phone/tablet/desktop sizes of the weave workshop).
- Gallery: 10 main designs (two woven) + 4 experimental. Describe-your-design: "herringbone", "twill", "weave", "woven" now open the woven herringbone (previously the experimental grid chevrons); "diamond weave" opens woven diamonds.
- Never done: bench testing, real-device or Safari testing, thread-weaving on a real rod. Playwright Chromium only.
- Limitations: see METHOD.md, "Woven designs".

## Custom woven lettering job (latest)
- Create from Text, Describe Your Design (quoted text) and the gallery tile "Woven lettering" now make woven lettering (`weave.js`, `wovenletters`). Saying "colour change" or "grid" in Describe still gives the old experimental painted-grid lettering.
- Tests: `node tests.js` 248/248 (201 existing + 47 new in `tests-lettering.js`; two parse assertions P3/P4 changed because lettering colour is now slot 0, Lettering, and background slot 1); `python3 browser-tests.py` 157/157 (142 existing + 15 new; three existing assertions updated: gallery count 15/11 main, default text K-LABS, overlong-message wording).
- Never done: bench testing, real-device or Safari testing. Playwright Chromium only.

## Custom logo, clipart & weave designer job (latest)
- New: Home → "Create Your Own Design": blank grid, geometric symbol, monogram templates, or Upload Artwork (PNG/JPG/SVG). Tap/drag drawing grid (touch, mouse, trackpad), mirror, clear, undo/redo (one step per stroke), colours, scale, grid size, My Designs library (localStorage `ktds.library.v1`, autosave `ktds.design.v1`, plain JSON `d.art`, account-compatible, no Supabase).
- Engine: `art.js` (grid model, conversion pipeline, library) and a `custom` branch in `weave.js` that reuses the woven-lettering bitmap construction; Workshop, charts, zoom, printable guide, warnings are the existing components.
- Tests: `node tests.js` 308/308 (248 existing + 60 new in `tests-custom.js`); `python3 browser-tests.py` 187/187 (157 existing, two choice-count assertions updated to four start choices, + 30 new custom checks incl. six phone/tablet/desktop sizes, uploads, save/reload).
- Never done: bench testing, real-device, Safari or touch-hardware testing. Playwright Chromium only.
- Limitations: see METHOD.md, "Custom designs and artwork conversion".

## Integration into K-Labs Studio Workshop (this version)
- One Workshop entry, "Thread Design Studio" (`data-workshop-tool-open="thread-studio"`), replaces the Thread Wrap Designer launcher. The studio's start screen has a fifth choice, "Diamond Layout for a Tapered Blank", that opens the existing Thread Wrap Designer (`#workshopToolThreadWrap`, `js/thread-wrap.js`, unchanged). Reason: the studio's diamond wrap assumes a constant rod diameter; the existing designer is the only tool that handles a tapered blank (equal-area rows from butt and tip diameters), so it is kept reachable rather than lost.
- Architecture: the studio stays a self-contained document (`thread-studio/index.html`). `js/thread-studio-host.js` fetches it and mounts it in an iframe via `srcdoc` inside the Workshop card `#workshopToolThreadStudio`, only while that card is open. No studio code runs in the Studio's page, so no CSS, global or calculation can collide with it. The only inputs are the account scope and the tapered-blank hand-off (a same-origin `postMessage`).
- Storage: designs use the existing studio keys with the Studio's `:<accountId>` suffix (`ktds.design.v1:<id>`, `ktds.library.v1:<id>`; signed-out = `:local`). Device-local, not synchronised, not included in Settings > Export Studio Data. A different account on the same device does not see them. Standalone use keeps the plain keys.
- Offline: `thread-studio/index.html` and `js/thread-studio-host.js` are in the service worker precache (cache id `build148-v222`). Tested offline in Chromium with a real service worker.
- Layout: the card fills the space between its Workshop heading and the bottom navigation. At 761 px and wider the Studio shell widens (to 1100 px) only while the studio card is open, so tablets and desktops get the studio's two-column workspace; phones keep the 410 px column.
- Studio source change for hosting (everything else in `src/` is as delivered before): storage keys take the scope suffix, the hand-off choice only appears when hosted, and the Google Fonts link was removed (it fell back to the same system font the Studio already uses, and the studio now makes no external request).
- Not done / not tested: real iPhone and iPad Safari (WebKit is not installed in the test environment); printing the marking template from inside the frame on iOS (desktop browsers print the frame's content; iOS behaviour is untested and may print differently); no bench testing of any thread technique (unchanged).
