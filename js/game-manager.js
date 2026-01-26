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

      // Ensure Search exists (Migration for old saves)
      this.ensureSearchGenerated();

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
        } else {
          throw new Error("No data returned");
        }
      } catch (err) {
        console.warn(
          "[GameManager] Static fetch failed/offline. Falling back to local generation.",
          err,
        );
        // 3. Fallback: Generate Locally
        this.state = this.createNewState();
        // Trigger background generation immediately
        this.ensureSearchGenerated();
      }

      this.save();
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

    if (CONFIG.debugMode) console.log("Game Initialized:", this.state);
    return true;
  }

  async fetchDailyPuzzle() {
    const seed = this.currentSeed;
    const year = Math.floor(seed / 10000);
    const month = Math.floor((seed % 10000) / 100);
    const day = seed % 100;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const url = `puzzles/daily-${dateStr}.json`;

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
        seed: this.currentSeed,
        startedAt: new Date().toISOString(),
        lastPlayed: new Date().toISOString(),
        generatedBy: "static-v1",
      },
      progress: {
        currentStage: "memory",
        stagesCompleted: [],
      },
      data: {
        solution: data.solution,
        initialPuzzle: data.puzzle,
        chunks: data.chunks, // Provided by JSON
      },
      memory: {
        pairsFound: 0,
        cards: [],
      },
      jigsaw: {
        placedChunks: [],
      },
      sudoku: {
        currentBoard: data.puzzle, // Start with holes
      },
      search: {
        // Static JSON likely contains searchTargets
        targets: data.searchTargets || [],
        found: [],
        version: 14,
      },
    };
  }

  createNewState() {
    // Generate the Sudoku data
    const gameData = generateDailyGame(this.currentSeed);

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
      },
      memory: {
        pairsFound: 0,
        // We will populate this when Memory initializes
        cards: [],
      },
      jigsaw: {
        placedChunks: [], // indices of placed chunks (0-8)
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

  ensureSearchGenerated() {
    // Force Generation or Validation
    let shouldRegenerate = false;

    if (
      !this.state.search ||
      !this.state.search.targets ||
      this.state.search.targets.length === 0 ||
      this.state.search.version !== 11 // Explicit V11 Check
    ) {
      shouldRegenerate = true;
      if (CONFIG.debugMode)
        console.warn(
          "[GameManager] Search Data Outdated/Missing. Regenerating...",
        );
    } else {
      // Validate Existing Targets
      const targets = this.state.search.targets;
      const seenCells = new Set(); // Check for overlaps globaly

      for (const target of targets) {
        if (!target.path || target.path.length < 2) {
          shouldRegenerate = true;
          break;
        }

        // Check each cell
        for (let i = 0; i < target.path.length; i++) {
          const cell = target.path[i];
          const key = `${cell.r},${cell.c}`;

          // 1. Check Duplicates/Overlaps
          if (seenCells.has(key)) {
            console.warn(
              `[GameManager] OVERLAP DETECTED at ${key} - Regenerating`,
            );
            shouldRegenerate = true;
            break;
          }
          seenCells.add(key);

          // 2. Check Orthogonality
          if (i < target.path.length - 1) {
            const next = target.path[i + 1];
            const dist = Math.abs(cell.r - next.r) + Math.abs(cell.c - next.c);
            if (dist !== 1) {
              console.warn(
                `[GameManager] DIAGONAL DETECTED at ${key}->${next.r},${next.c} - Regenerating`,
              );
              shouldRegenerate = true;
              break;
            }
          }
        }

        // 3. AMBIGUITY CHECK (Force regenerate if stale targets are ambiguous)
        if (!shouldRegenerate) {
          const numbers =
            target.numbers ||
            target.path.map((p) => this.state.data.solution[p.r][p.c]); // Ensure numbers exist
          // Need full solution board for check
          const board = this.state.data.solution;
          if (countSequenceOccurrences(board, numbers) > 1) {
            console.warn(
              `[GameManager] AMBIGUOUS SEQUENCE DETECTED (${numbers.join("-")}) - Regenerating`,
            );
            shouldRegenerate = true;
            break;
          }
        }

        if (shouldRegenerate) break;
      }
    }

    if (shouldRegenerate) {
      if (CONFIG.debugMode)
        console.log(
          "[GameManager] Starting Background Search Generation (Worker)...",
        );

      this.startBackgroundGeneration();
    }
  }

  startBackgroundGeneration() {
    if (window.Worker) {
      const worker = new Worker("js/search-worker.js", { type: "module" });

      worker.postMessage({
        board: this.state.data.solution,
        seed: this.currentSeed,
        debugMode: CONFIG.debugMode,
      });

      worker.onmessage = (e) => {
        const { status, sequences, message } = e.data;
        if (status === "success") {
          if (CONFIG.debugMode)
            console.log(
              "[GameManager] Background Generation Complete!",
              sequences.length,
            );

          // Update State silently
          this.state.search = {
            targets: sequences,
            found: [],
            version: 14,
          };
          this.save();
          worker.terminate();
        } else {
          console.error("[GameManager] Worker Failed:", message);
          worker.terminate();
        }
      };

      worker.onerror = (err) => {
        console.error("[GameManager] Worker Error:", err);
        worker.terminate();
      };
    } else {
      // Fallback for no worker support
      console.warn(
        "[GameManager] Workers not supported. Running synchronously (might freeze).",
      );
      const sequences = generateSearchSequences(
        this.state.data.solution,
        this.currentSeed,
        4000, // Short timeout for sync fallback
      );
      this.state.search = {
        targets: sequences,
        found: [],
        version: 14,
      };
      this.save();
    }
  }
}

// Singleton instance
export const gameManager = new GameManager();
