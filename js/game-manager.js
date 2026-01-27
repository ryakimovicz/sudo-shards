import { getDailySeed } from "./utils/random.js";
import { generateDailyGame } from "./sudoku-logic.js";
import {
  generateSearchSequences,
  countSequenceOccurrences,
} from "./search-gen.js";
import { CONFIG } from "./config.js";

export class GameManager {
  constructor() {
    this.currentSeed = getDailySeed();
    this.storageKey = `jigsudo_state_${this.currentSeed}`;
    this.state = null;

    this.ready = this.init(); // Promise that resolves when state is loaded
  }

  async init() {
    // 1. Check LocalStorage
    const savedState = localStorage.getItem(this.storageKey);

    if (savedState) {
      this.state = JSON.parse(savedState);

      this.state = JSON.parse(savedState);

      // Ensure Search exists (Migration for old saves)
      // this.ensureSearchGenerated(); -> REMOVED (Static only now)

      // Debug
      if (CONFIG.debugMode) {
        console.log(
          `[GameManager] Loading existing game for seed ${this.currentSeed}`,
        );
      }
    } else {
      // 2. Try Fetching Static Puzzle (Network)
      try {
        if (CONFIG.debugMode)
          console.log("[GameManager] Fetching daily puzzle...");
        const dailyData = await this.fetchDailyPuzzle();

        if (dailyData) {
          console.log("[GameManager] Loaded Static Puzzle!");
          this.state = this.createStateFromJSON(dailyData);
          this.save();
        } else {
          throw new Error("No data returned");
        }
      } catch (err) {
        console.error(
          "[GameManager] CRITICAL: Static fetch failed/offline. No fallback allowed.",
          err,
        );
        this.showCriticalError(
          "Error loading daily puzzle. Check connection & refresh.",
        );
        return false; // Initialize failed
      }
    }

    // Beta Mode Cleanups
    if (CONFIG.betaMode && this.state) {
      if (this.state.search && this.state.search.found.length > 0) {
        if (CONFIG.debugMode)
          console.log("[GameManager] Beta Mode: Resetting found sequences.");
        this.state.search.found = [];
        this.save();
      }
    }

    if (CONFIG.debugMode) {
      console.log("Game Initialized:", this.state);
      const ver = this.state.meta.version || "unknown";
      const seed = this.state.meta.seed;
      console.log(
        `%c🧩 Jigsaw Sudoku Loaded | Ver: ${ver} | Seed: ${seed}`,
        "color: #00bcd4; font-weight: bold;",
      );
    }
    return true;
  }

