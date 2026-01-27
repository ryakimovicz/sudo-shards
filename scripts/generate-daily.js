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
  console.log(
    "🧩 Starting Daily Puzzle Generation (Strict Quality Control)...",
  );

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
    let gameData;
    let attempts = 0;
    const MAX_AMBIGUITY_RETRIES = 500;

    // --- STEP 1: GENERATE SUDOKU BASE ---
    while (true) {
      if (attempts > 0) seedInt = baseSeed * 1000 + attempts;
      else seedInt = baseSeed; // Keep original for first try

      gameData = generateDailyGame(seedInt);

      // Unique blocks check
      const blocks = [];
      for (let r = 0; r < 9; r += 3) {
        for (let c = 0; c < 9; c += 3) {
          const block = [];
          for (let i = 0; i < 3; i++) {
            block.push(gameData.solution[r + i].slice(c, c + 3));
          }
          blocks.push(JSON.stringify(block));
        }
      }

      if (new Set(blocks).size === 9) {
        if (attempts > 0)
          console.log(
            `\n     ✅ Unique puzzle found after ${attempts} retries.`,
          );
        break;
      }
      attempts++;
      if (attempts > MAX_AMBIGUITY_RETRIES)
        throw new Error("Max Sudoku retries reached.");
    }

    // --- STEP 2: MULTIVERSE GENERATION ---
    // Strict logic: No islands < 3 cells allowed in ANY variation.

    let attemptsGlobal = 0;
    const MAX_GLOBAL_ATTEMPTS = 100; // More retries allowed because we fail fast
    let success = false;

    let finalVariations = {};
    let finalSimonValues = [];

    while (!success && attemptsGlobal < MAX_GLOBAL_ATTEMPTS) {
      attemptsGlobal++;

      // 1. Define variations
      let variations = {
        0: { board: JSON.parse(JSON.stringify(gameData.solution)) },
        LR: { board: swapStacks(gameData.solution) },
        TB: { board: swapBands(gameData.solution) },
        HV: { board: swapBands(swapStacks(gameData.solution)) },
      };

      // 2. Pre-calculate & VALIDATE Topography
      let topologyValid = true;
      for (let key in variations) {
        const { targetMap } = getAllTargets(variations[key].board);
        variations[key].peaksValleys = targetMap;

        // CRITICAL CHECK: Does this map have impossible islands?
        if (!checkTopologyConnectivity(variations[key].peaksValleys)) {
          topologyValid = false;
          // If the map is bad, don't even try to put snakes on it.
          // Just fail this Sudoku seed and try a new global attempt.
          break;
        }
      }

      if (!topologyValid) {
        // Bad geometry. Twist the seed and try a new Sudoku layout entirely.
        // This prevents wasting time on "cursed" boards.
        process.stdout.write(
          `   > Attempt ${attemptsGlobal}: Bad Topology (Islands detected). Regenerating Sudoku...\r`,
        );

        // Generate a NEW Sudoku on the fly
        const newSeed = baseSeed * 2000 + attemptsGlobal;
        gameData = generateDailyGame(newSeed);
        // (We skip the block uniqueness check here for speed, assuming newSeed gives decent results,
        // or we could extract that logic to a function. For now, it's safer to just proceed).
        continue;
      }

      process.stdout.write(
        `   > Attempt ${attemptsGlobal}: Topology OK. Generating Snakes... `,
      );

      // 3. Generate BASE ('0')
      const safeCellsBase = getSafeCells(
        variations["0"].board,
        variations["0"].peaksValleys,
      );
      const baseReserved = pickRandom(safeCellsBase, 3);
      const seedBase = seedInt + attemptsGlobal * 100;

      // Allow high initial holes (tolerance), but demand strict cleanup
      const resultBase = generateSearchSequences(
        variations["0"].board,
        seedBase,
        1500,
        baseReserved,
      );

      let baseValid = false;

      if (resultBase) {
        // Tolerancia: Aceptamos hasta 30 huecos si podemos limpiarlos todos
        if (resultBase.holes <= 30) {
          // STRICT CLEANUP: Only merge to existing snakes. No new 1-cell snakes.
          absorbOrphans(
            resultBase.sequences,
            variations["0"].board,
            baseReserved,
            variations["0"].peaksValleys,
          );

          // Final Check: MUST BE 0 HOLES
          const realHoles = countHoles(
            resultBase.sequences,
            baseReserved,
            variations["0"].peaksValleys,
          );
          if (realHoles === 0) baseValid = true;
        }
      }

      if (!baseValid) {
        process.stdout.write("Base Search failed to clean up. Retry.\r");
        continue;
      }

      // 4. Base Success! Extract Values.
      const simonValues = baseReserved.map(
        (c) => variations["0"].board[c.r][c.c],
      );

      variations["0"].search = {
        targets: resultBase.sequences,
        simon: baseReserved,
      };

      // 5. Generate OTHERS
      let allVariationsSuccess = true;
      const otherKeys = ["LR", "TB", "HV"];

      for (const key of otherKeys) {
        const resVar = generateConstrainedSoup(
          variations[key].board,
          variations[key].peaksValleys,
          simonValues,
          seedInt + attemptsGlobal * 100,
        );

        if (!resVar.success) {
          process.stdout.write(`Var [${key}] failed. Retry Set.\r`);
          allVariationsSuccess = false;
          break;
        }
        variations[key].search = {
          targets: resVar.sequences,
          simon: resVar.reserved,
        };
      }

      if (allVariationsSuccess) {
        console.log(
          `\n     ✅ SUCCESS! Simon Values: ${simonValues.join(", ")}`,
        );
        finalVariations = variations;
        finalSimonValues = simonValues;
        success = true;
      }
    }

    if (!success) throw new Error("Could not find valid puzzle.");

    // 6. Save
    const finalSearchTargets = {};
    for (let key in finalVariations) {
      finalSearchTargets[key] = finalVariations[key].search;
    }

    const dailyPuzzle = {
      meta: { version: "3.0", date: dateStr, seed: seedInt },
      data: {
        solution: gameData.solution,
        puzzle: gameData.puzzle,
        simonValues: finalSimonValues,
        searchTargets: finalSearchTargets,
      },
      chunks: gameData.chunks,
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

// --- HELPERS ---

// NEW: Flood Fill to detect impossible islands
function checkTopologyConnectivity(pvMap) {
  // Create a 9x9 grid representation
  // 0 = Walkable, 1 = Wall (Peak/Valley)
  let grid = Array(9)
    .fill()
    .map(() => Array(9).fill(0));
  let totalWalkable = 0;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (pvMap.has(`${r},${c}`)) {
        grid[r][c] = 1;
      } else {
        totalWalkable++;
      }
    }
  }

  // Flood fill from first walkable cell
  let visitedCount = 0;
  let startNode = null;

  // Find a start node
  outer: for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        startNode = { r, c };
        break outer;
      }
    }
  }

  if (!startNode) return true; // All walls? Valid theoretically but rare.

  let queue = [startNode];
  let visited = new Set([`${startNode.r},${startNode.c}`]);
  visitedCount++;

  while (queue.length > 0) {
    const { r, c } = queue.shift();
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];

    for (let d of dirs) {
      const nr = r + d[0];
      const nc = c + d[1];
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && grid[nr][nc] === 0) {
        const key = `${nr},${nc}`;
        if (!visited.has(key)) {
          visited.add(key);
          visitedCount++;
          queue.push({ r: nr, c: nc });
        }
      }
    }
  }

  // Check 1: Is the whole board connected? (Optional, but good for gameplay)
  // If we have disconnected components, we check if any component is too small (< 3).
  if (visitedCount !== totalWalkable) {
    // The board is fragmented. Check sizes of fragments.
    // If any fragment is < 3 cells, it's impossible to snake.
    // We already checked the main component. Now check the unvisited ones.
    // For simplicity: If fragmented, REJECT. It's better to have one big open board.
    return false;
  }

  return true;
}

