import { getDailySeed } from "./utils/random.js";
import { generateDailyGame } from "./sudoku-logic.js";

export class GameManager {
  constructor() {
    this.currentSeed = getDailySeed();
    this.storageKey = `jigsudo_state_${this.currentSeed}`;
    this.state = null;

    this.init();
  }

  init() {
    // 1. Check LocalStorage
    const savedState = localStorage.getItem(this.storageKey);

    if (savedState) {
      console.log(
        `[GameManager] Loading existing game for seed ${this.currentSeed}`,
      );
      this.state = JSON.parse(savedState);
    } else {
      console.log(
        `[GameManager] Generating NEW game for seed ${this.currentSeed}`,
      );
      this.state = this.createNewState();
      this.save();
    }

    // Debug
    console.log("Game Initialized:", this.state);
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
    };
  }

  save() {
    this.state.meta.lastPlayed = new Date().toISOString();
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  getState() {
    return this.state;
  }

  updateProgress(stage, data) {
    // Generic updater
    if (data) {
      this.state[stage] = { ...this.state[stage], ...data };
    }
    this.save();
  }
}

// Singleton instance
export const gameManager = new GameManager();
