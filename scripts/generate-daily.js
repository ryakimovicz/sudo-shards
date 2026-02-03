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

// CACHÉ GLOBAL DE UNICIDAD
let uniquenessCache = new Map();

async function generateDailyPuzzle() {
  console.log(
    "🧩 Starting Daily Puzzle Generation (Survivor Greedy + Cleanup)...",
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
    let finalCodeSequence = [];

    // --- BUCLE PRINCIPAL ---
    while (!success) {
      attemptsGlobal++;
      const currentSeed = baseSeed * 10000000 + attemptsGlobal;

      // Generador aleatorio determinista
      let localSeed = currentSeed;
      const nextRnd = () => {
        localSeed = (localSeed * 9301 + 49297) % 233280;
        return localSeed / 233280;
      };

      // 1. Generar Sudoku
      // Calcular día de la semana para la dificultad (0=Domingo, 6=Sábado)
      const [y, m, d] = dateStr.split("-").map(Number);
      const targetDate = new Date(y, m - 1, d);
      const dayIndex = targetDate.getDay();

      let gameData = generateDailyGame(currentSeed, dayIndex);

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

      // LIMPIAR CACHÉ
      uniquenessCache.clear();

      // 3. Procesar cada variante
      for (let key in variations) {
        const { targetMap } = getAllTargets(variations[key].board);
        variations[key].peaksValleys = targetMap;

        // B. Generar Cobertura "Survivor Greedy"
        const rawPaths = generateSurvivorGreedyCoverage(
          variations[key].board,
          variations[key].peaksValleys,
          nextRnd,
        );

        // C. Segmentation Inteligente
        let { snakes, orphans } = segmentPathsSmart(
          rawPaths,
          variations[key].board,
          variations[key].peaksValleys,
        );

        // Islas naturales (aisladas por paredes)
        let naturalIslands = getIslands(rawPaths, variations[key].peaksValleys);
        let totalIslands = [...naturalIslands, ...orphans];

        // Deduplicar islas
        let uniqueIslandCoords = new Set();
        let pendingIslands = [];
        totalIslands.forEach((isl) => {
          let k = `${isl.r},${isl.c}`;
          if (!uniqueIslandCoords.has(k)) {
            uniqueIslandCoords.add(k);
            pendingIslands.push(isl);
          }
        });

        // D. CLEANUP PHASE (El cambio clave)
        // Intentar pegar las islas a las víboras existentes
        const cleanupResult = cleanupIslands(
          pendingIslands,
          snakes,
          variations[key].board,
          variations[key].peaksValleys,
        );

        variations[key].snakes = cleanupResult.snakes;
        let finalIslands = cleanupResult.islands;

        variations[key].islands = finalIslands;

        // REGLA: Máximo 4 celdas libres
        if (finalIslands.length > 4) {
          if (attemptsGlobal % 10 === 1)
            process.stdout.write(
              `Too many islands in [${key}] (${finalIslands.length}).\r`,
            );
          validTopology = false;
          break;
        }

        // REGLA: Valores de islas únicos (no duplicados)
        const islandValSet = new Set(
          finalIslands.map((i) => variations[key].board[i.r][i.c]),
        );
        if (islandValSet.size < finalIslands.length) {
          if (attemptsGlobal % 10 === 1)
            process.stdout.write(
              `Duplicate Island Values in [${key}]. Next.\r`,
            );
          validTopology = false;
          break;
        }

        // --- CHEQUEO DE ADYACENCIA ---
        if (hasAdjacency(finalIslands)) {
          if (attemptsGlobal % 10 === 1)
            process.stdout.write(`Adjacent Islands in [${key}]. Next.\r`);
          validTopology = false;
          break;
        }

        // Guardar valores forzados
        finalIslands.forEach((isl) =>
          globalForcedValues.add(variations[key].board[isl.r][isl.c]),
        );

        // E. Candidates
        const candidates = new Set();
        finalIslands.forEach((isl) =>
          candidates.add(variations[key].board[isl.r][isl.c]),
        );
        variations[key].snakes.forEach((snake) => {
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

      // --- CHEQUEO: VALORES FORZADOS COMPATIBLES ---
      if (globalForcedValues.size > 4) {
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

      let targets = Array.from(globalForcedValues);
      let slotsNeeded = 4 - targets.length;
      let potentialFillers = commonValues.filter(
        (v) => !globalForcedValues.has(v),
      );

      if (potentialFillers.length < slotsNeeded) {
        continue;
      }

      let fillers = [...potentialFillers];
      for (let i = fillers.length - 1; i > 0; i--) {
        const j = Math.floor(nextRnd() * (i + 1));
        [fillers[i], fillers[j]] = [fillers[j], fillers[i]];
      }
      fillers = fillers.slice(0, slotsNeeded);

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
          console.error("Carve failed (topology or value mismatch).");
          carvingSuccess = false;
          break;
        }

        if (hasAdjacency(res.simonCoords)) {
          console.log(`     ❌ Carve failed: Adjacency detected in [${key}].`);
          carvingSuccess = false;
          break;
        }

        if (res.simonCoords.length !== 4) {
          if (attemptsGlobal % 10 === 1)
            process.stdout.write(
              `Carve result bad length (${res.simonCoords.length}) in [${key}].\r`,
            );
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
        finalCodeSequence = generateCodeSequence(finalTargets, nextRnd);
        success = true;
      }
    }

    // --- SAVE ---
    const dailyPuzzle = {
      meta: { version: "5.8-seed-fix", date: dateStr, seed: seedInt },
      data: {
        solution: finalGameData.solution,
        puzzle: finalGameData.puzzle,
        simonValues: finalSimonValues,
        codeSequence: finalCodeSequence,
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
// 🔐 LOGIC: CODE SEQUENCE GENERATION
// ==========================================
function generateCodeSequence(simonValues, rnd) {
  // Goal: Length 7. Length start at 3, end at 7.
  // Constraint: Must use ALL 4 simonValues at least once.
  // simonValues has 4 numbers.

  // 1. Start with the mandatory 4 values
  let pool = [...simonValues];

  // 2. Add 3 more randoms from simonValues to reach 7
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(rnd() * simonValues.length);
    pool.push(simonValues[idx]);
  }

  // 3. Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool;
}

// ==========================================
// 🧹 LOGIC: CLEANUP ISLANDS (MERGE ORPHANS)
// ==========================================
function cleanupIslands(islands, snakes, grid, pvMap) {
  let currentIslands = [...islands];
  let currentSnakes = [...snakes];
  let changed = true;

  // Repeat until no more merges can be made
  while (changed) {
    changed = false;
    let nextIslands = [];

    for (let island of currentIslands) {
      let merged = false;

      // Try to merge this island into ANY existing snake
      for (let i = 0; i < currentSnakes.length; i++) {
        let snake = currentSnakes[i];
        if (snake.length >= 9) continue; // Snake too long (max 9 usually)

        // Try Head
        if (dist(snake[0], island) === 1) {
          let newSnake = [island, ...snake];
          const seqValues = newSnake.map((p) => grid[p.r][p.c]);
          if (countOccurrences(grid, pvMap, seqValues) === 1) {
            currentSnakes[i] = newSnake;
            merged = true;
            changed = true;
            break;
          }
        }

        // Try Tail
        if (dist(snake[snake.length - 1], island) === 1) {
          let newSnake = [...snake, island];
          const seqValues = newSnake.map((p) => grid[p.r][p.c]);
          if (countOccurrences(grid, pvMap, seqValues) === 1) {
            currentSnakes[i] = newSnake;
            merged = true;
            changed = true;
            break;
          }
        }
      }

      if (!merged) {
        nextIslands.push(island);
      }
    }
    currentIslands = nextIslands;
  }

  return { islands: currentIslands, snakes: currentSnakes };
}

// ==========================================
// 🧠 LOGIC: SURVIVOR GREEDY COVERAGE
// ==========================================
function generateSurvivorGreedyCoverage(grid, pvMap, rnd) {
  let visited = Array(9)
    .fill()
    .map(() => Array(9).fill(false));
  let unvisitedCount = 81 - pvMap.size;

  pvMap.forEach((_, key) => {
    const [r, c] = key.split(",").map(Number);
    visited[r][c] = true;
  });

  let paths = [];

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
    let start = null;
    let minDegree = 9;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!visited[r][c]) {
          const degree = countOpenNeighbors(r, c);
          if (degree < minDegree) {
            minDegree = degree;
            start = { r, c };
          }
          if (minDegree <= 1) break;
        }
      }
      if (start && minDegree <= 1) break;
    }

    if (!start) break;

    let currentPath = [start];
    visited[start.r][start.c] = true;
    unvisitedCount--;

    let curr = start;
    let stuck = false;

    while (!stuck) {
      let moves = [];
      let criticalMoves = [];

      [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ].forEach((d) => {
        const nr = curr.r + d[0],
          nc = curr.c + d[1];
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && !visited[nr][nc]) {
          const degree = countOpenNeighbors(nr, nc);
          if (degree === 0) {
            criticalMoves.push({ r: nr, c: nc, degree });
          }
          moves.push({ r: nr, c: nc, degree });
        }
      });

      if (moves.length === 0) {
        stuck = true;
        break;
      }

      let nextNode;
      if (criticalMoves.length > 0) {
        nextNode = criticalMoves[0];
      } else {
        moves.sort((a, b) => {
          return a.degree - b.degree || rnd() - 0.5;
        });
        nextNode = moves[0];
      }

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
// 🪚 LOGIC: SMART SEGMENTATION
// ==========================================
function segmentPathsSmart(rawPaths, grid, pvMap) {
  let finalSnakes = [];
  let orphans = [];
  let uniqueCache = new Map();

  for (let path of rawPaths) {
    const solve = (currentPath, memo = {}) => {
      const key = currentPath.length;
      if (memo[key]) return memo[key];

      if (currentPath.length === 0) {
        return { snakes: [], orphans: [], orphanCount: 0 };
      }

      let bestRes = null;
      let minOrphans = Infinity;

      let maxCut = Math.min(currentPath.length, 6);
      for (let cut = maxCut; cut >= 3; cut--) {
        const chunk = currentPath.slice(0, cut);
        const seqValues = chunk.map((p) => grid[p.r][p.c]);
        const seqKey = seqValues.join(",");

        let isUnique;
        if (uniqueCache.has(seqKey)) {
          isUnique = uniqueCache.get(seqKey);
        } else {
          isUnique = countOccurrences(grid, pvMap, seqValues) === 1;
          uniqueCache.set(seqKey, isUnique);
        }

        if (isUnique) {
          const remRes = solve(currentPath.slice(cut), memo);
          const currentOrphans = remRes.orphanCount;
          if (currentOrphans < minOrphans) {
            minOrphans = currentOrphans;
            bestRes = {
              snakes: [chunk, ...remRes.snakes],
              orphans: remRes.orphans,
              orphanCount: currentOrphans,
            };
            if (minOrphans === 0) break;
          }
        }
      }

      if (minOrphans > 0) {
        const remRes = solve(currentPath.slice(1), memo);
        const currentOrphans = 1 + remRes.orphanCount;
        if (currentOrphans < minOrphans) {
          minOrphans = currentOrphans;
          bestRes = {
            snakes: remRes.snakes,
            orphans: [currentPath[0], ...remRes.orphans],
            orphanCount: currentOrphans,
          };
        }
      }

      memo[key] = bestRes;
      return bestRes;
    };

    const result = solve(path);
    finalSnakes.push(...result.snakes);
    orphans.push(...result.orphans);
  }
  return { snakes: finalSnakes, orphans };
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

function dist(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
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
      if (di <= 1 && dj <= 1) return true;
    }
  }
  return false;
}

generateDailyPuzzle();
