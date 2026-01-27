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

    let variations = {};
    let simonValues = [];
    let simonCoordsBase = [];
    let validVariationsFound = false;
    let variationAttempts = 0;

    while (!validVariationsFound && variationAttempts < 100) {
      variationAttempts++;
      variations = {
        0: { board: JSON.parse(JSON.stringify(gameData.solution)) },
        LR: { board: swapStacks(gameData.solution) },
        TB: { board: swapBands(gameData.solution) },
        HV: { board: swapBands(swapStacks(gameData.solution)) },
      };

      // 4a. Pick 3 Random Cells
      // Just pick random r,c. Check constraints later.
      simonCoordsBase = [];
      const usedIndices = new Set();
      while (simonCoordsBase.length < 3) {
        const r = Math.floor(Math.random() * 9);
        const c = Math.floor(Math.random() * 9);
        const key = `${r},${c}`;
        if (!usedIndices.has(key)) {
          usedIndices.add(key);
          simonCoordsBase.push({ r, c });
        }
      }

      simonValues = simonCoordsBase.map((p) => gameData.solution[p.r][p.c]);

      // 4b. Validate against all variations
      let clean = true;
      for (const [key, varData] of Object.entries(variations)) {
        // Map Coords
        varData.simonCoords = mapCoordinates(simonCoordsBase, key);
        // Calculate Peaks/Valleys
        const { targetMap } = getAllTargets(varData.board);
        varData.peaksValleys = targetMap; // We likely don't need the full map, just check function

        // Check if reserved cells land on a Peak/Valley
        for (const coord of varData.simonCoords) {
          // We can check local neighbors for P/V status
          // Or rely on search generator to respect reserved
          // But search gen assumes Reserved are NOT P/V.
          // If a reserved cell IS a P/V, we have a conflict (P/V must be distinct).
          // Actually Search Gen says: "Available = NOT P/V AND NOT Reserved".
          // So if a Reserved cell IS a P/V, it's fine, it just is excluded twice.
          // BUT user wants "Unused numbers" -> "Neither Peak, Valley nor Path".
          // If a reserved cell turns out to be a Peak, then it's used as a Peak.
          // So it CANNOT be a reserved "Simon" number (which implies 'Empty' at end of Search stage).
          // So yes: Reserved cells MUST NOT BE Peak/Valley in their current board state.

          // Simple check: Is it P/V?
          // Since we don't expose isPeakOrValley from here easily, we use the fact that getAllTargets returns all P/V.
          // targetMap is Map<"r,c", type>
          if (targetMap.has(`${coord.r},${coord.c}`)) {
            clean = false;
            break;
          }
        }
        if (!clean) break;
      }

      if (clean) validVariationsFound = true;
    }

    if (!validVariationsFound) {
      throw new Error(
        "Could not find valid Simon Cells distinct from Peaks/Valleys in all variations.",
      );
    }

    console.log(`   > Reserved Simon Values: ${simonValues.join(", ")}`);

    // 5. Generate Search Sequences for each Variation
    const allSearchTargets = {};

    for (const [key, varData] of Object.entries(variations)) {
      console.log(`     -> Generating sequences for Variation [${key}]...`);
      const result = generateSearchSequences(
        varData.board,
        seedInt + key.length, // Slight seed variance? No, preserve determinism best we can. Use same seed?
        // If we use same seed, RNG is same, but board is different. That is good.
        seedInt,
        60000,
        varData.simonCoords, // Pass Reserved Cells
      );

      if (!result || result.length === 0) {
        throw new Error(`Failed sequence generation for var ${key}`);
      }
      allSearchTargets[key] = {
        targets: result,
        simon: varData.simonCoords, // Save coords for client convenience
      };
    }

    // 5. Construct Final JSON Overlay
    const dailyPuzzle = {
      meta: {
        version: "2.0", // Bump version
        date: dateStr,
        seed: seedInt,
        generatedAt: new Date().toISOString(),
      },
      data: {
        solution: gameData.solution, // Original Board
        puzzle: gameData.puzzle,
        simonValues: simonValues, // The logical numbers
        searchTargets: allSearchTargets, // Map { "0": {...}, "LR": {...} ... }
      },
    };

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
