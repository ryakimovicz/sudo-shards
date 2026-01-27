import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Import Logic Modules
import { generateDailyGame } from "../js/sudoku-logic.js";
import { getAllTargets } from "../js/peaks-logic.js";

// Setup Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUZZLES_DIR = path.join(__dirname, "../public/puzzles");

if (!fs.existsSync(PUZZLES_DIR)) {
  fs.mkdirSync(PUZZLES_DIR, { recursive: true });
}

async function generateDailyPuzzle() {
  console.log(
    "🧩 Starting Daily Puzzle Generation (Clean Board + Heuristic Greedy)...",
  );

  let seed = process.argv[2];
  let dateStr = "";
  let seedInt;

  // Fecha y Semilla
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
  } else {
    if (/^\d{8}$/.test(seed)) {
      const y = seed.substring(0, 4);
      const m = seed.substring(4, 6);
      const d = seed.substring(6, 8);
      dateStr = `${y}-${m}-${d}`;
    } else {
      dateStr = "custom-" + seed;
    }
    seedInt = parseInt(seed, 10) || 12345;
  }
  console.log(`🔧 Target Date: ${dateStr}, Seed: ${seed}`);

  try {
    const baseSeed = seedInt;
    let attemptsGlobal = 0;
    let success = false;

    let finalGameData = null;
    let finalSearchTargets = {};
    let finalSimonValues = [];

    // --- BUCLE PRINCIPAL (More attempts, faster greedy) ---
    while (!success && attemptsGlobal < 5000) {
      attemptsGlobal++;
      const currentSeed = baseSeed * 1000 + attemptsGlobal;

      // 1. Generar Sudoku
      let gameData = generateDailyGame(currentSeed);

      // Print progress every 10 attempts to reduce noise
      if (attemptsGlobal % 10 === 1)
        process.stdout.write(`   > Attempt ${attemptsGlobal}: `);

      // 2. Definir Variantes
      let variations = {
        0: { board: JSON.parse(JSON.stringify(gameData.solution)) },
        LR: { board: swapStacks(gameData.solution) },
        TB: { board: swapBands(gameData.solution) },
        HV: { board: swapBands(swapStacks(gameData.solution)) },
      };

      let validTopology = true;
      let allCandidates = [];
      let globalForcedValues = new Set();

      // 3. Procesar cada variante
      for (let key in variations) {
        const { targetMap } = getAllTargets(variations[key].board);
        variations[key].peaksValleys = targetMap;

        // B. Generar Cobertura "Smart Greedy" (Heuristic to min islands)
        const rawPaths = generateSmartGreedyCoverage(
          variations[key].board,
          variations[key].peaksValleys,
        );

        // C. Verificar Islas PRE-Segmentation (Islas naturales)
        let islands = getIslands(rawPaths, variations[key].peaksValleys);

        // D. Segmentation (Captura orphans)
        const { snakes, orphans } = segmentPathsSmart(
          rawPaths,
          variations[key].board,
          variations[key].peaksValleys,
        );
        variations[key].snakes = snakes;

        // Add Orphans to Islands
        islands = [...islands, ...orphans];
        variations[key].islands = islands;

        // Check Count (Strict: > 3 fail)
        if (islands.length > 3) {
          if (attemptsGlobal % 10 === 1)
            process.stdout.write(
              `Too many islands in [${key}] (${islands.length}).\r`,
            );
          validTopology = false;
          break;
        }

        // --- NEW: PRE-CHECK ISLAND ADJACENCY ---
        if (hasAdjacency(islands)) {
          if (attemptsGlobal % 10 === 1)
            process.stdout.write(`Adjacent Islands in [${key}]. Next.\r`);
          validTopology = false;
          break;
        }

        // Track Forced
        islands.forEach((isl) =>
          globalForcedValues.add(variations[key].board[isl.r][isl.c]),
        );

        // E. Unique Analysis
        const uniqueSnakes = identifyUniqueSnakes(
          snakes,
          variations[key].board,
          variations[key].peaksValleys,
        );
        variations[key].uniqueSnakes = uniqueSnakes;

        // F. Candidates
        const candidates = new Set();
        islands.forEach((isl) =>
          candidates.add(variations[key].board[isl.r][isl.c]),
        );
        uniqueSnakes.forEach((snake) => {
          candidates.add(variations[key].board[snake[0].r][snake[0].c]);
          candidates.add(
            variations[key].board[snake[snake.length - 1].r][
              snake[snake.length - 1].c
            ],
          );
        });

        variations[key].candidates = candidates;
        allCandidates.push(candidates);
      }

      if (!validTopology) continue;

      // --- STRICT CHECK: FORCED VALUES ---
      if (globalForcedValues.size > 3) {
        // Too many diff islands
        continue;
      }

      let forcedCompatible = true;
      for (let forced of globalForcedValues) {
        for (let candidates of allCandidates) {
          if (!candidates.has(forced)) {
            forcedCompatible = false;
            break;
          }
        }
        if (!forcedCompatible) break;
      }
      if (!forcedCompatible) continue;

      // 4. Buscar Intersección
      let commonValues = [...allCandidates[0]];
      for (let i = 1; i < allCandidates.length; i++) {
        commonValues = commonValues.filter((val) => allCandidates[i].has(val));
      }

      // Build Targets
      let targets = Array.from(globalForcedValues);
      let slotsNeeded = 3 - targets.length;
      let potentialFillers = commonValues.filter(
        (v) => !globalForcedValues.has(v),
      );

      if (potentialFillers.length < slotsNeeded) {
        continue;
      }

      let fillers = potentialFillers
        .sort(() => 0.5 - Math.random())
        .slice(0, slotsNeeded);
      let finalTargets = [...targets, ...fillers];

      console.log(
        `\n     💎 Match! Targets: [${finalTargets.join(", ")}] (Forced: [${targets.join(", ")}])`,
      );

      let tempSearchTargets = {};
      let carvingSuccess = true;

      for (let key in variations) {
        const res = applyCarving(
          variations[key].snakes,
          variations[key].islands,
          variations[key].board,
          finalTargets,
        );

        if (!res.success) {
          console.error("Carve failed (topology).");
          carvingSuccess = false;
          break;
        }

        // --- NEW: ADJACENCY CHECK ---
        if (hasAdjacency(res.simonCoords)) {
          // console.error("Adjacency in free cells detected. Retry.");
          carvingSuccess = false;
          break;
        }

        tempSearchTargets[key] = {
          targets: res.snakes,
          simon: res.simonCoords,
        };
      }

      if (carvingSuccess) {
        finalSearchTargets = tempSearchTargets;
        finalSimonValues = finalTargets;
        finalGameData = gameData;
        success = true;
      }
    }

    if (!success)
      throw new Error("Could not generate valid puzzle after 5000 attempts.");

    // --- SAVE ---
    const dailyPuzzle = {
      meta: { version: "4.8-adjacency", date: dateStr, seed: seedInt },
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

// ==========================================
// 🧠 LOGIC: SMART GREEDY PATH GENERATOR
// ==========================================
// Heuristic: Prefer moves that visit "hard to reach" neighbors (low degree),
// effectively prioritizing tidying up corners/edges first.
function generateSmartGreedyCoverage(grid, pvMap) {
  let visited = Array(9)
    .fill()
    .map(() => Array(9).fill(false));
  let unvisitedCount = 81 - pvMap.size;

  // Mark walls
  pvMap.forEach((_, key) => {
    const [r, c] = key.split(",").map(Number);
    visited[r][c] = true;
  });

  let paths = [];

  // Helper: Count unvisited neighbors of a cell
  const countOpenNeighbors = (r, c) => {
    let count = 0;
    [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ].forEach((d) => {
      const nr = r + d[0],
        nc = c + d[1];
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && !visited[nr][nc]) count++;
    });
    return count;
  };

  while (unvisitedCount > 0) {
    // Find best start: Cell with FEWEST open neighbors (prioritize stranded cells)
    let candidates = [];
    let minDegree = 5;

    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        if (!visited[r][c]) {
          const degree = countOpenNeighbors(r, c);
          if (degree < minDegree) {
            minDegree = degree;
            candidates = [{ r, c }];
          } else if (degree === minDegree) {
            candidates.push({ r, c });
          }
        }
      }

    if (candidates.length === 0) break;

    // Pick random from best candidates
    let start = candidates[Math.floor(Math.random() * candidates.length)];
    let currentPath = [start];
    visited[start.r][start.c] = true;
    unvisitedCount--;

    let curr = start;
    let stuck = false;

    while (!stuck) {
      // Find valid moves
      let moves = [];
      [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ].forEach((d) => {
        const nr = curr.r + d[0],
          nc = curr.c + d[1];
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && !visited[nr][nc]) {
          // Heuristic Score:
          // We want to move to a neighbor that is "in danger" of being isolated.
          // Score = neighbors of (nr, nc) AFTER I move there.
          // Lower score is better (visit the guy who has no other options first).
          moves.push({ r: nr, c: nc });
        }
      });

      if (moves.length === 0) {
        stuck = true;
        break;
      }

      // Evaluate moves
      moves.sort((a, b) => {
        // Temporarily mark visited to calc degree? No, simple degree is fine.
        // Degree of neighbor node
        const da = countOpenNeighbors(a.r, a.c);
        const db = countOpenNeighbors(b.r, b.c);
        return da - db || Math.random() - 0.5; // Min degree first, then random
      });

      // Pick best
      // Sometimes picking strictly best leads to snake trap.
      // But let's try strict best first (Greedy Warnsdorff's rule).
      // Actually, for Hamilton paths Warnsdorff is good.

      const nextNode = moves[0];
      visited[nextNode.r][nextNode.c] = true;
      currentPath.push(nextNode);
      curr = nextNode;
      unvisitedCount--;
    }
    paths.push(currentPath);
  }
  return paths;
}

