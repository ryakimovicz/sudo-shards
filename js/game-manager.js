import { getDailySeed } from "./utils/random.js";
// Local generation removed per user request (Cloud Only)
import {
  generateSearchSequences,
  countSequenceOccurrences,
} from "./search-gen.js";
import { CONFIG } from "./config.js";
import { calculateRP, SCORING } from "./ranks.js";

export class GameManager {
  constructor() {
    this.currentSeed = getDailySeed();
    this.ready = this.prepareDaily(); // Initial Load
    this.cloudSaveTimeout = null;

    // Listen for tab focus/visibility to force save
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.forceCloudSave();
      }
    });
  }

  /**
   * Refreshes the daily seed and re-initializes the game state.
   * Called on Page Load and when user clicks "Start" to ensure fresh date.
   */
  async prepareDaily() {
    this.currentSeed = getDailySeed();
    this.storageKey = `jigsudo_state_${this.currentSeed}`;
    this.state = null;
    return await this.init();
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
      this._ensureStats(); // Migration
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
      stats: {
        totalPlayed: 0,
        wins: 0,
        currentStreak: 0,
        maxStreak: 0,
        peaksErrors: 0, // Track for daily score
        history: {},
        distribution: { "<2m": 0, "2-5m": 0, "+5m": 0 },
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
    throw new Error("Local generation disabled (Cloud Only)");
    // const gameData = generateDailyGame(this.currentSeed);
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
      peaks: {
        completed: false,
      },
      stats: {
        peaksErrors: 0, // Track errors for scoring
      },
      code: {
        completed: false,
      },
    };
  }

  async save() {
    if (this.conflictBlocked) return; // Prevent overwriting cloud data
    this.state.meta.lastPlayed = new Date().toISOString();
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));

    // SMART CLOUD SYNC (Debounced)
    this.saveCloudDebounced();
  }

  /**
   * Debounces the cloud save to avoid hitting Firebase quotas.
   * Default: 5 seconds of inactivity.
   */
  saveCloudDebounced(delay = 5000) {
    if (this.cloudSaveTimeout) {
      clearTimeout(this.cloudSaveTimeout);
    }

    this.cloudSaveTimeout = setTimeout(() => {
      this.forceCloudSave();
    }, delay);
  }

  /**
   * Forces an immediate write to Firestore.
   * Used on Stage Win, Game Complete, or App Suspend.
   */
  async forceCloudSave() {
    if (this.cloudSaveTimeout) {
      clearTimeout(this.cloudSaveTimeout);
      this.cloudSaveTimeout = null;
    }

    if (this.conflictBlocked) return; // Strict Block

    try {
      const { getCurrentUser } = await import("./auth.js");
      const { saveUserProgress } = await import("./db.js");
      const user = getCurrentUser();
      if (user && this.state) {
        // Serialize nested arrays for Firestore
        const cloudState = this._serializeState(this.state);
        await saveUserProgress(user.uid, cloudState);
      }
    } catch (e) {
      console.warn("Cloud save failed/skipped", e);
    }
  }

  // Called when remote data is loaded
  handleCloudSync(remoteData) {
    if (!remoteData) return;
    if (this.conflictBlocked) return; // Already blocked

    // Cloud data might have stringified arrays, deserialize them
    const hydratedData = this._deserializeState(remoteData);

    const remoteTime = new Date(hydratedData.meta.lastPlayed).getTime();
    const localTime = new Date(this.state.meta.lastPlayed).getTime();

    console.log(`[Sync] Remote: ${remoteTime}, Local: ${localTime}`);

    // Allow 10 second buffer for clock skew / latency
    // If Remote is > Local + 10s, it means another device really played later
    if (remoteTime > localTime + 10000) {
      console.warn("[Sync] Conflict detected! Remote is newer.");
      this.showConflictModal();
      return;
    }

    // Normal Sync (if newer or same) - we usually don't hot-reload unless user refreshes,
    // but here we just ensure we don't overwrite if remote is newer.
    // If remote is newer but within buffer? Maybe just accept it?
    // For now, only STRICT blocking.
  }

  showConflictModal() {
    this.conflictBlocked = true; // STOP ALL SAVING

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.95)";
    overlay.style.color = "white";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "99999";
    overlay.style.fontFamily = "outfit, sans-serif";
    overlay.style.textAlign = "center";
    overlay.style.padding = "20px";

    overlay.innerHTML = `
        <h1 style="color: #ff5555; margin-bottom: 20px; font-size: 3rem;">⚠️</h1>
        <h2 style="margin-bottom: 10px;">Partida activa en otro dispositivo</h2>
        <p style="font-size: 1.1rem; margin-bottom: 30px; max-width: 400px; color: #ccc;">
            Se ha detectado progreso más reciente desde otra ubicación.
            Por seguridad, esta sesión se ha detenido.
        </p>
        <button id="btn-conflict-reload" style="
            background: #ff5555;
            color: white;
            border: none;
            padding: 16px 32px;
            font-size: 1.2rem;
            font-weight: bold;
            border-radius: 12px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(255, 85, 85, 0.4);
            transition: transform 0.2s;
        ">
            Recargar Datos
        </button>
    `;

    document.body.appendChild(overlay);

    document.getElementById("btn-conflict-reload").onclick = () => {
      window.location.hash = ""; // Go to home
      window.location.reload();
    };
  }

  // FIRESTORE HELPER: Flatten nested arrays
  _serializeState(state) {
    // Deep clone to avoid mutating local state
    const clone = JSON.parse(JSON.stringify(state));

    // Stringify known 2D/3D arrays
    if (clone.data) {
      if (Array.isArray(clone.data.solution))
        clone.data.solution = JSON.stringify(clone.data.solution);
      if (Array.isArray(clone.data.initialPuzzle))
        clone.data.initialPuzzle = JSON.stringify(clone.data.initialPuzzle);
      if (Array.isArray(clone.data.chunks))
        clone.data.chunks = JSON.stringify(clone.data.chunks);
      if (clone.data.searchTargetsMap)
        clone.data.searchTargetsMap = JSON.stringify(
          clone.data.searchTargetsMap,
        );
    }
    if (clone.sudoku && Array.isArray(clone.sudoku.currentBoard)) {
      clone.sudoku.currentBoard = JSON.stringify(clone.sudoku.currentBoard);
    }

    return clone;
  }

  // FIRESTORE HELPER: Restore nested arrays
  _deserializeState(cloudState) {
    const clone = JSON.parse(JSON.stringify(cloudState));

    if (clone.data) {
      if (typeof clone.data.solution === "string")
        clone.data.solution = JSON.parse(clone.data.solution);
      if (typeof clone.data.initialPuzzle === "string")
        clone.data.initialPuzzle = JSON.parse(clone.data.initialPuzzle);
      if (typeof clone.data.chunks === "string")
        clone.data.chunks = JSON.parse(clone.data.chunks);
      if (typeof clone.data.searchTargetsMap === "string")
        clone.data.searchTargetsMap = JSON.parse(clone.data.searchTargetsMap);
    }
    if (clone.sudoku && typeof clone.sudoku.currentBoard === "string") {
      clone.sudoku.currentBoard = JSON.parse(clone.sudoku.currentBoard);
    }

    return clone;
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
        // Award Partial Points for the completed stage
        this.awardStagePoints(currentStage);
      }
      this.forceCloudSave(); // Immediate Cloud Push on Stage Win

      // Dispatch Event
      window.dispatchEvent(
        new CustomEvent("stage-changed", { detail: nextStage }),
      );
    }
  }

  // Generic State Update (called by Minigames)
  updateProgress(section, data) {
    if (!this.state || !this.state[section]) {
      // Create if missing (e.g. stats)
      if (section === "stats") this.state.stats = {};
      else return;
    }

    // Deep Merge or Shallow Merge? Shallow is usually enough for top keys
    // data: { peaksErrors: 1 }
    this.state[section] = { ...this.state[section], ...data };
    this.save();
  }

  /**
   * Awards partial RP for modifying a stage.
   * Updates global stats immediately.
   */
  async awardStagePoints(stage) {
    const points = SCORING.PARTIAL_RP[stage] || 0;
    if (points <= 0) return;

    console.log(`[Score] Awarding Partial Points for ${stage}: +${points}`);

    // Update Global Stats
    let stats =
      this.stats ||
      JSON.parse(localStorage.getItem("jigsudo_user_stats")) ||
      {};

    // Initialize currentRP if missing
    stats.currentRP = (stats.currentRP || 0) + points;

    // Also update localized accumulators for display
    stats.totalScoreAccumulated = (stats.totalScoreAccumulated || 0) + points;

    // Save
    this.stats = stats;
    localStorage.setItem("jigsudo_user_stats", JSON.stringify(stats));

    // Cloud Save (Stats Only)
    const { saveUserStats } = await import("./db.js");
    const { getCurrentUser } = await import("./auth.js");
    const user = getCurrentUser();

    if (user) {
      saveUserStats(user.uid, stats);
    }
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

  // --- Global Stats Management ---
  // Replaces local-state-bound stats with persistent global stats

  _ensureStats() {
    // Legacy cleanup or init
    if (this.state && !this.state.meta.stageTimes) {
      this.state.meta.stageTimes = {};
    }
    this._checkRankDecay();

    // Cleanup Legacy Data (Once per session mainly)
    const user = import("./auth.js").then((m) => m.getCurrentUser?.());
    // Since this is async/sync hybrid complexity, we just trigger it if user exists
    // We'll import dynamically to avoid circular dep issues if any, or better,
    // rely on auth.js listener calling ensureStats?
    // Actually, let's just use the auth listener approach later or assume userId is available in some context?
    // Simplified: We'll import cleanupLegacyStats and call it if we can.
    import("./db.js").then(({ cleanupLegacyStats }) => {
      const auth = import("./auth.js").then(({ getCurrentUser }) => {
        const u = getCurrentUser();
        if (u) cleanupLegacyStats(u.uid);
      });
    });
  }

  async _checkRankDecay() {
    // Load global stats (not state-bound)
    let stats =
      this.stats || JSON.parse(localStorage.getItem("jigsudo_user_stats"));
    if (!stats) return;

    const today = new Date().toISOString().split("T")[0];
    const lastCheck = stats.lastDecayCheck || stats.lastPlayedDate;

    // Only check if we haven't checked today
    if (lastCheck && lastCheck !== today) {
      // Check gap between today and last PLAYED date
      // If lastPlayed was yesterday, gap is 1 day. No penalty.
      // If lastPlayed was 2 days ago, gap is 2 days. Missed 1 day. Penalty.

      const lastPlayed = stats.lastPlayedDate || today; // If never played, assume today? No, safe default.
      if (!stats.lastPlayedDate) return;

      const lastDate = new Date(lastPlayed);
      const currDate = new Date(today);
      lastDate.setHours(0, 0, 0, 0);
      currDate.setHours(0, 0, 0, 0);

      const diffTime = currDate - lastDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 1) {
        const missed = diffDays - 1;
        const penalty = missed * SCORING.MISSED_DAY_RP;

        if (penalty > 0) {
          console.log(
            `[Rank] Decay applied: -${penalty} RP for ${missed} days.`,
          );
          stats.currentRP = Math.max(0, (stats.currentRP || 0) - penalty);

          // Update Check Timestamp
          stats.lastDecayCheck = today;
          this.stats = stats;
          localStorage.setItem("jigsudo_user_stats", JSON.stringify(stats));

          // Trigger Profile UI update? (Will happen on reload/profile view)
        }
      }
    }
  }

  // Stage Timing Logic
  startStageTimer(stage) {
    this.currentStage = stage;
    this.stageStartTime = Date.now();
    console.log(`[Timer] Started stage: ${stage}`);
  }

  stopStageTimer() {
    if (!this.currentStage || !this.stageStartTime) return;

    const duration = Date.now() - this.stageStartTime;
    this.recordStageTime(this.currentStage, duration);
    console.log(`[Timer] Stopped stage: ${this.currentStage} (${duration}ms)`);

    this.currentStage = null;
    this.stageStartTime = null;
  }

  // Called when stage changes in main loop (needs hook)
  recordStageTime(stage, durationMs) {
    if (!this.state) return;
    if (!this.state.meta.stageTimes) this.state.meta.stageTimes = {};

    const current = this.state.meta.stageTimes[stage] || 0;
    this.state.meta.stageTimes[stage] = current + durationMs;
    this.save();
  }

  async handleCloudSync(remoteProgress, remoteStats) {
    // 1. Progress (State) Sync
    if (remoteProgress) {
      // Logic to merge progress...
      console.log("[GM] Syncing Progress...");
      // If remote is newer, use it?
      // Skipping detailed complexity for now, strictly implementing Stats Sync
    }

    // 2. Stats Sync
    if (remoteStats) {
      console.log("[GM] Syncing Global Stats:", remoteStats);
      this.stats = remoteStats;
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
    }
  }

  // Updated to write to Global Storage
  async recordWin() {
    // 1. Load Global Stats
    let stats = this.stats ||
      JSON.parse(localStorage.getItem("jigsudo_user_stats")) || {
        totalPlayed: 0,
        wins: 0,
        currentStreak: 0,
        maxStreak: 0,
        lastPlayedDate: null, // YYYY-MM-DD
        currentRP: 0,
        history: {},
        lastDecayCheck: null,
        // Optimized Cache Stats
        bestTime: Infinity,
        bestScore: 0, // Raw Score (0-100k) or Unified? Let's use Unified (0-10) for UI display, or Raw for precision? User said 0-10.
        // Wait, bestScore calculation depends on if we store Raw or Unified.
        // Profile calculates unified from max(raw).
        // Let's store RAW max to be safe/consistent with daily score calculation, converting at view time if needed, OR store unified float.
        // User request: "bestScore (float): ... (0-10)". Okay, so we store the 0-10 value.
        // But recordWin gives raw dailyScore. We must convert using calculateRP.
        totalTimeAccumulated: 0,
        totalScoreAccumulated: 0, // Sum of unified RP? Or Sum of Raw? Sum of Unified is better for "Average Score: 9.5"
        totalPeaksErrorsAccumulated: 0,
        stageTimesAccumulated: {
          memory: 0,
          jigsaw: 0,
          sudoku: 0,
          peaks: 0,
          search: 0,
          code: 0,
        },
        stageWinsAccumulated: {
          memory: 0,
          jigsaw: 0,
          sudoku: 0,
          peaks: 0,
          search: 0,
          code: 0,
        },
        weekdayStatsAccumulated: {
          0: { sumTime: 0, sumErrors: 0, sumScore: 0, count: 0 },
          1: { sumTime: 0, sumErrors: 0, sumScore: 0, count: 0 },
          2: { sumTime: 0, sumErrors: 0, sumScore: 0, count: 0 },
          3: { sumTime: 0, sumErrors: 0, sumScore: 0, count: 0 },
          4: { sumTime: 0, sumErrors: 0, sumScore: 0, count: 0 },
          5: { sumTime: 0, sumErrors: 0, sumScore: 0, count: 0 },
          6: { sumTime: 0, sumErrors: 0, sumScore: 0, count: 0 },
        },
      };

    // Use seed to determine the date (handles midnight crossing)
    const seedStr = this.currentSeed.toString();
    const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;

    // Check if already won today
    if (stats.history[today] && stats.history[today].status === "won") {
      console.log("Already won today. Stats not incremented.");
      return;
    }

    console.log("🏆 RECORDING GLOBAL WIN!");

    // Update Counters
    stats.totalPlayed = (stats.totalPlayed || 0) + 1;
    stats.wins = (stats.wins || 0) + 1;

    // Streak Logic
    const last = stats.lastPlayedDate;
    if (last) {
      const lastDate = new Date(last);
      const currDate = new Date(today);
      // Zero time components for safety
      lastDate.setHours(0, 0, 0, 0);
      currDate.setHours(0, 0, 0, 0);

      const diffTime = currDate - lastDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        stats.currentStreak = (stats.currentStreak || 0) + 1;
      } else if (diffDays > 1) {
        stats.currentStreak = 1; // Broken
      }
    } else {
      stats.currentStreak = 1;
    }

    if (stats.currentStreak > (stats.maxStreak || 0)) {
      stats.maxStreak = stats.currentStreak;
    }

    // SCORING (Bonus Only)
    const startStr = this.state.meta.startedAt;
    const totalTimeMs = startStr
      ? Date.now() - new Date(startStr).getTime()
      : 0;
    const totalSeconds = Math.floor(totalTimeMs / 1000);

    // Get Errors (Peaks) - tracking
    const peaksErrors = this.state.stats?.peaksErrors || 0;

    // 1. Calculate Time-Based Bonus (Linear 24h Decay)
    const { calculateTimeBonus } = await import("./ranks.js");
    const timeBonus = calculateTimeBonus(totalSeconds);

    console.log(
      `[Score] Time: ${totalSeconds}s -> Bonus: ${timeBonus}/${SCORING.MAX_BONUS}`,
    );

    // 2. Calculate Penalties
    const penaltyPoints = peaksErrors * SCORING.ERROR_PENALTY_RP;

    // 3. Final Calculation
    // Total Gain Today = Fixed Points (4.0) + TimeBonus - Penalties
    // We already added Fixed Points to currentRP incrementally.
    // Now we add netChange.

    let netChange = timeBonus - penaltyPoints;

    // Store RAW precision for Leaderboards
    // netChange = Number(netChange.toFixed(2));

    // PROTECTION: Ensure we don't subtract from HISTORICAL points.
    // The worst that can happen is you lose all the points you made TODAY.
    // So 'Fixed Points (4.0) + netChange' must be >= 0.

    // Calculate what the theoretical total score is currently
    const theoreticalTotal = 4.0 + netChange; // 4.0 is max fixed.

    if (theoreticalTotal < 0) {
      // If errors are so huge that they eat all today's points and more...
      // We cap the penalty so the total result is exactly 0.
      // 4.0 + netChange = 0  =>  netChange = -4.0
      netChange = -4.0;
    }

    // Update Stats
    stats.currentRP = (stats.currentRP || 0) + netChange;
    // We do NOT round stats.currentRP to keep sorting precision

    // Safety check (shouldn't be needed with logic above, but good for float drift)
    if (stats.currentRP < 0) stats.currentRP = 0;

    // Display Score can be rounded for UI, but logs/storage keep precision
    const dailyScore = Math.max(0, 4.0 + netChange);
    const rpEarned = netChange; // Log differential

    // --- Update Optimized Cache ---
    // Initialize if missing (migration)
    if (stats.bestTime === undefined) stats.bestTime = Infinity;
    if (stats.bestScore === undefined) stats.bestScore = 0;
    if (stats.totalTimeAccumulated === undefined)
      stats.totalTimeAccumulated = 0;
    if (stats.totalScoreAccumulated === undefined)
      stats.totalScoreAccumulated = 0;
    if (stats.totalPeaksErrorsAccumulated === undefined)
      stats.totalPeaksErrorsAccumulated = 0;

    // Nested Objects Migration
    if (!stats.stageTimesAccumulated) {
      stats.stageTimesAccumulated = {
        memory: 0,
        jigsaw: 0,
        sudoku: 0,
        peaks: 0,
        search: 0,
        code: 0,
      };
    }
    if (!stats.stageWinsAccumulated) {
      stats.stageWinsAccumulated = {
        memory: 0,
        jigsaw: 0,
        sudoku: 0,
        peaks: 0,
        search: 0,
        code: 0,
      };
    }
    if (!stats.weekdayStatsAccumulated) {
      stats.weekdayStatsAccumulated = {};
      for (let i = 0; i < 7; i++) {
        stats.weekdayStatsAccumulated[i] = {
          sumTime: 0,
          sumErrors: 0,
          sumScore: 0,
          count: 0,
        };
      }
    }

    // Updates
    if (totalTimeMs > 0 && totalTimeMs < stats.bestTime) {
      stats.bestTime = totalTimeMs;
    }
    // FIX: Compare dailyScore (Total 10.0 scale) not just rpEarned (Bonus)
    if (dailyScore > stats.bestScore) {
      stats.bestScore = dailyScore;
    }
    stats.totalTimeAccumulated += totalTimeMs;
    // FIX: Add rpEarned (Bonus) to total. Fixed points were already added via awardStagePoints!
    // So here we only add the Bonus part to avoid double counting the Fixed part.
    stats.totalScoreAccumulated += rpEarned;
    stats.totalPeaksErrorsAccumulated += peaksErrors;

    // Update Stage Accumulators
    const st = this.state.meta.stageTimes || {};
    for (const [stage, time] of Object.entries(st)) {
      if (stats.stageTimesAccumulated[stage] !== undefined) {
        stats.stageTimesAccumulated[stage] += time;
        stats.stageWinsAccumulated[stage]++;
      }
    }

    // Update Weekday Accumulators
    // Fix: In JS getDay() for "2026-02-04" depends on timezone if not parsed correctly.
    // In recordWin, 'today' is "YYYY-MM-DD" from new Date().toISOString()
    // We should parse it as local or use the date object directly.
    // Use the puzzle date for weekday stats to handle midnight crossing correctly
    const dateObj = new Date(today + "T12:00:00");
    const dayIdx = dateObj.getDay(); // 0=Sun, 6=Sat
    if (stats.weekdayStatsAccumulated[dayIdx]) {
      const w = stats.weekdayStatsAccumulated[dayIdx];
      w.sumTime += totalTimeMs;
      w.sumErrors += peaksErrors;
      w.sumScore += dailyScore; // Use TOTAL Daily Score for day averages
      w.count++;
    }

    console.log(
      `[Score] Time: ${totalSeconds}s, Errors: ${peaksErrors} -> Score: ${dailyScore} -> RP: +${rpEarned}`,
    );

    stats.lastPlayedDate = today;
    stats.lastDecayCheck = today;

    // Save History Record
    stats.history[today] = {
      status: "won",
      totalTime: totalTimeMs,
      stageTimes: this.state.meta.stageTimes || {},
      timestamp: Date.now(),
      score: dailyScore,
      peaksErrors: peaksErrors,
    };

    // Persist
    this.stats = stats;
    localStorage.setItem("jigsudo_user_stats", JSON.stringify(stats));

    // Cloud Save
    const { saveUserStats } = await import("./db.js");
    const user = await import("./auth.js").then((m) => m.getCurrentUser());
    if (user) {
      saveUserStats(user.uid, stats);
    }

    this.forceCloudSave(); // Save game state too (marked completed)
  }
}

// Singleton instance
export const gameManager = new GameManager();
