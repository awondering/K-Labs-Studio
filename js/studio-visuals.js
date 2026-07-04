// js/studio-visuals.js
// Stage 1 stub for Build 008 visuals module.
// This module exposes a minimal StudioVisuals global with an update(r, state)
// entrypoint so the rest of the app can call into visuals without changing
// calculation logic. Stage 1 intentionally does not render any visuals — it
// only logs received updates. Later stages will implement the full SVG rod
// and LED animation engine here.

(function () {
  window.StudioVisuals = window.StudioVisuals || {};

  // Update will be called by ui.js after calcGuideLayout(...) runs.
  // Parameters:
  // - r: result object from calcGuideLayout { rows: [...], actual: number, diff: number }
  // - state: application state (firstGuide, guideCount, targetStripper, locked, ...)
  window.StudioVisuals.update = function (r, state) {
    // Stage 1: no-op with safe logging for verification. Keep logs minimal.
    if (typeof console !== 'undefined' && console.log) {
      console.log('StudioVisuals.update', {
        rows: (r && r.rows && r.rows.length) || 0,
        actual: r && r.actual,
        diff: r && r.diff,
        stateSummary: {
          firstGuide: state && state.firstGuide,
          guideCount: state && state.guideCount,
          targetStripper: state && state.targetStripper
        }
      });
    }
    // Future stages will read r.rows and state and animate markers.
  };
})();