// ==========================================
// 🪚 LOGIC: SMART SEGMENTATION ({snakes, orphans})
// ==========================================
function segmentPathsSmart(rawPaths, grid, pvMap) {
  let finalSnakes = [];
  let orphans = [];

  for (let path of rawPaths) {
    let remaining = [...path];
    while (remaining.length > 0) {
      const len = remaining.length;
      if (len <= 6) {
        if (len >= 3) {
          finalSnakes.push(remaining);
        } else {
          orphans.push(...remaining);
        }
        break;
      }
      // Smart uniqueness
      let bestCut = -1;
      for (let cut = 6; cut >= 3; cut--) {
        let remSize = len - cut;
        if (remSize > 0 && remSize < 3) continue;
        const candidateChunk = remaining.slice(0, cut);
        const seqValues = candidateChunk.map((p) => grid[p.r][p.c]);
        if (countOccurrences(grid, pvMap, seqValues) === 1) {
          bestCut = cut;
          break;
        }
      }
      // Fallback
      if (bestCut === -1) {
        let cut = 6;
        while (cut >= 3) {
          if (len - cut === 0 || len - cut >= 3) break;
          cut--;
        }
        if (cut < 3) cut = 3;
        bestCut = cut;
      }
      finalSnakes.push(remaining.slice(0, bestCut));
      remaining = remaining.slice(bestCut);
    }
  }
  return { snakes: finalSnakes, orphans };
}

