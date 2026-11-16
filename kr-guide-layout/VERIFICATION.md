# KR Guide Layout: what was checked (updated 2026-11-16)

**No manufacturer chart data is in this repository.** Distribution rights for the Fuji placement charts have not been confirmed, so the tool ships only invented demonstration values (labelled as such on screen) and lets the builder type measurements from their own chart. A test scans this directory for the earlier chart's values, model designations and provenance text and fails if any return.

## Verified here (by tests, no manufacturer data involved)
| Item | How |
|---|---|
| Position arithmetic | The engine's positions from the tip, stem and butt are compared with independent integer arithmetic in tenths of an inch, for the demonstration values. |
| Builder entry | `referenceFromEntry` is tested for inches and millimetres, too few or too many gaps, non-numeric, zero and negative values, and for producing neutral labels ("Stripper", "Reduction n", "Choke", "Running", "Tip-top") with no envelope marked verified. |
| Fit, clearance, ordering, locks, reset, rebase | Engine tests (71) and browser checks (40, headless Chromium, 390 px). |
| Guide-count heuristic and spacing review | Tested for invariants (ranking, review versus suitable, locked and manual guides kept, never a valid layout shown for invalid geometry) on the demonstration values and an extreme sweep. |

## Still unverified (shown as such in the tool)
- **Demonstration values are invented.** They exercise the engine; they are not a rod design.
- **Builder-entered numbers are not checked against any chart.** The tool cannot know whether they were typed correctly or whether the chart measures to a ring base, ring centre or foot.
- **Ring base versus ring centre.** Positions are shown as ring centres on the blank axis with an assumed zero offset; do not use them to mark foot placement.
- **Blank versus finished length.** Whether a chart's length includes the tip-top is not known to the tool.
- **Role order.** The tool assumes stripper, reduction guides, choke guide, running guides, tip-top, in that order, with the choke guide fourth.
- **Runner-gap envelope.** Only applied if the builder types a smallest and largest gap; the demonstration envelope is invented.
- **Unverified guide.** The demonstration third reduction guide carries an "unverified" flag to exercise the flag; builders can mark none.
- **Heuristics.** The guide-count comparison and proportional compression are K-Labs methods, not a manufacturer's, and not physically tested.
