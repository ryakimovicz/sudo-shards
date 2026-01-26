import {
  isPeakOrValley,
  getNeighbors,
  getOrthogonalNeighbors,
} from "./peaks-logic.js";
import { CONFIG } from "./config.js";

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

export function generateSearchSequences(board, dateSeed, maxDuration = 4000) {
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

  // 2. Target Used Cells = Total Available - 3
  // We want exactly 3 cells left unused (neither peak/valley nor sequence)
  const totalAvailable = availableCells.length;
  const targetUsedCount = Math.max(0, totalAvailable - 3);

  if (CONFIG.debugMode) {
    console.log(
      `Generating Search: Available ${totalAvailable}, Target Used ${targetUsedCount}`,
    );
  }

  // 3. Retry Loop Strategy
  // If we get a valid count (3 free) but they are CLUSTERED, we reject and retry.
  // We perturb the RNG or heuristics slightly each time.
  const maxRetries = 20;
  let bestGlobalResult = null;
  let minAdjacency = 999;

  // Global performance stats to track overall time
  const globalPerfStats = {
    start: Date.now(),
  };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // START DEBUG LOG
    const logPrefix = `[Generator ${attempt + 1}/${maxRetries}]`;
    if (CONFIG.debugMode) console.log(`${logPrefix} Starting attempt...`);
    // END DEBUG LOG

    // Perturb RNG for subsequent attempts (keep deterministic base, but shift)
    // We pass 'attempt' to influence sorting/randomness if needed,
    // or just burn some RNG calls.
    if (attempt > 0) {
      rng.next(); // Shift state
      rng.next();
    }

    const iterationPerf = {
      count: 0,
      max: 50000, // Reduced max per attempt to allow multiple fast tries
      start: Date.now(),
      timeout: false,
      best: { sequences: [], usedCount: -1, adjacencyScore: 999 },
      maxDuration: maxDuration,
    };

    // Reset Collections for this attempt
    usedMap.clear();
    sequences.length = 0; // Clear array

    const result = backtrackSequences(
      board,
      usedMap,
      sequences,
      0, // currentUsedCount
      targetUsedCount,
      peaksValleys,
      rng,
      iterationPerf, // Use local perf stats
      precomputeNumberLocations(board), // This is fast enough to redo or cache
      attempt > 0, // enableRandomness for later attempts
    );

    // Analyze Result
    let candidateSequences = [];
    let candidateUsedCount = 0;

    if (result === true) {
      // Improved: backtrack returned true (unlikely with strict max/time, but possible)
      // DEEP COPY to prevent reference clearing
      candidateSequences = sequences.map((s) => ({
        ...s,
        path: s.path.map((p) => ({ ...p })),
        numbers: [...s.numbers],
      }));
      candidateUsedCount = targetUsedCount;
    } else {
      // Use Best of this iteration
      if (iterationPerf.best.usedCount > 0) {
        candidateSequences = iterationPerf.best.sequences.map((s, i) => ({
          ...s,
          id: i,
        }));
        candidateUsedCount = iterationPerf.best.usedCount;

        // Run Panic Fill on this candidate
        candidateSequences = runPanicFill(
          candidateSequences,
          board,
          totalAvailable,
          peaksValleys,
          rows,
          cols,
        );
        // Recalculate usage after panic
        const pSet = new Set();
        candidateSequences.forEach((s) =>
          s.path.forEach((p) => pSet.add(`${p.r},${p.c}`)),
        );
        candidateUsedCount = pSet.size;
      }
    }

    // Check Clustering
    const adj = calculateFinalAdjacency(
      candidateSequences,
      peaksValleys,
      rows,
      cols,
    );
    const holesLeft = totalAvailable - candidateUsedCount;

    if (CONFIG.debugMode)
      console.log(
        `   > Attempt ${attempt}: used=${candidateUsedCount}, adj=${adj}`,
      );

    // SUCCESS CRITERIA: Full usage (only 3 left) AND 0 Adjacency
    if (holesLeft <= 3 && adj === 0) {
      if (CONFIG.debugMode)
        console.log(
          `${logPrefix} SUCCESS! Found separated solution with 3 holes.`,
        );
      return candidateSequences;
    } else {
      if (CONFIG.debugMode)
        console.log(
          `${logPrefix} Failed criteria. Holes: ${holesLeft} (Target <=3), Adj: ${adj} (Target 0). Retrying...`,
        );
    }

    // Track Global Best (just in case we fail all retries)
    // Prioritize: 1. Fewest Holes, 2. Lowest Adjacency
    if (!bestGlobalResult) {
      bestGlobalResult = {
        seqs: candidateSequences,
        holes: holesLeft,
        adj: adj,
      };
      minAdjacency = adj;
    } else {
      if (holesLeft < bestGlobalResult.holes) {
        bestGlobalResult = {
          seqs: candidateSequences,
          holes: holesLeft,
          adj: adj,
        };
        minAdjacency = adj;
      } else if (holesLeft === bestGlobalResult.holes && adj < minAdjacency) {
        bestGlobalResult = {
          seqs: candidateSequences,
          holes: holesLeft,
          adj: adj,
        };
        minAdjacency = adj;
      }
    }

    // Logic for total timeout?
    // Use the passed maxDuration (minus a buffer for retry loops)
    if (Date.now() - globalPerfStats.start > maxDuration - 200) {
      console.warn(
        "[Generator] Global Time Limit reached. Returning best found.",
      );
      break;
    }
  }

  // Return best best
  return bestGlobalResult ? bestGlobalResult.seqs : [];
}

