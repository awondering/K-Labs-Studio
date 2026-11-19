# Diamond cross wrap: method, sources and evidence

**Nothing here has been tested on a rod blank.** Every design in the app says "not bench tested".

## What the app builds
One decorative diamond cross wrap, generated from physical thread paths (`crosswrap.js`). The rod preview, the numbered workshop steps, the unrolled path diagram and the printable marking guide all read the same thread list.

### Geometry (independently implemented)
- Two opposite reference lines run along the blank: **A** at 0° and **C** at 180°.
- **A marks** at `z = k·S`, **C marks** at `z = (k + ½)·S`, measured from the start of the wrap. `S` = crossing spacing.
- An **up thread** (butt to tip) is a helix of pitch `S` leaning `\` on the side facing you with the butt on your left. A **back thread** (tip to butt) is a helix of pitch `S` leaning `/`. Both pass through every mark, so they cross on the marks, giving an X at each one. Seen together they form the diamond lattice.
- The rod keeps turning the same way; only the feed direction reverses (tested: angle always increases along travel).
- A band is built outward from a centre thread, one pass (up then back) at a time, each thread touching the last. Offsets run `0, +1, −1, +2, −2 …`. Because one continuous thread turns at the end, a pass lays the up thread at offset `o` and the back thread at offset `−o` (tested: the up thread ends exactly where the back thread starts).
- Later threads lie over earlier ones (layered, not woven). Within a pass the back thread is over the up thread at every crossing.
- Slope `m = S/(πD)`; a thread of width `w` covers `w·√(1+m²)` along the rod; one leg is `√(len² + (n·π·D)²)` long. Wrap length is rounded down to whole spacings, so the wrap starts and ends on A marks.
- Colours: underwrap, then a main band (3, 5 or 7 threads), then one inner outline thread and one outer outline thread each side, then end bands in the outer-outline colour. Each colour is one continuous thread, so a whole wrap has 3 thread tie-ins/offs plus the plain-wrap underwrap and end bands, not thousands of colour changes.

## Evidence tiers
**Mathematically verified (automated tests, `tests-cross.js`)**: spacing/mark positions, wrap-length rounding, circumference, thread widths, handedness and travel direction, pitch, thread continuity at the turn-arounds, crossing coordinates (closed form versus a brute-force root scan), layering order, preview colour versus an independent perpendicular-distance model (6,000 random points), ribbon structure, thread length versus numerically integrated helix, and that every instruction quotes the engine's own numbers.

**Documented by builders (not by a manufacturer or a book we could read)**:
- Cross wrap = threads crossing to form an X at each intersection; diamond wrap = threads to each side widen the X into boxes; chevron = every added thread goes to the same side ([Rod Builders glossary](https://rodbuilding.org/glossary)).
- Marks along a line at 0° and a second set at 180° starting half way between, then "wrap up and down crossing at the marks" ([BassResource, "weaving" thread](https://bassresource.com/bass-fishing-forums/topic/151624-weaving)).
- Same layout with a base underwrap, centre-line thread through each X, multi-thread bands outlined with silver then black, tie-off with inlaid colour bands ([BassResource, "cross weave/wrap"](https://www.bassresource.com/bass-fishing-forums/topic/157966-experimenting-with-a-cross-weavewrap/)).
- Finding 0° and 180° by measuring a tape strip wrapped once round the rod; tape folded sticky-side out at each end to turn the thread; starting with several turns over the tape; building bands one pass down and back at a time ([Crappie.com, chevron wrap post](https://old.crappie.com/crappie/4501175-post7.html)).
- Layered passes of 4–6, 3–4, 2–3, 2–3 threads, "up and down … forming an X" ([SurfTalk "step by step Diamond wrap"](https://www.stripersonline.com/surftalk/topic/393466-step-by-step-diamond-wrap/)).
- Tools that exist for the same job: four wrap points to reverse thread direction ([Cross Wrap Sleeves](https://acceptance.reach.dog/shop/custom-rod-building-jigs/products/cross-wrap-sleeves)); a jig for aligning wrap crosses on any axis ([CRB Butt Wrap Alignment Tool](https://mudhole.com/products/crb-butt-wrap-alignment-tool)).

**Experimental, awaiting bench testing**: default spacing `S = D`; band thread counts and 90% fill limit; pass order and the tip-side/butt-side rule; end-band width (6 mm); thread allowances (20% plus 150 mm tails); the end-turn arrangement.

## Where sources disagree or are silent
- Spacing: one reply says marks "equal to the blank dia"; one builder used marks every 1" on a 1" circumference; another says "an X every inch". The app offers `S` from 0.75× to 3× the diameter, default 1×, and calls the default experimental.
- Side rule: the SurfTalk post says "go up and come down on the same side". The app's offsets follow from thread continuity at the turn-around (up at `o`, back at `−o`) and may not match every builder's habit.
- Not found in readable form: number of turns around the tape, tie-off detail, taper compensation (a forum reply says the crosses narrow toward the thin end and compensating "requires an advanced formula"), and the contents of Mud Hole Live #085 and Dale Clemens's books (paywalled/video/robots-blocked). Commercial packages (Visual Wrap, course material) were not consulted or copied.

## Not implemented
- Chevron and other cross-wrap variants (the glossary describes chevron, but the readable sources don't give enough to implement it credibly).
- Weaves and lettering. The documented technique for lettering and logos is weaving with a "left list" (glossary); it needs its own engine. Until then, lettering and the grid patterns remain, labelled **experimental**, behind a disclosure in the gallery.
- Taper (constant diameter assumed), multi-page templates, a saved-design library, installable PWA.

## Workshop presentation
The workshop views (rod highlight, diagram, band cross-section, compact steps) are derived from `layout.threads` and `pathPoints`; nothing in them is drawn from separate data. Start, turn-around and end markers are the first and last path points of the up and back threads. "Previous thread" in the pass action is the existing thread at the adjacent offset (offset−1 for o>0, offset+1 for o<0), as the engine lays it. Whether that matches every builder's habit is part of the experimental evidence tier (not bench tested).

## Advanced diamond designs
A design is an ordered list of lattice groups. Each group is a cross-wrap lattice: up threads (family R) and back threads (family L) that are helices of pitch mult*S through the marks, shifted along the rod by shift*S, laid centre thread first and outward. Groups are laid in order, so later groups lie over earlier ones; within the whole design the top thread at a point is the covering thread with the highest sequence number.
- Crossing of an R thread (u_R, pitch S_R) and an L thread (u_L, pitch S_L): z = (k + u_R/S_R + u_L/S_L) / (1/S_R + 1/S_L), theta = 2pi(z - u_R)/S_R. For one lattice this is the earlier formula.
- Mark compatibility: a lattice of pitch 3S through A marks at 0, 3S, ... also meets C at 1.5S, 4.5S, ... which are existing C marks. A lattice shifted by S/2 meets C at 0, S, ... and A at S/2, 3S/2, ..., which need marks every S/2 on both lines (the Diamond Chain prints and says so).
- Gaps: a skipped offset is an empty position, one thread width wide on each side; the underwrap shows.
- Thread runs: a colour used in separate runs (for example the chain's black outlines) is tied in and off once per run.
Evidence: these arrangements are Studio constructions from the documented method, labelled experimental and not bench tested.

## Chevron cross wrap
Source: the rodbuilding.org glossary defines a chevron as "a type of cross-wrap where each additional thread is wrapped to the same side", against the diamond wrap "where threads are wrapped to each side of the pattern". That definition is all the readable sources give; the rest is derived here.
- Model: thread k of the stack is an up helix (family R) at offset k and a back helix (family L) at the same offset k. Their X sits on line A or C at every half spacing, displaced along the rod by k x thread width. In a diamond the pair is (k, -k), so the X spreads around the rod instead.
- Look: along line A the colours step in thread order, the same at every mark; the field is mirror-symmetric about line A, so each V has its apex on a mark line. Later threads lie over earlier ones, giving nested arrowheads that point toward the tip.
- Construction order: stack threads 0..K-1 (first colour, then second), then an outline thread beyond each end. Each colour is one continuous thread; the two outline passes are consecutive so black is one run.
- Not claimed: bench behaviour, thread slippage at the turn-arounds, or that builders place the outline threads this way.

## Woven designs (decorative weaving engine, `weave.js`)

### What was and was not found
Only short builder-glossary definitions could be read (rodbuilding.org): *Weaving* = wrapping over/under threads that run lengthwise along the blank; *Left List* = the pattern for a weave, each step indicating which threads are lifted and not wrapped over per revolution; *Do* = repeat the previous step; *Color Change Weave* = colour changing along a thread line. The batsonenterprises pattern archive (PicToWeave) and a castleduncan forum thread could not be read (the first only points to software help, the second was blocked). So thread counts, band lengths, tension advice, the weft take-up allowance and the step wording are engineering choices, not published rod-builder numbers.

### Physical model
- Warp: M lines lie lengthwise, side by side round the blank. A line is g threads laid flat together and lifted as one. M is a whole number of pattern periods and M x cell width = circumference. g = round(cell width / thread width).
- Weft: one thread wound as a normal helix (one thread width per turn). Each turn goes OVER some lines (weft shows) and UNDER the others (the warp is lifted and shows). A row is g turns using the same left list (keeps cells square). Row boundaries follow the helix, so the weave shows the slight one-thread-per-turn shear a real wound weft would have.
- Wrap = start band (weft over every line, locks the warp), whole pattern repeats, finish band. Warp tails are free until the finish band.
- One plan feeds everything: `L.unit` (left lists for one repeat) and turn numbering t = floor(z/w - theta/2pi). The rod preview (`slotAt`, `coverAt`), workshop steps, chart, ring diagram and printed guide all read it. Tests compare them against an independent warp/weft model built only from the draft.
- Workshop: spools and amounts, mark the lines, lay the warp, start band, one step per distinct row (identical neighbouring rows merge), one "repeat" step for the remaining repeats, finish band, finish. Each step gives start (always mark 0), path (under/over runs), turns, crossings/layering, position against the finished work and the next action. Preview highlights the active turns; earlier work is subdued; warp not yet woven shows as bare warp.
- Drafts: Woven herringbone = 2/2 twill whose diagonal turns about the edge between lines every 6 lines (2 colours, rule-based). Woven diamonds = diamond drawn by lifting the warp, with an accent colour in the two centre lines (3 colours, bitmap-style draft). Any draft (a lift function and a warp-colour function) runs through the same engine; a test draws a letter K through it as the foundation for woven lettering.

### Evidence
Principle (warp lengthwise, weft over/under, left list): documented. Drafts: standard weaving drafts. Geometry/layering/order: calculated and tested. Quantities (20 mm tails each end, 10% weft take-up, 15% reserve), band length (about 4 mm), line width: estimates. Not bench tested.

### Limitations
- Thread count is set by the circumference: about circumference / thread width warp threads (around 140 threads on an 8 mm blank with size A, about 85 with size E). Larger thread sizes cut this. No separate warp thread size yet.
- Weaving on a blank was not tested. Lifting lines for every turn is slow; no shortcut such as lifting several turns at once is modelled.
- Colour change along a warp line (the glossary's colour change weave) is not modelled; warp colour is per line only. The weft is one colour.
- Float lengths are measured and warned about but no tie-down is added.
- The preview does not draw thread thickness, over/under relief or gaps between lines beyond simple shading.
- Not tested on a real device; Playwright Chromium only.

### Woven lettering
- The 5x7 font bitmap becomes the left list: pixel x runs along the rod, pixel y round it, each pixel is s x s cells (s = letter size). Lifted line = warp (Lettering colour) shows; weft over = Background colour. One blank pixel column between letters, three for a space.
- Round the blank: letters are centred; if a whole copy (7s + 3 lines) fits more than once, copies repeat evenly. Along the rod: the message is centred in the wrapped length with plain-wrap margins. If it does not fit, the plan grows to the length it needs and a warning gives that length.
- Lines round the blank follow the thread (about 3 threads per line). Letter size is limited so a letter plus 3 spare lines fits round the blank.
- Workshop: one step per run of identical rows (a letter column of s rows, or a plain-wrap margin); each names the letter and column, the lines to go under, the turns, and what is next. The chart shows the active rows and three neighbours either side.
- Limitations: thread count still follows the circumference; horizontal letter strokes are warp floats (measured, warned above 12 mm, no tie-down); 5x7 capitals only; lettering reads along the rod; a long message means dozens of steps; nothing bench tested.

### Custom designs and artwork conversion
- A custom design is a bitmap `d.art = {v:1,w,h,rows:[h strings of 0/1],edited,name?,src,conv,report}`. It goes through the same bitmap-to-weave construction as woven lettering (pixel x along the rod, y round it; each pixel s×s cells; design colour lifts the warp, background shows weft). Preview, plan, charts, printable guide and warnings all read the one left-list `L.unit`; there is no separate image renderer.
- Upload: image is reduced to ≤96 px; the source keeps brightness and colour (4 bits a channel). Transparent pixels are background. Transparent artwork: visible colours are split by colour difference from white; when there are two clearly different groups the lighter one is background (outlines, white fills and eyes show), one colour stays a silhouette. Opaque artwork with a plain border: pattern = colours that differ from the border colour (coloured and dark backgrounds too). Then, for both, a tone split: when the pattern colours include a clearly darker group with real area (not just anti-aliased edges), that group (outlines, eyes, mouths, line work) is kept and lighter fills become background; on a dark background the lighter group is kept. Whole shape (transparent and opaque artwork) keeps every pattern colour, giving the filled silhouette. Photos, gradients and sources saved without colour: luminance with an Otsu or manual cut-off and border-based auto-invert, as before. Invert flips the result (XOR); cropped to ink; area-averaged to the chosen detail. Clean-up removes a lone cell only when nothing touches it, even at a corner, and it is only partly covered (diagonal lines and solid dots stay), and fills a one-cell hole only when it is partly covered (clear windows stay). Photos, gradients and very fine detail are not preserved. A report counts shapes (corners join) and busy edges and warns "too detailed", "detail lost" (fine lines or shapes with no matching cell nearby, gaps that closed up), "almost every cell filled", "tiny", says when fills were taken as background, and warns "This artwork has N colours…" whenever two or more of the artwork's colours end up together in the design or in the background (transparency is not counted as a colour; an opaque image's own background colour is). Clip-art cases compared with an ideal conversion: src/tests-clipart.js. The source is kept so cut-off, invert, crop, whole shape and detail can be changed; manual grid edits are kept but a re-conversion replaces them (stated in the UI).
- Storage: plain JSON; reopening restores grid, colours, size and conversion settings.
- Limitations: not bench tested; the stated float, fine-thread and fit warnings are estimates. Maximum grid 48×24. SVG must be rasterisable by the browser. Designs are best bold, high-contrast and simple. Chromium only.
