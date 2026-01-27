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
  console.log("🔍 STARTING DIAGNOSTIC MODE...");

  let seed = process.argv[2] || "20260127";
  let seedInt = parseInt(seed, 10);
  console.log(`🔧 Seed: ${seedInt}`);

  try {
    const baseSeed = seedInt;
    let attemptsGlobal = 0;
    let success = false;

    // --- MAIN LOOP ---
    while (!success && attemptsGlobal < 5) {
      // Bajamos a 5 intentos para no spamear el log
      attemptsGlobal++;
      const currentSeed = baseSeed * 1000 + attemptsGlobal;

      console.log(`\n------------------------------------------------`);
      console.log(`▶️ ATTEMPT ${attemptsGlobal} (Seed: ${currentSeed})`);

      let gameData = generateDailyGame(currentSeed);

      let variations = {
        0: { board: JSON.parse(JSON.stringify(gameData.solution)) },
      };

      // SOLO PROBAMOS VARIANTE 0 PARA AISLAR EL ERROR
      let key = "0";
      console.log(`   [Topology] Analyzing Variant 0...`);

      const { targetMap } = getAllTargets(variations[key].board);
      variations[key].peaksValleys = targetMap;

      const islands = getIslands(variations[key].peaksValleys);
      console.log(`   [Islands] Found ${islands.length} forced islands.`);
      variations[key].islands = islands;

      console.log(`   [Fill] Generating Full Cover...`);

      // Llamada con LOGS ACTIVADOS
      const fillResult = generateFullCoverDebug(
        variations[key].board,
        variations[key].peaksValleys,
        islands,
        currentSeed + 100,
      );

      if (!fillResult.success) {
        console.log(`❌ Fill Failed.`);
        continue;
      }

      console.log(`✅ Fill SUCCESS!`);
      success = true; // Si llegamos acá, funciona
    }
  } catch (error) {
    console.error("❌ Fatal Error:", error);
  }
}

// --- DEBUG VERSION OF GENERATE FULL COVER ---
function generateFullCoverDebug(grid, pvMap, reserved, seed) {
  const result = generateSearchSequences(grid, seed, 1000, reserved);

  if (!result) {
    console.log(`      ⚠️ generateSearchSequences returned NULL.`);
    return { success: false };
  }

  const allowedHoles = reserved.length + 45;
  console.log(
    `      📊 Initial Generation: ${result.holes} holes (Max allowed: ${allowedHoles})`,
  );

  if (result.holes > allowedHoles) {
    console.log(`      ❌ Too many initial holes. Rejecting.`);
    return { success: false };
  }

  console.log(`      🧹 Starting Cleanup (absorbOrphans)...`);
  absorbOrphansDebug(result.sequences, grid, reserved, pvMap);

  const finalHoles = countHoles(result.sequences, reserved.length, pvMap);
  console.log(`      🏁 Final Holes after cleanup: ${finalHoles} (Target: 0)`);

  if (finalHoles === 0) return { success: true, sequences: result.sequences };
  return { success: false };
}

// --- DEBUG VERSION OF ABSORB ORPHANS ---
function absorbOrphansDebug(sequences, grid, reservedArr, topographyMap) {
  const reservedSet = new Set(reservedArr.map((p) => `${p.r},${p.c}`));
  let changed = true;
  let iterations = 0;

  while (changed) {
    changed = false;
    iterations++;
    const orphans = [];

    // Scan for orphans
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

    if (orphans.length === 0) {
      console.log(`         ✨ Iteration ${iterations}: No orphans left!`);
      return true;
    }

    // console.log(`         Iteration ${iterations}: Found ${orphans.length} orphans.`);

    // Try Merge
    let mergedCount = 0;
    for (let i = 0; i < orphans.length; i++) {
      let orphan = orphans[i];
      if (!orphan) continue;
      for (let seq of sequences) {
        if (dist(seq[0], orphan) === 1) {
          seq.unshift(orphan);
          orphans[i] = null;
          changed = true;
          mergedCount++;
          break;
        }
        if (dist(seq[seq.length - 1], orphan) === 1) {
          seq.push(orphan);
          orphans[i] = null;
          changed = true;
          mergedCount++;
          break;
        }
      }
    }

    // New Snakes
    let newSnakeCount = 0;
    const rem = orphans.filter((o) => o !== null);
    if (!changed && rem.length >= 2) {
      for (let i = 0; i < rem.length; i++) {
        for (let j = i + 1; j < rem.length; j++) {
          if (dist(rem[i], rem[j]) === 1) {
            sequences.push([rem[i], rem[j]]);
            changed = true;
            newSnakeCount++;
            break;
          }
        }
        if (changed) break;
      }
    }

    // Si no hubo cambios en esta pasada, imprimimos por qué
    if (!changed) {
      console.log(
        `         💀 Stuck at Iteration ${iterations}. ${rem.length} orphans remaining.`,
      );
      rem.forEach((o) => {
        // Analizar vecinos para ver por qué está atascado
        let neighbors = [];
        [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ].forEach((d) => {
          let nr = o.r + d[0],
            nc = o.c + d[1];
          if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
            let type = "Empty";
            if (topographyMap.has(`${nr},${nc}`)) type = "Wall";
            else if (reservedSet.has(`${nr},${nc}`)) type = "Island";
            else if (
              sequences.some((s) => s.some((p) => p.r === nr && p.c === nc))
            )
              type = "SnakeBody";
            neighbors.push(type);
          } else neighbors.push("Edge");
        });
        console.log(
          `            - Orphan at [${o.r},${o.c}] is trapped by: ${neighbors.join(", ")}`,
        );
      });
    }
  }
  return false;
}

// --- HELPERS ---
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
function dist(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}
function countHoles(sequences, reservedCount, pvMap) {
  let used = sequences.reduce((acc, s) => acc + s.length, 0);
  return 81 - (used + pvMap.size + reservedCount);
}

generateDailyPuzzle();
