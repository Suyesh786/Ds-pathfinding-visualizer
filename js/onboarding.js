// ══════════════════════════════════════════════════════════════
//  DS Academy – Guided Onboarding System  (js/onboarding.js)
//  v2 — refined per UX feedback
//
//  CHANGES FROM v1:
//  1. Tooltip placement — fixed-position anchoring via
//     getBoundingClientRect() so tooltips always appear ABOVE the
//     target button, never block interaction, pointer-events:none.
//  2. Correct tutorial flow:
//       highlight-start → (user places start)
//       → highlight-end → (user places end)
//       → wall-hint (2s auto) → run-hint → watch-sim → complete
//  3. Floating tooltip animation — gentle translateY bob (4px, 3s),
//     soft cyan glow. Defined via onbTooltipFloat in onboarding.css.
//  4. Run button layout — fixed-position tooltips escape
//     builder-section's overflow:hidden entirely.
//
//  Reuses without modification:
//  - showToast() from helpers.js
//  - .btn-glow / btnGlowPulse from animations.css + style.css
//  - CSS variables (--accent, --bg-card, --border, --font-mono…)
//  - _pulseOnce() pattern from controls.js
// ══════════════════════════════════════════════════════════════

import { showToast } from './utils/helpers.js';

// ── Step sequence ─────────────────────────────────────────────
const ONBOARDING_STEPS = [
  'highlight-start', // Step 1 — glow Start btn, tooltip above it
  'highlight-end',   // Step 2 — glow End btn, tooltip above it
  'wall-hint',       // Step 3 — tooltip above wall btn, 2s then auto
  'run-hint',        // Step 4 — beacon + tooltip above Run btn
  'watch-sim',       // Step 5 — mid-sim toasts
  'complete',        // Step 6 — completion banner
];

// ══════════════════════════════════════════════════════════════
//  PUBLIC ENTRY POINT
// ══════════════════════════════════════════════════════════════

export function startGuidedOnboarding(grid, controls, simRunner) {
  const ob = new OnboardingController(grid, controls, simRunner);
  ob.start();
  return ob;
}

// ══════════════════════════════════════════════════════════════
//  CONTROLLER
// ══════════════════════════════════════════════════════════════

class OnboardingController {
  constructor(grid, controls, simRunner) {
    this.grid      = grid;
    this.controls  = controls;
    this.simRunner = simRunner;

    this._stepIdx      = -1;
    this._active       = true;
    this._timers       = [];
    this._beacons      = [];
    this._tooltip      = null;   // single floating tooltip at a time
    this._startPlaced  = false;
    this._endPlaced    = false;
    this._nodesReady   = false;

    // Keep tooltip anchored on scroll/resize
    this._repositionBound = () => this._repositionTooltip();
    window.addEventListener('scroll', this._repositionBound, { passive: true });
    window.addEventListener('resize', this._repositionBound, { passive: true });

    this._patchGridForOnboarding();
  }

  // ── Timer helpers ─────────────────────────────────────────────
  _schedule(fn, delay) {
    const id = setTimeout(() => { if (this._active) fn(); }, delay);
    this._timers.push(id);
    return id;
  }
  _clearTimers() {
    this._timers.forEach(clearTimeout);
    this._timers.length = 0;
  }

  // ── Patch grid to observe node placement ──────────────────────
  _patchGridForOnboarding() {
    const origStart = this.grid._placeStart.bind(this.grid);
    const origEnd   = this.grid._placeEnd.bind(this.grid);
    const self      = this;

    this.grid._placeStart = function(r, c, s) {
      origStart(r, c, s);
      if (!self._startPlaced) {
        self._startPlaced = true;
        self._onStartPlaced();
      }
    };
    this.grid._placeEnd = function(r, c, s) {
      origEnd(r, c, s);
      if (!self._endPlaced) {
        self._endPlaced = true;
        self._onEndPlaced();
      }
    };
  }

  _onStartPlaced() {
    if (!this._active) return;
    this._hideTooltip();
    this._removeBeacons();
    this._clearTimers();
    this._schedule(() => this._goToStep('highlight-end'), 350);
  }

  _onEndPlaced() {
    if (!this._active) return;
    if (this._startPlaced && !this._nodesReady) {
      this._nodesReady = true;
      this._hideTooltip();
      this._removeBeacons();
      this._clearTimers();
      this._schedule(() => this._goToStep('wall-hint'), 350);
    }
  }

  // ══════════════════════════════════════════
  //  LIFECYCLE
  // ══════════════════════════════════════════

  start() {
    this._showProgressBar();
    showToast('Guided Mode — follow the steps to get started', '🎓', 4000);
    // Small delay so the app fade-in settles before we render the tooltip
    this._schedule(() => this._goToStep('highlight-start'), 900);
  }

