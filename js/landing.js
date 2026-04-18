// ══════════════════════════════════════════════════════════════
//  DS Academy – Landing Scene  (js/landing.js)
//
//  Faithful vanilla-JS port of:
//    LandingScene.jsx  →  phase sequencer + grid + BFS
//    LogoMatrix.jsx    →  gold letter overlay
//    InvitationText.jsx→  tagline + divider
//    InitializeButton.jsx → styled button with corner accents
//
//  Background matches the site's dark-blue #090b10 theme.
//  Calls window.__landingDone() when the user clicks Initialize
//  (defined in app.js to dismiss the scene and show the app).
// ══════════════════════════════════════════════════════════════

// ── Grid constants (match JSX exactly) ───────────────────────
const ROWS      = 24;   // ↑ from 20 — taller container fills screen better
const COLS      = 44;   // ↑ from 42 — adds 2 cols on right to match 3-col left margin of G
const CELL_SIZE = 20;   // px

// ── GRAPH pixel coordinates  (identical to LOGO_COORDINATES) ─
// Letters occupy rows 9–13, cols 3–40 inside a 24×44 grid.
// Vertical centre of 24-row grid = row 11.5 → letters rows 9-13 are centred.
// Horizontal: G starts col 3 (3-col left margin), H ends col 40 (3-col right margin → 44-1-40=3). ✓
const LOGO_COORDS = [
  // G (cols 3-8)
  [9,4],[9,5],[9,6],[9,7],
  [10,3],
  [11,3],[11,6],[11,7],[11,8],
  [12,3],[12,8],
  [13,4],[13,5],[13,6],[13,7],[13,8],
  // R (cols 11-16)
  [9,11],[9,12],[9,13],[9,14],
  [10,11],[10,15],
  [11,11],[11,12],[11,13],[11,14],
  [12,11],[12,13],
  [13,11],[13,14],[13,15],
  // A (cols 19-24)
  [9,21],[9,22],
  [10,20],[10,23],
  [11,19],[11,20],[11,21],[11,22],[11,23],[11,24],
  [12,19],[12,24],
  [13,19],[13,24],
  // P (cols 27-32)
  [9,27],[9,28],[9,29],[9,30],
  [10,27],[10,31],
  [11,27],[11,28],[11,29],[11,30],
  [12,27],
  [13,27],
  // H (cols 35-40)
  [9,35],[9,40],
  [10,35],[10,40],
  [11,35],[11,36],[11,37],[11,38],[11,39],[11,40],
  [12,35],[12,40],
  [13,35],[13,40],
];

// Pre-build as a Set<"r-c"> for fast lookup
const LOGO_SET = new Set(LOGO_COORDS.map(([r, c]) => `${r}-${c}`));

// BFS origin = crossbar of letter A (row 9, col 21)
const BFS_ORIGIN_R = 11;   // crossbar of letter A in 24-row grid (rows shifted +2)
const BFS_ORIGIN_C = 21;
const BFS_MAX_NODES = 320;  // ↑ from 260 — covers extra cells from larger grid
const BFS_SPEED_MS  = 3;    // ↓ from 5ms — ultra-fast spread for maximum energy

// Phase names
const PHASE = {
  VOID:       'void',
  GRID:       'grid',
  WHISPER:    'whisper',
  IDENTITY:   'identity',
  INVITATION: 'invitation',
  ASSEMBLED:  'assembled',
};

// ── Timer registry (mirrors timersRef in JSX) ─────────────────
const _timers = [];
function schedule(fn, delay) {
  const id = setTimeout(fn, delay);
  _timers.push(id);
  return id;
}
function clearAllTimers() {
  _timers.forEach(clearTimeout);
  _timers.length = 0;
}

// ── BFS order generator ───────────────────────────────────────
function bfsOrder(startR, startC, rows, cols) {
  const visited = new Set([`${startR}-${startC}`]);
  const queue   = [[startR, startC]];
  const order   = [];
  const dirs    = [[0,1],[1,0],[0,-1],[-1,0]];

  while (queue.length) {
    const [r, c] = queue.shift();
    order.push([r, c]);
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      const key = `${nr}-${nc}`;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited.has(key)) {
        visited.add(key);
        queue.push([nr, nc]);
      }
    }
  }
  return order;
}

