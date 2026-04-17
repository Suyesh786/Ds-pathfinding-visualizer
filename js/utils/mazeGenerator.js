// ── Maze Generator ─────────────────────────────────────
// Recursive-division maze generation.
// Returns a Set of "r,c" strings representing wall positions.

export function generateMaze(rows, cols, startNode, endNode) {
  const walls = new Set();

  function divide(rStart, rEnd, cStart, cEnd) {
    const height = rEnd - rStart;
    const width  = cEnd - cStart;
    if (height < 2 || width < 2) return;

    const horizontal = height > width
      ? true
      : width > height
      ? false
      : Math.random() < 0.5;

    if (horizontal) {
      const wallRow    = rStart + 1 + Math.floor(Math.random() * (height - 1));
      const passageCol = cStart  + Math.floor(Math.random() * width);

      for (let c = cStart; c < cEnd; c++) {
        if (c !== passageCol && !_isSpecial(wallRow, c, startNode, endNode)) {
          walls.add(`${wallRow},${c}`);
        }
      }

      divide(rStart,      wallRow, cStart, cEnd);
      divide(wallRow + 1, rEnd,    cStart, cEnd);
    } else {
      const wallCol    = cStart  + 1 + Math.floor(Math.random() * (width  - 1));
      const passageRow = rStart  + Math.floor(Math.random() * height);

      for (let r = rStart; r < rEnd; r++) {
        if (r !== passageRow && !_isSpecial(r, wallCol, startNode, endNode)) {
          walls.add(`${r},${wallCol}`);
        }
      }

      divide(rStart, rEnd, cStart,      wallCol);
      divide(rStart, rEnd, wallCol + 1, cEnd);
    }
  }

  divide(0, rows, 0, cols);
  return walls;
}

function _isSpecial(r, c, startNode, endNode) {
  if (startNode && startNode[0] === r && startNode[1] === c) return true;
  if (endNode   && endNode[0]   === r && endNode[1]   === c) return true;
  return false;
}