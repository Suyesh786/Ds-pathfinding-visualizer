// ── controls.js ────────────────────────────────────────
// Manages all button interactions, speed slider, pause, reset.

import { showToast } from './utils/helpers.js';
import { generateMaze } from './utils/mazeGenerator.js';

export class Controls {
  constructor(grid, simRunner) {
    this.grid      = grid;
    this.simRunner = simRunner;

    this._bindModeButtons();
    this._bindGridControls();
    this._bindSimControls();

    // Both buttons start disabled on page load.
    // app.js's patchGridCallbacks() is the single place that triggers
    // updates — _watchNodePlacement() has been removed to avoid conflicts.
    this._updateRunBtn();
    this._updateMazeBtn();
  }

  // ── Mode buttons ─────────────────────────────────────────────
  _bindModeButtons() {
    const modes = {
      'btn-wall' : 'wall',
      'btn-start': 'start',
      'btn-end'  : 'end',
    };

    Object.entries(modes).forEach(([id, mode]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', () => {
        this.grid.setMode(mode);
        this._highlightMode(id);
        const icon = mode === 'wall' ? '🧱' : mode === 'start' ? '🟠' : '🔴';
        showToast(`Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`, icon);
      });
    });

    this._highlightMode('btn-wall');
  }

  _highlightMode(activeId) {
    ['btn-wall', 'btn-start', 'btn-end'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('active', id === activeId);
    });
  }

  // ── Grid controls ────────────────────────────────────────────
  _bindGridControls() {
    document.getElementById('btn-clear-walls')?.addEventListener('click', () => {
      this.grid.clearWalls();
      showToast('Walls cleared', '🧹');
      this._updateRunBtn();
    });

    document.getElementById('btn-maze')?.addEventListener('click', () => {
      if (!this.grid.isReady()) return;
      generateMaze(this.grid);
      showToast('Maze generated!', '🌀');
      this._updateRunBtn();
    });
  }

  // ── Simulation controls ──────────────────────────────────────
  _bindSimControls() {
    document.getElementById('btn-run')?.addEventListener('click', () => {
      if (!this.grid.isReady()) {
        showToast('Please set both Start and End nodes first', '⚠️');
        return;
      }
      this.simRunner.run();
    });

    const pauseBtn = document.getElementById('btn-pause');
    pauseBtn?.addEventListener('click', () => {
      if (this.simRunner.isPaused()) {
        this.simRunner.resume();
        pauseBtn.textContent = '⏸ Pause';
        showToast('Resumed', '▶️');
      } else {
        this.simRunner.pause();
        pauseBtn.textContent = '▶ Resume';
        showToast('Paused', '⏸');
      }
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => {
      this.simRunner.reset();
      if (pauseBtn) pauseBtn.textContent = '⏸ Pause';
      showToast('Simulation reset', '🔄');
      this._updateRunBtn();
    });

    const slider   = document.getElementById('speed-slider');
    const speedVal = document.getElementById('speed-val');
    slider?.addEventListener('input', () => {
      const labels = ['Snail', 'Slow', 'Medium', 'Fast', 'Turbo'];
      const idx    = Math.round((parseInt(slider.value) - 1) / 99 * 4);
      if (speedVal) speedVal.textContent = labels[idx] ?? 'Medium';
    });
  }

  // ── Button state helpers ─────────────────────────────────────

  // Public — called by app.js's patchGridCallbacks after node placement
  updateMazeBtn() { this._updateMazeBtn(); }
  updateRunBtn()  { this._updateRunBtn();  }

  _updateMazeBtn() {
    const btn = document.getElementById('btn-maze');
    if (!btn) return;
    const ready = this.grid.isReady();
    btn.disabled = !ready;
    if (ready) this._pulseOnce(btn);
  }

  _updateRunBtn() {
    const btn = document.getElementById('btn-run');
    if (!btn) return;
    const ready = this.grid.isReady();
    btn.disabled = !ready;
    if (ready) this._pulseOnce(btn);
  }

  // Pulses the button once when it unlocks, then removes the class
  // so it returns to a normal resting appearance permanently.
  _pulseOnce(btn) {
    btn.classList.remove('btn-glow');
    void btn.offsetWidth;                    // force reflow to restart animation
    btn.classList.add('btn-glow');

    // setTimeout is the reliable fallback — matches animation duration (850ms)
    const cleanup = () => btn.classList.remove('btn-glow');
    btn.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, 900);               // safety net if animationend misfires
  }
}