// ── app.js ─────────────────────────────────────────────
// Main application entry point and simulation runner.

import { Grid }                    from './grid.js';
import { Controls }                from './controls.js';
import { bfs }                     from './algorithms/bfs.js';
import { dfs }                     from './algorithms/dfs.js';
import { CellAnimator }            from './visualization/animateCells.js';
import { TraversalLog }            from './visualization/logs.js';
import { scrollTo, sleep }         from './utils/helpers.js';
import { initLanding }             from './landing.js';
import { startGuidedOnboarding }   from './onboarding.js';

// ── Boot ────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');

  app.style.display = 'none';
  app.style.opacity = '0';

  // initLanding now calls back with the chosen mode string:
  //   'guided'   → start onboarding after app init
  //   'explorer' → no onboarding, go straight to simulator
  initLanding((mode) => {
    app.style.display    = 'block';
    app.style.transition = 'opacity 0.5s ease';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        app.style.opacity = '1';
        initApp(mode);
      });
    });
  });
});

// ── Main Init ────────────────────────────────────────────────
function initApp(mode = 'explorer') {
  const grid     = new Grid('grid-container', 20);
  const simState = createSimState(grid);
  const controls = new Controls(grid, simState);

  // Patch place methods so BOTH Run and Maze buttons stay in sync.
  function patchGridCallbacks() {
    const origPlaceStart = Grid.prototype._placeStart.bind(grid);
    const origPlaceEnd   = Grid.prototype._placeEnd.bind(grid);

    grid._placeStart = function (r, c, s) {
      origPlaceStart(r, c, s);
      controls.updateRunBtn();
      controls.updateMazeBtn();
    };

    grid._placeEnd = function (r, c, s) {
      origPlaceEnd(r, c, s);
      controls.updateRunBtn();
      controls.updateMazeBtn();
    };
  }

  patchGridCallbacks();

  const origResize = grid.resize.bind(grid);
  grid.resize = function (newSize) {
    origResize(newSize);
    patchGridCallbacks();
  };

  const sizeSelect = document.getElementById('grid-size');
  sizeSelect?.addEventListener('change', () => {
    const size = parseInt(sizeSelect.value);
    grid.resize(size);
    controls.updateRunBtn();
    controls.updateMazeBtn();
    simState.reset();
  });

  setStatus('Place Start & End nodes to begin', '');

  // ── Launch onboarding if guided mode ─────────────────────────
  // Slight delay so the app fade-in completes first (matches the
  // 0.5s opacity transition on #app above).
  if (mode === 'guided') {
    setTimeout(() => {
      // onboarding.js patches grid callbacks itself for node tracking.
      // It must be started AFTER patchGridCallbacks() above so the
      // chain is: app-patch → onboarding-patch (innermost wins).
      startGuidedOnboarding(grid, controls, simState);
    }, 600);
  }
}

// ── Status helper ─────────────────────────────────────────────
function setStatus(text, state) {
  const dot  = document.getElementById('status-dot');
  const span = document.getElementById('status-text');
  if (dot)  dot.className    = `status-dot ${state}`;
  if (span) span.textContent = text;
}

// ── Insight Panel helper ──────────────────────────────────────
function showInsightPanel(side, result) {
  const panel     = document.getElementById(`${side}-insight`);
  const iconEl    = document.getElementById(`${side}-insight-icon`);
  const titleEl   = document.getElementById(`${side}-insight-title`);
  const statsEl   = document.getElementById(`${side}-insight-stats`);
  const explainEl = document.getElementById(`${side}-insight-explanation`);

  if (!panel) return;

  const found   = result.path.length > 0;
  const pathLen = result.path.length;
  const visited = result.visited.length;
  const isBfs   = side === 'bfs';

  if (found) {
    iconEl.textContent  = '✔';
    titleEl.textContent = isBfs ? 'Shortest Path Found' : 'Path Found';
    titleEl.className   = 'insight-title path-found';
    statsEl.innerHTML   =
      `<div class="insight-stat-item">Distance: <span>${pathLen}</span> nodes</div>` +
      `<div class="insight-stat-item">Visited: <span>${visited}</span> nodes</div>`;
    explainEl.textContent = isBfs
      ? 'BFS guarantees the shortest path in an unweighted grid because it explores level by level, always reaching the goal via the fewest hops first.'
      : 'DFS explores depth-first and does not guarantee the shortest path. It follows one branch as far as possible before backtracking.';
  } else {
    iconEl.textContent  = '✗';
    titleEl.textContent = 'No Path Found';
    titleEl.className   = 'insight-title no-path';
    statsEl.innerHTML   =
      `<div class="insight-stat-item">Visited: <span>${visited}</span> nodes</div>`;
    explainEl.textContent = isBfs
      ? 'BFS exhausted all reachable nodes level by level but never reached the goal — the goal is unreachable from the start.'
      : 'DFS explored deeply but could not reach the goal. The target node is in an unreachable region.';
  }

  panel.style.display = 'flex';
  void panel.offsetHeight;
  panel.classList.add('insight-appear');
}

