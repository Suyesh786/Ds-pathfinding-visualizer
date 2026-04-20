// ══════════════════════════════════════════════════════════════
//  DS Academy – Guided Onboarding System  (js/onboarding.js)
//
//  Integrates seamlessly with the existing animation system:
//  - Reuses showToast(), sleep(), scrollTo() from helpers.js
//  - Reuses .btn-glow / _pulseOnce pattern from controls.js
//  - Reuses .cell-visited / .cell-path / .cell-wall-anim classes
//  - Reuses .fade-slide-up, .insight-appear from animations.css
//  - Reuses CSS variables from style.css for all colours/fonts
//  - Ghost grid BFS mirrors the landing scene's lc-visited pattern
//
//  Entry point: startGuidedOnboarding(grid, controls, simRunner)
//  Called from app.js when user picks "Guided Mode".
// ══════════════════════════════════════════════════════════════

import { showToast, sleep, scrollTo } from './utils/helpers.js';

// ── Step definitions ──────────────────────────────────────────
// Each step has: id, delay before next auto-advance (0 = manual),
// setup() runs when step begins, teardown() runs when it ends.

const ONBOARDING_STEPS = [
  'ghost-grid',     // Step 1 — Ghost BFS demo on the real grid
  'highlight-wall', // Step 2 — Highlight wall button + toast
  'highlight-nodes',// Step 3 — Highlight start/end buttons + toast
  'place-nodes',    // Step 4 — Wait for user to place both nodes
  'run-hint',       // Step 5 — Run button pulse + explanation callout
  'watch-sim',      // Step 6 — Let simulation run; show mid-sim hint
  'complete',       // Step 7 — Post-simulation insight banner
];

// ══════════════════════════════════════════════════════════════
//  PUBLIC ENTRY POINT
// ══════════════════════════════════════════════════════════════

/**
 * startGuidedOnboarding
 * @param {Grid}     grid      – the main Grid instance from app.js
 * @param {Controls} controls  – Controls instance
 * @param {object}   simRunner – { run, pause, resume, reset, isPaused }
 */
export function startGuidedOnboarding(grid, controls, simRunner) {
  const ob = new OnboardingController(grid, controls, simRunner);
  ob.start();
  return ob;
}

// ══════════════════════════════════════════════════════════════
//  ONBOARDING CONTROLLER
// ══════════════════════════════════════════════════════════════

class OnboardingController {
  constructor(grid, controls, simRunner) {
    this.grid      = grid;
    this.controls  = controls;
    this.simRunner = simRunner;

    this._stepIdx   = -1;
    this._active    = true;
    this._timers    = [];
    this._beacons   = [];    // DOM elements to clean up
    this._callouts  = [];    // DOM elements to clean up
    this._ghostDone = false;

    // Track node placement progress
    this._startPlaced = false;
    this._endPlaced   = false;
    this._nodesReady  = false;

    // Bind node-placement observer
    this._patchGridForOnboarding();
  }

  // ── Timer helpers (mirrors landing.js pattern) ────────────────
  _schedule(fn, delay) {
    const id = setTimeout(() => { if (this._active) fn(); }, delay);
    this._timers.push(id);
    return id;
  }
  _clearTimers() {
    this._timers.forEach(clearTimeout);
    this._timers.length = 0;
  }

  // ── Observe node placement via grid method patching ───────────
  // Mirrors the patchGridCallbacks() pattern from app.js
  _patchGridForOnboarding() {
    const origStart = this.grid._placeStart.bind(this.grid);
    const origEnd   = this.grid._placeEnd.bind(this.grid);
    const self      = this;

    this.grid._placeStart = function(r, c, s) {
      origStart(r, c, s);
      self._startPlaced = true;
      self._onNodePlaced();
    };
    this.grid._placeEnd = function(r, c, s) {
      origEnd(r, c, s);
      self._endPlaced = true;
      self._onNodePlaced();
    };
  }

  _onNodePlaced() {
    if (this._startPlaced && this._endPlaced && !this._nodesReady) {
      this._nodesReady = true;
      // Both nodes placed — advance to run-hint step
      this._schedule(() => this._goToStep('run-hint'), 400);
    } else if (this._startPlaced && !this._endPlaced && this._stepIdx === this._stepIdxOf('place-nodes')) {
      // Start placed, waiting for end
      this._schedule(() => {
        showToast('Start placed! Now set your End node 🔴', '🟠', 3000);
      }, 300);
    } else if (this._endPlaced && !this._startPlaced && this._stepIdx === this._stepIdxOf('place-nodes')) {
      this._schedule(() => {
        showToast('End placed! Now set your Start node 🟠', '🔴', 3000);
      }, 300);
    }
  }

