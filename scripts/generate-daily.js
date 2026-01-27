import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Import Logic Modules
import { generateDailyGame } from "../js/sudoku-logic.js";
import { getAllTargets } from "../js/peaks-logic.js";
import { generateSearchSequences } from "../js/search-gen.js";

// Setup Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUZZLES_DIR = path.join(__dirname, "../public/puzzles");

if (!fs.existsSync(PUZZLES_DIR)) {
  fs.mkdirSync(PUZZLES_DIR, { recursive: true });
}

async function generateDailyPuzzle() {
  console.log("🧩 Starting Daily Puzzle Generation (Intersection Strategy)...");

  // 1. Determine Seed
  let seed = process.argv[2];
  let dateStr = "";
  let seedInt;

  if (!seed) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    dateStr = `${yyyy}-${mm}-${dd}`;
    seedInt = parseInt(`${yyyy}${mm}${dd}`, 10);
    seed = seedInt.toString();
    console.log(`📅 Target Date: ${dateStr} (Tomorrow), Seed: ${seed}`);
  } else {
    if (/^\d{8}$/.test(seed)) {
      const y = seed.substring(0, 4);
      const m = seed.substring(4, 6);
      const d = seed.substring(6, 8);
      dateStr = `${y}-${m}-${d}`;
    } else {
      dateStr = "custom-" + seed;
    }
    console.log(`🔧 Custom Seed: ${seed} -> Date: ${dateStr}`);
    seedInt = parseInt(seed, 10) || 12345;
  }

  try {
    const baseSeed = seedInt;
    let attemptsGlobal = 0;
    let success = false;

    let finalGameData = null;
    let finalSearchTargets = {};
    let finalSimonValues = [];

    // --- MAIN LOOP ---
    while (!success && attemptsGlobal < 100) {
      attemptsGlobal++;

      // 1. Generate NEW Sudoku
      const currentSeed = (baseSeed * 1000) + attemptsGlobal;
      let gameData = generateDailyGame(currentSeed);

      process.stdout.write(`   > Attempt ${attemptsGlobal}: `);

      // 2. Setup Variations
      let variations = {
        0: { board: JSON.parse(JSON.stringify(gameData.solution)) },
        LR: { board: swapStacks(gameData.solution) },
        TB: { board: swapBands(gameData.solution) },
        HV: { board: swapBands(swapStacks(gameData.solution)) },
      };

      // 3. SCAN ISLANDS & GENERATE SNAKES
      // We do this in one pass to fail fast
      let validGeneration = true;
      let commonCandidates = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]); // Start assuming all are possible

      for (let key in variations) {
        // A. Topology
        const { targetMap } = getAllTargets(variations[key].board);
        variations[key].peaksValleys = targetMap;

        // B. Detect Islands (These are MANDATORY candidates)
        const islands = getIslands(variations[key].peaksValleys);
        variations[key].islands = islands;

        // C. Full Fill (Respecting Islands)
        const fillResult = generateFullCover(
          variations[key].board,
          variations[key].peaksValleys,
          islands,
          currentSeed + 100,
        );

        if (!fillResult.success) {
          process.stdout.write(`Fill failed [${key}]. Next.\r`);
          validGeneration = false;
          break;
        }
        variations[key].fullSnakes = fillResult.sequences;

        // D. ANALYZE CARVABLE NUMBERS
        // This is the new logic: Ask the board what can be removed.
        const carvableSet = getCarvableValues(
          variations[key].fullSnakes,
          variations[key].board,
          islands,
        );

        // Intersection: Keep only numbers that are carvable in ALL previous variants too
        commonCandidates = new Set(
          [...commonCandidates].filter((x) => carvableSet.has(x)),
        );

        if (commonCandidates.size < 3) {
          process.stdout.write(`Intersection too small (<3). Next.\r`);
          validGeneration = false;
          break;
        }
      }

      if (!validGeneration) continue;

      // 4. THE EXECUTION
      // If we got here, 'commonCandidates' contains numbers that are valid
      // to remove in ALL 4 variations.

      const candidatesArray = Array.from(commonCandidates);
      // Pick 3 random numbers from the valid intersection
      const finalTargets = candidatesArray
        .sort(() => 0.5 - Math.random())
        .slice(0, 3);

      console.log(
        `\n     💎 Match Found! Common Candidates: [${candidatesArray.join(",")}] -> Picking: [${finalTargets.join(",")}]`,
      );

      // 5. PERFORM CARVE (Guaranteed to succeed)
      let tempSearchTargets = {};

      for (let key in variations) {
        // Identify which of the final targets are ALREADY islands in this variant
        // (Islands don't need carving, they are already holes)
        const islandValues = new Set(
          variations[key].islands.map((i) => variations[key].board[i.r][i.c]),
        );
        const toCarve = finalTargets.filter((v) => !islandValues.has(v));

        const carveResult = carveHoles(
          variations[key].fullSnakes,
          variations[key].board,
          toCarve,
        );

        if (!carveResult.success) {
          // Should happen very rarely given our pre-check, but possible due to randomness in "which" 5 to pick if multiple exist
          // But 'carveHoles' scans all, so it should be fine.
          console.error("Unexpected carve error. Retrying loop.");
          validGeneration = false;
          break;
        }

        // Combine Islands + Carved Holes
        const finalHoles = [
          ...variations[key].islands.map((i) => ({ r: i.r, c: i.c })),
          ...carveResult.removedCoords,
        ];

        tempSearchTargets[key] = {
          targets: carveResult.sequences,
          simon: finalHoles,
        };
      }

      if (validGeneration) {
        console.log(`     ✅ SUCCESS! Puzzle Generated.`);
        finalSearchTargets = tempSearchTargets;
        finalSimonValues = finalTargets;
        finalGameData = gameData;
        success = true;
      }
    }

    if (!success)
      throw new Error("Could not generate valid puzzle after 100 attempts.");

    // --- SAVE ---
    const dailyPuzzle = {
      meta: { version: "3.4-intersection", date: dateStr, seed: seedInt },
      data: {
        solution: finalGameData.solution,
        puzzle: finalGameData.puzzle,
        simonValues: finalSimonValues,
        searchTargets: finalSearchTargets,
      },
      chunks: finalGameData.chunks,
    };

    const filename = `daily-${dateStr}.json`;
    fs.writeFileSync(
      path.join(PUZZLES_DIR, filename),
      JSON.stringify(dailyPuzzle, null, 2),
    );
    console.log(`✅ Puzzle saved: ${filename}`);
  } catch (error) {
    console.error("❌ Fatal Error:", error);
    process.exit(1);
  }
}

