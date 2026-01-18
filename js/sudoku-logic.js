import { createGenerator } from "./utils/random.js";

// Constants
const GRID_SIZE = 9;
const SUBGRID_SIZE = 3;

/**
 * Checks if placing num at board[row][col] is valid
 */
function isValid(board, row, col, num) {
  // Check Row
  for (let x = 0; x < GRID_SIZE; x++) {
    if (board[row][x] === num) return false;
  }

  // Check Column
  for (let x = 0; x < GRID_SIZE; x++) {
    if (board[x][col] === num) return false;
  }

  // Check 3x3 Subgrid
  const startRow = row - (row % SUBGRID_SIZE);
  const startCol = col - (col % SUBGRID_SIZE);
  for (let i = 0; i < SUBGRID_SIZE; i++) {
    for (let j = 0; j < SUBGRID_SIZE; j++) {
      if (board[i + startRow][j + startCol] === num) return false;
    }
  }

  return true;
}

/**
 * Solves the board using backtracking.
 * randomness: if provided (function), shuffles candidates for generation.
 * countSolutions: if true, returns the number of solutions found (capped at 2 for efficiency).
 */
function solveSudoku(board, randomGenerator = null, countSolutions = false) {
  let solutions = 0;

  function solve() {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (board[row][col] === 0) {
          let nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];

          // Shuffle if generating
          if (randomGenerator) {
            for (let i = nums.length - 1; i > 0; i--) {
              const j = Math.floor(randomGenerator() * (i + 1));
              [nums[i], nums[j]] = [nums[j], nums[i]];
            }
          }

          for (let num of nums) {
            if (isValid(board, row, col, num)) {
              board[row][col] = num;

              if (solve()) {
                if (!countSolutions) return true; // Found one, keep going?
                // If counting, we essentially backtrack implicitly by successful return logic differences
                // But standard backtracking returns true on success.
                // For counting, we need to continue searching.
              }

              // Backtrack
              if (countSolutions) {
                // If we are in counting mode, we don't return true immediately
                // We check if we completed the board
              } else {
                board[row][col] = 0;
              }
            }
          }
          if (countSolutions) return false; // Should have returned already if solved
          return false;
        }
      }
    }

    // Board completed
    if (countSolutions) {
      solutions++;
      return solutions < 2; // Keep searching if we haven't found 2 yet
    }
    return true;
  }

  // Specialized Counter for strict checking
  function countSol() {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (board[row][col] === 0) {
          for (let num = 1; num <= 9; num++) {
            if (isValid(board, row, col, num)) {
              board[row][col] = num;
              if (countSol()) {
                if (solutions >= 2) return true; // Stop early
              }
              board[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    solutions++;
    return false; // Continue searching
  }

  if (countSolutions) {
    countSol();
    return solutions;
  } else {
    return solve();
  }
}

/**
 * Generates a full valid Sudoku board
 */
function generateFullBoard(prng) {
  const board = Array.from({ length: GRID_SIZE }, () =>
    Array(GRID_SIZE).fill(0),
  );
  solveSudoku(board, prng);
  return board;
}

/**
 * Removes numbers to create a puzzle with a unique solution
 */
function createPuzzle(fullBoard, prng) {
  const puzzle = fullBoard.map((row) => [...row]); // Deep copy
  const positions = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      positions.push([r, c]);
    }
  }

  // Shuffle positions
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  // Try to remove ~45 numbers (leaving ~36)
  let attempts = 45;

  for (let [r, c] of positions) {
    if (attempts <= 0) break;

    const removed = puzzle[r][c];
    puzzle[r][c] = 0;

    // Check if unique solution exists
    // We pass a COPY of the puzzle because solver mutates it
    const copyForCheck = puzzle.map((row) => [...row]);
    const solutionsCount = solveSudoku(copyForCheck, null, true);

    if (solutionsCount !== 1) {
      // Not unique or no solution (shouldn't happen), put it back
      puzzle[r][c] = removed;
    } else {
      attempts--;
    }
  }

  return puzzle;
}

/**
 * Splits the full board into 9 3x3 chunks for the Jigsaw phase
 */
function getChunks(board) {
  const chunks = [];
  for (let tr = 0; tr < 3; tr++) {
    // Top Row of chunks
    for (let tc = 0; tc < 3; tc++) {
      // Top Col of chunks
      const chunk = [];
      for (let r = 0; r < 3; r++) {
        const row = [];
        for (let c = 0; c < 3; c++) {
          row.push(board[tr * 3 + r][tc * 3 + c]);
        }
        chunk.push(row);
      }
      chunks.push(chunk);
    }
  }
  return chunks;
}

export function generateDailyGame(seed) {
  const prng = createGenerator(seed);
  const solution = generateFullBoard(prng);
  const puzzle = createPuzzle(solution, prng);
  const chunks = getChunks(solution);

  return {
    seed,
    solution,
    puzzle,
    chunks,
  };
}