// ══════════════════════════════════════════════════════════════
//  DOM BUILDERS
// ══════════════════════════════════════════════════════════════

// ── Main scene container ──────────────────────────────────────
function buildScene() {
  const scene = document.createElement('div');
  scene.id = 'landing-scene';
  return scene;
}

// ── Pulse dot ─────────────────────────────────────────────────
function buildPulseDot() {
  const dot = document.createElement('div');
  dot.id = 'landing-pulse-dot';
  return dot;
}

// ── Grid wrapper ──────────────────────────────────────────────
function buildGridWrapper() {
  const wrapper = document.createElement('div');
  wrapper.id = 'landing-grid-wrapper';

  // Set the natural pixel dimensions — CSS transform: scale() in
  // landing.css scales this down on smaller viewports without
  // disturbing the internal BFS / logo pixel coordinates.
  const W = COLS * CELL_SIZE;  // 880px
  const H = ROWS * CELL_SIZE;  // 480px
  wrapper.style.width  = `${W}px`;
  wrapper.style.height = `${H}px`;

  // Allow the scale transform to overflow the wrapper's own box
  // so it doesn't get clipped by the parent scene's overflow:hidden.
  wrapper.style.flexShrink = '0';

  return wrapper;
}

// ── SVG gridlines ─────────────────────────────────────────────
// Lines start invisible (stroke-dashoffset = full length).
// Each line's transition-delay is computed from its distance to
// the grid centre — lines closest to centre draw first.
function buildGridLines(wrapper) {
  const W  = COLS * CELL_SIZE;
  const H  = ROWS * CELL_SIZE;
  const cx = W / 2;
  const cy = H / 2;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'landing-gridlines';
  svg.setAttribute('width',  W);
  svg.setAttribute('height', H);
  svg.style.display = 'block';
  svg.style.position = 'absolute';
  svg.style.inset = '0';

  const makeLine = (x1, y1, x2, y2, dist) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.style.stroke        = 'rgba(255,255,255,0.18)'; /* Further increased visibility */
    line.style.strokeWidth   = '0.7'; /* Slightly thicker */
    line.style.strokeDasharray  = '2000';
    line.style.strokeDashoffset = '2000';
    line.style.opacity = '0';
    line.style.transition =
      `stroke-dashoffset 0.85s ${(dist * 0.5).toFixed(3)}s cubic-bezier(0.16,1,0.3,1),` +
      `opacity 0.15s ${(dist * 0.5).toFixed(3)}s ease`;
    svg.appendChild(line);
    return line;
  };

  // Horizontal lines
  for (let i = 0; i <= ROWS; i++) {
    const y    = i * CELL_SIZE;
    const dist = Math.abs(y - cy) / cy;
    makeLine(0, y, W, y, dist);
  }
  // Vertical lines
  for (let i = 0; i <= COLS; i++) {
    const x    = i * CELL_SIZE;
    const dist = Math.abs(x - cx) / cx;
    makeLine(x, 0, x, H, dist);
  }

  wrapper.appendChild(svg);
  return svg;
}

// Trigger the draw animation by un-offsetting the lines
function animateGridLines(svg) {
  const lines = svg.querySelectorAll('line');
  lines.forEach(line => {
    line.style.strokeDashoffset = '0';
    line.style.opacity = '1';
  });
}

// ── Cell layer ────────────────────────────────────────────────
function buildCellLayer(wrapper) {
  const layer = document.createElement('div');
  layer.id = 'landing-cell-layer';
  layer.style.gridTemplateColumns = `repeat(${COLS}, ${CELL_SIZE}px)`;
  layer.style.gridTemplateRows    = `repeat(${ROWS}, ${CELL_SIZE}px)`;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'landing-cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      layer.appendChild(cell);
    }
  }

  wrapper.appendChild(layer);
  return layer;
}

// Fast cell accessor
function getCell(layer, r, c) {
  return layer.children[r * COLS + c];
}

// ── Logo overlay ──────────────────────────────────────────────
function buildLogoLayer(wrapper) {
  const layer = document.createElement('div');
  layer.id = 'landing-logo-layer';
  wrapper.appendChild(layer);
  return layer;
}

