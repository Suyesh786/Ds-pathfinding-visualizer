// ══════════════════════════════════════════════════════════════
//  DS Academy – Guided Onboarding System  (js/onboarding.js)
//  v5 — user-controlled Continue button for sim-tour Sub-A & Sub-B
//
//  CHANGES FROM v4:
//
//  ── Sim-tour Sub-A (Log Panel) ───────────────────────────────
//  Previously: auto-advanced after a 2.2 s timer.
//  Now: tooltip contains a [ Continue ] button.  The simulation
//  stays paused and the tooltip stays visible until the user
//  clicks Continue.  No timer at all.
//
//  ── Sim-tour Sub-B (Speed Slider) ────────────────────────────
//  Previously: auto-advanced after a 2.2 s timer.
//  Now: same Continue button pattern.  Sim stays paused.
//
//  ── Sim-tour Sub-C (Resume) ──────────────────────────────────
//  UNCHANGED — tooltip has no Continue button.  User must click
//  the actual Resume button to proceed.
//
//  ── _showTooltipOnEl() ───────────────────────────────────────
//  New optional third parameter: onContinue (function | null).
//  When provided:
//    • A <button class="onb-tooltip-continue"> is appended.
//    • The button's click handler calls onContinue() once then
//      removes itself (one-shot, prevents double-fire).
//    • TOOLTIP_H is increased to 120 px for vertical positioning
//      so the taller card doesn't overlap the target element.
//  When null/omitted: behaviour is identical to v4.
//
//  ── Everything else ──────────────────────────────────────────
//  All other steps, race-condition guards, infrastructure
//  methods (progress bar, beacon, completion banner, highlight
//  ring, log observer, tooltip positioning) are UNCHANGED.
// ══════════════════════════════════════════════════════════════

import { showToast } from './utils/helpers.js';