  _stepIdxOf(id) {
    return ONBOARDING_STEPS.indexOf(id);
  }

  // ══════════════════════════════════════════
  //  LIFECYCLE
  // ══════════════════════════════════════════

  start() {
    this._showProgressBar();
    this._goToStep('ghost-grid');
  }

  stop() {
    this._active = false;
    this._clearTimers();
    this._removeBeacons();
    this._removeCallouts();
    this._hideProgressBar();
    this._destroyGhostGrid();
  }

  _goToStep(stepId) {
    if (!this._active) return;
    const idx = this._stepIdxOf(stepId);
    if (idx === -1) return;
    this._stepIdx = idx;
    this._updateProgressBar(idx);
    this._runStep(stepId);
  }

  // ══════════════════════════════════════════
  //  STEP RUNNER
  // ══════════════════════════════════════════

  _runStep(stepId) {
    switch (stepId) {
      case 'ghost-grid':     return this._stepGhostGrid();
      case 'highlight-wall': return this._stepHighlightWall();
      case 'highlight-nodes':return this._stepHighlightNodes();
      case 'place-nodes':    return this._stepPlaceNodes();
      case 'run-hint':       return this._stepRunHint();
      case 'watch-sim':      return this._stepWatchSim();
      case 'complete':       return this._stepComplete();
    }
  }

  // ══════════════════════════════════════════
  //  STEP 1 — Ghost BFS demo
  // ══════════════════════════════════════════
  _stepGhostGrid() {
    const grid = this.grid;
    if (!grid.container) return;

    const rows = grid.size;
    const cols = grid.size;

    // Show a contextual callout above the grid
    this._showCallout(
      'grid-container',
      'above',
      '🔍 Watch BFS explore',
      'Breadth-first search expands outward level by level — like a wave from the origin.',
      'onb-callout-ghost'
    );

    showToast('Guided Mode — watch the algorithm explore', '🎓', 4000);

    // BFS order from center
    const startR = Math.floor(rows / 2);
    const startC = Math.floor(cols / 2);
    const order  = this._bfsOrderOnGrid(startR, startC, rows, cols);

    // We'll visit up to half the grid cells as a "demo"
    const cap    = Math.min(Math.floor(rows * cols * 0.55), order.length);
    const capped = order.slice(0, cap);

    // Animate visits with the existing .cell-visited / .cell-path classes
    // using the same timing pattern as CellAnimator in animateCells.js
    const GHOST_DELAY = 18; // ms per cell (fast but visible)
    const visitedEls  = [];

    capped.forEach(([r, c], i) => {
      this._schedule(() => {
        const el = grid._getEl(r, c);
        if (!el) return;
        const state = grid.cells[r][c];
        if (state !== 'wall' && state !== 'start' && state !== 'end') {
          el.classList.add('cell-visited', 'onb-ghost');
          el.style.setProperty('--ghost-alpha', '0.45');
          visitedEls.push({ el, r, c });
        }
      }, i * GHOST_DELAY);
    });

    const totalGhostMs = cap * GHOST_DELAY;

    // After visits, animate a "path" trace back to center as a demo
    this._schedule(() => {
      this._animateGhostPath(grid, startR, startC, rows, cols, visitedEls);
    }, totalGhostMs + 200);

    // After ghost done, fade it out and advance
    this._schedule(() => {
      this._clearGhostCells(grid);
      this._removeCallouts();
      this._ghostDone = true;
      this._schedule(() => this._goToStep('highlight-wall'), 500);
    }, totalGhostMs + 200 + (Math.min(cols, rows) * 30) + 800);
  }

