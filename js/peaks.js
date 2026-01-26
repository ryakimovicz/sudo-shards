/* Peaks Logic */
import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";

// State
let peaksErrors = 0;
let totalTargets = 0;
let foundTargets = 0;
let solvedBoard = null; // 9x9 matrix
let targetMap = null; // "row,col" -> "peak" | "valley"

export function initPeaks() {
  console.log("Initializing Peaks Stage...");

  // 1. Reset State
  peaksErrors = 0;
  foundTargets = 0;
  updateErrorCounter();
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

export function transitionToPeaks() {
  console.log("Transitioning to Peaks & Valleys...");

  const gameSection = document.getElementById("memory-game");
  const sudokuControls = document.getElementById("sudoku-controls");

  if (!gameSection) return;

  // 1. Hide Sudoku Controls
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
      tooltipTitle.textContent = t.peaks_help_title || "Picos y Valles";
      tooltipDesc.innerHTML = t.peaks_help_desc || t.es.peaks_help_desc; // Fallback
      tooltipTitle.style.opacity = "1";
      tooltipDesc.style.opacity = "1";
    }, 500);
  }

  // 5. Update Game Manager Logic
  if (gameManager.getState().progress.currentStage !== "peaks") {
    gameManager.updateProgress("progress", { currentStage: "peaks" });
  }

  // 6. Initialize Peaks Logic
  initPeaks();
}

function prepareGameLogic() {
  const state = gameManager.getState();
  solvedBoard = state.data.solution;
  targetMap = new Map();

  // Find all Peaks and Valleys
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const type = checkCellType(r, c, solvedBoard);
      if (type) {
        targetMap.set(`${r},${c}`, type);
      }
    }
  }

  totalTargets = targetMap.size;
  console.log(`Peaks & Valleys Ready. Found ${totalTargets} targets.`);
}

function checkCellType(row, col, board) {
  const val = board[row][col];
  const neighbors = getNeighbors(row, col);

  // Check Peak (All neighbors are SMALLER)
  const isPeak = neighbors.every((n) => board[n.r][n.c] < val);
  if (isPeak) return "peak";

  // Check Valley (All neighbors are LARGER)
  const isValley = neighbors.every((n) => board[n.r][n.c] > val);
  if (isValley) return "valley";

  return null;
}

function getNeighbors(r, c) {
  const neighbors = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
        neighbors.push({ r: nr, c: nc });
      }
    }
  }
  return neighbors;
}

function attachPeaksListeners() {
  const board = document.getElementById("memory-board");
  if (!board) return;

  // Use a named function reference to avoid duplication if called multiple times?
  // Ideally initPeaks is called once per session.
  // We can just add event listener.
  // IMPORTANT: We need to filter events if NOT in peaks mode, partially handled by logic but safer to check.

  board.addEventListener("click", handleBoardClick);
}

function handleBoardClick(e) {
  const gameSection = document.getElementById("memory-game");
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
    handleCorrectClick(cell, targetType);
  } else {
    // WRONG!
    handleIncorrectClick(cell);
  }
}

function handleCorrectClick(cell, type) {
  cell.classList.add("peaks-found");
  // Visuals handled via CSS classes
  if (type === "peak") {
    cell.classList.add("peak-found");
    cell.title = "Pico / Peak";
  } else {
    cell.classList.add("valley-found");
    cell.title = "Valle / Valley";
  }

  foundTargets++;
  updateRemainingCounter();
  checkPeaksVictory();
}

function handleIncorrectClick(cell) {
  peaksErrors++;
  updateErrorCounter();

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
  if (foundTargets >= totalTargets) {
    console.log("Peaks Stage Complete!");
    // Trigger Search Stage...
    setTimeout(() => {
      alert("¡Etapa Completada! Siguiente: Sopa de Números (Próximamente)");
      // gameManager.advanceStage("search");
    }, 500);
  }
}
