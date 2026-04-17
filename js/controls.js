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
    this._updateRunBtn();
  }

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

  _bindGridControls() {
    // Clear walls
    document.getElementById('btn-clear-walls')?.addEventListener('click', () => {
      this.grid.clearWalls();
      showToast('Walls cleared', '🧹');
      this._updateRunBtn();
    });

    // Generate maze
    document.getElementById('btn-maze')?.addEventListener('click', () => {
      const walls = generateMaze(
        this.grid.size,
        this.grid.size,
        this.grid.startNode,
        this.grid.endNode
      );
      this.grid.applyWalls(walls);
      showToast('Maze generated!', '🌀');
    });
  }

  _bindSimControls() {
    // Run
    document.getElementById('btn-run')?.addEventListener('click', () => {
      if (!this.grid.isReady()) {
        showToast('Please set both Start and End nodes first', '⚠️');
        return;
      }
      this.simRunner.run();
    });

    // Pause / Resume — button is now inside the speed centre panel
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

    // Reset
    document.getElementById('btn-reset')?.addEventListener('click', () => {
      this.simRunner.reset();
      if (pauseBtn) pauseBtn.textContent = '⏸ Pause';
      showToast('Simulation reset', '🔄');
      this._updateRunBtn();
    });

    // Speed label — now bound to the vertical slider in comparison section
    const slider   = document.getElementById('speed-slider');
    const speedVal = document.getElementById('speed-val');
    slider?.addEventListener('input', () => {
      const labels = ['Snail', 'Slow', 'Medium', 'Fast', 'Turbo'];
      const idx    = Math.round((parseInt(slider.value) - 1) / 99 * 4);
      if (speedVal) speedVal.textContent = labels[idx] ?? 'Medium';
    });
  }

  updateRunBtn() { this._updateRunBtn(); }

  _updateRunBtn() {
    const btn = document.getElementById('btn-run');
    if (!btn) return;
    const ready = this.grid.isReady();
    btn.disabled = !ready;
    btn.classList.toggle('btn-glow', ready);
  }
}