  stop() {
    this._active = false;
    this._clearTimers();
    this._removeBeacons();
    this._hideTooltip();
    this._hideProgressBar();
    window.removeEventListener('scroll', this._repositionBound);
    window.removeEventListener('resize', this._repositionBound);
  }

  _goToStep(stepId) {
    if (!this._active) return;
    const idx = ONBOARDING_STEPS.indexOf(stepId);
    if (idx === -1) return;
    this._stepIdx = idx;
    this._updateProgressBar(idx);
    this._runStep(stepId);
  }

  _runStep(stepId) {
    switch (stepId) {
      case 'highlight-start': return this._stepHighlightStart();
      case 'highlight-end':   return this._stepHighlightEnd();
      case 'wall-hint':       return this._stepWallHint();
      case 'run-hint':        return this._stepRunHint();
      case 'watch-sim':       return this._stepWatchSim();
      case 'complete':        return this._stepComplete();
    }
  }

  // ══════════════════════════════════════════
  //  STEP 1 — Highlight Start button
  // ══════════════════════════════════════════
  _stepHighlightStart() {
    // Switch grid to start-placement mode so the user's next click works
    this.grid.setMode('start');
    this._syncModeHighlight('btn-start');

    this._addBeacon('btn-start');
    this._pulseButton('btn-start');

    this._showTooltip(
      'btn-start',
      '🟠 Place your Start node',
      'Click anywhere on the grid to set the starting point for the algorithm.'
    );
  }

  // ══════════════════════════════════════════
  //  STEP 2 — Highlight End button
  // ══════════════════════════════════════════
  _stepHighlightEnd() {
    this.grid.setMode('end');
    this._syncModeHighlight('btn-end');

    this._addBeacon('btn-end');
    this._pulseButton('btn-end');

    this._showTooltip(
      'btn-end',
      '🔴 Place your End node',
      'Now click a different grid cell to set the destination.'
    );
  }

  // ══════════════════════════════════════════
  //  STEP 3 — Wall hint (2 s then auto-advance)
  // ══════════════════════════════════════════
  _stepWallHint() {
    this.grid.setMode('wall');
    this._syncModeHighlight('btn-wall');

    this._addBeacon('btn-wall');

    this._showTooltip(
      'btn-wall',
      '🧱 Draw walls (optional)',
      'Click and drag on the grid to create obstacles. Walls are optional — skip ahead anytime.'
    );

    // Auto-advance after 2 seconds regardless of interaction
    this._schedule(() => {
      this._hideTooltip();
      this._removeBeacons();
      this._goToStep('run-hint');
    }, 2000);
  }

  // ══════════════════════════════════════════
  //  STEP 4 — Run button hint
  // ══════════════════════════════════════════
  _stepRunHint() {
    this._addBeacon('btn-run');
    this._pulseButton('btn-run');

    this._showTooltip(
      'btn-run',
      '▶ Run the simulation',
      "BFS and DFS will race side-by-side. Watch how differently they explore the grid!"
    );

    const runBtn = document.getElementById('btn-run');
    const onRun = () => {
      runBtn?.removeEventListener('click', onRun);
      this._hideTooltip();
      this._removeBeacons();
      this._schedule(() => this._goToStep('watch-sim'), 1200);
    };
    runBtn?.addEventListener('click', onRun);
  }

  // ══════════════════════════════════════════
  //  STEP 5 — Watch sim mid-hints
  // ══════════════════════════════════════════
  _stepWatchSim() {
    showToast('BFS expands like a wave · DFS dives deep first', '🔬', 5000);

    this._schedule(() => {
      showToast('BFS guarantees the shortest path · DFS does not', '💡', 5000);
    }, 5500);

    this._schedule(() => {
      showToast('Compare the visited counts in each card', '👀', 4500);
    }, 11000);

    this._schedule(() => this._goToStep('complete'), 18000);
  }

  // ══════════════════════════════════════════
  //  STEP 6 — Complete
  // ══════════════════════════════════════════
  _stepComplete() {
    this._showCompletionBanner();
    this._hideProgressBar();
  }

  // ══════════════════════════════════════════
  //  FIXED-POSITION TOOLTIP
  //
  //  One tooltip at a time. Mounted to document.body with
  //  position:fixed so it escapes any overflow:hidden ancestor.
  //  pointer-events:none means it NEVER blocks button clicks.
  //  Floating animation (onbTooltipFloat) defined in onboarding.css.
  // ══════════════════════════════════════════