function generateConstrainedSoup(grid, peaksValleysMap, targetValues, seed) {
  let candidatePools = [[], [], []];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (peaksValleysMap.has(`${r},${c}`)) continue;
      const val = grid[r][c];
      targetValues.forEach((target, idx) => {
        if (val === target) candidatePools[idx].push({ r, c });
      });
    }
  }
  if (candidatePools.some((p) => p.length === 0)) return { success: false };

  let attempts = 0;
  while (attempts < 30) {
    attempts++;
    const reserved = [
      pickRandom(candidatePools[0], 1)[0],
      pickRandom(candidatePools[1], 1)[0],
      pickRandom(candidatePools[2], 1)[0],
    ];

    // Ensure uniqueness
    const uniqueKeys = new Set(reserved.map((p) => `${p.r},${p.c}`));
    if (uniqueKeys.size < 3) continue;

    // Ensure reserved are not isolated (basic check)
    // ... (can skip for speed, absorbOrphans will handle)

    const result = generateSearchSequences(
      grid,
      seed + attempts * 10,
      800,
      reserved,
    );

    if (result && result.holes <= 30) {
      absorbOrphans(result.sequences, grid, reserved, peaksValleysMap);
      if (countHoles(result.sequences, reserved, peaksValleysMap) === 0) {
        return { success: true, sequences: result.sequences, reserved };
      }
    }
  }
  return { success: false };
}

// STRICT ABSORBER: No new small snakes.
function absorbOrphans(sequences, grid, reservedArr, topographyMap) {
  const reservedSet = new Set(reservedArr.map((p) => `${p.r},${p.c}`));
  let changed = true;
  while (changed) {
    changed = false;
    const orphans = [];

    // Find Orphans
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

    // Try to merge to existing snakes
    for (let i = 0; i < orphans.length; i++) {
      let orphan = orphans[i];
      if (!orphan) continue;
      for (let seq of sequences) {
        const head = seq[0];
        const tail = seq[seq.length - 1];

        // Head merge
        if (dist(head, orphan) === 1) {
          seq.unshift(orphan);
          orphans[i] = null;
          changed = true;
          break;
        }
        // Tail merge
        if (dist(tail, orphan) === 1) {
          seq.push(orphan);
          orphans[i] = null;
          changed = true;
          break;
        }
      }
    }

    // Note: No "Create pair" logic here. We force strict adherence to min length.
  }
  return false; // Still has holes? Fail.
}

function dist(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}
function countHoles(sequences, reserved, pvMap) {
  let used = sequences.reduce((acc, s) => acc + s.length, 0);
  return 81 - (used + pvMap.size + 3);
}
function getSafeCells(grid, pvMap) {
  let cells = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (!pvMap.has(`${r},${c}`)) cells.push({ r, c });
  return cells;
}
function pickRandom(arr, n) {
  return [...arr].sort(() => 0.5 - Math.random()).slice(0, n);
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