// --- NEW HELPER: Analyze what can be removed ---
function getCarvableValues(sequences, grid, islands) {
  const carvable = new Set();

  // 1. Islands are always "carvable" (already carved)
  for (let isl of islands) {
    carvable.add(grid[isl.r][isl.c]);
  }

  // 2. Check generated snakes
  for (let seq of sequences) {
    for (let i = 0; i < seq.length; i++) {
      const cell = seq[i];
      const val = grid[cell.r][cell.c];

      // If we already marked this number as feasible, skip expensive check
      if (carvable.has(val)) continue;

      // Simulate removal
      let canRemove = false;

      // Head
      if (i === 0) {
        if (seq.length - 1 >= 3) canRemove = true;
      }
      // Tail
      else if (i === seq.length - 1) {
        if (seq.length - 1 >= 3) canRemove = true;
      }
      // Middle
      else {
        // Length of left part = i
        // Length of right part = seq.length - 1 - i
        if (i >= 3 && seq.length - 1 - i >= 3) canRemove = true;
      }

      if (canRemove) {
        carvable.add(val);
      }
    }
  }
  return carvable;
}

// --- HELPER 1: FULL COVER GENERATOR ---
function generateFullCover(grid, pvMap, reserved, seed) {
  // Allow tolerance because we use absorbOrphans
  const result = generateSearchSequences(grid, seed, 1000, reserved);
  if (result && result.holes <= reserved.length + 45) {
    absorbOrphans(result.sequences, grid, reserved, pvMap);
    const holes = countHoles(result.sequences, reserved.length, pvMap);
    if (holes === 0) return { success: true, sequences: result.sequences };
  }
  return { success: false };
}

