// ── logs.js ────────────────────────────────────────────
// Manages traversal log display and auto-scroll.

export class TraversalLog {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.stepCount = 0;
  }

  clear() {
    this.stepCount = 0;
    if (this.container) {
      this.container.innerHTML = '<span class="log-empty">Waiting for simulation…</span>';
    }
  }

  addStep(r, c, type = 'visit') {
    if (!this.container) return;

    const empty = this.container.querySelector('.log-empty');
    if (empty) empty.remove();

    this.stepCount++;
    const line = document.createElement('div');
    line.className = 'log-line log-entry';

    const action =
      type === 'visit' ? 'Visit' :
      type === 'queue' ? 'Enqueue' :
      type === 'stack' ? 'Push' :
      'Process';

    line.innerHTML =
      `<span class="step-num">Step ${this.stepCount}</span>` +
      ` → ${action} <span class="coord">(${r}, ${c})</span>`;

    this.container.appendChild(line);
    this.container.scrollTop = this.container.scrollHeight;
  }

  addPathFound(pathLen) {
    if (!this.container) return;
    const line = document.createElement('div');
    line.className = 'log-line path-found log-entry';
    line.innerHTML =
      `✓ Path found! Length: <span class="coord">${pathLen}</span> nodes`;
    this.container.appendChild(line);
    this.container.scrollTop = this.container.scrollHeight;
  }

  addNoPath() {
    if (!this.container) return;
    const line = document.createElement('div');
    line.className = 'log-line no-path log-entry';
    line.textContent = '✗ No path found!';
    this.container.appendChild(line);
    this.container.scrollTop = this.container.scrollHeight;
  }

  addVisited(count) {
    if (!this.container) return;
    const line = document.createElement('div');
    line.className = 'log-line log-entry';
    line.style.color = 'var(--text-muted)';
    line.innerHTML =
      `Total visited: <span class="coord">${count}</span> nodes`;
    this.container.appendChild(line);
    this.container.scrollTop = this.container.scrollHeight;
  }
}