  async fetchDailyPuzzle() {
    const seed = this.currentSeed;
    const year = Math.floor(seed / 10000);
    const month = Math.floor((seed % 10000) / 100);
    const day = seed % 100;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const url = `public/puzzles/daily-${dateStr}.json`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e) {
      if (CONFIG.debugMode) console.warn("Fetch failed:", e);
      return null;
    }
  }

  createStateFromJSON(json) {
    const { data, meta } = json;
    // We ignore meta from JSON mostly, use our own timestamps
    return {
      meta: {
        seed: meta.seed || this.currentSeed,
        version: meta.version || "unknown", // Capture version from JSON
        startedAt: new Date().toISOString(),
        lastPlayed: new Date().toISOString(),
        generatedBy: "static-server",
      },
      progress: {
        currentStage: "memory",
        stagesCompleted: [],
      },
      data: {
        solution: data.solution,
        initialPuzzle: data.puzzle,
        chunks: data.chunks, // Provided by JSON
        searchTargetsMap: data.searchTargets, // Store the full map { "0": ..., "LR": ... }
        simonValues: data.simonValues || [],
      },
      memory: {
        pairsFound: 0,
        cards: [],
      },
      jigsaw: {
        placedChunks: [],
        variation: null, // "0", "LR", "TB", "HV"
      },
      sudoku: {
        currentBoard: data.puzzle, // Start with holes
      },
      search: {
        targets: [], // Will be populated by setJigsawVariation
        found: [],
        version: 14,
      },
      simon: {
        values: data.simonValues || [],
        coordinates: [], // Will be populated by setJigsawVariation
      },
    };
  }

  setJigsawVariation(variationKey) {
    if (!this.state) return;

    console.log(`[GameManager] Setting Jigsaw Variation: ${variationKey}`);
    this.state.jigsaw.variation = variationKey;

    // Load Variation Data
    // Handle Backward Compat (if map is missing, fallback to empty or array check)
    const map = this.state.data.searchTargetsMap;
    let variationData = null;

    if (map && !Array.isArray(map)) {
      // New V2 Format
      variationData = map[variationKey];
    } else if (Array.isArray(map)) {
      // Old V1 Format (Direct Array)
      variationData = { targets: map, simon: [] };
    }

    if (variationData) {
      if (CONFIG.debugMode)
        console.log(
          `[GameManager] Loaded Search/Simon data for ${variationKey}`,
        );

      // --- CRITICAL FIX: Transform Coords to Numbers ---
      // The JSON provides snakes as [{r,c}, {r,c}], but UI needs { numbers: [1,2,3] }
      // We must look up the numbers from the correctly transformed solution board.

      const solvedBoard = this.getTargetSolutionWithVariation(variationKey);

      this.state.search.targets = variationData.targets.map((snake, idx) => {
        // IDEMPOTENCY CHECK: If already transformed (has .path and .numbers), return as is.
        if (!Array.isArray(snake) && snake.path && snake.numbers) {
          return snake;
        }

        if (!Array.isArray(snake)) {
          console.warn(`[GameManager] Invalid snake at index ${idx}:`, snake);
          return { id: idx, numbers: [], path: [] };
        }

        // If it's the old format (already numbers), pass through (unlikely now)
        if (typeof snake[0] === "number") return { id: idx, numbers: snake };

        // New format: Array of {r,c}
        const numbers = snake.map((pos) => solvedBoard[pos.r][pos.c]);
        return {
          id: idx,
          path: snake,
          numbers: numbers,
        };
      });

      this.state.simon.coordinates = variationData.simon || [];
    } else {
      console.error(
        `[GameManager] Critical: No data found for variation ${variationKey}`,
      );
      // Fallback
      this.state.search.targets = [];
      this.state.simon.coordinates = [];
    }

    this.save();
  }

  getTargetSolution() {
    return this.getTargetSolutionWithVariation(
      this.state.jigsaw.variation || "0",
    );
  }

  getTargetSolutionWithVariation(variationKey) {
    if (!this.state || !this.state.data.solution) return [];

    const baseSolution = this.state.data.solution;
    const variation = variationKey || "0";

    if (variation === "0") return baseSolution;

    // Helper to Deep Copy
    const board = JSON.parse(JSON.stringify(baseSolution));

    // Apply Transformations (Same logic as Generator)
    if (variation === "LR" || variation === "HV") {
      // Swap Stacks (Cols 0-2 with 6-8)
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 3; c++) {
          const temp = board[r][c];
          board[r][c] = board[r][c + 6];
          board[r][c + 6] = temp;
        }
      }
    }

    if (variation === "TB" || variation === "HV") {
      // Swap Bands (Rows 0-2 with 6-8)
      for (let offset = 0; offset < 3; offset++) {
        const tempRow = board[offset];
        board[offset] = board[offset + 6];
        board[offset + 6] = tempRow;
      }
    }

    return board;
  }

  createNewState() {
    // Generate the Sudoku data
    const gameData = generateDailyGame(this.currentSeed);
    // Note: Local generation does not support V2 Symmetric logic yet.
    // Ideally we should update generateDailyGame/Factory too, but strictly "Static First" now.
    // If fallback is disabled, this might never be called in prod.

    return {
      meta: {
        seed: this.currentSeed,
        startedAt: new Date().toISOString(),
        lastPlayed: new Date().toISOString(),
      },
      progress: {
        currentStage: "memory", // memory, jigsaw, sudoku, peaks, search
        stagesCompleted: [],
      },
      data: {
        solution: gameData.solution,
        initialPuzzle: gameData.puzzle, // The one with holes
        chunks: gameData.chunks, // The 9 solved 3x3 grids (prizes)
        searchTargetsMap: [], // Local gen support pending
        simonValues: [],
      },
      memory: {
        pairsFound: 0,
        // We will populate this when Memory initializes
        cards: [],
      },
      jigsaw: {
        placedChunks: [], // indices of placed chunks (0-8)
        variation: "0",
      },
      sudoku: {
        currentBoard: gameData.puzzle, // Will be modified by user
      },
      search: {
        // Initialize empty, let ensureSearchGenerated fill it via Worker
        targets: [],
        found: [],
        version: 14, // Increment this to invalidate caches
      },
      simon: {
        values: [],
        coordinates: [],
      },
    };
  }

  save() {
    this.state.meta.lastPlayed = new Date().toISOString();
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  getState() {
    return this.state;
  }

  advanceStage() {
    const stages = ["memory", "jigsaw", "sudoku", "peaks", "search"];
    const currentIdx = stages.indexOf(this.state.progress.currentStage);

    if (currentIdx >= 0 && currentIdx < stages.length - 1) {
      const nextStage = stages[currentIdx + 1];
      const currentStage = this.state.progress.currentStage;

      console.log(`[GameManager] Advancing: ${currentStage} -> ${nextStage}`);

      // Update State
      this.state.progress.currentStage = nextStage;
      if (!this.state.progress.stagesCompleted.includes(currentStage)) {
        this.state.progress.stagesCompleted.push(currentStage);
      }
      this.save();

      // Dispatch Event
      window.dispatchEvent(
        new CustomEvent("stageChanged", { detail: { stage: nextStage } }),
      );
    }
  }

  updateProgress(stage, data) {
    // Generic updater
    if (data) {
      this.state[stage] = { ...this.state[stage], ...data };
    }
    this.save();
  }

  showCriticalError(message) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.9)";
    overlay.style.color = "white";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "9999";
    overlay.style.fontFamily = "sans-serif";
    overlay.style.textAlign = "center";
    overlay.style.padding = "20px";

    overlay.innerHTML = `
        <h2 style="color: #ff5555; margin-bottom: 20px;">⚠️ Status Error detected</h2>
        <p style="font-size: 1.2rem; margin-bottom: 30px;">${message}</p>
        <button onclick="window.location.reload()" style="
            background: #4a90e2; 
            color: white; 
            border: none; 
            padding: 12px 24px; 
            font-size: 1rem; 
            border-radius: 8px; 
            cursor: pointer;
        ">Reload App</button>
      `;

    document.body.appendChild(overlay);
  }
}

// Singleton instance
export const gameManager = new GameManager();
