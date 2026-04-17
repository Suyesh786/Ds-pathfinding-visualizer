// ── Grid Module ────────────────────────────────────────
// Manages grid state, rendering, and interaction.

import { showToast } from './utils/helpers.js';

export class Grid {
  constructor(containerId, size = 20) {
    this.container  = document.getElementById(containerId);
    this.size       = size;
    this.cells      = [];       // 2-D array of cell-state strings
    this.startNode  = null;     // [r, c]
    this.endNode    = null;     // [r, c]
    this.mode       = 'wall';   // 'wall' | 'start' | 'end'
    this.painting   = false;

    this._build();
  }

  // ── Build / Rebuild ──────────────────────────────────
  _build() {
    const s = this.size;
    this.cells = Array.from({ length: s }, () => Array(s).fill('empty'));

    const maxW     = Math.min(this.container.parentElement.clientWidth - 60, 760);
    const cellSize = Math.max(10, Math.floor((maxW - s * 2) / s));

    this.container.style.gridTemplateColumns = `repeat(${s}, ${cellSize}px)`;
    this.container.style.gridTemplateRows    = `repeat(${s}, ${cellSize}px)`;
    this.container.className = s <= 10 ? 'grid-sm' : s <= 20 ? 'grid-md' : 'grid-lg';
    this.container.id = 'grid-container';

    this.container.innerHTML = '';
    for (let r = 0; r < s; r++) {
      for (let c = 0; c < s; c++) {
        const el = document.createElement('div');
        el.className = 'cell cell-pop';
        el.style.animationDelay = `${(r + c) * 0.004}s`;
        el.dataset.r = r;
        el.dataset.c = c;
        this.container.appendChild(el);
      }
    }

    this._bindEvents();
  }

  // ── Resize ──────────────────────────────────────────
  resize(newSize) {
    this.size      = newSize;
    this.startNode = null;
    this.endNode   = null;
    this._build();
  }

  // ── Events ──────────────────────────────────────────
  _bindEvents() {
    // Abort any previously attached listeners so we don't stack them on resize
    if (this._eventsAC) this._eventsAC.abort();
    this._eventsAC = new AbortController();
    const signal = this._eventsAC.signal;

    this.container.addEventListener('mousedown', e => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      e.preventDefault();
      this.painting = true;
      this._handleClick(cell);
    }, { signal });

    this.container.addEventListener('mouseover', e => {
      if (!this.painting) return;
      const cell = e.target.closest('.cell');
      if (!cell) return;
      if (this.mode === 'wall') this._paintWall(cell);
    }, { signal });

    document.addEventListener('mouseup', () => { this.painting = false; }, { signal });

    // Touch support
    this.container.addEventListener('touchstart', e => {
      const t  = e.touches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const cell = el?.closest('.cell');
      if (cell) { e.preventDefault(); this._handleClick(cell); }
    }, { passive: false, signal });

    this.container.addEventListener('touchmove', e => {
      const t  = e.touches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const cell = el?.closest('.cell');
      if (cell && this.mode === 'wall') { e.preventDefault(); this._paintWall(cell); }
    }, { passive: false, signal });
  }

  _handleClick(cellEl) {
    const r     = parseInt(cellEl.dataset.r);
    const c     = parseInt(cellEl.dataset.c);
    const state = this.cells[r][c];

    if      (this.mode === 'wall')  this._toggleWall(r, c, state);
    else if (this.mode === 'start') this._placeStart(r, c, state);
    else if (this.mode === 'end')   this._placeEnd(r, c, state);
  }

  _toggleWall(r, c, state) {
    if (state === 'start' || state === 'end') return;
    const next = state === 'wall' ? 'empty' : 'wall';
    this.cells[r][c] = next;
    this._getEl(r, c).className = next === 'wall' ? 'cell wall cell-wall-anim' : 'cell';
  }

  _paintWall(cellEl) {
    const r     = parseInt(cellEl.dataset.r);
    const c     = parseInt(cellEl.dataset.c);
    const state = this.cells[r][c];
    if (state === 'start' || state === 'end' || state === 'wall') return;
    this.cells[r][c] = 'wall';
    this._getEl(r, c).className = 'cell wall cell-wall-anim';
  }

  _placeStart(r, c, state) {
    if (state === 'end') return;
    if (this.startNode) {
      const [or, oc] = this.startNode;
      this.cells[or][oc] = 'empty';
      this._getEl(or, oc).className = 'cell';
    }
    this.startNode       = [r, c];
    this.cells[r][c]     = 'start';
    this._getEl(r, c).className = 'cell start node-place';
    showToast('Start node placed', '🟠');
  }

  _placeEnd(r, c, state) {
    if (state === 'start') return;
    if (this.endNode) {
      const [or, oc] = this.endNode;
      this.cells[or][oc] = 'empty';
      this._getEl(or, oc).className = 'cell';
    }
    this.endNode         = [r, c];
    this.cells[r][c]     = 'end';
    this._getEl(r, c).className = 'cell end node-place';
    showToast('End node placed', '🔴');
  }

  // ── Helpers ─────────────────────────────────────────
  _getEl(r, c) {
    return this.container.children[r * this.size + c];
  }

  setMode(mode) { this.mode = mode; }

  clearWalls() {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.cells[r][c] === 'wall') {
          this.cells[r][c] = 'empty';
          this._getEl(r, c).className = 'cell';
        }
      }
    }
  }

  clearVisited() {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const state = this.cells[r][c];
        const el    = this._getEl(r, c);
        if      (state === 'start') el.className = 'cell start';
        else if (state === 'end')   el.className = 'cell end';
        else if (state === 'wall')  el.className = 'cell wall';
        else                        el.className = 'cell';
      }
    }
  }

  applyWalls(wallSet) {
    // First, clear existing walls
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.cells[r][c] === 'wall') {
          this.cells[r][c] = 'empty';
          this._getEl(r, c).className = 'cell';
        }
      }
    }
    // Then apply new wall set
    wallSet.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      if (r >= 0 && r < this.size && c >= 0 && c < this.size) {
        if (this.cells[r][c] !== 'start' && this.cells[r][c] !== 'end') {
          this.cells[r][c] = 'wall';
          const el = this._getEl(r, c);
          el.className = 'cell wall cell-wall-anim';
          el.style.animationDelay = `${Math.random() * 0.4}s`;
        }
      }
    });
  }

  isReady() {
    return this.startNode !== null && this.endNode !== null;
  }

  getGridData() {
    return this.cells.map(row => [...row]);
  }
}