// ── BFS Algorithm ──────────────────────────────────────
// Returns { visited: [[r,c], ...], path: [[r,c], ...] }
// Uses a queue (FIFO) – explores neighbours layer by layer.

export function bfs(grid, startRow, startCol, endRow, endCol) {
  const rows = grid.length;
  const cols = grid[0].length;

  const visited = [];
  const seen    = Array.from({ length: rows }, () => Array(cols).fill(false));
  const parent  = Array.from({ length: rows }, () => Array(cols).fill(null));

  const queue = [[startRow, startCol]];
  seen[startRow][startCol] = true;

  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  let found = false;

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    visited.push([r, c]);

    if (r === endRow && c === endCol) { found = true; break; }

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (
        nr >= 0 && nr < rows &&
        nc >= 0 && nc < cols &&
        !seen[nr][nc] &&
        grid[nr][nc] !== 'wall'
      ) {
        seen[nr][nc]   = true;
        parent[nr][nc] = [r, c];
        queue.push([nr, nc]);
      }
    }
  }

  // Reconstruct path
  const path = [];
  if (found) {
    let curr = [endRow, endCol];
    while (curr !== null) {
      path.unshift(curr);
      const [r, c] = curr;
      curr = parent[r][c];
    }
  }

  return { visited, path };
}