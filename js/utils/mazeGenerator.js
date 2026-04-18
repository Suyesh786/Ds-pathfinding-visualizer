// js/utils/mazeGenerator.js
// ─────────────────────────────────────────────────────────────
// Recursive Backtracking Maze Generator
// Compatible with your Grid class (grid.js).
//
// Improvement 2: After generation, a BFS check guarantees the
// maze is always solvable. If no path exists from start → end,
// a minimal corridor is carved through walls to connect them.
// ─────────────────────────────────────────────────────────────

/**
 * Generates a maze using Recursive Backtracking (iterative stack).
 * Guarantees a valid path exists between start and end nodes.
 *
 * @param {Grid} gridInstance - Your instantiated Grid object from grid.js
 */
export function generateMaze(gridInstance) {
  const size = gridInstance.size;

  // ── Step 1: Build a local boolean map for the algorithm ─────
  const isWall = Array.from({ length: size }, () => Array(size).fill(true));

  // ── Step 2: Recursive backtracking (iterative with stack) ───
  const stack = [[1, 1]];
  isWall[1][1] = false;

  const directions = [
    [-2,  0],
    [ 2,  0],
    [ 0, -2],
    [ 0,  2],
  ];

  while (stack.length > 0) {
    const [cr, cc] = stack[stack.length - 1];
    const shuffled = [...directions].sort(() => Math.random() - 0.5);
    let moved = false;

    for (const [dr, dc] of shuffled) {
      const nr = cr + dr;
      const nc = cc + dc;
      const inBounds = nr > 0 && nr < size - 1 && nc > 0 && nc < size - 1;

      if (inBounds && isWall[nr][nc]) {
        isWall[cr + dr / 2][cc + dc / 2] = false;
        isWall[nr][nc] = false;
        stack.push([nr, nc]);
        moved = true;
        break;
      }
    }

    if (!moved) stack.pop();
  }

  // ── Step 3: Build the wallSet and apply to real grid ────────
  const wallSet = new Set();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isWall[r][c]) wallSet.add(`${r},${c}`);
    }
  }

  gridInstance.applyWalls(wallSet);

  // ── Step 4: Clear cells adjacent to start/end ───────────────
  const adjacentOffsets = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  function clearAdjacentWalls(node) {
    if (!node) return;
    const [nr, nc] = node;
    for (const [dr, dc] of adjacentOffsets) {
      const ar = nr + dr;
      const ac = nc + dc;
      if (
        ar >= 0 && ar < size &&
        ac >= 0 && ac < size &&
        gridInstance.cells[ar][ac] === 'wall'
      ) {
        gridInstance.cells[ar][ac] = 'empty';
        gridInstance._getEl(ar, ac).className = 'cell';
      }
    }
  }

  clearAdjacentWalls(gridInstance.startNode);
  clearAdjacentWalls(gridInstance.endNode);

  // ── Step 5: BFS check — guarantee a valid path exists ───────
  // If start or end isn't placed yet, skip the check.
  if (!gridInstance.startNode || !gridInstance.endNode) return;

  const pathExists = _bfsCheck(gridInstance);

  if (!pathExists) {
    // No path found — carve a straight corridor from start → end.
    // Walk row-first then column to connect the two nodes,
    // clearing any wall cells along the way.
    _carveCorridorToEnd(gridInstance);
  }
}

// ─────────────────────────────────────────────────────────────
// _bfsCheck
// Returns true if there is any passable path from startNode
// to endNode using 4-directional movement.
// Treats 'wall' as impassable; everything else is passable.
// ─────────────────────────────────────────────────────────────
function _bfsCheck(gridInstance) {
  const size  = gridInstance.size;
  const cells = gridInstance.cells;
  const [sr, sc] = gridInstance.startNode;
  const [er, ec] = gridInstance.endNode;

  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  const queue   = [[sr, sc]];
  visited[sr][sc] = true;

  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const [r, c] = queue.shift();

    if (r === er && c === ec) return true;

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (
        nr >= 0 && nr < size &&
        nc >= 0 && nc < size &&
        !visited[nr][nc] &&
        cells[nr][nc] !== 'wall'
      ) {
        visited[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
  }

  return false; // end node was never reached
}

// ─────────────────────────────────────────────────────────────
// _carveCorridorToEnd
// Carves an L-shaped corridor from startNode to endNode:
//   1. Walk vertically from start row → end row (same column as start)
//   2. Walk horizontally from start col → end col (at end row)
// Any wall cell along this path is cleared to 'empty'.
// ─────────────────────────────────────────────────────────────
function _carveCorridorToEnd(gridInstance) {
  const size  = gridInstance.size;
  const cells = gridInstance.cells;
  const [sr, sc] = gridInstance.startNode;
  const [er, ec] = gridInstance.endNode;

  function clearCell(r, c) {
    if (
      r >= 0 && r < size &&
      c >= 0 && c < size &&
      cells[r][c] === 'wall'
    ) {
      cells[r][c] = 'empty';
      gridInstance._getEl(r, c).className = 'cell';
    }
  }

  // Vertical leg: move from sr → er along column sc
  const rowStep = sr < er ? 1 : -1;
  for (let r = sr; r !== er; r += rowStep) {
    clearCell(r, sc);
  }

  // Horizontal leg: move from sc → ec along row er
  const colStep = sc < ec ? 1 : -1;
  for (let c = sc; c !== ec; c += colStep) {
    clearCell(er, c);
  }
}