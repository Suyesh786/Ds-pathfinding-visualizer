// ── animateCells.js ────────────────────────────────────
// Handles visual animation of visited cells and path drawing
// for a given grid element (the comparison mini-grids).

import { sleep } from '../utils/helpers.js';

export class CellAnimator {
  constructor(gridEl, rows, cols, cellSize) {
    this.gridEl  = gridEl;
    this.rows    = rows;
    this.cols    = cols;
    this.stopped = false;
    this.paused  = false;

    // Build mini-grid cells
    gridEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    gridEl.style.gridTemplateRows    = `repeat(${rows}, ${cellSize}px)`;
    gridEl.innerHTML = '';

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const el = document.createElement('div');
        el.className = 'cell';
        gridEl.appendChild(el);
      }
    }
  }

  getEl(r, c) {
    return this.gridEl.children[r * this.cols + c];
  }

  // Mirror the source grid's wall / start / end state
  applyGridState(gridData, startNode, endNode) {
    const rows = gridData.length;
    const cols = gridData[0].length;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const el    = this.getEl(r, c);
        const state = gridData[r][c];
        if      (state === 'wall')  el.className = 'cell wall';
        else if (state === 'start') el.className = 'cell start';
        else if (state === 'end')   el.className = 'cell end';
        else                        el.className = 'cell';
      }
    }
  }

  // Animate visited sequence, then path
  async animate(visitedOrder, path, getDelay, onStep, onDone, startNode, endNode) {
    this.stopped = false;

    // ── Visited phase ──────────────────────────────────────
    for (let i = 0; i < visitedOrder.length; i++) {
      if (this.stopped) return;

      while (this.paused && !this.stopped) await sleep(50);
      if (this.stopped) return;

      const [r, c]  = visitedOrder[i];
      const el      = this.getEl(r, c);
      const isStart = startNode && startNode[0] === r && startNode[1] === c;
      const isEnd   = endNode   && endNode[0]   === r && endNode[1]   === c;

      if (!isStart && !isEnd) {
        el.className = 'cell visited cell-visited';
      }

      onStep(i, r, c);
      await sleep(getDelay());
    }

    // ── Path phase ─────────────────────────────────────────
    for (let i = 0; i < path.length; i++) {
      if (this.stopped) return;

      while (this.paused && !this.stopped) await sleep(50);
      if (this.stopped) return;

      const [r, c]  = path[i];
      const el      = this.getEl(r, c);
      const isStart = startNode && startNode[0] === r && startNode[1] === c;
      const isEnd   = endNode   && endNode[0]   === r && endNode[1]   === c;

      if (!isStart && !isEnd) {
        el.className = 'cell path cell-path';
        el.style.animationDelay = `${i * 0.03}s`;
      }

      await sleep(getDelay() * 1.5);
    }

    onDone(path.length > 0);
  }

  stop()   { this.stopped = true; }
  pause()  { this.paused  = true; }
  resume() { this.paused  = false; }

  reset(gridData, startNode, endNode) {
    this.stopped = false;
    this.paused  = false;
    this.applyGridState(gridData, startNode, endNode);
  }
}