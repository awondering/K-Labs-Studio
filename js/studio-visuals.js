// js/studio-visuals.js
// Stage 4: marker positioning engine. Maps calcGuideLayout output (rows.cum)
// to positions along the inline SVG rod path (#rodPath) and creates animated
// LED markers inside #ledLayer.

(function () {
  window.StudioVisuals = window.StudioVisuals || {};

  // Configuration
  const CONFIG = {
    maxMarkers: 40, // safe upper limit; actual visible count controlled by guideCount
    appearDuration: 240,
    disappearDuration: 180,
    moveDuration: 360
  };

  // Internal state
  let svgRoot = null;
  let rodPath = null;
  let ledLayer = null;
  let pathLength = 0;
  let markers = []; // pooled marker objects {el, currentLen, targetLen, visible}
  let animating = false;
  let lastLayoutKey = null; // to detect changes

  function ensureElements() {
    if (svgRoot && rodPath && ledLayer) return true;
    const container = document.getElementById('studioRodContainer');
    if (!container) return false;
    svgRoot = container.querySelector('svg');
    if (!svgRoot) return false;
    rodPath = svgRoot.querySelector('#rodPath');
    ledLayer = svgRoot.querySelector('#ledLayer');
    if (!rodPath || !ledLayer) return false;
    // ensure pathLength is read fresh
    pathLength = rodPath.getTotalLength();
    return true;
  }

  function createMarker() {
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.classList.add('led', 'led--hidden');
    // create a use referencing the ledMarker symbol if present, otherwise construct circles
    const markerSym = svgRoot.querySelector('#ledMarker');
    if (markerSym) {
      // clone children of symbol into group
      markerSym.childNodes.forEach(n => {
        g.appendChild(n.cloneNode(true));
      });
    } else {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('r', '8');
      c.setAttribute('cx', '0');
      c.setAttribute('cy', '0');
      c.setAttribute('fill', '#ff3b3b');
      g.appendChild(c);
    }
    // set initial transform off-canvas
    g.setAttribute('transform', 'translate(-9999,-9999)');
    ledLayer.appendChild(g);
    return { el: g, currentLen: 0, targetLen: 0, visible: false };
  }

  function ensurePool(n) {
    while (markers.length < n && markers.length < CONFIG.maxMarkers) {
      markers.push(createMarker());
    }
  }

  // linear easing helper (time ratio)
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // animation loop handles moving markers toward targetLen and updating transforms
  function animate() {
    if (!animating) return;
    let anyActive = false;
    const now = performance.now();
    markers.forEach(m => {
      if (!m.el) return;
      // if not visible and target is hidden, skip
      if (!m.visible && m.targetVisible === false) return;
      // compute interpolation
      if (m.animStart != null && m.animFrom != null && m.animTo != null) {
        const elapsed = now - m.animStart;
        const dur = m.animDur || CONFIG.moveDuration;
        const t = Math.min(1, elapsed / dur);
        const eased = easeInOut(t);
        const len = m.animFrom + (m.animTo - m.animFrom) * eased;
        m.currentLen = len;
        const pt = rodPath.getPointAtLength(len);
        m.el.setAttribute('transform', `translate(${pt.x},${pt.y})`);
        anyActive = anyActive || t < 1;
        if (t >= 1) {
          // finish
          m.animStart = null; m.animFrom = null; m.animTo = null; m.animDur = null;
        }
      }
      // opacity/visibility handled via classes and CSS transitions
    });

    if (anyActive) {
      requestAnimationFrame(animate);
    } else {
      animating = false;
    }
  }

  function startAnimationIfNeeded() {
    if (!animating) {
      animating = true; requestAnimationFrame(animate);
    }
  }

  // Update markers from calc result r and state
  window.StudioVisuals.update = function (r, state) {
    // do not run until DOM ready and svg elements are available
    if (!ensureElements()) return;

    // quick guard: rows must exist
    if (!r || !r.rows) return;

    // create enough markers
    const count = Math.max(0, Math.min(r.rows.length, state.guideCount || r.rows.length));
    ensurePool(count);

    // compute mapping factor: mm -> length along path
    // Use targetStripper from state (must match calc inputs)
    const targetStripper = Number(state.targetStripper) || r.actual || 1;
    pathLength = rodPath.getTotalLength();

    // mark previously visible counts and new counts
    const layoutKey = `${state.firstGuide}|${state.guideCount}|${state.targetStripper}|${r.rows.length}`;
    const prevKey = lastLayoutKey;
    lastLayoutKey = layoutKey;

    // update each marker's target length
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      if (i < count) {
        const cumMm = r.rows[i].cum; // cumulative mm from calc
        const targetLen = Math.max(0, Math.min(pathLength, (cumMm / targetStripper) * pathLength));
        m.targetLen = targetLen;
        m.targetVisible = true;
        // if currently not visible, set start pos to current or to target for nicer entry
        if (!m.visible) {
          // position the marker at the target but hidden — we'll animate opacity via class
          const pt = rodPath.getPointAtLength(targetLen);
          m.el.setAttribute('transform', `translate(${pt.x},${pt.y})`);
          m.currentLen = targetLen;
          // trigger appear: add visible class on next tick
          requestAnimationFrame(() => {
            m.el.classList.remove('led--hidden');
            m.el.classList.add('led--visible');
          });
          m.visible = true;
        } else {
          // visible: animate from currentLen to targetLen
          m.animStart = performance.now();
          m.animFrom = m.currentLen;
          m.animTo = targetLen;
          m.animDur = CONFIG.moveDuration;
        }
      } else {
        // marker should be hidden
        if (m.visible) {
          // start hide transition using class
          m.el.classList.remove('led--visible');
          m.el.classList.add('led--hidden');
          m.targetVisible = false;
          m.visible = false;
          // optionally move offscreen after disappear duration (no animation required here)
        }
      }
    }

    // start animation loop
    startAnimationIfNeeded();
  };

})();