// Extracted Panic Fill to reuse
function runPanicFill(
  bestSeqs,
  board,
  totalAvailable,
  peaksValleys,
  rows,
  cols,
) {
  const usedMap = new Set();
  bestSeqs.forEach((s) => s.path.forEach((p) => usedMap.add(`${p.r},${p.c}`)));
  const boardLocs = precomputeNumberLocations(board);
  let currentUsed = usedMap.size;

  if (totalAvailable - currentUsed > 3) {
    if (CONFIG.debugMode) console.log("Entering Strict Panic Fill Mode...");

    let attempts = 0;
    const maxAttempts = 100; // Increased from 50
    let stuckCounter = 0;

    while (totalAvailable - usedMap.size > 3 && attempts < maxAttempts) {
      attempts++;
      const holes = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = `${r},${c}`;
          if (!usedMap.has(key) && !peaksValleys.has(key)) {
            holes.push({ r, c });
          }
        }
      }
      if (holes.length === 0) break;

      // Sorting ...
      holes.forEach((h) => {
        let degree = 0;
        holes.forEach((other) => {
          if (h === other) return;
          const dist = Math.abs(h.r - other.r) + Math.abs(h.c - other.c);
          if (dist === 1) degree++;
        });
        h.degree = degree;
      });
      holes.sort((a, b) => b.degree - a.degree);

      let filledAny = false;
      for (const hole of holes) {
        if (usedMap.has(`${hole.r},${hole.c}`)) continue;
        // Try lengths
        const lengths = [5, 4, 3, 6];
        for (const len of lengths) {
          const paths = findPaths(board, hole, len, usedMap, peaksValleys);
          for (const p of paths) {
            const numbers = p.map((cell) => board[cell.r][cell.c]);
            if (countSequenceOccurrences(board, numbers, boardLocs) === 1) {
              p.forEach((cell) => usedMap.add(`${cell.r},${cell.c}`));
              bestSeqs.push({ path: p, numbers, id: bestSeqs.length });
              filledAny = true;
              break;
            }
          }
          if (filledAny) break;
        }
        if (filledAny) break;
      }
      if (!filledAny) {
        stuckCounter++;
        // If stuck, maybe try randomizing hole order instead of strict degree sort?
        if (stuckCounter > 5) break; // Give it a few tries before giving up
      } else {
        stuckCounter = 0;
      }
    }
  }
  return bestSeqs;
}

