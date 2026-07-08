// js/studio-visuals.js
// Blank visual and guide-marker renderer for the layout screen.

(function () {
  window.StudioVisuals = window.StudioVisuals || {};

  const VIEW_BOX = { width: 1000, height: 180 };
  const TRACK = { left: 56, right: 944, y: 90 };
  const MAX_MARKERS = 40;

  let container = null;
  let markerLayer = null;
  let guideList = null;
  let markers = [];
  let activeIndex = -1;
  let wired = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numberOrZero(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function ensureElements() {
    if (!container) container = document.getElementById('studioRodContainer');
    if (!container) return false;
    if (!markerLayer) markerLayer = container.querySelector('#rodBlankMarkerLayer');
    if (!markerLayer) return false;
    if (!guideList) guideList = document.getElementById('guideSpacingCards');
    if (!wired) wireInteractions();
    return true;
  }

  function createMarker(index) {
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.classList.add('rod-marker');
    g.dataset.guideIndex = String(index);
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `Guide ${index + 1}`);
    g.innerHTML = `
      <circle class="rod-marker__halo" cx="0" cy="0" r="16"></circle>
      <circle class="rod-marker__core" cx="0" cy="0" r="7"></circle>
      <circle class="rod-marker__dot" cx="0" cy="0" r="3"></circle>
    `;
    g.style.transformBox = 'fill-box';
    g.style.transformOrigin = 'center center';
    g.style.transition = 'transform 320ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease';
    markerLayer.appendChild(g);
    return g;
  }

  function ensurePool(count) {
    while (markers.length < count && markers.length < MAX_MARKERS) {
      markers.push(createMarker(markers.length));
    }
  }

  function setMarkerTransform(marker, x, y) {
    marker.style.transform = `translate(${x}px, ${y}px)`;
  }

  function setActiveIndex(index) {
    activeIndex = typeof index === 'number' && index >= 0 ? index : -1;
    if (!guideList || !markers.length) return;

    guideList.querySelectorAll('[data-guide-index]').forEach((row) => {
      const isActive = Number(row.dataset.guideIndex) === activeIndex;
      row.classList.toggle('guide-spacing-row--active', isActive);
      row.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    markers.forEach((marker, index) => {
      marker.classList.toggle('rod-marker--active', index === activeIndex);
    });
  }

  function findGuideIndexFromTarget(target) {
    const item = target && target.closest ? target.closest('[data-guide-index]') : null;
    if (!item) return -1;
    const index = Number(item.dataset.guideIndex);
    return Number.isFinite(index) ? index : -1;
  }

  function wireInteractions() {
    wired = true;

    container.addEventListener('pointermove', (event) => {
      const index = findGuideIndexFromTarget(event.target);
      if (index >= 0) setActiveIndex(index);
    });
    container.addEventListener('pointerleave', () => setActiveIndex(-1));
    container.addEventListener('click', (event) => {
      const index = findGuideIndexFromTarget(event.target);
      if (index >= 0) setActiveIndex(index);
    });
    container.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        const index = findGuideIndexFromTarget(event.target);
        if (index >= 0) {
          event.preventDefault();
          setActiveIndex(index);
        }
      }
    });

    if (guideList) {
      guideList.addEventListener('pointermove', (event) => {
        const index = findGuideIndexFromTarget(event.target);
        if (index >= 0) setActiveIndex(index);
      });
      guideList.addEventListener('pointerleave', () => setActiveIndex(-1));
      guideList.addEventListener('click', (event) => {
        const index = findGuideIndexFromTarget(event.target);
        if (index >= 0) setActiveIndex(index);
      });
    }

    document.addEventListener('click', (event) => {
      if (!container.contains(event.target) && !(guideList && guideList.contains(event.target))) {
        setActiveIndex(-1);
      }
    });
  }

  function update(r, state) {
    if (!ensureElements() || !r || !Array.isArray(r.rows)) return;

    const guideCount = Math.max(0, Math.min(numberOrZero(state && state.guideCount) || r.rows.length, r.rows.length));
    const targetStripper = numberOrZero(state && state.targetStripper) || r.actual || 1;
    const activeRows = r.rows.slice(0, guideCount);

    ensurePool(activeRows.length);

    activeRows.forEach((row, index) => {
      const ratio = clamp(row.cum / targetStripper, 0, 1);
      const x = TRACK.left + (TRACK.right - TRACK.left) * ratio;
      const wobble = index === 0 ? -2 : index === activeRows.length - 1 ? 1 : 0;
      const y = TRACK.y + wobble;
      const marker = markers[index];
      marker.hidden = false;
      marker.dataset.guideIndex = String(index);
      marker.setAttribute('aria-label', `Guide ${row.g}: ${row.cum.toFixed(1)} mm`);
      marker.setAttribute('aria-pressed', String(index === activeIndex));
      setMarkerTransform(marker, x, y);
    });

    for (let i = activeRows.length; i < markers.length; i++) {
      markers[i].hidden = true;
    }

    if (activeIndex >= activeRows.length) {
      setActiveIndex(-1);
    } else {
      setActiveIndex(activeIndex);
    }
  }

  window.StudioVisuals.update = update;
})();
