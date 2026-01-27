import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Import Logic Modules directly from /js/
// Note: We need to use relative paths from this script location
import { generateDailyGame, checkBlockAmbiguity } from "../js/sudoku-logic.js";
import { getAllTargets } from "../js/peaks-logic.js";
import { generateSearchSequences } from "../js/search-gen.js";
import { getDailySeed } from "../js/utils/random.js";

// Setup Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUZZLES_DIR = path.join(__dirname, "../public/puzzles");

// Ensure output directory exists
if (!fs.existsSync(PUZZLES_DIR)) {
  fs.mkdirSync(PUZZLES_DIR, { recursive: true });
}

async function generateDailyPuzzle() {
  console.log("🧩 Starting Daily Puzzle Generation...");

  // 1. Determine Seed (Argument or Today)
  let seed = process.argv[2];
  let dateStr = "";
  let seedInt;

  if (!seed) {
    // Generate for "Tomorrow" to ensure it's ready for early timezones (Asia/Oceania)
    // Run at 00:00 UTC Jan 26 -> Generates for Jan 27
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    dateStr = `${yyyy}-${mm}-${dd}`;

    // Convert formatted date back to integer seed
    // We cannot use getDailySeed() because that uses "Now".
    // We must manually construct seed from the calculated tomorrow date.
    seedInt = parseInt(`${yyyy}${mm}${dd}`, 10);
    seed = seedInt.toString();

    console.log(`📅 Target Date: ${dateStr} (Tomorrow), Seed: ${seed}`);
  } else {
    // If seed is "20260127", we want dateStr to be "2026-01-27"
    // Check if seed matches YYYYMMDD format
    if (/^\d{8}$/.test(seed)) {
      const y = seed.substring(0, 4);
      const m = seed.substring(4, 6);
      const d = seed.substring(6, 8);
      dateStr = `${y}-${m}-${d}`;
    } else {
      dateStr = "custom-" + seed;
    }
    console.log(`🔧 Custom Seed: ${seed} -> Date: ${dateStr}`);
  }

  try {
    // seedInt is already set above if logic is correct, but let's ensure it exists
    if (!seedInt) seedInt = parseInt(seed, 10);
    const baseSeed = seedInt; // Store original date seed

    // 2. Generate Sudoku & Jigsaw (Base)
    console.log("   > Generating Sudoku & Jigsaw Layers...");

    let gameData;
    let attempts = 0;
    const MAX_AMBIGUITY_RETRIES = 500;

    // "El Permutador de Bloques" Loop
    while (true) {
      // Use suffix strategy: 20260126 -> 20260126000, 20260126001, etc.
      // This ensures strictly unique seeds for this date without touching tomorrow's seed
      if (attempts > 0) {
        seedInt = baseSeed * 1000 + attempts;
      } else {
        // First attempt tries the clean date seed (optional, but let's stick to the pattern)
        // or just start with * 1000.
        // Actually, if we change the seed format, we change the resulting puzzle for EVERYONE.
        // But since this is a new validation, it's fine.
        // Let's keep attempt 0 as the pure date seed for backward compat if it works?
        // No, "20260126" and "20260126000" are different numbers.
        // Let's just use the appended version for consistency if we want.
        // OR: keep logic: seedInt = (attempts === 0) ? baseSeed : (baseSeed * 1000 + attempts);
        seedInt = attempts === 0 ? baseSeed : baseSeed * 1000 + attempts;
      }

      gameData = generateDailyGame(seedInt);

      // Validate: Ensure no two blocks are identical (Visual Ambiguity)
      // We no longer check for "Block Swapping Ambiguity" because Stack Swaps are always valid in Sudoku.
      // Instead, we will enforce STRICT placement in the client (jigsaw.js).
      const blocks = [];
      for (let r = 0; r < 9; r += 3) {
        for (let c = 0; c < 9; c += 3) {
          // Extract 3x3 block
          const block = [];
          for (let i = 0; i < 3; i++) {
            block.push(gameData.solution[r + i].slice(c, c + 3));
          }
          blocks.push(JSON.stringify(block));
        }
      }

      if (new Set(blocks).size === 9) {
        // All blocks unique!
        if (attempts > 0) {
          console.log(
            `\n     ✅ Found visually unique puzzle after ${attempts} retries. Final Seed: ${seedInt}`,
          );
        }
        break;
      }

      attempts++;

      if (attempts % 10 === 0) process.stdout.write(".");

      if (attempts > MAX_AMBIGUITY_RETRIES) {
        throw new Error(
          `Could not find a unique block arrangement after ${MAX_AMBIGUITY_RETRIES} attempts.`,
        );
      }
    }
    if (attempts > 0 && attempts % 10 !== 0) console.log(""); // Newline cleanup

    // 3. Generate Peaks & Valleys (Base)
    console.log("   > Calculating Peaks & Valleys (Base)...");
    // We only need this to verify validity? No, we need to generate search sequences for each variation.

    // 4. PREPARE SYMMETRIC VARIATIONS
    // We need 4 variations:
    // 0: Identity (Base)
    // LR: Swap Left Stack (cols 0-2) with Right Stack (cols 6-8)
    // TB: Swap Top Band (rows 0-2) with Bottom Band (rows 6-8)
    // HV: Swap Both (Rotate 180 symmetric effectively for blocks, though not cells)

    // First: Select 3 RESERVED cells (Simon Values) from Base Solution
    // They must NOT be Peak or Valley in the BASE solution?
    // Actually, Peak/Valley status might change if we swap bands?
    // Wait. Peaks/Valleys are Local neighbor checks.
    // If we swap a whole stack of blocks 3x3:
    // The internal 3x3 relationships are preserved.
    // But the BORDERS between blocks change.
    // So Peak/Valley status might change at the edges.
    // Thus we must recalculate Peaks/Valleys for each variation.

    // Selecting Reserved Cells:
    // We want 3 random cells that are NOT peaks/valleys in ANY variation?
    // That's too restrictive.
    // Easier: Pick 3 cells. Calculate variations. IF any reserved cell becomes a peak/valley in any variation, RETRY picking reserved cells.
    // This ensures consistency.

    // 4. PREPARE SYMMETRIC VARIATIONS & GENERATE SEARCH
    // Strategy: "Target Values" (Unified Simon Numbers, Dynamic Coordinates)

    let attemptsGlobal = 0;
    const MAX_GLOBAL_ATTEMPTS = 50;
    let success = false;

    let finalVariations = {};
    let finalSimonValues = [];
    let finalSearchTargets = {};

    while (!success && attemptsGlobal < MAX_GLOBAL_ATTEMPTS) {
      attemptsGlobal++;
      process.stdout.write(`   > Global Attempt ${attemptsGlobal}: `);

      // 1. Define Boards
      let variations = {
        0: { board: JSON.parse(JSON.stringify(gameData.solution)) },
        LR: { board: swapStacks(gameData.solution) },
        TB: { board: swapBands(gameData.solution) },
        HV: { board: swapBands(swapStacks(gameData.solution)) },
      };

      // 2. Pre-calculate Peaks/Valleys constraints for ALL
      for (let key in variations) {
        const { targetMap } = getAllTargets(variations[key].board);
        variations[key].peaksValleys = targetMap;
      }

      // 3. Generate BASE ('0')
      const safeCellsBase = getSafeCells(
        variations["0"].board,
        variations["0"].peaksValleys,
      );
      if (safeCellsBase.length < 3) {
        process.stdout.write("Base Board too crowded. Retry.\r");
        continue;
      }

      const baseReserved = pickRandom(safeCellsBase, 3);
      const seedBase = seedInt + attemptsGlobal * 100;

      const resultBase = generateSearchSequences(
        variations["0"].board,
        seedBase,
        5000, // Fast timeout
        baseReserved,
      );

      if (!resultBase || resultBase.holes > 3) {
        process.stdout.write("Base Search failed. Retry.\r");
        continue;
      }

      // Base Success! Extract Values.
      const simonValues = baseReserved.map(
        (c) => variations["0"].board[c.r][c.c],
      );

      let currentBatchResults = {};
      currentBatchResults["0"] = {
        targets: resultBase.sequences,
        simon: baseReserved,
      };

      // 4. Generate OTHERS (LR, TB, HV) forcing same Values
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
          process.stdout.write(
            `Var [${key}] failed to match values [${simonValues}]. Retry Set.\r`,
          );
          allVariationsSuccess = false;
          break;
        }

        currentBatchResults[key] = {
          targets: resVar.sequences,
          simon: resVar.reserved,
        };
      }

      if (allVariationsSuccess) {
        console.log(
          `\n     ✅ SUCCESS! All variations valid. Simon Values: ${simonValues.join(", ")}`,
        );
        finalSearchTargets = currentBatchResults;
        finalSimonValues = simonValues;
        success = true;
      }
    }

    if (!success) {
      throw new Error(
        `CRITICAL: Could not find valid puzzle layout after ${MAX_GLOBAL_ATTEMPTS} attempts.`,
      );
    }

    // 5. Construct Final JSON Overlay
    const dailyPuzzle = {
      meta: {
        version: "2.5", // Target Values Strategy
        date: dateStr,
        seed: seedInt,
        generatedAt: new Date().toISOString(),
      },
      data: {
        solution: gameData.solution, // Original Board
        puzzle: gameData.puzzle,
        simonValues: finalSimonValues, // The logical numbers
        searchTargets: finalSearchTargets, // Map { "0": { targets: ..., simon: ... } }
      },
      chunks: gameData.chunks,
    };

    // --- HELPERS ---

    function generateConstrainedSoup(
      grid,
      peaksValleysMap,
      targetValues,
      seed,
    ) {
      // 1. Find candidates
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

      // 2. Try generation with orphan cleanup
      let attempts = 0;
      while (attempts < 20) {
        attempts++;
        const reserved = [
          pickRandom(candidatePools[0], 1)[0],
          pickRandom(candidatePools[1], 1)[0],
          pickRandom(candidatePools[2], 1)[0],
        ];

        const uniqueKeys = new Set(reserved.map((p) => `${p.r},${p.c}`));
        if (uniqueKeys.size < 3) continue;

        // A. FASTER TIMEOUT (800ms) - Fail fast to try more combinations
        const result = generateSearchSequences(
          grid,
          seed + attempts * 10,
          800,
          reserved,
        );

        if (!result) continue;

        // B. ORPHAN ABSORPTION STRATEGY
        // If result is "good enough" (holes <= 8), try to fix it.
        if (result.holes <= 8) {
          // Attempt to merge orphans
          absorbOrphans(result.sequences, grid, reserved, peaksValleysMap);

          // Verify perfection
          const realHoles = countHoles(
            result.sequences,
            reserved,
            peaksValleysMap,
          );

          if (realHoles === 0) {
            return {
              success: true,
              sequences: result.sequences,
              reserved: reserved,
            };
          }
        }
      }
      return { success: false };
    }

    // --- NUEVO HELPER PARA LIMPIEZA ---
    function absorbOrphans(sequences, grid, reservedArr, topographyMap) {
      const reservedSet = new Set(reservedArr.map((p) => `${p.r},${p.c}`));

      let changed = true;
      while (changed) {
        changed = false;
        const orphans = [];

        // 1. Find Orphans
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const key = `${r},${c}`;
            // Re-check usage dynamically (expensive but safe)
            const isUsed = sequences.some((seq) =>
              seq.some((s) => s.r === r && s.c === c),
            );
            const isWall = topographyMap.has(key);
            const isReserved = reservedSet.has(key);

            if (!isUsed && !isWall && !isReserved) {
              orphans.push({ r, c });
            }
          }
        }

        if (orphans.length === 0) return true; // Clean!

        // 2. Merge Orphans
        for (let orphan of orphans) {
          for (let seq of sequences) {
            // Check Head
            const head = seq[0];
            if (
              Math.abs(head.r - orphan.r) + Math.abs(head.c - orphan.c) ===
              1
            ) {
              seq.unshift(orphan);
              changed = true;
              break;
            }
            // Check Tail
            const tail = seq[seq.length - 1];
            if (
              Math.abs(tail.r - orphan.r) + Math.abs(tail.c - orphan.c) ===
              1
            ) {
              seq.push(orphan);
              changed = true;
              break;
            }
          }
          if (changed) break; // Restart scan after modification
        }
      }
      return false;
    }

    function countHoles(sequences, reserved, pvMap) {
      let usedCount = 0;
      sequences.forEach((s) => (usedCount += s.length));
      let wallCount = pvMap.size;
      let reservedCount = 3; // Fixed for Simon
      let totalCells = 81;
      // Holes = Total - (Used + Walls + Reserved)
      return totalCells - (usedCount + wallCount + reservedCount);
    }

    function getSafeCells(grid, pvMap) {
      let cells = [];
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (!pvMap.has(`${r},${c}`)) cells.push({ r, c });
      return cells;
    }

    function pickRandom(arr, n) {
      const shuffled = [...arr].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, n);
    }

    // Helper Functions for Transposition
    function swapStacks(board) {
      // Swap ColStack 0 (0-2) and ColStack 2 (6-8)
      const newBoard = board.map((row) => [...row]);
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 3; c++) {
          const temp = newBoard[r][c];
          newBoard[r][c] = newBoard[r][c + 6];
          newBoard[r][c + 6] = temp;
        }
      }
      return newBoard;
    }

    function swapBands(board) {
      // Swap RowBand 0 (0-2) and RowBand 2 (6-8)
      const newBoard = board.map((row) => [...row]);
      // Swap rows 0,1,2 with 6,7,8
      for (let offset = 0; offset < 3; offset++) {
        const tempRow = newBoard[offset];
        newBoard[offset] = newBoard[offset + 6];
        newBoard[offset + 6] = tempRow;
      }
      return newBoard;
    }

    function mapCoordinates(coords, mode) {
      return coords.map((p) => {
        let r = p.r;
        let c = p.c;
        // Apply LR
        if (mode === "LR" || mode === "HV") {
          if (c < 3) c += 6;
          else if (c >= 6) c -= 6;
        }
        // Apply TB
        if (mode === "TB" || mode === "HV") {
          if (r < 3) r += 6;
          else if (r >= 6) r -= 6;
        }
        return { r, c };
      });
    }

    // 6. Save to File
    const filename = `daily-${dateStr}.json`;
    const filePath = path.join(PUZZLES_DIR, filename);

    fs.writeFileSync(filePath, JSON.stringify(dailyPuzzle, null, 2));
    console.log(`✅ Success! Puzzle saved to: ${filePath}`);
  } catch (error) {
    console.error("❌ Fatal Error during generation:", error);
    process.exit(1);
  }
}

// Run
generateDailyPuzzle();