function calculateFinalAdjacency(sequences, peaksValleys, rows, cols) {
  const usedMap = new Set();
  sequences.forEach((s) => s.path.forEach((p) => usedMap.add(`${p.r},${p.c}`)));
  return calculateUnusedAdjacency(usedMap, peaksValleys, rows, cols);
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
  enableRandomness = false,
) {
  // Track Best Result
  // We want MAX usedCount.
  // Tie-breaker: MIN adjacency of remaining holes.
  let isBetter = false;
  let adjScore = 999;

  if (currentUsedCount > perfStats.best.usedCount) {
    isBetter = true;
  } else if (currentUsedCount === perfStats.best.usedCount) {
    // Check Adjacency Score (Lower is better)
    // Calculate only if potential contender
    adjScore = calculateUnusedAdjacency(usedMap, peaksValleys, 9, 9); // simplistic check
    if (adjScore < perfStats.best.adjacencyScore) {
      isBetter = true;
    }
  }

  if (isBetter) {
    // If we didn't calculate score yet (first case), do it now
    if (adjScore === 999)
      adjScore = calculateUnusedAdjacency(usedMap, peaksValleys, 9, 9);

    // Deep Copy sequences to save this state
    const seqCopy = sequences.map((s) => ({
      ...s,
      path: s.path.map((p) => ({ ...p })),
      numbers: [...s.numbers],
    }));
    perfStats.best = {
      sequences: seqCopy,
      usedCount: currentUsedCount,
      adjacencyScore: adjScore,
    };
  }

  // Performance Guard
  perfStats.count++;
  if (perfStats.count > perfStats.max) {
    perfStats.timeout = true;
    return true; // Return TRUE to preserve stack on limit
  }
  if (Date.now() - perfStats.start > perfStats.maxDuration) {
    // Timeout
    // console.warn("Search Generation Timed Out");
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

  // EPSILON-GREEDY:
  // If randomness is enabled (retry attempts), sometimes shuffle the "best" candidates
  // to break local optima.
  if (enableRandomness && rng.nextFloat() < 0.3) {
    // 30% chance to shuffle the top 5 candidates
    const topN = Math.min(styledStarts.length, 5);
    for (let i = topN - 1; i > 0; i--) {
      const j = rng.range(0, i);
      [styledStarts[i], styledStarts[j]] = [styledStarts[j], styledStarts[i]];
    }
  }

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
            enableRandomness,
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

  // Total Free Cells = remainingToFill + 3 (Final Buffer)
  // We need to fill remainingToFill.
  // The 'smallIslandSum' cells are useless for filling.
  // So available for filling = (TotalFree - smallIslandSum).
  // If (TotalFree - smallIslandSum) < remainingToFill, we are stuck.
  // Or simply: smallIslandSum must fit in the final 3 buffer.
  if (smallIslandSum > 3) return false;

  // EXTRA CONSTRAINT: If remainingToFill is 0 (we are at the end state),
  // we must ensure the 3 unused cells are NOT neighbors.
  if (remainingToFill === 0) {
    // Collect unused cells
    const unused = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const key = `${r},${c}`;
        if (!usedMap.has(key) && !peaksValleys.has(key)) {
          unused.push({ r, c });
        }
      }
    }

    // Check adjacency
    for (let i = 0; i < unused.length; i++) {
      for (let j = i + 1; j < unused.length; j++) {
        const u1 = unused[i];
        const u2 = unused[j];
        const dist = Math.abs(u1.r - u2.r) + Math.abs(u1.c - u2.c);
        if (dist === 1) return false; // Fail if neighbors
      }
    }
  }

  return true;
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

function calculateUnusedAdjacency(usedMap, peaksValleys, rows, cols) {
  let adjacency = 0;
  // This is expensive O(N^2) or O(N), do sparingly.
  // Iterating board is O(81).
  const unused = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (!usedMap.has(key) && !peaksValleys.has(key)) {
        unused.push({ r, c });
      }
    }
  }

  for (let i = 0; i < unused.length; i++) {
    for (let j = i + 1; j < unused.length; j++) {
      const u1 = unused[i];
      const u2 = unused[j];
      const dist = Math.abs(u1.r - u2.r) + Math.abs(u1.c - u2.c);
      if (dist === 1) adjacency++;
    }
  }
  return adjacency;
}
