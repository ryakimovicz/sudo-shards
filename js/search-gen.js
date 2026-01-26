import {
  isPeakOrValley,
  getNeighbors,
  getOrthogonalNeighbors,
} from "./peaks-logic.js";

// Deterministic RNG (Linear Congruential Generator)
class SeededRNG {
  constructor(seed) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed;
  }
  nextFloat() {
    return (this.next() - 1) / 2147483646;
  }
  range(min, max) {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }
}

export function generateSearchSequences(board, dateSeed) {
  const rng = new SeededRNG(dateSeed);
  const rows = 9;
  const cols = 9;
  const usedMap = new Set(); // "r,c" of cells used in sequences
  const sequences = [];

  // 1. Identify Available Cells (NOT Peak AND NOT Valley)
  const availableCells = [];
  const peaksValleys = new Set();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isPeakOrValley(r, c, board)) {
        peaksValleys.add(`${r},${c}`);
      } else {
        availableCells.push({ r, c });
      }
    }
  }

  // 2. Target Used Cells = Total Available - 5
  // We want exactly 5 cells left unused (neither peak/valley nor sequence)
  const totalAvailable = availableCells.length;
  const targetUsedCount = Math.max(0, totalAvailable - 5);

  console.log(
    `Generating Search: Available ${totalAvailable}, Target Used ${targetUsedCount}`,
  );

  // 3. Backtracking Generation
  const perfStats = {
    count: 0,
    max: 200000,
    start: Date.now(),
    timeout: false,
    best: { sequences: [], usedCount: -1 },
  };

  const result = backtrackSequences(
    board,
    usedMap,
    sequences,
    0, // currentUsedCount
    targetUsedCount,
    peaksValleys,
    rng,
    {
      count: 0,
      max: 200000,
      start: Date.now(),
      timeout: false,
      best: { sequences: [], usedCount: -1 },
    }, // Performance Stats
    precomputeNumberLocations(board),
    new Set(), // ambiguousCache
  );

  // If we found a perfect result, return it.
  if (result) {
    return sequences;
  }

  // If we failed (or timed out), use BEST result instead of current stack
  if (perfStats.best.usedCount > 0) {
    console.warn(
      `[Generator] Timeout/Limit. Restoring BEST result: ${perfStats.best.usedCount} cells used.`,
    );
    return perfStats.best.sequences.map((s, i) => ({ ...s, id: i }));
  }

  return [];
}

function backtrackSequences(
  board,
  usedMap,
  sequences,
  currentUsedCount,
  targetUsedCount,
  peaksValleys,
  rng,
  perfStats,
  numberLocs,
) {
  // Track Best Result
  if (currentUsedCount > perfStats.best.usedCount) {
    // Deep Copy sequences to save this state
    const seqCopy = sequences.map((s) => ({
      ...s,
      path: s.path.map((p) => ({ ...p })),
      numbers: [...s.numbers],
    }));
    perfStats.best = {
      sequences: seqCopy,
      usedCount: currentUsedCount,
    };
  }

  // Performance Guard
  perfStats.count++;
  if (perfStats.count > perfStats.max) {
    perfStats.timeout = true;
    return true; // Return TRUE to preserve stack on limit
  }
  if (Date.now() - perfStats.start > 4000) {
    // 4 Second Timeout
    console.warn("Search Generation Timed Out");
    perfStats.timeout = true;
    return true; // Return TRUE to preserve stack on timeout
  }

  // Base Case: Success
  if (currentUsedCount === targetUsedCount) {
    return true;
  }

  // Pruning: Check for islands (Dead Ends)
  if (
    !isValidState(usedMap, peaksValleys, targetUsedCount - currentUsedCount)
  ) {
    return false;
  }

  // 1. Filter and Calculate Degrees (MRV Heuristic)
  // We want to prioritize cells with fewer available neighbors to prevent creating islands.
  const styledStarts = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const key = `${r},${c}`;
      if (!usedMap.has(key) && !peaksValleys.has(key)) {
        const degree = getDegree(r, c, usedMap, peaksValleys);
        styledStarts.push({ r, c, degree });
      }
    }
  }

  if (styledStarts.length === 0) return false;

  // 2. Sort by Degree (Ascending) + Randomness for ties
  // Shuffle first to randomize ties
  shuffleArray(styledStarts, rng);
  // Then stable sort by degree
  styledStarts.sort((a, b) => a.degree - b.degree);

  // Take top N candidates? No, try them in order.

  for (const startObj of styledStarts) {
    const start = { r: startObj.r, c: startObj.c };

    // Try lengths 6 down to 3 (Longer sequences first = better fill?)
    // Actually, mixing lengths is good, but long first fills faster.
    const lengths = [6, 5, 4, 3];
    shuffleArray(lengths, rng); // Keep randomness in lengths

    for (const len of lengths) {
      // Don't exceed target
      if (currentUsedCount + len > targetUsedCount) continue;

      // Try to find a path of 'len' starting at 'start'
      const paths = findPaths(board, start, len, usedMap, peaksValleys);
      shuffleArray(paths, rng);

      for (const path of paths) {
        // Place Path
        path.forEach((cell) => usedMap.add(`${cell.r},${cell.c}`));

        // Extract Numbers
        const numbers = path.map((p) => board[p.r][p.c]);

        // AMBIGUITY CHECK: Ensure this number sequence appears ONLY ONCE on the entire board
        if (countSequenceOccurrences(board, numbers, numberLocs) > 1) {
          // Reject ambiguous sequence
          path.forEach((cell) => usedMap.delete(`${cell.r},${cell.c}`));
          continue;
        }

        const seqObj = { path, numbers, id: sequences.length };
        sequences.push(seqObj);

        // Recursive Step
        if (
          backtrackSequences(
            board,
            usedMap,
            sequences,
            currentUsedCount + len,
            targetUsedCount,
            peaksValleys,
            rng,
            perfStats,
            numberLocs,
          )
        ) {
          return true;
        }

        // If child returned TRUE due to timeout, propagate it without popping
        if (perfStats.timeout) return true;

        // Undo (Backtrack)
        sequences.pop();
        path.forEach((cell) => usedMap.delete(`${cell.r},${cell.c}`));
      }
    }
  }

  return false;
}

