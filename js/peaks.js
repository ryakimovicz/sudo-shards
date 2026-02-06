/* Peaks Logic */
import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";
import { transitionToSearch } from "./search.js";
import { getAllTargets } from "./peaks-logic.js";
import { resetUI } from "./memory.js";

// State
let peaksErrors = 0;
let totalTargets = 0;
let foundTargets = 0;
let solvedBoard = null; // 9x9 matrix
let targetMap = null; // "row,col" -> "peak" | "valley"
let currentHintRow = 0;

export function initPeaks() {
  console.log("Initializing Peaks Stage...");

  // 1. Reset State
  peaksErrors = 0;
  // foundTargets = 0; // REMOVED: Breaks hydration via resumePeaksState
  currentHintRow = 0; // Reset hint progress
  updateErrorCounter();
  // Sync Reset
  gameManager.updateProgress("stats", { peaksErrors: 0 });
  updateRemainingCounter();

  // 2. Show Stats
  const statsEl = document.getElementById("peaks-stats");
  if (statsEl) statsEl.classList.remove("hidden");

  // 3. Prepare Logic
  prepareGameLogic();

  // Wrap numbers in spans for animation
  const cells = document.querySelectorAll(".peaks-mode .mini-cell"); // careful with selector if class not yet applied? transition adds it. initPeaks called after transition.
  cells.forEach((cell) => {
    if (!cell.querySelector(".curr-number")) {
      const text = cell.textContent;
      cell.textContent = "";
      const span = document.createElement("span");
      span.className = "curr-number";
      span.textContent = text;
      cell.appendChild(span);
    }
  });

  updateRemainingCounter(); // Set initial value

  // 4. Attach Listeners
  attachPeaksListeners();
}

export async function transitionToPeaks() {
  console.log("Transitioning to Peaks & Valleys...");
  window.isGameTransitioning = true;

  const gameSection = document.getElementById("game-section");
  const sudokuControls = document.getElementById("sudoku-controls");

  if (!gameSection) return;

  // 1. Global UI Cleanup
  resetUI();

  // 2. Hide Sudoku Controls
  if (sudokuControls) {
    sudokuControls.classList.add("hidden");
  }

  // 2. Switch Mode Classes (Synchronous swap to prevent layout jump)
  gameSection.classList.add("peaks-mode");
  gameSection.classList.remove("sudoku-mode");

  // 3. Update Title
  const lang = getCurrentLang();
  const t = translations[lang];
  const titleEl = document.querySelector(".header-title-container h2");

  if (titleEl) {
    titleEl.style.transition = "opacity 0.5s ease";
    titleEl.style.opacity = "0";
    setTimeout(() => {
      titleEl.textContent = t.game_peaks || "Picos y Valles";
      titleEl.style.opacity = "1";
    }, 500);
  }

  // 4. Update Tooltip
  const tooltipTitle = document.querySelector(".info-tooltip h3");
  const tooltipDesc = document.querySelector(".info-tooltip p");

  if (tooltipTitle && tooltipDesc) {
    tooltipTitle.style.transition = "opacity 0.5s ease";
    tooltipDesc.style.opacity = "0";
    setTimeout(() => {
      tooltipTitle.style.opacity = "1";
      tooltipDesc.style.opacity = "1";
      // Unlock
      window.isGameTransitioning = false;
    }, 500);
  }

  // 5. Update Game Manager Logic
  if (gameManager.getState().progress.currentStage !== "peaks") {
    gameManager.updateProgress("progress", { currentStage: "peaks" });
  }

  // 6. Initialize Peaks Logic
  initPeaks();

  // 7. Hydrate Previous Progress (Fix for login restoration)
  const { resumeSudokuState } = await import("./sudoku.js");
  resumeSudokuState();
  resumePeaksState();
}

function prepareGameLogic() {
  const state = gameManager.getState();

  // FIXED: Use symmetric solution (TB, LR, etc.) instead of raw solution
  solvedBoard = gameManager.getTargetSolution();
  targetMap = new Map();

  // Find all Peaks and Valleys
  const result = getAllTargets(solvedBoard);
  targetMap = result.targetMap;

  totalTargets = targetMap.size;
  console.log(`Peaks & Valleys Ready. Found ${totalTargets} targets.`);
}

// checkCellType and getNeighbors moved to peaks-logic.js

