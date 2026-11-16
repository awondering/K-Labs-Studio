# KR Guide Layout: reference data verification (updated 2026-11-15)

**Source checked:** Fuji KR Concept spinning placement charts, 3-page PDF supplied by the builder (Merrick Tackle copy, undated, retailer-hosted).
**Method:** text layer read for all eight rows, then all three pages rendered at 220 dpi and every rod drawing read visually. Text and drawings agree on every number.

## Verified (text layer and drawings)
| Item | Result |
|---|---|
| Guide count | Labels 8, 8, 9, 10, 10, 11, 11, 11 **include the tip-top**. Each drawing has one dimension value per guide, the stripper value runs from the reel-stem arrow to guide #1, and the last guide (LG) sits at the final arrow. |
| Reduction guides | 16/8/5.5 (5'6"), 20/10/5.5 (6' and 6'6"), 25/12/5.5 (7' to 9'). Guides #1 to #3, all in the KL-H bracket. |
| Choke guide | The 4th guide is the first KB in every row. It is the "Rapid Choke" point (page 2 shows B ending on #4). |
| KB / KT split as drawn | KB 1,1,1,1,2,2,3,3 and KT 3,3,4,5,4,5,4,4 (5'6" to 9'). 3 + KB + KT + LG equals the labelled count in all eight rows. The 7 ft row is 1 KB + 5 KT, as the engine uses. |
| Ring sizes | KB/KT/LG are 4 mm to 6'6", 4.5 mm from 7'. |
| Distances | Stripper values (A table), #2 (C), #3 (D) and every runner gap match between text, tables and drawings. The engine's 7 ft row equals the chart exactly. |
| Runner-gap envelope | Smallest 3.5 in (88.9 mm), largest 6.2 in (157.5 mm), gaps after the choke, every row narrowing toward the tip. Supported by the drawings. |

## Discrepancies inside the chart (preserved, never combined)
1. **Stripper at 6'6":** 25.6 in in table A, 25.5 in the drawing. Both are visible on the page.
2. **Choke distance (table B vs drawing):** the table is larger than the drawing's chain (#2 + #3 + #3 to #4) in all eight rows, by 0.1 in in five and 0.2 in in three. Example at 7 ft: 21.6 in table, 21.5 in drawing. Systematic, cause unresolved. The engine uses the drawing and holds the table as a cross-check.
3. **Envelope definition:** the 6.2 in maximum counts gaps after the choke. Counting the #3 to #4 transition gap would make it 6.8 in. The chart does not say which is meant.

## Still unverified
- **Frame designation of the third KR reduction guide.** The Fuji placement chart groups it with the KL-H guides (bracket in the drawings) but shows only "5.5" and does not identify its individual frame designation. A retail kit and Fuji's Japanese spec list an M frame. The app displays it as **KL5.5**, flagged unverified, and does not substitute KL5.5H or KL5.5M (decision recorded 2026-11-15).
- **"Ring base".** Tables B, C and D measure from the ring base, and A to "the guide ring". No definition is given. The engine shows positions as ring centres with an assumed zero offset, so they must not be used to mark foot placement.
- **Rod length: blank or finished.** Not stated. If the chart's length reaches the tip-top, the implied butt-to-stem distance is 10.8, 9.9, 7.7, 7.8, 8.9, 11.2, 13.7 and 16.6 in for the eight rows (derived, not from Fuji). The values vary a lot and 7.7 to 7.8 in is short for a finished spinning rod, which is at least consistent with blank lengths. It does not settle the question.
- **The "isosceles triangle".** Pages 1 and 2 show #1 to #4 along a dashed line from the spool cone, but no triangle is dimensioned, so the repositioning rule for #2 and #3 is not quantified.

## Where the data lives
The chart values are in `kr-guide-layout/src/chart-data.js` only (as printed, inches, unaltered) and are inlined into the served `index.html` by `build.js`. They are Fuji's published values as transcribed by the builder/K-Labs; this tool is not affiliated with or endorsed by Fuji. Redistribution rights for the transcription have not been confirmed by the owner of the chart; the single-file isolation exists so the data can be removed or replaced without touching the engine (builder entry via "Other rod" continues to work without it).

## Changes in the remediation (branch `fix/kr-guide-layout-remediation`)
The chart reference replaces the invented demonstration values. No numeric value was changed from the verified transcription. The rod picker derives the default reel-stem position as blank length minus the chart's stem-to-tip-top distance; that position is a K-Labs calculation, not a Fuji figure.