// Check if remaining holes are valid
// Allow holes ONLY if they will become the final 5
// Since we fill EXACTLY targetUsedCount, "holes" here means islands of unused cells.
// Constraint: logic says "Islands < 3 are impossible".
// BUT: We have a buffer of 5.
// So, the SUM of all islands size < 3 MUST be <= (remaining_buffer_for_final_5).
// Actually, strict reading of user request: "imposibles (islas < 3 celdas que no son parte de los 5 finales)".
// This means we can have small islands if they are the FINAL leftovers.
// Total unused cells at ANY point = (TotalAvailable - currentUsedCount).
// Final unused will be 5.
// So, valid state is: Sum(size of islands < 3) <= 5.
function isValidState(usedMap, peaksValleys, remainingToFill) {
  const visited = new Set();
  let smallIslandSum = 0;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const key = `${r},${c}`;
      if (usedMap.has(key) || peaksValleys.has(key) || visited.has(key))
        continue;

      // Found an unused component
      const size = getComponentSize(r, c, usedMap, peaksValleys, visited);

      // If this island is too small to fit a sequence (size < 3),
      // it MUST remain unused forever.
      if (size < 3) {
        smallIslandSum += size;
      }
    }
  }

  // Total Free Cells = remainingToFill + 5 (Final Buffer)
  // We need to fill remainingToFill.
  // The 'smallIslandSum' cells are useless for filling.
  // So available for filling = (TotalFree - smallIslandSum).
  // If (TotalFree - smallIslandSum) < remainingToFill, we are stuck.
  // Or simply: smallIslandSum must fit in the final 5 buffer.
  return smallIslandSum <= 5;
}

function getComponentSize(startR, startC, usedMap, peaksValleys, visited) {
  let size = 0;
  const stack = [{ r: startR, c: startC }];
  visited.add(`${startR},${startC}`);

  while (stack.length > 0) {
    const { r, c } = stack.pop();
    size++;

    const neighbors = getOrthogonalNeighbors(r, c);
    for (const n of neighbors) {
      const key = `${n.r},${n.c}`;
      if (!usedMap.has(key) && !peaksValleys.has(key) && !visited.has(key)) {
        visited.add(key);
        stack.push(n);
      }
    }
  }
  return size;
}

function getDegree(r, c, usedMap, peaksValleys) {
  let degree = 0;
  const neighbors = getOrthogonalNeighbors(r, c);
  for (const n of neighbors) {
    const key = `${n.r},${n.c}`;
    if (!usedMap.has(key) && !peaksValleys.has(key)) {
      degree++;
    }
  }
  return degree;
}

function findPaths(board, start, len, usedMap, peaksValleys) {
  const result = [];

  function dfs(curr, path, visitedSet) {
    if (path.length === len) {
      result.push([...path]);
      return;
    }

    const neighbors = getOrthogonalNeighbors(curr.r, curr.c);
    for (const n of neighbors) {
      const key = `${n.r},${n.c}`;
      // Constraint: Unique cells (not in global usedMap, not in current path, not peak/valley)
      if (!usedMap.has(key) && !peaksValleys.has(key) && !visitedSet.has(key)) {
        visitedSet.add(key);
        path.push(n);
        dfs(n, path, visitedSet);
        path.pop();
        visitedSet.delete(key);
      }
    }
  }

  dfs(start, [start], new Set([`${start.r},${start.c}`]));
  return result;
}

function shuffleArray(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = rng.range(0, i);
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Check how many times a number sequence exists on the board (Orthogonally)
export function countSequenceOccurrences(board, numbers, numberLocs) {
  let count = 0;
  const startNum = numbers[0];

  // Use pre-computed locations if available to speed up start finding
  let starts = [];
  if (numberLocs) {
    starts = numberLocs[startNum];
  } else {
    // Fallback if called without locs (e.g. from game-manager validation)
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === startNum) starts.push({ r, c });
      }
    }
  }

  for (const s of starts) {
    count += countPathFrom(board, s.r, s.c, numbers, 1);
    if (count > 1) return count;
  }

  return count;
}

function precomputeNumberLocations(board) {
  const locs = Array.from({ length: 10 }, () => []);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = board[r][c];
      if (val >= 0 && val <= 9) locs[val].push({ r, c });
    }
  }
  return locs;
}

function countPathFrom(board, r, c, numbers, index, visited = new Set()) {
  if (index >= numbers.length) return 1;

  const currentKey = `${r},${c}`;
  visited.add(currentKey);

  const targetNum = numbers[index];
  let total = 0;

  const neighbors = getOrthogonalNeighbors(r, c);
  for (const n of neighbors) {
    const key = `${n.r},${n.c}`;
    if (!visited.has(key) && board[n.r][n.c] === targetNum) {
      // Clone set for branching paths
      const newVisited = new Set(visited);
      total += countPathFrom(board, n.r, n.c, numbers, index + 1, newVisited);
      if (total > 1) break;
    }
  }

  return total;
}