// Spawn a single logo cell DOM element (invisible, spring-in via class)
function spawnLogoCell(logoLayer, r, c) {
  const el = document.createElement('div');
  el.className = 'logo-cell';
  el.style.top  = `${r * CELL_SIZE}px`;
  el.style.left = `${c * CELL_SIZE}px`;
  logoLayer.appendChild(el);

  // Force reflow so the transition fires
  void el.offsetHeight;

  // Schedule the spring-in on next tick
  requestAnimationFrame(() => {
    el.classList.add('logo-visible');
  });
}

// ── Vignette ──────────────────────────────────────────────────
function buildVignette(wrapper) {
  const v = document.createElement('div');
  v.id = 'landing-vignette';
  wrapper.appendChild(v);
}

// ── Invitation overlay ────────────────────────────────────────
function buildInvitation(scene, onInitialize) {
  const overlay = document.createElement('div');
  overlay.id = 'landing-invitation';

  const inner = document.createElement('div');
  inner.id = 'landing-invitation-inner';

  // -- Tagline (InvitationText)
  const taglineWrap = document.createElement('div');
  taglineWrap.className = 'landing-tagline-wrap';

  const tagline = document.createElement('p');
  tagline.className = 'landing-tagline';
  tagline.textContent = 'Place walls. Choose algorithm. Find the path.';
  taglineWrap.appendChild(tagline);

  // -- Divider line
  const divider = document.createElement('div');
  divider.className = 'landing-divider';

  // -- Initialize button (InitializeButton)
  const btnWrap = document.createElement('div');
  btnWrap.className = 'landing-btn-wrap';

  const btn = document.createElement('button');
  btn.className = 'landing-btn';
  btn.setAttribute('aria-label', 'Initialize visualizer');

  const btnInner = document.createElement('div');
  btnInner.className = 'landing-btn-inner';
  btnInner.textContent = 'Initialize';

  const btnBorder = document.createElement('div');
  btnBorder.className = 'landing-btn-border';

  // Four corner accents
  ['tl', 'tr', 'bl', 'br'].forEach(pos => {
    const corner = document.createElement('div');
    corner.className = `landing-btn-corner ${pos}`;
    btn.appendChild(corner);
  });

  btn.appendChild(btnInner);
  btn.appendChild(btnBorder);

  // Click / touch handler
  btn.addEventListener('click', () => {
    onInitialize();
  });

  btnWrap.appendChild(btn);

  // Assemble
  inner.appendChild(taglineWrap);
  inner.appendChild(divider);
  inner.appendChild(btnWrap);
  overlay.appendChild(inner);
  scene.appendChild(overlay);

  return overlay;
}

// ══════════════════════════════════════════════════════════════
//  MEMORY TRACES
//  Full-screen SVG behind the grid. Eight polyline traces emerge
//  from the four edges of the grid box, make right-angle turns
//  (Manhattan routing), branch once, then fade to nothing before
//  reaching the screen edge.
//
//  The draw technique is identical to buildGridLines():
//    stroke-dasharray = stroke-dashoffset = pathLength
//  Triggering animateTraces() sets dashoffset → 0, causing the
//  CSS transition to draw each trace from its grid-edge origin
//  outward. Staggered delays make them appear one group at a time.
//
//  All coordinates are computed from the grid's live
//  getBoundingClientRect() so they always align perfectly
//  regardless of viewport size.
// ══════════════════════════════════════════════════════════════

// ── Build the full-screen traces SVG (called once at mount) ───
// Returns the SVG element; traces are drawn but invisible until
// animateTraces() is called.
function buildTraces(scene, gridWrapper) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'landing-traces-svg';

  // Positioned to fill the entire #landing-scene (fixed viewport)
  svg.setAttribute('width',  '100%');
  svg.setAttribute('height', '100%');
  svg.style.position = 'absolute';
  svg.style.inset    = '0';
  svg.style.overflow = 'visible';
  svg.style.pointerEvents = 'none';

  // Insert BEHIND gridWrapper so traces don't overlap grid content
  scene.insertBefore(svg, gridWrapper);

  return svg;
}