  _animateGhostPath(grid, startR, startC, rows, cols, visitedEls) {
    // Spiral a "path" from visited cells back toward center
    // This is a simplified visual trace — not a real path, just aesthetics
    const pathLen = Math.min(12, Math.floor(Math.min(rows, cols) * 0.5));
    const path    = [];
    let r = startR + Math.floor(rows * 0.15);
    let c = startC + Math.floor(cols * 0.15);

    for (let i = 0; i < pathLen; i++) {
      r = Math.max(0, Math.min(rows - 1, r - 1));
      c = Math.max(0, Math.min(cols - 1, c - (i % 2 === 0 ? 1 : 0)));
      path.push([r, c]);
    }

    path.forEach(([pr, pc], i) => {
      this._schedule(() => {
        const el = grid._getEl(pr, pc);
        if (!el) return;
        const state = grid.cells[pr][pc];
        if (state !== 'wall' && state !== 'start' && state !== 'end') {
          el.classList.remove('cell-visited', 'onb-ghost');
          el.classList.add('cell-path', 'onb-ghost');
          el.style.animationDelay = `${i * 0.03}s`;
        }
      }, i * 30);
    });
  }

  _clearGhostCells(grid) {
    // Fade out ghost cells gracefully using existing transition
    const ghosts = grid.container.querySelectorAll('.onb-ghost');
    ghosts.forEach((el, i) => {
      setTimeout(() => {
        el.style.transition = 'opacity 0.3s ease, background 0.3s ease';
        el.style.opacity    = '0';
        setTimeout(() => {
          el.classList.remove('cell-visited', 'cell-path', 'onb-ghost');
          el.style.opacity    = '';
          el.style.transition = '';
          el.style.animationDelay = '';
        }, 320);
      }, i * 2); // stagger the fade-out slightly
    });
  }

  _destroyGhostGrid() {
    const ghosts = document.querySelectorAll('.onb-ghost');
    ghosts.forEach(el => {
      el.classList.remove('cell-visited', 'cell-path', 'onb-ghost');
      el.style.opacity = '';
      el.style.transition = '';
    });
  }