  _showTooltip(targetId, title, body) {
    this._hideTooltip();

    const target = document.getElementById(targetId);
    if (!target) return;

    const tip = document.createElement('div');
    tip.id        = 'onb-tooltip';
    tip.className = 'onb-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('aria-live', 'polite');
    // pointer-events: none — tooltip NEVER blocks button interaction
    tip.style.pointerEvents = 'none';

    tip.innerHTML = `
      <div class="onb-tooltip-arrow"></div>
      <p class="onb-tooltip-title">${title}</p>
      <p class="onb-tooltip-body">${body}</p>
    `;

    document.body.appendChild(tip);
    this._tooltip = { el: tip, targetId, targetEl: target };

    // Position synchronously before first paint
    this._positionTooltip(tip, target);

    // Trigger entrance animation on next frame pair
    requestAnimationFrame(() => {
      requestAnimationFrame(() => tip.classList.add('onb-tooltip-visible'));
    });
  }

  _hideTooltip() {
    if (!this._tooltip) return;
    const tip = this._tooltip.el;
    this._tooltip = null;
    tip.classList.remove('onb-tooltip-visible');
    tip.classList.add('onb-tooltip-exit');
    // Remove after exit transition (200ms)
    setTimeout(() => tip.remove(), 250);
  }

  /**
   * Position the tooltip above the target button using fixed coords.
   * The tooltip's bottom edge sits GAP px above the button's top edge.
   * Horizontally centred over the button, clamped within viewport.
   */
  _positionTooltip(tipEl, targetEl) {
    const TOOLTIP_W = 280;   // matches CSS width
    const TOOLTIP_H = 88;    // approximate height (title + body)
    const ARROW_H   = 9;     // half the arrow square diagonal
    const GAP       = 10;    // gap between tooltip bottom and button top

    const rect = targetEl.getBoundingClientRect();

    // Horizontal: centre over button, clamp to viewport
    let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - TOOLTIP_W - 12));

    // Vertical: above button
    const top = rect.top - TOOLTIP_H - ARROW_H - GAP;

    tipEl.style.position = 'fixed';
    tipEl.style.width    = `${TOOLTIP_W}px`;
    tipEl.style.left     = `${Math.round(left)}px`;
    tipEl.style.top      = `${Math.round(top)}px`;
    tipEl.style.zIndex   = '9500';

    // Store for scroll/resize reposition
    tipEl._targetEl  = targetEl;
    tipEl._tooltipW  = TOOLTIP_W;
    tipEl._tooltipH  = TOOLTIP_H;
    tipEl._arrowH    = ARROW_H;
    tipEl._gap       = GAP;
  }

  _repositionTooltip() {
    if (!this._tooltip) return;
    const { el } = this._tooltip;
    if (!el._targetEl) return;

    const rect   = el._targetEl.getBoundingClientRect();
    const W      = el._tooltipW  || 280;
    const H      = el._tooltipH  || 88;
    const arrowH = el._arrowH    || 9;
    const gap    = el._gap       || 10;

    let left = rect.left + rect.width / 2 - W / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - W - 12));
    const top = rect.top - H - arrowH - gap;

    el.style.left = `${Math.round(left)}px`;
    el.style.top  = `${Math.round(top)}px`;
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

    requestAnimationFrame(() => {
      requestAnimationFrame(() => bar.classList.add('onb-bar-visible'));
    });

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
  //  BEACON — pulsing ring appended to button
  // ══════════════════════════════════════════

  _addBeacon(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn || btn.querySelector('.onb-beacon')) return;
    // Allow the ring to overflow the button box
    btn.style.overflow = 'visible';
    const beacon = document.createElement('span');
    beacon.className = 'onb-beacon';
    beacon.setAttribute('aria-hidden', 'true');
    btn.appendChild(beacon);
    this._beacons.push({ btn, beacon });
  }

  _removeBeacons() {
    this._beacons.forEach(({ btn, beacon }) => {
      beacon.remove();
      btn.style.overflow = '';
    });
    this._beacons = [];
  }

  // ══════════════════════════════════════════
  //  COMPLETION BANNER
  // ══════════════════════════════════════════

  _showCompletionBanner() {
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

    requestAnimationFrame(() => {
      requestAnimationFrame(() => banner.classList.add('onb-complete-visible'));
    });

    document.getElementById('onb-complete-dismiss')?.addEventListener('click', () => {
      banner.classList.add('onb-complete-exit');
      setTimeout(() => banner.remove(), 350);
      this.stop();
    });

    showToast("Onboarding complete — you're all set!", '✦', 3500);
  }

  // ══════════════════════════════════════════
  //  BUTTON PULSE — mirrors Controls._pulseOnce()
  // ══════════════════════════════════════════

  _pulseButton(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.classList.remove('btn-glow');
    void btn.offsetWidth;
    btn.classList.add('btn-glow');
    const cleanup = () => btn.classList.remove('btn-glow');
    btn.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, 900);
  }

  // ── Sync the active-mode button highlight ────────────────────
  // Mirrors Controls._highlightMode() without importing Controls
  _syncModeHighlight(activeId) {
    ['btn-wall', 'btn-start', 'btn-end'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', id === activeId);
    });
  }
}