// ── Goal Discovery animation ──────────────────────────────────
function triggerGoalPulse(gridEl, endNode, cols) {
  const [er, ec] = endNode;
  const cell     = gridEl.children[er * cols + ec];
  if (!cell) return;

  cell.classList.add('goal-pulse');

  const ripple = document.createElement('div');
  ripple.className = 'goal-ripple';
  cell.appendChild(ripple);

  setTimeout(() => {
    cell.classList.remove('goal-pulse');
    ripple.remove();
  }, 650);
}

// ── Simulation State Factory ──────────────────────────────────
function createSimState(grid) {
  let bfsAnimator = null;
  let dfsAnimator = null;
  let _paused     = false;
  let _running    = false;

  function getDelay() {
    const slider = document.getElementById('speed-slider');
    const v      = slider ? parseInt(slider.value) : 50;
    return Math.max(5, 305 - v * 3);
  }

  function updateStats(side, visitedCount, pathLen) {
    const visitEl = document.getElementById(`${side}-visited`);
    const pathEl  = document.getElementById(`${side}-path`);
    if (visitEl) visitEl.textContent = visitedCount;
    if (pathEl)  pathEl.textContent  = (typeof pathLen === 'number' && pathLen > 0)
      ? pathLen : '—';
  }

  function setProgress(side, pct) {
    const el = document.getElementById(`${side}-progress`);
    if (el) el.style.width = `${pct}%`;
  }

  // ── Run ──────────────────────────────────────────────────────
  async function run() {
    if (_running)        return;
    if (!grid.isReady()) return;

    _running = true;
    _paused  = false;
    setStatus('Running…', 'running');

    ['bfs', 'dfs'].forEach(s => {
      const p = document.getElementById(`${s}-insight`);
      if (p) { p.style.display = 'none'; p.classList.remove('insight-appear'); }
    });

    const compSection = document.getElementById('comparison-section');
    compSection.classList.add('visible');
    await sleep(100);
    scrollTo(compSection);
    await sleep(400);

    const speedPanel = document.getElementById('speed-center-panel');
    if (speedPanel) speedPanel.classList.add('visible');

    const gridData = grid.getGridData();
    const [sr, sc] = grid.startNode;
    const [er, ec] = grid.endNode;
    const rows     = grid.size;
    const cols     = grid.size;

    const wrapEl   = document.querySelector('.algo-grid-wrap');
    const compW    = Math.min(wrapEl ? wrapEl.clientWidth : 300, 340);
    const cellSize = Math.max(6, Math.floor((compW - cols) / cols));

    // ── BFS setup ─────────────────────────────────────────────
    const bfsGridEl = document.getElementById('bfs-grid');
    bfsAnimator = new CellAnimator(bfsGridEl, rows, cols, cellSize);
    bfsAnimator.applyGridState(gridData, grid.startNode, grid.endNode);

    const bfsLog = new TraversalLog('bfs-log');
    bfsLog.clear();

    // ── DFS setup ─────────────────────────────────────────────
    const dfsGridEl = document.getElementById('dfs-grid');
    dfsAnimator = new CellAnimator(dfsGridEl, rows, cols, cellSize);
    dfsAnimator.applyGridState(gridData, grid.startNode, grid.endNode);

    const dfsLog = new TraversalLog('dfs-log');
    dfsLog.clear();

    // ── Compute ────────────────────────────────────────────────
    const bfsResult = bfs(gridData, sr, sc, er, ec);
    const dfsResult = dfs(gridData, sr, sc, er, ec);

    const totalBfs = bfsResult.visited.length || 1;
    const totalDfs = dfsResult.visited.length || 1;

    let bfsDone = false;
    let dfsDone = false;

    // ── Animate both in parallel ──────────────────────────────
    const bfsPromise = bfsAnimator.animate(
      bfsResult.visited,
      bfsResult.path,
      getDelay,
      (i, r, c) => {
        bfsLog.addStep(r, c, 'visit');
        updateStats('bfs', i + 1, 0);
        setProgress('bfs', Math.round((i + 1) / totalBfs * 100));
        if (r === er && c === ec && !bfsDone) {
          bfsDone = true;
          triggerGoalPulse(bfsGridEl, grid.endNode, cols);
        }
      },
      (found) => {
        if (found) {
          bfsLog.addPathFound(bfsResult.path.length);
          bfsLog.addVisited(bfsResult.visited.length);
          updateStats('bfs', bfsResult.visited.length, bfsResult.path.length);
        } else {
          bfsLog.addNoPath();
          updateStats('bfs', bfsResult.visited.length, 0);
        }
        setProgress('bfs', 100);
        showInsightPanel('bfs', bfsResult);
      },
      grid.startNode,
      grid.endNode
    );

    const dfsPromise = dfsAnimator.animate(
      dfsResult.visited,
      dfsResult.path,
      getDelay,
      (i, r, c) => {
        dfsLog.addStep(r, c, 'stack');
        updateStats('dfs', i + 1, 0);
        setProgress('dfs', Math.round((i + 1) / totalDfs * 100));
        if (r === er && c === ec && !dfsDone) {
          dfsDone = true;
          triggerGoalPulse(dfsGridEl, grid.endNode, cols);
        }
      },
      (found) => {
        if (found) {
          dfsLog.addPathFound(dfsResult.path.length);
          dfsLog.addVisited(dfsResult.visited.length);
          updateStats('dfs', dfsResult.visited.length, dfsResult.path.length);
        } else {
          dfsLog.addNoPath();
          updateStats('dfs', dfsResult.visited.length, 0);
        }
        setProgress('dfs', 100);
        showInsightPanel('dfs', dfsResult);
      },
      grid.startNode,
      grid.endNode
    );

    await Promise.all([bfsPromise, dfsPromise]);
    _running = false;
    setStatus('Simulation complete ✓', 'done');
  }

  // ── Pause / Resume ────────────────────────────────────────────
  function pause() {
    _paused = true;
    bfsAnimator?.pause();
    dfsAnimator?.pause();
    setStatus('Paused', 'running');
  }

  function resume() {
    _paused = false;
    bfsAnimator?.resume();
    dfsAnimator?.resume();
    setStatus('Running…', 'running');
  }

  // ── Reset ─────────────────────────────────────────────────────
  function reset() {
    bfsAnimator?.stop();
    dfsAnimator?.stop();
    bfsAnimator = null;
    dfsAnimator = null;
    _running    = false;
    _paused     = false;

    grid.clearVisited();
    setStatus('Ready — run another simulation', 'ready');

    const compSection = document.getElementById('comparison-section');
    compSection.classList.remove('visible');

    const speedPanel = document.getElementById('speed-center-panel');
    if (speedPanel) speedPanel.classList.remove('visible');

    const pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) pauseBtn.textContent = '⏸ Pause';

    ['bfs', 'dfs'].forEach(s => {
      updateStats(s, '—', 0);
      setProgress(s, 0);
      const log = new TraversalLog(`${s}-log`);
      log.clear();
      const panel = document.getElementById(`${s}-insight`);
      if (panel) { panel.style.display = 'none'; panel.classList.remove('insight-appear'); }
    });
  }

  return { run, pause, resume, reset, isPaused: () => _paused };
}