function attachPeaksListeners() {
  const board = document.getElementById("memory-board");
  if (!board) return;

  // Use a named function reference to avoid duplication if called multiple times?
  // Ideally initPeaks is called once per session.
  // We can just add event listener.
  // IMPORTANT: We need to filter events if NOT in peaks mode, partially handled by logic but safer to check.

  board.addEventListener("click", handleBoardClick);

  // Listen for language changes to update tooltips dynamically
  window.addEventListener("languageChanged", updatePeaksTooltips);
}

function updatePeaksTooltips() {
  const lang = getCurrentLang();
  const t = translations[lang];
  const board = document.getElementById("memory-board");
  if (!board) return;

  // Update Peaks
  board.querySelectorAll(".peak-found").forEach((cell) => {
    cell.title = t.peaks_tooltip_peak || "Pico";
  });

  // Update Valleys
  board.querySelectorAll(".valley-found").forEach((cell) => {
    cell.title = t.peaks_tooltip_valley || "Valle";
  });
}

function handleBoardClick(e) {
  const gameSection = document.getElementById("game-section");
  if (!gameSection || !gameSection.classList.contains("peaks-mode")) return;

  const cell = e.target.closest(".mini-cell");
  if (!cell) return;

  // Prevent interacting with already solved cells
  if (cell.classList.contains("peaks-found")) return;

  // Calculate coords
  const slot = cell.closest(".sudoku-chunk-slot");
  if (!slot) return;

  const slotIndex = parseInt(slot.dataset.slotIndex);
  const cellsInSlot = Array.from(slot.querySelectorAll(".mini-cell"));
  const cellIndex = cellsInSlot.indexOf(cell);

  const row = Math.floor(slotIndex / 3) * 3 + Math.floor(cellIndex / 3);
  const col = (slotIndex % 3) * 3 + (cellIndex % 3);

  const key = `${row},${col}`;
  const targetType = targetMap.get(key);

  if (targetType) {
    // CORRECT!
    handleCorrectClick(cell, targetType, row, col);
  } else {
    // WRONG!
    handleIncorrectClick(cell);
  }
}

function handleCorrectClick(cell, type, row, col, silent = false) {
  cell.classList.add("peaks-found");
  // Visuals handled via CSS classes
  const lang = getCurrentLang();
  const t = translations[lang];

  if (type === "peak") {
    cell.classList.add("peak-found");
    cell.title = t.peaks_tooltip_peak || "Pico";
  } else {
    cell.classList.add("valley-found");
    cell.title = t.peaks_tooltip_valley || "Valle";
  }

  foundTargets++;
  updateRemainingCounter();

  // SYNC STATE: Save progress
  const state = gameManager.getState();
  if (!state.peaks.foundCoords) state.peaks.foundCoords = [];
  const coordsKey = `${row},${col}`;
  if (!state.peaks.foundCoords.includes(coordsKey)) {
    state.peaks.foundCoords.push(coordsKey);
  }

  if (silent) return;

  gameManager.save();

  checkPeaksVictory();
}

/**
 * Hydrates found peaks/valleys from saved state.
 */
export function resumePeaksState() {
  const state = gameManager.getState();
  const foundCoords = state.peaks?.foundCoords || [];

  console.log(`[Peaks] Hydrating ${foundCoords.length} found targets.`);

  const board = document.getElementById("memory-board");
  if (!board) return;

  // IMPORTANT: Reset foundTargets before hydration to avoid duplication
  foundTargets = 0;
  prepareGameLogic(); // Ensure targetMap is ready

  foundCoords.forEach((key) => {
    const [r, c] = key.split(",").map(Number);
    const targetType = targetMap.get(key);

    const slotIndex = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    const cellIndex = (r % 3) * 3 + (c % 3);

    const slot = board.querySelector(`[data-slot-index="${slotIndex}"]`);
    if (slot) {
      const cell = slot.querySelectorAll(".mini-cell")[cellIndex];
      if (cell) {
        handleCorrectClick(cell, targetType, r, c, true);
      }
    }
  });
}

function handleIncorrectClick(cell) {
  peaksErrors++;
  updateErrorCounter();

  // Sync with GameManager State
  gameManager.updateProgress("stats", { peaksErrors: peaksErrors });

  // Shake animation on the NUMBER only
  const numSpan = cell.querySelector(".curr-number");
  if (numSpan) {
    numSpan.classList.add("error-shake");
    setTimeout(() => numSpan.classList.remove("error-shake"), 500);
  } else {
    // Fallback if span missing
    cell.classList.add("error-shake");
    setTimeout(() => cell.classList.remove("error-shake"), 500);
  }
}

function updateRemainingCounter() {
  const el = document.getElementById("peaks-remaining-count");
  if (el) el.textContent = totalTargets - foundTargets;
}