// --- HELPER 2: THE CARVER ---
function carveHoles(sequences, grid, targetValues) {
  let removedCoords = [];
  let seqCopy = JSON.parse(JSON.stringify(sequences));

  for (let target of targetValues) {
    let carved = false;
    let candidates = [];

    for (let sIdx = 0; sIdx < seqCopy.length; sIdx++) {
      const seq = seqCopy[sIdx];
      for (let cIdx = 0; cIdx < seq.length; cIdx++) {
        const cell = seq[cIdx];
        if (grid[cell.r][cell.c] === target) {
          candidates.push({ sIdx, cIdx, r: cell.r, c: cell.c });
        }
      }
    }
    // Important: Prefer candidates that allow simple head/tail removal first
    candidates.sort((a, b) => {
      // Simple heuristic: prefer removing from long snakes
      return 0.5 - Math.random();
    });

    for (let cand of candidates) {
      const seq = seqCopy[cand.sIdx];
      if (cand.cIdx === 0) {
        if (seq.length - 1 >= 3) {
          seq.shift();
          removedCoords.push({ r: cand.r, c: cand.c });
          carved = true;
          break;
        }
      } else if (cand.cIdx === seq.length - 1) {
        if (seq.length - 1 >= 3) {
          seq.pop();
          removedCoords.push({ r: cand.r, c: cand.c });
          carved = true;
          break;
        }
      } else {
        const left = seq.slice(0, cand.cIdx);
        const right = seq.slice(cand.cIdx + 1);
        if (left.length >= 3 && right.length >= 3) {
          seqCopy[cand.sIdx] = left;
          seqCopy.push(right);
          removedCoords.push({ r: cand.r, c: cand.c });
          carved = true;
          break;
        }
      }
    }
    if (!carved) return { success: false };
  }
  return { success: true, sequences: seqCopy, removedCoords };
}

// --- STANDARD HELPERS ---
function getIslands(pvMap) {
  const grid = Array(9)
    .fill()
    .map(() => Array(9).fill(0));
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) if (pvMap.has(`${r},${c}`)) grid[r][c] = 1;
  const islands = [];
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (grid[r][c] === 0) {
        let free = 0;
        for (let d of dirs) {
          const nr = r + d[0],
            nc = c + d[1];
          if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && grid[nr][nc] === 0)
            free++;
        }
        if (free === 0) islands.push({ r, c });
      }
  return islands;
}

function absorbOrphans(sequences, grid, reservedArr, topographyMap) {
  const reservedSet = new Set(reservedArr.map((p) => `${p.r},${p.c}`));
  let changed = true;
  while (changed) {
    changed = false;
    const orphans = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const key = `${r},${c}`;
        const isUsed = sequences.some((seq) =>
          seq.some((s) => s.r === r && s.c === c),
        );
        const isWall = topographyMap.has(key);
        const isReserved = reservedSet.has(key);
        if (!isUsed && !isWall && !isReserved) orphans.push({ r, c });
      }
    }
    if (orphans.length === 0) return true;

    for (let i = 0; i < orphans.length; i++) {
      let orphan = orphans[i];
      if (!orphan) continue;
      for (let seq of sequences) {
        if (dist(seq[0], orphan) === 1) {
          seq.unshift(orphan);
          orphans[i] = null;
          changed = true;
          break;
        }
        if (dist(seq[seq.length - 1], orphan) === 1) {
          seq.push(orphan);
          orphans[i] = null;
          changed = true;
          break;
        }
      }
    }

    const rem = orphans.filter((o) => o !== null);
    if (!changed && rem.length >= 2) {
      for (let i = 0; i < rem.length; i++) {
        for (let j = i + 1; j < rem.length; j++) {
          if (dist(rem[i], rem[j]) === 1) {
            sequences.push([rem[i], rem[j]]);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
  }
  return false;
}

function dist(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}
function countHoles(sequences, reservedCount, pvMap) {
  let used = sequences.reduce((acc, s) => acc + s.length, 0);
  return 81 - (used + pvMap.size + reservedCount);
}
function swapStacks(board) {
  const newBoard = board.map((r) => [...r]);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 3; c++) {
      [newBoard[r][c], newBoard[r][c + 6]] = [
        newBoard[r][c + 6],
        newBoard[r][c],
      ];
    }
  return newBoard;
}
function swapBands(board) {
  const newBoard = board.map((r) => [...r]);
  for (let r = 0; r < 3; r++)
    [newBoard[r], newBoard[r + 6]] = [newBoard[r + 6], newBoard[r]];
  return newBoard;
}

generateDailyPuzzle();