// ── Step sequence ─────────────────────────────────────────────
const ONBOARDING_STEPS = [
  'highlight-start', // Step 1 — glow Start btn, tooltip above it
  'highlight-end',   // Step 2 — glow End btn, tooltip above it
  'wall-hint',       // Step 3 — tooltip above wall btn, 2 s auto
  'run-hint',        // Step 4 — beacon + tooltip above Run btn
  'watch-sim',       // Step 5 — simulator controls tour (3 sub-steps)
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

    this._stepIdx    = -1;
    this._active     = true;
    this._timers     = [];
    this._beacons    = [];
    this._tooltip    = null;

    // ── Race-condition state guard ─────────────────────────────
    this._state = {
      startPlaced  : false,
      endPlaced    : false,
      runClicked   : false,
      simTourDone  : false,
    };

    // Seed from existing grid state (handles fast users)
    if (grid.startNode) this._state.startPlaced = true;
    if (grid.endNode)   this._state.endPlaced   = true;

    this._logObserver      = null;
    this._highlightedEls   = [];
    this._resumeClickHandler = null;

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
      if (!self._state.startPlaced) {
        self._state.startPlaced = true;
        self._onStartPlaced();
      }
    };

    this.grid._placeEnd = function(r, c, s) {
      origEnd(r, c, s);
      if (!self._state.endPlaced) {
        self._state.endPlaced = true;
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
    if (this._state.startPlaced) {
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

    if (this._state.startPlaced && this._state.endPlaced) {
      this._schedule(() => this._goToStep('wall-hint'), 900);
      return;
    }
    if (this._state.startPlaced) {
      this._schedule(() => this._goToStep('highlight-end'), 900);
      return;
    }
    this._schedule(() => this._goToStep('highlight-start'), 900);
  }

  stop() {
    this._active = false;
    this._clearTimers();
    this._removeBeacons();
    this._hideTooltip();
    this._hideProgressBar();
    this._disconnectLogObserver();
    this._clearHighlights();
    if (this._resumeClickHandler) {
      const pauseBtn = document.getElementById('btn-pause');
      pauseBtn?.removeEventListener('click', this._resumeClickHandler);
      this._resumeClickHandler = null;
    }
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
    if (this._state.startPlaced) { this._goToStep('highlight-end'); return; }

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
    if (this._state.endPlaced) { this._goToStep('wall-hint'); return; }

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
  //  STEP 3 — Wall hint (2 s auto-advance)
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
    if (this._state.runClicked) { this._goToStep('watch-sim'); return; }

    this._addBeacon('btn-run');
    this._pulseButton('btn-run');

    this._showTooltip(
      'btn-run',
      '▶ Run the simulation',
      'BFS and DFS will race side-by-side. Watch how differently they explore the grid!'
    );

    const runBtn = document.getElementById('btn-run');
    const onRun  = () => {
      runBtn?.removeEventListener('click', onRun);
      this._state.runClicked = true;
      this._hideTooltip();
      this._removeBeacons();
      this._schedule(() => this._goToStep('watch-sim'), 1200);
    };
    runBtn?.addEventListener('click', onRun);
  }

  // ══════════════════════════════════════════
  //  STEP 5 — Simulator Controls Tour  (v5)
  //
  //  Sub-A  auto-pause → log tooltip with [ Continue ] button
  //         user clicks Continue → Sub-B  (sim stays paused)
  //
  //  Sub-B  speed tooltip with [ Continue ] button
  //         user clicks Continue → Sub-C  (sim stays paused)
  //
  //  Sub-C  highlight Resume btn → tooltip "Press Resume"
  //         no Continue button — user must click the actual
  //         Resume button to finish the tour
  // ══════════════════════════════════════════
  _stepWatchSim() {
    if (this._state.simTourDone) return;
    this._state.simTourDone = true;
    this._simTourSubA();
  }

  // ── Sub-step A — Explain the Log Panel ──────────────────────
  //  Waits for ≥2 log entries in #bfs-log, then:
  //    1. Pauses the simulation.
  //    2. Glows + scrolls the log panel.
  //    3. Shows tooltip with a [ Continue ] button.
  //    4. Waits for user to click Continue (no timer).
  //  On Continue: clears log highlight, advances to Sub-B.
  //  Simulation stays paused.
  _simTourSubA() {
    if (!this._active) return;

    const logEl = document.getElementById('bfs-log');
    if (!logEl) {
      this._schedule(() => this._simTourSubA(), 300);
      return;
    }

    let triggered = false;

    const trigger = () => {
      if (triggered || !this._active) return;

      const lineCount = logEl.querySelectorAll('.log-line').length;
      if (lineCount < 2) return;

      triggered = true;
      this._disconnectLogObserver();

      // 1. Pause the simulation
      this.simRunner.pause();
      const pauseBtn = document.getElementById('btn-pause');
      if (pauseBtn) pauseBtn.textContent = '▶ Resume';

      // 2. Glow the log panel
      this._highlightEl(logEl);

      // 3. Scroll to newest entry
      logEl.scrollTop = logEl.scrollHeight;

      // 4. Show tooltip with Continue button.
      //    onContinue fires when user clicks [ Continue ].
      this._showTooltipOnEl(
        logEl,
        '📋 Algorithm Steps Log',
        'These are the algorithm steps. Each entry shows how the algorithm explores the grid.',
        () => {
          // Continue clicked — clear log highlight, move to Sub-B
          this._clearHighlights();
          this._schedule(() => this._simTourSubB(), 300);
        }
      );
    };

    // Observe #bfs-log for new .log-line children
    this._logObserver = new MutationObserver(trigger);
    this._logObserver.observe(logEl, { childList: true });

    // Fire immediately in case entries already exist
    trigger();
  }

  // ── Sub-step B — Explain Speed Control ──────────────────────
  //  Sim is still paused.  Glows the speed slider and shows
  //  a tooltip with a [ Continue ] button.  Waits for user click.
  //  On Continue: clears slider highlight, advances to Sub-C.
  _simTourSubB() {
    if (!this._active) return;

    const sliderEl = document.getElementById('speed-slider');
    if (!sliderEl) {
      // Speed panel not yet visible — skip gracefully
      this._schedule(() => this._simTourSubC(), 400);
      return;
    }

    this._highlightEl(sliderEl);

    this._showTooltipOnEl(
      sliderEl,
      '⚡ Simulation Speed',
      'You can control the simulation speed here. Slow it down to observe every step.',
      () => {
        // Continue clicked — clear slider highlight, move to Sub-C
        this._clearHighlights();
        this._schedule(() => this._simTourSubC(), 300);
      }
    );
  }

  // ── Sub-step C — Explain Resume (user-driven) ───────────────
  //  UNCHANGED from v4.
  //  Sim is paused; btn-pause reads "▶ Resume".
  //  Highlights btn-pause, shows tooltip "Press Resume to continue."
  //  NO Continue button.  Waits for user to click Resume itself.
  //  On click: cleans up, resumes sim, goes to 'complete'.
  _simTourSubC() {
    if (!this._active) return;

    const pauseBtn = document.getElementById('btn-pause');
    if (!pauseBtn) {
      this._goToStep('complete');
      return;
    }

    this._highlightEl(pauseBtn);
    this._addBeacon('btn-pause');

    // No onContinue — tooltip has no Continue button
    this._showTooltip(
      'btn-pause',
      '▶ Press Resume',
      'Press Resume to continue the simulation.'
    );

    this._resumeClickHandler = () => {
      if (!this._active) return;

      pauseBtn.removeEventListener('click', this._resumeClickHandler);
      this._resumeClickHandler = null;

      this._hideTooltip();
      this._removeBeacons();
      this._clearHighlights();

      // resume() is idempotent — safe even if controls.js also calls it
      this.simRunner.resume();

      this._schedule(() => this._goToStep('complete'), 600);
    };

    pauseBtn.addEventListener('click', this._resumeClickHandler);
  }

  // ══════════════════════════════════════════
  //  STEP 6 — Complete
  // ══════════════════════════════════════════
  _stepComplete() {
    this._showCompletionBanner();
    this._hideProgressBar();
  }

  // ══════════════════════════════════════════
  //  TOOLTIP — by element ID
  //  Delegates to _showTooltipOnEl.
  //  onContinue is passed through unchanged.
  // ══════════════════════════════════════════

  _showTooltip(targetId, title, body, onContinue = null) {
    const target = document.getElementById(targetId);
    if (!target) return;
    this._showTooltipOnEl(target, title, body, onContinue);
  }

  /**
   * Show a floating tooltip anchored to any DOM element.
   *
   * @param {Element}       targetEl   — Element to anchor above.
   * @param {string}        title      — Bold header text.
   * @param {string}        body       — Description text.
   * @param {function|null} onContinue — If provided, a [ Continue ]
   *   button is rendered.  Clicking it calls onContinue() once
   *   and hides the tooltip.  If null, no button is rendered and
   *   pointer-events on the tooltip card remain none (v4 behaviour).
   */
  _showTooltipOnEl(targetEl, title, body, onContinue = null) {
    this._hideTooltip();
    if (!targetEl) return;

    const tip = document.createElement('div');
    tip.id        = 'onb-tooltip';
    tip.className = 'onb-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('aria-live', 'polite');

    // When there is no Continue button keep pointer-events:none
    // so the tooltip card never blocks underlying UI.
    // When there IS a Continue button we need pointer-events:auto
    // on the card — the CSS :has() selector handles this, but we
    // also set it inline as a reliable fallback for browsers
    // (e.g. Firefox < 121) that don't yet support :has().
    if (onContinue) {
      tip.style.pointerEvents = 'auto';
    } else {
      tip.style.pointerEvents = 'none';
    }

    // Build HTML — Continue button rendered only when callback provided
    const continueHtml = onContinue
      ? `<button class="onb-tooltip-continue" type="button">Continue</button>`
      : '';

    tip.innerHTML = `
      <div class="onb-tooltip-arrow"></div>
      <p class="onb-tooltip-title">${title}</p>
      <p class="onb-tooltip-body">${body}</p>
      ${continueHtml}
    `;

    document.body.appendChild(tip);
    this._tooltip = { el: tip, targetEl };

    // Use a larger height estimate when a Continue button is present
    // so the tooltip positions far enough above the target.
    this._positionTooltip(tip, targetEl, onContinue ? 120 : 88);

    // Wire the Continue button AFTER appending to DOM
    if (onContinue) {
      const btn = tip.querySelector('.onb-tooltip-continue');
      if (btn) {
        let fired = false;
        btn.addEventListener('click', () => {
          if (fired || !this._active) return;
          fired = true;
          this._hideTooltip();
          onContinue();
        }, { once: true });
      }
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => tip.classList.add('onb-tooltip-visible'));
    });
  }

  _hideTooltip() {
    if (!this._tooltip) return;
    const tip     = this._tooltip.el;
    this._tooltip = null;
    tip.classList.remove('onb-tooltip-visible');
    tip.classList.add('onb-tooltip-exit');
    setTimeout(() => tip.remove(), 250);
  }

  /**
   * Position the tooltip above (or below if off-screen) the target.
   *
   * @param {Element} tipEl      — The tooltip DOM node.
   * @param {Element} targetEl   — Element to anchor to.
   * @param {number}  tooltipH   — Estimated tooltip height in px.
   *   Defaults to 88 (no button); pass 120 when Continue is present.
   */
  _positionTooltip(tipEl, targetEl, tooltipH = 88) {
    const TOOLTIP_W = 280;
    const ARROW_H   = 9;
    const GAP       = 10;

    const rect = targetEl.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - TOOLTIP_W - 12));

    let top = rect.top - tooltipH - ARROW_H - GAP;
    if (top < 8) {
      // Flip below the element when there isn't enough room above
      top = rect.bottom + ARROW_H + GAP;
    }

    tipEl.style.position = 'fixed';
    tipEl.style.width    = `${TOOLTIP_W}px`;
    tipEl.style.left     = `${Math.round(left)}px`;
    tipEl.style.top      = `${Math.round(top)}px`;
    tipEl.style.zIndex   = '9500';

    // Cache for scroll / resize reposition
    tipEl._targetEl = targetEl;
    tipEl._tooltipW = TOOLTIP_W;
    tipEl._tooltipH = tooltipH;
    tipEl._arrowH   = ARROW_H;
    tipEl._gap      = GAP;
  }

  _repositionTooltip() {
    if (!this._tooltip) return;
    const { el } = this._tooltip;
    if (!el._targetEl) return;

    const rect   = el._targetEl.getBoundingClientRect();
    const W      = el._tooltipW || 280;
    const H      = el._tooltipH || 88;
    const arrowH = el._arrowH   || 9;
    const gap    = el._gap      || 10;

    let left = rect.left + rect.width / 2 - W / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - W - 12));
    const top = rect.top - H - arrowH - gap;

    el.style.left = `${Math.round(left)}px`;
    el.style.top  = `${Math.round(top)}px`;
  }

  // ══════════════════════════════════════════
  //  HIGHLIGHT RING
  // ══════════════════════════════════════════

  _highlightEl(el) {
    if (!el) return;
    el._onbOrigBoxShadow  = el.style.boxShadow  || '';
    el._onbOrigTransition = el.style.transition || '';
    el._onbOrigOutline    = el.style.outline    || '';

    el.style.transition = 'box-shadow 0.3s ease, outline 0.3s ease';
    el.style.boxShadow  =
      '0 0 0 2px rgba(0,229,255,0.35), 0 0 18px 4px rgba(0,229,255,0.18)';
    el.style.outline = '1px solid rgba(0,229,255,0.40)';

    this._highlightedEls.push(el);
  }

  _clearHighlights() {
    this._highlightedEls.forEach(el => {
      el.style.transition = el._onbOrigTransition || '';
      el.style.boxShadow  = el._onbOrigBoxShadow  || '';
      el.style.outline    = el._onbOrigOutline     || '';
      delete el._onbOrigBoxShadow;
      delete el._onbOrigTransition;
      delete el._onbOrigOutline;
    });
    this._highlightedEls = [];
  }

  // ══════════════════════════════════════════
  //  LOG OBSERVER
  // ══════════════════════════════════════════

  _disconnectLogObserver() {
    if (this._logObserver) {
      this._logObserver.disconnect();
      this._logObserver = null;
    }
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
  //  BEACON
  // ══════════════════════════════════════════

  _addBeacon(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn || btn.querySelector('.onb-beacon')) return;
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
  //  BUTTON PULSE
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

  _syncModeHighlight(activeId) {
    ['btn-wall', 'btn-start', 'btn-end'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('active', id === activeId);
    });
  }
}