function updateErrorCounter() {
  const el = document.getElementById("peaks-error-count");
  if (el) el.textContent = peaksErrors;
}

function checkPeaksVictory() {
  const currentState = gameManager.getState().progress.currentStage;
  if (currentState !== "peaks") return;

  if (foundTargets >= totalTargets) {
    console.log("Peaks Stage Complete!");

    // Play Victory Animation
    const board = document.getElementById("memory-board");
    if (board) board.classList.add("board-complete");

    // Localized Browser Alert
    const lang = getCurrentLang();
    const t = translations[lang];
    const msg =
      t.alert_next_search || "Siguiente: Sopa de Números\n(Próximamente)";

    // Trigger Search Stage...
    setTimeout(() => {
      if (board) board.classList.remove("board-complete");

      // Timer Transition
      gameManager.stopStageTimer(); // End Peaks
      gameManager.startStageTimer("search"); // Start Search

      transitionToSearch();
      // Also advance logic state
      gameManager.awardStagePoints("peaks");
      // gameManager.advanceStage("search"); // Explicit award is safer
    }, 800); // reduced delay to match animation (0.6s) + buffer
  }
}

export function providePeaksHint() {
  if (currentHintRow > 8) return; // Already finished or out of bounds

  console.log(`Providing Hint for Row ${currentHintRow}`);

  const board = document.getElementById("memory-board");
  // Find all cells for this row
  // We can select by iterating slots/cells but we have targetMap logic already.
  // Better to iterate cols 0..8

  for (let col = 0; col < 9; col++) {
    const key = `${currentHintRow},${col}`;
    const targetType = targetMap.get(key);

    // Only act if there IS a target here that hasn't been found yet
    if (targetType) {
      // Find the specific DOM element
      const slotIndex =
        Math.floor(currentHintRow / 3) * 3 + Math.floor(col / 3);
      const cellIndexInSlot = (currentHintRow % 3) * 3 + (col % 3);

      const slot = board.querySelector(
        `.sudoku-chunk-slot[data-slot-index="${slotIndex}"]`,
      );
      if (slot) {
        const cells = slot.querySelectorAll(".mini-cell");
        const cell = cells[cellIndexInSlot];

        if (cell && !cell.classList.contains("peaks-found")) {
          handleCorrectClick(cell, targetType, currentHintRow, col);
        }
      }
    }
  }

  currentHintRow++;
}
// --- DEBUG / BETA HELP ---
export function debugSolvePeaks() {
  // Solve ONE row that has remaining targets
  // We need to iterate rows 0..8

  const board = document.getElementById("memory-board");
  if (!board) return;

  for (let r = 0; r < 9; r++) {
    let hasUnfoundTargets = false;

    // Check this row for unfound targets in our targetMap
    // targetMap keys are "r,c"
    for (let c = 0; c < 9; c++) {
      const key = `${r},${c}`;
      if (targetMap.has(key)) {
        // It's a target! Check if found.
        // We can check DOM or internal state (?)
        // DOM is easiest: check for .peaks-found class??
        // But mapping DOM to r,c is tricky unless we select them.

        // Let's reverse: find the cell for r,c
        // block = floor(r/3)*3 + floor(c/3)
        // cellInBlock = (r%3)*3 + (c%3)

        const slotIndex = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        const cellIndex = (r % 3) * 3 + (c % 3);

        const slot = board.querySelector(
          `.sudoku-chunk-slot[data-slot-index="${slotIndex}"]`,
        );
        if (slot) {
          const cell = slot.querySelectorAll(".mini-cell")[cellIndex];
          if (cell && !cell.classList.contains("peaks-found")) {
            hasUnfoundTargets = true;
          }
        }
      }
    }

    if (hasUnfoundTargets) {
      // Solve this entire row
      console.log(`[Debug] Solving Peaks Row ${r}`);
      for (let c = 0; c < 9; c++) {
        const key = `${r},${c}`;
        const type = targetMap.get(key);
        if (type) {
          // It's a target
          const slotIndex = Math.floor(r / 3) * 3 + Math.floor(c / 3);
          const cellIndex = (r % 3) * 3 + (c % 3);
          const slot = board.querySelector(
            `.sudoku-chunk-slot[data-slot-index="${slotIndex}"]`,
          );
          if (slot) {
            const cell = slot.querySelectorAll(".mini-cell")[cellIndex];
            if (cell && !cell.classList.contains("peaks-found")) {
              handleCorrectClick(cell, type, r, c);
            }
          }
        }
      }
      return; // Done one row
    }
  }
}
