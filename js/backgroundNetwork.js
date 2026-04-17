// ── backgroundNetwork.js ───────────────────────────────
// Loading screen: BFS ripple wave on a dot-grid canvas.
// Main app: subtle floating network graph.

// ══════════════════════════════════════════
//  SHARED STATE
// ══════════════════════════════════════════
let canvas, ctx, animFrameId = null;
let mode = 'bfs'; // 'bfs' | 'network'

// ══════════════════════════════════════════
//  BFS RIPPLE (loading screen background)
// ══════════════════════════════════════════
const CELL_SIZE   = 28;   // match the body dot-grid size
const BFS_SPEED   = 48;   // ms per ring expansion
const FADE_RINGS  = 18;   // how many rings stay visible
const RESTART_MS  = 2200; // ms before next ripple starts

let gridCols = 0, gridRows = 0;
let bfsRings = [];           // [{ring, cells:[{col,row}], born}]
let bfsOrigin = null;
let bfsTimer  = null;
let bfsRingTimer = null;

function initBFS() {
  canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (mode === 'bfs') launchRipple();
  });

  canvas.style.opacity = '1';
  launchRipple();
  animFrameId = requestAnimationFrame(drawBFS);
}

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  gridCols = Math.ceil(canvas.width  / CELL_SIZE) + 2;
  gridRows = Math.ceil(canvas.height / CELL_SIZE) + 2;
}

function launchRipple() {
  clearTimeout(bfsTimer);
  clearInterval(bfsRingTimer);
  bfsRings = [];

  // Always start from the exact centre of the viewport
  const cx = Math.floor(gridCols / 2);
  const cy = Math.floor(gridRows / 2);
  bfsOrigin = { col: cx, row: cy };

  // Pre-compute BFS ring layers
  const visited = new Set();
  const rings   = [];
  let frontier  = [{ col: cx, row: cy }];
  visited.add(`${cx},${cy}`);

  const maxRings = Math.max(gridCols, gridRows) + 4;

  for (let r = 0; r < maxRings && frontier.length; r++) {
    rings.push({ ring: r, cells: [...frontier], born: null });
    const next = [];
    for (const { col, row } of frontier) {
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = col + dc, nr = row + dr;
        const key = `${nc},${nr}`;
        if (!visited.has(key)) {
          visited.add(key);
          next.push({ col: nc, row: nr });
        }
      }
    }
    frontier = next;
  }

  // Release rings one at a time via interval
  let ri = 0;
  const now = performance.now();
  bfsRingTimer = setInterval(() => {
    if (ri >= rings.length) {
      clearInterval(bfsRingTimer);
      // Restart after a pause
      bfsTimer = setTimeout(launchRipple, RESTART_MS);
      return;
    }
    rings[ri].born = performance.now();
    bfsRings.push(rings[ri]);
    // Trim old rings
    if (bfsRings.length > FADE_RINGS + 2) bfsRings.shift();
    ri++;
  }, BFS_SPEED);
}