  // BFS order generator (mirrors landing.js bfsOrder)
  _bfsOrderOnGrid(startR, startC, rows, cols) {
    const visited = new Set([`${startR},${startC}`]);
    const queue   = [[startR, startC]];
    const order   = [];
    const dirs    = [[0,1],[1,0],[0,-1],[-1,0]];

    while (queue.length) {
      const [r, c] = queue.shift();
      order.push([r, c]);
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        const key = `${nr},${nc}`;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited.has(key)) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }
    return order;
  }

  // ══════════════════════════════════════════
  //  STEP 2 — Highlight wall button
  // ══════════════════════════════════════════
  _stepHighlightWall() {
    this._removeBeacons();

    this._addBeacon('btn-wall');
    this._showCallout(
      'btn-wall',
      'below',
      '🧱 Draw walls',
      'Click and drag on the grid to place walls. Walls are impassable barriers.',
      'onb-callout-wall'
    );

    showToast('Click & drag on the grid to draw walls', '🧱', 4000);

    // Pulse the wall button using the same _pulseOnce pattern
    this._pulseButton('btn-wall');

    // Auto-advance after delay (or user can click the button)
    const wallBtn = document.getElementById('btn-wall');
    const onWallClick = () => {
      wallBtn?.removeEventListener('click', onWallClick);
      this._removeCallouts();
      this._removeBeacons();
      this._schedule(() => this._goToStep('highlight-nodes'), 600);
    };
    wallBtn?.addEventListener('click', onWallClick);

    // Auto-advance after 5s even if user doesn't click
    this._schedule(() => {
      wallBtn?.removeEventListener('click', onWallClick);
      this._removeCallouts();
      this._removeBeacons();
      this._goToStep('highlight-nodes');
    }, 5000);
  }

  // ══════════════════════════════════════════
  //  STEP 3 — Highlight start/end buttons
  // ══════════════════════════════════════════
  _stepHighlightNodes() {
    this._removeBeacons();
    this._removeCallouts();

    this._addBeacon('btn-start');
    this._addBeacon('btn-end');

    this._showCallout(
      'btn-start',
      'below',
      '🟠 Place Start & End nodes',
      'Select a mode then click a grid cell. The algorithm travels from Start → End.',
      'onb-callout-nodes'
    );

    showToast('Place your Start 🟠 and End 🔴 nodes on the grid', '📍', 4500);

    this._pulseButton('btn-start');
    this._schedule(() => this._pulseButton('btn-end'), 400);

    // Advance to place-nodes step
    this._schedule(() => {
      this._removeBeacons();
      this._removeCallouts();
      this._goToStep('place-nodes');
    }, 1200);
  }

  // ══════════════════════════════════════════
  //  STEP 4 — Wait for node placement
  // ══════════════════════════════════════════
  _stepPlaceNodes() {
    // If already placed before this step (race condition), skip forward
    if (this._nodesReady) {
      this._schedule(() => this._goToStep('run-hint'), 200);
      return;
    }

    this._addBeacon('btn-start');
    this._addBeacon('btn-end');

    // Show persistent hint — will be dismissed when both nodes placed
    showToast('Set Start & End nodes to continue', '📍', 6000);

    // Pulse both node buttons every 4s until placed
    const pulseInterval = setInterval(() => {
      if (!this._active || this._nodesReady) {
        clearInterval(pulseInterval);
        return;
      }
      this._pulseButton('btn-start');
      this._schedule(() => this._pulseButton('btn-end'), 350);
    }, 4000);

    this._timers.push(pulseInterval); // ensure cleanup
  }

  // ══════════════════════════════════════════
  //  STEP 5 — Run button hint
  // ══════════════════════════════════════════
  _stepRunHint() {
    this._removeBeacons();
    this._removeCallouts();

    showToast('Both nodes set! Ready to run the simulation ▶', '✅', 3500);

    this._schedule(() => {
      this._addBeacon('btn-run');
      this._pulseButton('btn-run');

      this._showCallout(
        'btn-run',
        'above',
        '▶ Run the simulation',
        'BFS and DFS will race side-by-side. Watch how differently they explore!',
        'onb-callout-run'
      );

      // Listen for run button click to advance
      const runBtn = document.getElementById('btn-run');
      const onRun = () => {
        runBtn?.removeEventListener('click', onRun);
        this._removeBeacons();
        this._removeCallouts();
        this._schedule(() => this._goToStep('watch-sim'), 1500);
      };
      runBtn?.addEventListener('click', onRun);
    }, 800);
  }

  // ══════════════════════════════════════════
  //  STEP 6 — Watch sim (mid-sim hints)
  // ══════════════════════════════════════════
  _stepWatchSim() {
    showToast('BFS explores level by level — DFS dives deep first', '🔬', 5000);

    this._schedule(() => {
      showToast('BFS guarantees the shortest path · DFS does not', '💡', 5000);
    }, 5500);

    this._schedule(() => {
      showToast('Watch the visited counts — notice the difference?', '👀', 5000);
    }, 11000);

    // After sim likely completes, advance to complete step
    this._schedule(() => {
      this._goToStep('complete');
    }, 18000);
  }

  // ══════════════════════════════════════════
  //  STEP 7 — Complete
  // ══════════════════════════════════════════
  _stepComplete() {
    this._showCompletionBanner();
    this._hideProgressBar();
  }

  // ══════════════════════════════════════════
  //  PROGRESS BAR
  // ══════════════════════════════════════════

  _showProgressBar() {
    let bar = document.getElementById('onb-progress-bar');
    if (bar) return;

    bar = document.createElement('div');
    bar.id        = 'onb-progress-bar';
    bar.className = 'onb-progress-bar';
    bar.innerHTML = `
      <div class="onb-progress-inner">
        <span class="onb-progress-label">// guided mode</span>
        <div class="onb-progress-track">
          <div class="onb-progress-fill" id="onb-progress-fill"></div>
        </div>
        <span class="onb-progress-step" id="onb-progress-step">1 / ${ONBOARDING_STEPS.length}</span>
        <button class="onb-skip-btn" id="onb-skip-btn" aria-label="Skip onboarding">skip</button>
      </div>
    `;

    document.body.appendChild(bar);

    // Entrance animation — bar slides down from top
    requestAnimationFrame(() => {
      requestAnimationFrame(() => bar.classList.add('onb-bar-visible'));
    });

    // Skip button
    document.getElementById('onb-skip-btn')?.addEventListener('click', () => {
      this.stop();
      showToast('Onboarding skipped — explore freely!', '⚡', 2500);
    });
  }

  _updateProgressBar(idx) {
    const fill = document.getElementById('onb-progress-fill');
    const step = document.getElementById('onb-progress-step');
    if (fill) fill.style.width = `${((idx + 1) / ONBOARDING_STEPS.length) * 100}%`;
    if (step) step.textContent = `${idx + 1} / ${ONBOARDING_STEPS.length}`;
  }

  _hideProgressBar() {
    const bar = document.getElementById('onb-progress-bar');
    if (!bar) return;
    bar.classList.add('onb-bar-exit');
    setTimeout(() => bar.remove(), 400);
  }

  // ══════════════════════════════════════════
  //  BEACON HELPERS
  //  Beacon = pulsing ring on a button
  //  (no intrusive popup — just a subtle ring)
  // ══════════════════════════════════════════

  _addBeacon(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    // Don't double-add
    if (btn.querySelector('.onb-beacon')) return;

    const beacon = document.createElement('span');
    beacon.className  = 'onb-beacon';
    beacon.setAttribute('aria-hidden', 'true');
    btn.style.position = 'relative';
    btn.appendChild(beacon);
    this._beacons.push({ btn, beacon });
  }

  _removeBeacons() {
    this._beacons.forEach(({ btn, beacon }) => {
      beacon.remove();
    });
    this._beacons = [];
  }

  // ══════════════════════════════════════════
  //  CALLOUT HELPERS
  //  Callout = small tooltip-style card
  //  attached to a target element
  // ══════════════════════════════════════════

  _showCallout(targetId, position, title, body, id) {
    // Remove existing callout with same id
    document.getElementById(id)?.remove();

    const target = document.getElementById(targetId);
    if (!target) return;

    const callout = document.createElement('div');
    callout.id        = id;
    callout.className = `onb-callout onb-callout-${position}`;
    callout.setAttribute('role', 'tooltip');
    callout.innerHTML = `
      <div class="onb-callout-arrow"></div>
      <p class="onb-callout-title">${title}</p>
      <p class="onb-callout-body">${body}</p>
    `;

    // Insert after target for natural DOM flow
    target.insertAdjacentElement('afterend', callout);

    // Position it relative to target
    this._positionCallout(callout, target, position);

    // Entrance: reuse fade-slide-up pattern
    requestAnimationFrame(() => {
      requestAnimationFrame(() => callout.classList.add('onb-callout-visible'));
    });

    this._callouts.push(callout);
    return callout;
  }

  _positionCallout(callout, target, position) {
    // Use CSS positioning rather than JS coords so it's responsive
    // The callout is inserted after the target in DOM flow
    callout.style.position = 'absolute';

    // For above/below we rely on CSS classes — no JS coords needed
    // For complex positioning scenarios, we'd measure, but CSS handles our cases
  }

  _removeCallouts() {
    this._callouts.forEach(el => {
      el.classList.add('onb-callout-exit');
      setTimeout(() => el.remove(), 250);
    });
    this._callouts = [];
  }

  // ══════════════════════════════════════════
  //  COMPLETION BANNER
  // ══════════════════════════════════════════

  _showCompletionBanner() {
    // Remove existing
    document.getElementById('onb-complete-banner')?.remove();

    const banner = document.createElement('div');
    banner.id        = 'onb-complete-banner';
    banner.className = 'onb-complete-banner';
    banner.innerHTML = `
      <div class="onb-complete-inner">
        <span class="onb-complete-icon">✦</span>
        <div class="onb-complete-text">
          <p class="onb-complete-title">Onboarding complete</p>
          <p class="onb-complete-sub">You've seen BFS vs DFS in action. Reset and experiment freely!</p>
        </div>
        <button class="onb-complete-dismiss" id="onb-complete-dismiss" aria-label="Dismiss">×</button>
      </div>
    `;

    const compSection = document.getElementById('comparison-section');
    if (compSection) {
      compSection.insertAdjacentElement('afterend', banner);
    } else {
      document.getElementById('app')?.appendChild(banner);
    }

    // Entrance — reuse insight-appear timing
    requestAnimationFrame(() => {
      requestAnimationFrame(() => banner.classList.add('onb-complete-visible'));
    });

    document.getElementById('onb-complete-dismiss')?.addEventListener('click', () => {
      banner.classList.add('onb-complete-exit');
      setTimeout(() => banner.remove(), 350);
      this.stop();
    });

    showToast('Onboarding complete — you\'re all set!', '✦', 3500);
  }

  // ══════════════════════════════════════════
  //  BUTTON PULSE HELPER
  //  Mirrors Controls._pulseOnce() exactly
  // ══════════════════════════════════════════

  _pulseButton(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    // Exact same technique as Controls._pulseOnce()
    btn.classList.remove('btn-glow');
    void btn.offsetWidth; // force reflow
    btn.classList.add('btn-glow');

    const cleanup = () => btn.classList.remove('btn-glow');
    btn.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, 900);
  }
}