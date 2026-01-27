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
    dateStr = "custom-" + seed;
    console.log(`🔧 Custom Seed: ${seed}`);
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

      // Validar Permutaciones
      if (checkBlockAmbiguity(gameData.solution)) {
        if (attempts > 0) {
          console.log(
            `\n     ✅ Found unique puzzle after ${attempts} retries. Final Seed: ${seedInt}`,
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

    // 3. Generate Peaks & Valleys
    console.log("   > Calculating Peaks & Valleys...");
    const { targetMap, peakCount, valleyCount } = getAllTargets(
      gameData.solution,
    );

    // 4. Generate Search Sequences (The Heavy Calculation)
    console.log("   > Generating Search Sequences (timeout: 60s)...");
    // We use a longer timeout for server generation to ensure perfection
    const searchSequences = generateSearchSequences(
      gameData.solution,
      seedInt,
      60000,
    );

    if (!searchSequences || searchSequences.length === 0) {
      throw new Error("Failed to generate valid search sequences.");
    }

    console.log(`     -> Found ${searchSequences.length} sequences.`);

    // 5. Construct Final JSON Overlay
    const dailyPuzzle = {
      meta: {
        version: "1.0",
        date: dateStr,
        seed: seedInt,
        generatedAt: new Date().toISOString(),
      },
      data: {
        // We store the 'solution' and 'puzzle' (holes)
        // The client can reconstruct 'chunks' from 'puzzle' logic if needed,
        // OR we can save everything to be purely static and fast.
        // Saving everything is safer for 'Static' philosophy.
        solution: gameData.solution,
        puzzle: gameData.puzzle,
        chunks: gameData.chunks,
        searchTargets: searchSequences,
      },
    };

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
