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
    // 1. Always Try Fetching Daily Puzzle (for version check)
    let dailyData = null;
    try {
      if (CONFIG.debugMode)
        console.log("[GameManager] Fetching daily puzzle...");
      dailyData = await this.fetchDailyPuzzle();
    } catch (e) {
      console.warn("[GameManager] Offline or Fetch Failed:", e);
    }

    // 2. Check LocalStorage
    const savedStateStr = localStorage.getItem(this.storageKey);
    let savedState = null;

    if (savedStateStr) {
      try {
        savedState = JSON.parse(savedStateStr);

        // VERSION CHECK: If we have both, check for mismatch
        if (dailyData && savedState) {
          const savedVer = savedState.meta?.version || "unknown";
          const newVer = dailyData.meta?.version || "unknown";

          if (savedVer !== newVer) {
            console.warn(
              `⚠️ Version mismatch! Saved: ${savedVer} vs New: ${newVer}. Wiping old save.`,
            );
            localStorage.removeItem(this.storageKey);
            savedState = null; // Force reload from dailyData
          }
        }
      } catch (err) {
        console.error("Error parsing save, wiping:", err);
        localStorage.removeItem(this.storageKey);
        savedState = null;
      }
    }

    // 3. Load State Decision
    if (savedState) {
      // A. Load Saved Game
      this.state = savedState;
      if (CONFIG.debugMode)
        console.log(
          `[GameManager] Loading existing game for seed ${this.currentSeed}`,
        );
    } else if (dailyData) {
      // B. Load New Daily Puzzle
      console.log("[GameManager] Starting Fresh Daily Puzzle!");
      this.state = this.createStateFromJSON(dailyData);
      this.save();
    } else {
      // C. Critical Failure
      console.error("[GameManager] CRITICAL: No Save & No Network.");
      this.showCriticalError(
        "Error loading daily puzzle. Check connection & refresh.",
      );
      return false;
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
        codeSequence: data.codeSequence || [],
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
      code: {
        completed: false,
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
        currentStage: "memory", // memory, jigsaw, sudoku, peaks, search, code
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
      code: {
        completed: false,
      },
    };
  }

  async save() {
    this.state.meta.lastPlayed = new Date().toISOString();
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));

    // CLOUD SYNC
    // Dynamic Import to avoid circular dependencies at top level if desired,
    // or just assume global auth state if module loaded.
    // Better: Check if user is logged in via Auth module helper
    try {
      const { getCurrentUser } = await import("./auth.js");
      const { saveUserProgress } = await import("./db.js");
      const user = getCurrentUser();
      if (user) {
        saveUserProgress(user.uid, this.state);
      }
    } catch (e) {
      console.warn("Cloud save failed/skipped", e);
    }
  }

  // Called when remote data is loaded
  handleCloudSync(remoteData) {
    if (!remoteData) return;

    // Simple Strategy: If remote is "ahead" or we just logged in and local is fresh.
    // For now, let's just overwrite local with remote if remote exists to ensure sync across devices.
    // Ideally we check timestamps.

    const remoteTime = new Date(remoteData.meta.lastPlayed).getTime();
    const localTime = new Date(this.state.meta.lastPlayed).getTime();

    console.log(`[Sync] Remote: ${remoteTime}, Local: ${localTime}`);

    // If remote is newer OR local is basically empty/fresh seed
    // (Simplified: Always load remote on login for now as "Restore Profile")
    this.state = remoteData;
    this.save(); // Save to local

    // Reload App state?
    // Since specific game logic might have initialized (like Jigsaw pieces),
    // we might need to reload the page or re-init modules.
    // Easiest: Reload page.
    // Better: Dispatch 'stateRestored' event.

    console.log("Cloud Save Restored. Reloading...");
    setTimeout(() => window.location.reload(), 500);
  }

  getState() {
    return this.state;
  }

  advanceStage() {
    const stages = ["memory", "jigsaw", "sudoku", "peaks", "search", "code"];
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
