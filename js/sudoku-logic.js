/**
 * Validates a full 9x9 board and returns all conflicting cells
 * Returns a Set of strings "row,col"
 */
export function getConflicts(board) {
  const conflicts = new Set();
  const SIZE = 9;

  // Check Rows
  for (let r = 0; r < SIZE; r++) {
    const seen = new Map(); // number -> col index(es)
    for (let c = 0; c < SIZE; c++) {
      const num = board[r][c];
      if (num === 0) continue;
      if (!seen.has(num)) seen.set(num, []);
      seen.get(num).push(c);
    }
    // identify duplicates
    seen.forEach((cols, num) => {
      if (cols.length > 1) {
        cols.forEach((c) => conflicts.add(`${r},${c}`));
      }
    });
  }

  // Check Cols
  for (let c = 0; c < SIZE; c++) {
    const seen = new Map(); // number -> row index(es)
    for (let r = 0; r < SIZE; r++) {
      const num = board[r][c];
      if (num === 0) continue;
      if (!seen.has(num)) seen.set(num, []);
      seen.get(num).push(r);
    }
    seen.forEach((rows, num) => {
      if (rows.length > 1) {
        rows.forEach((r) => conflicts.add(`${r},${c}`));
      }
    });
  }

  return conflicts;
}