// ── Helper: make one trace polyline + optional branch ─────────
// points     — array of [x, y] in scene coordinates
// delay      — CSS transition delay in seconds
// duration   — CSS transition duration in seconds
// Returns the primary polyline element (for the animateTraces caller).
function makeTrace(svg, points, delay, duration) {
  const TRACE_COLOR    = 'rgba(110, 231, 183, 0.55)'; // teal, same family as button
  const TRACE_OPACITY  = '0.07';                       // final resting opacity

  // Build SVG points string
  const ptStr = points.map(([x, y]) => `${x},${y}`).join(' ');

  // Estimate path length as sum of Manhattan segments
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.abs(points[i][0] - points[i-1][0])
         + Math.abs(points[i][1] - points[i-1][1]);
  }
  len += 40; // safety margin

  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', ptStr);
  poly.setAttribute('fill',   'none');
  poly.style.stroke          = TRACE_COLOR;
  poly.style.strokeWidth     = '0.75';
  poly.style.opacity         = '0';
  poly.style.strokeDasharray  = `${len}`;
  poly.style.strokeDashoffset = `${len}`;
  // Transition: draw (dashoffset) + fade-in (opacity) simultaneously
  poly.style.transition =
    `stroke-dashoffset ${duration}s ${delay}s cubic-bezier(0.16, 1, 0.3, 1),` +
    `opacity 0.2s ${delay}s ease`;

  svg.appendChild(poly);

  // Small dot at the branch / elbow points (every point except first and last)
  points.slice(1, -1).forEach(([x, y]) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r',  '2');
    circle.setAttribute('fill', TRACE_COLOR);
    circle.style.opacity    = '0';
    circle.style.transition = `opacity 0.3s ${delay + duration * 0.7}s ease`;
    svg.appendChild(circle);
    poly._elbowDots = poly._elbowDots || [];
    poly._elbowDots.push(circle);
  });

  return poly;
}

