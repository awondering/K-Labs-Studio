// js/studio-visuals.js
// Stage 5: refined marker animation and smoothing (mid-flight retargeting, reduced-motion support)

(function () {
  window.StudioVisuals = window.StudioVisuals || {};

  const CONFIG = {
    maxMarkers: 40,
    appearDuration: 240,
    disappearDuration: 180,
    moveDuration: 360, // base duration in ms for typical moves
    minMoveDuration: 120,
    maxMoveDuration: 600
  };

  let svgRoot = null;
  let rodPath = null;
  let ledLayer = null;
  let pathLength = 0;
  let markers = [];
  let animating = false;
  let reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ensureElements() {
    if (svgRoot && rodPath && ledLayer) return true;
    const container = document.getElementById('studioRodContainer');
    if (!container) return false;
    svgRoot = container.querySelector('svg');
    if (!svgRoot) return false;
    rodPath = svgRoot.querySelector('#rodPath');
    ledLayer = svgRoot.querySelector('#ledLayer');
    if (!rodPath || !ledLayer) return false;
    pathLength = rodPath.getTotalLength();
    return true;
  }

  function createMarker() {
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.classList.add('led', 'led--hidden');
    const markerSym = svgRoot.querySelector('#ledMarker');
    if (markerSym) {
      // clone children to avoid moving the symbol
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

    // ensure transform origin / box for consistent transforms in modern browsers
    g.style.transformBox = 'fill-box';
    g.style.transformOrigin = 'center center';
    g.setAttribute('transform', 'translate(-9999,-9999)');
    ledLayer.appendChild(g);
    return { el: g, currentLen: 0, targetLen: 0, visible: false, anim: null };
  }

  function ensurePool(n) {
    while (markers.length < n && markers.length < CONFIG.maxMarkers) {
      markers.push(createMarker());
    }
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function nowMs() { return performance.now(); }

  function animateFrame() {
    if (!animating) return;
    let any = false;
    const tNow = nowMs();

    // Update pathLength in case of viewport/resolution changes
    // Only update if rodPath exists
    if (rodPath) {
      pathLength = rodPath.getTotalLength();
    }

    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      if (!m.el) continue;

      // If reduced motion, we shouldn't be in animation loop, but guard anyway
      if (reducedMotion) continue;

      if (m.anim) {
        const a = m.anim;
        const elapsed = tNow - a.start;
        const t = clamp(elapsed / a.dur, 0, 1);
        const eased = easeInOut(t);
        const len = a.from + (a.to - a.from) * eased;
        m.currentLen = len;
        // map to point
        const pt = rodPath.getPointAtLength(len);
        // write transform
        m.el.setAttribute('transform', `translate(${pt.x},${pt.y})`);
        any = any || t < 1;
        if (t >= 1) {
          m.anim = null; // finished
        }
      }
    }

    if (any) {
      requestAnimationFrame(animateFrame);
    } else {
      animating = false;
    }
  }

  function startAnimationIfNeeded() {
    if (!animating && !reducedMotion) {
      animating = true; requestAnimationFrame(animateFrame);
    }
  }

  // immediate positioning used for reduced-motion or instant updates
  function setMarkerPositionInstant(m, len) {
    m.currentLen = len;
    const pt = rodPath.getPointAtLength(len);
    m.el.setAttribute('transform', `translate(${pt.x},${pt.y})`);
  }

  // compute duration proportional to distance but clamped
  function computeDuration(delta) {
    const pct = Math.min(1, Math.abs(delta) / pathLength);
    const dur = Math.round(CONFIG.moveDuration * (0.2 + pct * 0.8));
    return clamp(dur, CONFIG.minMoveDuration, CONFIG.maxMoveDuration);
  }

  // Public update method: called by ui.render after calcGuideLayout
  window.StudioVisuals.update = function (r, state) {
    if (!ensureElements()) return;
    if (!r || !r.rows) return;

    const guideCount = Number(state.guideCount) || r.rows.length;
    const count = Math.max(0, Math.min(guideCount, r.rows.length));
    ensurePool(count);

    const targetStripper = Number(state.targetStripper) || r.actual || 1;
    pathLength = rodPath.getTotalLength();

    // handle markers
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      if (i < count) {
        const cumMm = r.rows[i].cum;
        const targetLen = clamp((cumMm / targetStripper) * pathLength, 0, pathLength);
        m.targetLen = targetLen;

        if (!m.visible) {
          // First-time show: place instantly at target, then trigger CSS appear
          setMarkerPositionInstant(m, targetLen);
          // Force reflow then flip classes to trigger CSS transition
          requestAnimationFrame(() => {
            m.el.classList.remove('led--hidden');
            m.el.classList.add('led--visible');
          });
          m.visible = true;
          // ensure currentLen is synced
          m.currentLen = targetLen;
        } else {
          // Already visible: retarget smoothly
          if (reducedMotion) {
            // instant if reduced motion
            setMarkerPositionInstant(m, targetLen);
            m.currentLen = targetLen;
          } else {
            // start a new anim from current position to new target
            const from = (m.anim && m.anim.from !== undefined) ? m.anim.from + ((m.anim.to - m.anim.from) * easeInOut(clamp((nowMs() - m.anim.start) / m.anim.dur,0,1))) : m.currentLen;
            const delta = Math.abs(targetLen - from);
            const dur = computeDuration(delta);
            m.anim = { start: nowMs(), from: from, to: targetLen, dur: dur };
            // launch animation loop
            startAnimationIfNeeded();
          }
        }
      } else {
        // hide marker
        if (m.visible) {
          m.el.classList.remove('led--visible');
          m.el.classList.add('led--hidden');
          m.visible = false;
          // do not remove element - keep in pool
        }
        m.targetLen = 0;
        m.anim = null;
      }
    }

    // If reduced motion, immediately apply final positions without rAF
    if (reducedMotion) {
      for (let i = 0; i < Math.min(count, markers.length); i++) {
        setMarkerPositionInstant(markers[i], markers[i].targetLen);
      }
    }
  };

  // handle resize: recompute pathLength and re-position markers instantly based on currentLen
  let resizeTimeout = null;
  function onResize() {
    if (!ensureElements()) return;
    pathLength = rodPath.getTotalLength();
    // reposition all markers to currentLen
    markers.forEach(m => {
      if (m.currentLen != null) {
        const len = clamp(m.currentLen, 0, pathLength);
        const pt = rodPath.getPointAtLength(len);
        m.el.setAttribute('transform', `translate(${pt.x},${pt.y})`);
      }
    });
  }
  window.addEventListener('resize', () => { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(onResize, 120); }, { passive: true });

})();