function drawBFS() {
  if (mode !== 'bfs') return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const now = performance.now();

  // ── Draw dot grid (always visible, very faint) ──────
  ctx.fillStyle = 'rgba(30, 36, 51, 0.9)';
  for (let col = 0; col < gridCols; col++) {
    for (let row = 0; row < gridRows; row++) {
      const x = col * CELL_SIZE + CELL_SIZE / 2;
      const y = row * CELL_SIZE + CELL_SIZE / 2;
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Draw BFS cells ──────────────────────────────────
  for (const { ring, cells, born } of bfsRings) {
    if (born === null) continue;
    const age = now - born;        // ms since this ring appeared
    const maxAge = FADE_RINGS * BFS_SPEED;
    const lifeRatio = Math.min(age / maxAge, 1); // 0→1

    // Fade in fast, fade out slowly
    let alpha;
    if (lifeRatio < 0.08) {
      alpha = lifeRatio / 0.08;        // quick bloom in
    } else {
      alpha = 1 - ((lifeRatio - 0.08) / 0.92); // slow fade out
    }
    alpha = Math.max(0, Math.min(alpha, 1));

    // Colour: cyan for BFS wave
    const baseR = 0, baseG = 229, baseB = 255;
    // Slightly more purple for later rings
    const purple = Math.min(ring / 30, 1);
    const r = Math.round(baseR + (124 - baseR) * purple * 0.4);
    const g = Math.round(baseG + ( 58 - baseG) * purple * 0.3);
    const b = Math.round(baseB + (237 - baseB) * purple * 0.2);

    const cellAlpha = alpha * 0.55;
    const glowAlpha = alpha * 0.12;

    for (const { col, row } of cells) {
      const x = col * CELL_SIZE;
      const y = row * CELL_SIZE;
      const pad = 3;

      // Glow halo
      ctx.fillStyle = `rgba(${r},${g},${b},${glowAlpha})`;
      ctx.fillRect(x - pad, y - pad, CELL_SIZE + pad * 2, CELL_SIZE + pad * 2);

      // Cell body
      ctx.fillStyle = `rgba(${r},${g},${b},${cellAlpha})`;
      ctx.beginPath();
      roundRect(ctx, x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2, 3);
      ctx.fill();

      // Bright edge highlight on leading ring face
      if (lifeRatio < 0.25) {
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.9})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        roundRect(ctx, x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2, 3);
        ctx.stroke();
      }
    }
  }

  // ── Vignette overlay ────────────────────────────────
  const vignette = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, 0,
    canvas.width / 2, canvas.height / 2,
    Math.max(canvas.width, canvas.height) * 0.7
  );
  vignette.addColorStop(0,   'rgba(9,11,16,0)');
  vignette.addColorStop(0.6, 'rgba(9,11,16,0)');
  vignette.addColorStop(1,   'rgba(9,11,16,0.85)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  animFrameId = requestAnimationFrame(drawBFS);
}

// ══════════════════════════════════════════
//  NETWORK GRAPH (main app background)
// ══════════════════════════════════════════
const MAX_NODES       = 55;
const MAX_CONNECTIONS = 3;
const DISTANCE_THRESH = 150;
const NODE_RADIUS     = 1.8;
const LINE_WIDTH      = 0.5;
const BASE_OPACITY    = 0.055;
const SPEED           = 0.22;

let nodes = [];

function initNetwork() {
  // Reuse same canvas
  canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  clearTimeout(bfsTimer);
  clearInterval(bfsRingTimer);
  cancelAnimationFrame(animFrameId);
  bfsRings = [];
  mode = 'network';

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  spawnNodes();
  animFrameId = requestAnimationFrame(drawNetwork);
}

function spawnNodes() {
  nodes = [];
  for (let i = 0; i < MAX_NODES; i++) {
    nodes.push({
      x:  Math.random() * canvas.width,
      y:  Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * SPEED,
      vy: (Math.random() - 0.5) * SPEED,
    });
  }
}

function drawNetwork() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const n of nodes) {
    n.x += n.vx; n.y += n.vy;
    if (n.x < -10)                 n.x = canvas.width  + 10;
    if (n.x > canvas.width  + 10)  n.x = -10;
    if (n.y < -10)                 n.y = canvas.height + 10;
    if (n.y > canvas.height + 10)  n.y = -10;
  }

  for (let i = 0; i < nodes.length; i++) {
    let conns = 0;
    for (let j = i + 1; j < nodes.length && conns < MAX_CONNECTIONS; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < DISTANCE_THRESH) {
        const alpha = BASE_OPACITY * (1 - d / DISTANCE_THRESH);
        ctx.beginPath();
        ctx.strokeStyle = `rgba(0,229,255,${alpha})`;
        ctx.lineWidth   = LINE_WIDTH;
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
        conns++;
      }
    }
  }

  for (const n of nodes) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,229,255,${BASE_OPACITY * 1.4})`;
    ctx.fill();
  }

  animFrameId = requestAnimationFrame(drawNetwork);
}

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ══════════════════════════════════════════
//  BOOTSTRAP
// ══════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  // Start BFS ripple immediately (behind loading screen)
  initBFS();

  // Switch to network when loading screen hides
  const loadScreen = document.getElementById('loading-screen');
  if (!loadScreen) { setTimeout(initNetwork, 3500); return; }

  const observer = new MutationObserver(() => {
    if (loadScreen.style.display === 'none') {
      observer.disconnect();
      setTimeout(initNetwork, 600);
    }
  });
  observer.observe(loadScreen, { attributes: true, attributeFilter: ['style'] });
});