// ── Trigger all traces to draw (called from GRID phase) ───────
// gridWrapper must already be in the DOM so getBoundingClientRect works.
function animateTraces(svg, gridWrapper) {
  // Get grid box position in viewport space.
  // #landing-scene is position:fixed inset:0, so scene coords === viewport coords.
  const box = gridWrapper.getBoundingClientRect();

  // Convenience aliases for the four edges
  const gTop    = box.top;
  const gBottom = box.bottom;
  const gLeft   = box.left;
  const gRight  = box.right;
  const gCx     = box.left + box.width  / 2; // horizontal centre
  const gCy     = box.top  + box.height / 2; // vertical centre

  const vW = window.innerWidth;
  const vH = window.innerHeight;

  // ── Define all 8 traces ─────────────────────────────────────
  // Each trace is: [ [startX, startY], [turn1X, turn1Y], ..., [endX, endY] ]
  // Traces exit the grid edge, make 1 right-angle turn, then
  // optionally branch (represented as a second independent polyline
  // that shares the first segment).
  //
  // Delay groups (seconds):
  //   0.10 — top two traces (first to appear)
  //   0.25 — bottom two traces
  //   0.40 — left two traces
  //   0.55 — right two traces
  // Duration: 1.1s each, giving a staggered draw-out over ~1.6s total.

  const DURATION = 1.1;

  // ── TOP EDGE ─────────────────────────────────────────────────
  // Trace T1: exits top edge at 28% from left, goes up, turns left, exits screen
  {
    const ox = gLeft + box.width * 0.28;
    const oy = gTop;
    const turnY = gTop - 90;
    const endX  = Math.max(0, gLeft - 180);
    makeTrace(svg, [[ox, oy], [ox, turnY], [endX, turnY]], 0.10, DURATION);
    // Branch from elbow: goes further up toward screen top
    makeTrace(svg, [[ox, turnY], [ox, Math.max(0, gTop - 220)]], 0.20, DURATION * 0.6);
  }

  // Trace T2: exits top edge at 72% from left, goes up, turns right, exits screen
  {
    const ox = gLeft + box.width * 0.72;
    const oy = gTop;
    const turnY = gTop - 70;
    const endX  = Math.min(vW, gRight + 200);
    makeTrace(svg, [[ox, oy], [ox, turnY], [endX, turnY]], 0.10, DURATION);
    // Branch: short vertical going toward top-right corner
    makeTrace(svg, [[ox, turnY], [ox, Math.max(0, gTop - 180)]], 0.20, DURATION * 0.6);
  }

  // ── BOTTOM EDGE ──────────────────────────────────────────────
  // Trace B1: exits bottom edge at 30% from left, goes down, turns left
  {
    const ox = gLeft + box.width * 0.30;
    const oy = gBottom;
    const turnY = gBottom + 80;
    const endX  = Math.max(0, gLeft - 160);
    makeTrace(svg, [[ox, oy], [ox, turnY], [endX, turnY]], 0.25, DURATION);
    // Branch: short segment going further down
    makeTrace(svg, [[ox, turnY], [ox, Math.min(vH, gBottom + 200)]], 0.35, DURATION * 0.6);
  }

  // Trace B2: exits bottom edge at 70% from left, goes down, turns right
  {
    const ox = gLeft + box.width * 0.70;
    const oy = gBottom;
    const turnY = gBottom + 100;
    const endX  = Math.min(vW, gRight + 190);
    makeTrace(svg, [[ox, oy], [ox, turnY], [endX, turnY]], 0.25, DURATION);
    // Branch: short segment going further down
    makeTrace(svg, [[ox, turnY], [ox, Math.min(vH, gBottom + 210)]], 0.35, DURATION * 0.6);
  }

  // ── LEFT EDGE ────────────────────────────────────────────────
  // Trace L1: exits left edge at 35% from top, goes left, turns up
  {
    const ox = gLeft;
    const oy = gTop + box.height * 0.35;
    const turnX = gLeft - 110;
    const endY  = Math.max(0, gTop - 120);
    makeTrace(svg, [[ox, oy], [turnX, oy], [turnX, endY]], 0.40, DURATION);
    // Branch from elbow: goes further left toward screen edge
    makeTrace(svg, [[turnX, oy], [Math.max(0, gLeft - 260), oy]], 0.50, DURATION * 0.6);
  }

  // Trace L2: exits left edge at 65% from top, goes left, turns down
  {
    const ox = gLeft;
    const oy = gTop + box.height * 0.65;
    const turnX = gLeft - 130;
    const endY  = Math.min(vH, gBottom + 130);
    makeTrace(svg, [[ox, oy], [turnX, oy], [turnX, endY]], 0.40, DURATION);
    // Branch: goes further left
    makeTrace(svg, [[turnX, oy], [Math.max(0, gLeft - 280), oy]], 0.50, DURATION * 0.6);
  }

  // ── RIGHT EDGE ───────────────────────────────────────────────
  // Trace R1: exits right edge at 35% from top, goes right, turns up
  {
    const ox = gRight;
    const oy = gTop + box.height * 0.35;
    const turnX = gRight + 110;
    const endY  = Math.max(0, gTop - 120);
    makeTrace(svg, [[ox, oy], [turnX, oy], [turnX, endY]], 0.55, DURATION);
    // Branch from elbow: goes further right
    makeTrace(svg, [[turnX, oy], [Math.min(vW, gRight + 260), oy]], 0.65, DURATION * 0.6);
  }

  // Trace R2: exits right edge at 65% from top, goes right, turns down
  {
    const ox = gRight;
    const oy = gTop + box.height * 0.65;
    const turnX = gRight + 130;
    const endY  = Math.min(vH, gBottom + 130);
    makeTrace(svg, [[ox, oy], [turnX, oy], [turnX, endY]], 0.55, DURATION);
    // Branch: goes further right
    makeTrace(svg, [[turnX, oy], [Math.min(vW, gRight + 280), oy]], 0.65, DURATION * 0.6);
  }

  // ── Trigger all traces to draw ───────────────────────────────
  // Force a reflow so the initial dashoffset is painted before we change it
  void svg.getBoundingClientRect();

  const allPolys   = svg.querySelectorAll('polyline');
  const allCircles = svg.querySelectorAll('circle');

  allPolys.forEach(p => {
    p.style.strokeDashoffset = '0';
    p.style.opacity          = '0.07';
  });

  allCircles.forEach(c => {
    c.style.opacity = '0.10';
  });
}

