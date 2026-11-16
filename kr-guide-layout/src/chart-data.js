/* Fuji KR Concept spinning guide-placement chart, eight rows (5'6" to 9'), transcribed by K-Labs.
   Source: the three-page chart PDF supplied by the builder (Merrick Tackle copy, undated). Text layer read 2026-11-14 and checked against the
   chart drawings (rendered at 220 dpi) 2026-11-15; see ../VERIFICATION.md for what was verified, the discrepancies inside the chart, and what is
   still unverified. Values are inches as printed and have not been altered.
   Fields: rod, label = guide count INCLUDING the tip-top, stripperTable (table A), stripperDiagram (distance used for the layout),
   choke (table B: stem-side distance to the choke guide), g2 and g3 (tables C and D), gaps (runner and reduction gaps, stripper to tip-top),
   sizes (ring sizes in mm per guide), kb and kt (counts as drawn). This is Fuji's data, not a K-Labs specification; K-Labs Studio is not
   affiliated with or endorsed by Fuji. This file is the only place the chart values live. */
(function (root) {
  const R = (rod, label, stripperTable, stripperDiagram, choke, g2, g3, gaps, sizes, kb, kt) => ({ rod, label, stripperTable, stripperDiagram, choke, g2, g3, gaps, sizes, kb, kt });
  const rows = [
    R("5'6\"", 8, 21.6, 21.6, 17.5, 7.2, 5.5, [7.2, 5.5, 4.7, 4.5, 4.3, 3.9, 3.5], [16, 8, 5.5, 4, 4, 4, 4, 4], 1, 3),
    R("6'", 8, 23.6, 23.6, 20.2, 8.4, 6.2, [8.4, 6.2, 5.5, 5.3, 5.1, 4.5, 3.5], [20, 10, 5.5, 4, 4, 4, 4, 4], 1, 3),
    R("6'6\"", 9, 25.6, 25.5, 21.6, 9, 6.6, [9, 6.6, 5.9, 5.3, 5.1, 4.7, 4.3, 3.9], [20, 10, 5.5, 4, 4, 4, 4, 4, 4], 1, 4),
    R("7'", 10, 27.5, 27.5, 21.6, 9, 6.6, [9, 6.6, 5.9, 5.3, 4.9, 4.5, 4.3, 4.3, 3.9], [25, 12, 5.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5], 1, 5),
    R("7'6\"", 10, 29.5, 29.5, 22.4, 9, 7, [9, 7, 6.2, 5.9, 5.5, 5.1, 4.7, 4.3, 3.9], [25, 12, 5.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5], 2, 4),
    R("8'", 11, 31.4, 31.4, 22.6, 9.4, 7, [9.4, 7.0, 6.1, 5.5, 5.1, 4.7, 4.3, 3.9, 3.9, 3.5], [25, 12, 5.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5], 2, 5),
    R("8'6\"", 11, 31.4, 31.4, 23.8, 9.8, 7.4, [9.8, 7.4, 6.4, 5.9, 5.5, 5.1, 4.7, 4.3, 3.9, 3.9], [25, 12, 5.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5], 3, 4),
    R("9'", 11, 31.4, 31.4, 24.6, 10.2, 7.4, [10.2, 7.4, 6.8, 6.2, 5.9, 5.5, 5.1, 4.7, 4.3, 3.9], [25, 12, 5.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5], 3, 4)
  ];
  const data = { rows, envelope: { minGapIn: 3.5, maxGapIn: 6.2 } };
  if (typeof module !== 'undefined' && module.exports) module.exports = data; else root.KR_CHART_DATA = data;
})(typeof window !== 'undefined' ? window : globalThis);