function identifyUniqueSnakes(snakes, grid, pvMap) {
  let uniqueOnes = [];
  for (let snake of snakes) {
    const seqValues = snake.map((p) => grid[p.r][p.c]);
    if (countOccurrences(grid, pvMap, seqValues) === 1) {
      uniqueOnes.push(snake);
    }
  }
  return uniqueOnes;
}

function countOccurrences(grid, pvMap, targetSeq) {
  let count = 0;
  const startVal = targetSeq[0];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (pvMap.has(`${r},${c}`)) continue;
      if (grid[r][c] === startVal) {
        count += searchPath(
          grid,
          pvMap,
          r,
          c,
          targetSeq,
          1,
          new Set([`${r},${c}`]),
        );
        if (count > 1) return count;
      }
    }
  }
  return count;
}

function searchPath(grid, pvMap, r, c, targetSeq, index, visited) {
  if (index >= targetSeq.length) return 1;
  let found = 0;
  const nextVal = targetSeq[index];
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  for (let d of dirs) {
    const nr = r + d[0];
    const nc = c + d[1];
    const key = `${nr},${nc}`;
    if (
      nr >= 0 &&
      nr < 9 &&
      nc >= 0 &&
      nc < 9 &&
      !pvMap.has(key) &&
      !visited.has(key) &&
      grid[nr][nc] === nextVal
    ) {
      const newVisited = new Set(visited);
      newVisited.add(key);
      found += searchPath(
        grid,
        pvMap,
        nr,
        nc,
        targetSeq,
        index + 1,
        newVisited,
      );
      if (found > 1) return found;
    }
  }
  return found;
}

function applyCarving(snakes, islands, grid, targets) {
  let finalSnakes = JSON.parse(JSON.stringify(snakes));
  let simonCoords = islands.map((i) => ({ r: i.r, c: i.c }));

  let satisfiedValues = new Set(simonCoords.map((p) => grid[p.r][p.c]));
  let toCarve = targets.filter((t) => !satisfiedValues.has(t));

  for (let val of toCarve) {
    let carved = false;
    for (let i = 0; i < finalSnakes.length; i++) {
      let s = finalSnakes[i];

      if (grid[s[0].r][s[0].c] === val) {
        if (s.length > 3) {
          simonCoords.push(s.shift());
          carved = true;
          break;
        }
      }
      let tailIdx = s.length - 1;
      if (grid[s[tailIdx].r][s[tailIdx].c] === val) {
        if (s.length > 3) {
          simonCoords.push(s.pop());
          carved = true;
          break;
        }
      }
    }
    if (!carved) return { success: false };
  }
  return { success: true, snakes: finalSnakes, simonCoords };
}

function getIslands(paths, pvMap) {
  let visitedCount = paths.reduce((acc, p) => acc + p.length, 0);
  let wallCount = pvMap.size;
  let expected = 81;
  let islands = [];
  if (visitedCount + wallCount < expected) {
    let visitedMap = new Set();
    paths.flat().forEach((p) => visitedMap.add(`${p.r},${p.c}`));
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        if (!pvMap.has(`${r},${c}`) && !visitedMap.has(`${r},${c}`)) {
          islands.push({ r, c });
        }
      }
  }
  return islands;
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

function hasAdjacency(coords) {
  if (coords.length < 2) return false;
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      const di = Math.abs(coords[i].r - coords[j].r);
      const dj = Math.abs(coords[i].c - coords[j].c);
      // Orthogonal adjacency: distance is 1 (sum of diffs is 1)
      // Diagonal adjacency: r diff 1, c diff 1 (sum is 2, diffs non-zero)
      // User probably means Orthogonal. Or ANY touch?
      // "Adyacentes" usually includes diagonals in Minesweeper but only orthogonal in Crosswords.
      // Let's assume ANY touch (Orthogonal + Diagonal) to be safe for "visually separate".
      // So if max(dr, dc) == 1 => adjacent.

      if (di <= 1 && dj <= 1) return true;
    }
  }
  return false;
}

generateDailyPuzzle();