// ══════════════════════════════════════════════════════════════
//  MAIN LANDING INIT
// ══════════════════════════════════════════════════════════════
export function initLanding(onDone) {

  // ── Build DOM ───────────────────────────────────────────────
  const scene      = buildScene();
  document.body.insertBefore(scene, document.body.firstChild);

  const pulseDot   = buildPulseDot();
  scene.appendChild(pulseDot);

  const gridWrapper = buildGridWrapper();
  scene.appendChild(gridWrapper);

  const gridSvg   = buildGridLines(gridWrapper);
  const cellLayer = buildCellLayer(gridWrapper);
  const logoLayer = buildLogoLayer(gridWrapper);
  buildVignette(gridWrapper);

  // ── Memory traces SVG (built now, triggered in GRID phase) ──
  // Must be called after gridWrapper is in the DOM.
  const tracesSvg = buildTraces(scene, gridWrapper);

  const invitation = buildInvitation(scene, handleInitialize);

  // ── State ───────────────────────────────────────────────────
  let currentPhase = PHASE.VOID;

  // ── Phase machine ───────────────────────────────────────────
  function setPhase(newPhase) {
    currentPhase = newPhase;

    switch (newPhase) {

      // ── VOID → pulse dot visible ──────────────────────────
      case PHASE.VOID:
        pulseDot.classList.add('visible');
        break;

      // ── GRID → dot fades, grid materialises, traces draw ─
      case PHASE.GRID:
        pulseDot.classList.remove('visible');
        pulseDot.classList.add('hidden');

        gridWrapper.classList.add('visible');
        // Trigger SVG grid line draw
        animateGridLines(gridSvg);
        // Trigger memory traces draw (slight delay so grid lines lead)
        schedule(() => animateTraces(tracesSvg, gridWrapper), 300);
        break;

      // ── WHISPER → BFS ripple outward from GRAPH center ───
      case PHASE.WHISPER: {
        const sequence = bfsOrder(BFS_ORIGIN_R, BFS_ORIGIN_C, ROWS, COLS);
        const capped   = sequence.slice(0, BFS_MAX_NODES);

        capped.forEach(([r, c], i) => {
          schedule(() => {
            const cell = getCell(cellLayer, r, c);
            if (cell && !LOGO_SET.has(`${r}-${c}`)) {
              cell.classList.add('lc-visited');
              setTimeout(() => {
                if (cell.classList.contains('lc-visited')) {
                  // No-op — the ::after fires once via animation, no cleanup needed.
                }
              }, 500);
            }
          }, i * BFS_SPEED_MS);
        });

        // Advance to IDENTITY after BFS finishes
        schedule(() => setPhase(PHASE.IDENTITY), BFS_MAX_NODES * BFS_SPEED_MS + 150);
        break;
      }

      // ── IDENTITY → light up GRAPH letters one by one ─────
      case PHASE.IDENTITY: {
        // Sort top→bottom, left→right (reading order)
        const sorted = [...LOGO_SET].sort((a, b) => {
          const [ar, ac] = a.split('-').map(Number);
          const [br, bc] = b.split('-').map(Number);
          return ar !== br ? ar - br : ac - bc;
        });

        sorted.forEach((key, i) => {
          schedule(() => {
            const [r, c] = key.split('-').map(Number);
            spawnLogoCell(logoLayer, r, c);
          }, i * 16);
        });

        const totalMs = sorted.length * 16;
        schedule(() => setPhase(PHASE.INVITATION), totalMs + 500);
        break;
      }

      // ── INVITATION → show tagline + button ───────────────
      case PHASE.INVITATION:
        invitation.classList.add('visible');
        break;

      // ── ASSEMBLED → user clicked Initialize ──────────────
      case PHASE.ASSEMBLED:
        invitation.classList.remove('visible');
        gridWrapper.classList.add('exit');
        scene.classList.add('landing-exit');

        schedule(() => {
          scene.remove();
          clearAllTimers();
          onDone();
        }, 650);
        break;
    }
  }

  // ── Handle Initialize click ─────────────────────────────────
  function handleInitialize() {
    if (currentPhase === PHASE.ASSEMBLED) return;
    setPhase(PHASE.ASSEMBLED);
  }

  // ── Boot sequence (matches JSX useEffect timings) ───────────
  // Phase 0: dot pulses immediately
  setPhase(PHASE.VOID);

  // Phase 1: grid materialises at 200 ms
  schedule(() => setPhase(PHASE.GRID), 200);

  // Phase 2: BFS whisper starts at 1000 ms (reduced from 1400ms — less idle wait)
  schedule(() => setPhase(PHASE.WHISPER), 1000);

  // Allow external skip (e.g. for dev / impatient users)
  // Exposed as window.__skipLanding()
  window.__skipLanding = () => handleInitialize();
}