// ── backgroundNetwork.js ───────────────────────────────
// Subtle animated graph network drawn on a canvas behind the app.
// Starts after the loading screen finishes.

const MAX_NODES       = 60;
const MAX_CONNECTIONS = 3;
const DISTANCE_THRESH = 140;
const NODE_RADIUS     = 2;
const LINE_WIDTH      = 0.5;
const BASE_OPACITY    = 0.065;  // max line/node opacity
const SPEED           = 0.28;   // px per frame

let canvas, ctx, nodes = [], animFrameId = null;

function initNetwork() {
  canvas = document.getElementById('bg-network');
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  resize();
  window.addEventListener('resize', resize);

  spawnNodes();
  animFrameId = requestAnimationFrame(tick);

  // Fade the canvas in smoothly
  canvas.classList.add('visible');
}

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
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

function tick() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Move nodes
  for (const n of nodes) {
    n.x += n.vx;
    n.y += n.vy;

    // Wrap around edges
    if (n.x < -10)                n.x = canvas.width  + 10;
    if (n.x > canvas.width  + 10) n.x = -10;
    if (n.y < -10)                n.y = canvas.height + 10;
    if (n.y > canvas.height + 10) n.y = -10;
  }

  // Draw connections
  for (let i = 0; i < nodes.length; i++) {
    let connections = 0;
    for (let j = i + 1; j < nodes.length && connections < MAX_CONNECTIONS; j++) {
      const dx   = nodes[i].x - nodes[j].x;
      const dy   = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < DISTANCE_THRESH) {
        const alpha = BASE_OPACITY * (1 - dist / DISTANCE_THRESH);
        ctx.beginPath();
        ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
        ctx.lineWidth   = LINE_WIDTH;
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
        connections++;
      }
    }
  }

  // Draw nodes
  for (const n of nodes) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 229, 255, ${BASE_OPACITY * 1.2})`;
    ctx.fill();
  }

  animFrameId = requestAnimationFrame(tick);
}

// ── Wait for the loading screen to finish ──────────────
// app.js hides loading screen at ~2700ms + 600ms fade = ~3300ms total.
// We use a MutationObserver on the loading screen itself.
window.addEventListener('DOMContentLoaded', () => {
  const loadScreen = document.getElementById('loading-screen');
  if (!loadScreen) {
    // Fallback: just start after expected load duration
    setTimeout(initNetwork, 3500);
    return;
  }

  const observer = new MutationObserver(() => {
    // Loading screen is hidden when display becomes 'none'
    const style = loadScreen.style;
    if (style.display === 'none') {
      observer.disconnect();
      setTimeout(initNetwork, 500);
    }
  });

  observer.observe(loadScreen, { attributes: true, attributeFilter: ['style'] });
});