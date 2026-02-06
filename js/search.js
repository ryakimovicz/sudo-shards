/* Search Logic (Sopa de Números) */
import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";
import { isPeakOrValley, getNeighbors } from "./peaks-logic.js";
import { initCode } from "./code.js";
import { resetUI } from "./memory.js";

let isSelecting = false;
let currentPath = []; // Array of {r, c}
let currentCells = []; // Array of DOM Elements

export function initSearch() {
  console.log("Initializing Search Stage...");

  // Ensure data exists (Generated at Init now)
  // gameManager.ensureSearchGenerated(); // Removed to avoid freeze during transition
  const state = gameManager.getState();
  const searchData = state.search;

  if (!searchData || !searchData.targets.length) {
    console.error("Failed to load search targets.");
    return;
  }

  // Render UI
  renderTargets(searchData);
  attachSearchListeners();

  // Restore found state
  if (searchData.found && searchData.found.length > 0) {
    restoreFoundSequences(searchData);
  }
}

function renderTargets(data) {
  // Remove existing if any
  const existingContainer = document.getElementById("search-targets-container");
  if (existingContainer) existingContainer.remove();

  const gameSection = document.getElementById("game-section");

  const container = document.createElement("div");
  container.id = "search-targets-container";
  container.className = "search-targets-container";

  // REMOVED TITLE as per user request
  // const title = document.createElement("h3");
  // title.setAttribute("data-i18n", "search_targets_title");
  // const lang = getCurrentLang();
  // const t = translations[lang];
  // title.textContent = t && t.search_targets_title ? t.search_targets_title : "Secuencias:";
  // container.appendChild(title);

  const list = document.createElement("div");
  list.className = "search-targets-list";

  // Shuffle targets for display (Fisher-Yates)
  // We create a copy to not affect the actual data state
  const displayTargets = [...data.targets];
  for (let i = displayTargets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [displayTargets[i], displayTargets[j]] = [
      displayTargets[j],
      displayTargets[i],
    ];
  }

  displayTargets.forEach((target) => {
    const chip = document.createElement("div");
    chip.className = "search-target-chip";
    chip.dataset.id = target.id;
    // target.numbers is array [1, 5, 3...]
    chip.textContent = target.numbers.join(" - ");

    if (data.found.includes(target.id)) {
      chip.classList.add("found");
    }

    list.appendChild(chip);
  });

  container.appendChild(list);
  // Append to .board-wrapper to be "just below the board"
  const boardWrapper = document.querySelector(".board-wrapper");
  if (boardWrapper) {
    boardWrapper.appendChild(container);
  } else {
    gameSection.appendChild(container);
  }
}

function attachSearchListeners() {
  const board = document.getElementById("memory-board");
  if (!board) return;

  // Mouse / Touch Interaction
  board.addEventListener("mousedown", startSelection);
  document.addEventListener("mousemove", updateSelection); // Document to track drags smoothly
  document.addEventListener("mouseup", endSelection);

  // Mobile Touch equivalents
  board.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault(); // Prevent scroll
      startSelection(e.changedTouches[0]);
    },
    { passive: false },
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      updateSelection(e.changedTouches[0]);
    },
    { passive: false },
  );

  document.addEventListener("touchend", (e) => {
    endSelection(e.changedTouches[0]);
  });
}

function startSelection(e) {
  const gameSection = document.getElementById("game-section");
  if (!gameSection || !gameSection.classList.contains("search-mode")) return;

  const cell = getTargetCell(e);
  if (!cell) return;

  // Validate start cell: Not Peak, Not Valley, Not Found
  if (isInvalidStart(cell)) return;

  isSelecting = true;
  currentPath = [];
  currentCells = [];

  addToSelection(cell);
}

function updateSelection(e) {
  if (!isSelecting) return;
  const cell = getTargetCell(e);

  // If hovering same cell as last one, ignore
  if (
    !cell ||
    (currentCells.length > 0 && cell === currentCells[currentCells.length - 1])
  )
    return;

  // Validate move:
  // 1. Must be neighbor of last cell (Orthogonal)
  // 2. Must not be in current path (No loop)
  // 3. Must not be Peak/Valley/Found
  if (isValidMove(cell)) {
    addToSelection(cell);
  } else {
    // If user backtracks to previous cell, undo last step?
    if (
      currentCells.length > 1 &&
      cell === currentCells[currentCells.length - 2]
    ) {
      removeFromSelection();
    }
  }
}

function endSelection(e) {
  if (!isSelecting) return;
  isSelecting = false;

  validateSequence();
}

function getTargetCell(e) {
  // e.target might be the span inside
  let el = document.elementFromPoint(e.clientX, e.clientY);
  return el?.closest(".mini-cell");
}

function isInvalidStart(cell) {
  return (
    cell.classList.contains("peak-found") ||
    cell.classList.contains("valley-found") ||
    cell.classList.contains("search-found-cell")
  );
}

function isValidMove(cell) {
  if (isInvalidStart(cell)) return false;
  if (currentCells.includes(cell)) return false; // Already in path

  const lastCell = currentCells[currentCells.length - 1];
  if (!lastCell) return false; // Safety check for race conditions
  const lastSlot = lastCell.closest(".sudoku-chunk-slot");
  const thisSlot = cell.closest(".sudoku-chunk-slot");

  // Calculate rigorous row/col
  const lastCoords = getCoords(lastCell, lastSlot);
  const thisCoords = getCoords(cell, thisSlot);

  // Check Orthogonal
  const dr = Math.abs(lastCoords.r - thisCoords.r);
  const dc = Math.abs(lastCoords.c - thisCoords.c);

  return dr + dc === 1;
}

function getCoords(cell, slot) {
  const slotIndex = parseInt(slot.dataset.slotIndex);
  const cells = Array.from(slot.querySelectorAll(".mini-cell"));
  const idx = cells.indexOf(cell);
  const r = Math.floor(slotIndex / 3) * 3 + Math.floor(idx / 3);
  const c = (slotIndex % 3) * 3 + (idx % 3);
  return { r, c };
}

function addToSelection(cell) {
  const slot = cell.closest(".sudoku-chunk-slot");
  const coords = getCoords(cell, slot);

  currentCells.push(cell);
  currentPath.push(coords);
  cell.classList.add("search-selected");
}

function removeFromSelection() {
  const cell = currentCells.pop();
  currentPath.pop();
  cell.classList.remove("search-selected");
}

function validateSequence() {
  // Check against targets
  // path is array of {r, c}
  // Convert to numbers
  const state = gameManager.getState();
  const targets = state.search.targets;
  const found = state.search.found;

  const currentNumbers = currentCells.map((c) => c.textContent.trim());
  const currentNumString = currentNumbers.join(",");

  // EASTER EGG CHECK: "4,2"
  if (currentNumString === "4,2") {
    triggerEasterEgg(); // Random emoji
  }

  // EASTER EGG CHECK: "5"
  if (currentNumString === "5") {
    // Check if it's a valid target first? NO, override for Easter Egg.
    // If "5" IS a target, it will match below and trigger found sequence simultaneously?
    // Let's allow it. Emoji overlays don't block game logic.
    triggerEasterEgg("🍵");
  }

  const match = targets.find((t) => {
    // Exact match of numbers AND not already found
    if (found.includes(t.id)) return false;
    const targetNumString = t.numbers.join(",");
    // Also check coordinate match? The logical requirement is sequence of numbers.
    // If there are duplicate sequences, finding one is enough.
    // However, the GENERATION ensures unique paths.
    // But does it ensure unique number sequences? "avoid duplicate sequences if possible".
    // If it's ambiguous, we should verify COORDINATES or just accept the number sequence.
    // Let's accept the number sequence if it matches.
    if (targetNumString === currentNumString) return true;

    // Reverse match allowed? "can change direction" implies path logic, not reverse reading.
    // Usually word search allows reverse. But here "sequence" implies order 1->2->3.
    // Assuming strict order as generated.
    return false;
  });

  if (match) {
    // VICTORY for this sequence
    handleFoundSequence(match);
    // Clear selection immediately after success
    currentCells.forEach((c) => c.classList.remove("search-selected"));
    currentPath = [];
    currentCells = [];
  } else {
    // FAILURE for this sequence
    // Visual Feedback: Shake + Red

    // Capture the cells to clear in a local variable to avoid race conditions
    const errorCells = [...currentCells];

    errorCells.forEach((c) => {
      c.classList.remove("search-selected");
      c.classList.add("search-error");
    });

    // Clear globals immediately so new selection can start fresh if user is fast
    currentPath = [];
    currentCells = [];

    // Wait for animation to finish before clearing classes
    setTimeout(() => {
      errorCells.forEach((c) => {
        c.classList.remove("search-error");
      });
    }, 500);
  }
}

function handleFoundSequence(target) {
  const state = gameManager.getState();
  if (!state.search.found.includes(target.id)) {
    state.search.found.push(target.id);
    gameManager.save();
  }

  // 1. Mark Cells Permanently
  // We cannot rely on currentCells being populated (e.g. Hint mode)
  // So we explicitly find the cells from target.path
  const board = document.getElementById("memory-board");

  target.path.forEach((pos) => {
    // Find dom element for this position
    const slotIndex = Math.floor(pos.r / 3) * 3 + Math.floor(pos.c / 3);
    const cellIndex = (pos.r % 3) * 3 + (pos.c % 3);

    const slot = board.querySelector(
      `.sudoku-chunk-slot[data-slot-index="${slotIndex}"]`,
    );
    if (slot) {
      const cell = slot.querySelectorAll(".mini-cell")[cellIndex];
      if (cell) {
        cell.classList.remove("search-selected");
        cell.classList.add("search-found-cell");
      }
    }
  });

  // 2. Mark Chip (UI List)
  const chip = document.querySelector(
    `.search-target-chip[data-id="${target.id}"]`,
  );
  if (chip) chip.classList.add("found");

  // 3. Check All Found?
  if (state.search.found.length === state.search.targets.length) {
    console.log("ALL SEQUENCES FOUND!");

    // Trigger Global Win Animation & Transition
    const boardWrapper = document.querySelector(".board-wrapper");
    boardWrapper.classList.add("search-win"); // Green Glow or similar

    setTimeout(() => {
      boardWrapper.classList.remove("search-win");

      // Timer Transition
      gameManager.stopStageTimer(); // End Search
      gameManager.startStageTimer("code"); // Start Code

      gameManager.awardStagePoints("search"); // Advances to 'code'
      transitionToCode();
    }, 500);
  }
}

function restoreFoundSequences(data) {
  const board = document.getElementById("memory-board");
  // We need to re-scan board to find coords? Or we should store coords in target?
  // Target HAS 'path' [{r,c}].

  data.found.forEach((id) => {
    const target = data.targets.find((t) => t.id === id);
    if (!target) return;

    target.path.forEach((pos) => {
      // Find cell
      const slotIndex = Math.floor(pos.r / 3) * 3 + Math.floor(pos.c / 3);
      const cellIndex = (pos.r % 3) * 3 + (pos.c % 3);

      const slot = board.querySelector(
        `.sudoku-chunk-slot[data-slot-index="${slotIndex}"]`,
      );
      if (slot) {
        const cell = slot.querySelectorAll(".mini-cell")[cellIndex];
        if (cell) cell.classList.add("search-found-cell");
      }
    });
  });
}

export async function transitionToSearch() {
  console.log("Transitioning to Number Search...");
  window.isGameTransitioning = true;

  const gameSection = document.getElementById("game-section");
  if (!gameSection) return;

  // 1. Global UI Cleanup
  resetUI();

  // 1.5 Switch Mode Classes
  gameSection.classList.add("search-mode");

  // 2. Update Title
  const lang = getCurrentLang();
  const t = translations[lang];
  const titleEl = document.querySelector(".header-title-container h2");

  if (titleEl) {
    titleEl.style.transition = "opacity 0.5s ease";
    titleEl.style.opacity = "0";
    setTimeout(() => {
      titleEl.textContent = t.game_search || "Sopa de Números";
      titleEl.style.opacity = "1";
    }, 500);
  }

  // 3. Update Tooltip
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

  // 6. Initialize Search Logic
  initSearch();

  // 6.5 Update Stage in State
  if (gameManager.getState().progress.currentStage !== "search") {
    gameManager.updateProgress("progress", { currentStage: "search" });
  }

  // 7. Hydrate Previous Progress (Fix for login restoration)
  const { resumeSudokuState } = await import("./sudoku.js");
  const { resumePeaksState } = await import("./peaks.js");
  resumeSudokuState();
  resumePeaksState();
}

export function provideSearchHint() {
  const state = gameManager.getState();
  const searchData = state.search;

  if (!searchData || !searchData.targets) return;

  // Find first UNFOUND target
  const target = searchData.targets.find(
    (t) => !searchData.found.includes(t.id),
  );

  if (target) {
    console.log(
      `[Search] Resolving target ${target.id}: ${target.numbers.join("-")}`,
    );
    handleFoundSequence(target);
  } else {
    console.log("[Search] No more targets to solve.");
  }
}

export async function transitionToCode() {
  console.log("Transitioning to The Code...");
  window.isGameTransitioning = true;

  const gameSection = document.getElementById("game-section");
  if (!gameSection) return;

  // 1. Global UI Cleanup
  resetUI();

  // 1.5 Switch Mode Classes
  gameSection.classList.add("code-mode");

  // 2. Hide Search UI
  const searchContainer = document.getElementById("search-targets-container");
  if (searchContainer) searchContainer.style.display = "none";

  // 3. Update Title
  const lang = getCurrentLang();
  const t = translations[lang];
  const titleEl = document.querySelector(".header-title-container h2");

  if (titleEl) {
    titleEl.style.transition = "opacity 0.5s ease";
    titleEl.style.opacity = "0";
    setTimeout(() => {
      titleEl.textContent = t.game_code || "El Código";
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
      tooltipTitle.textContent = t.code_help_title || "El Código";
      tooltipDesc.innerHTML = t.code_help_desc || "Memoriza la secuencia.";
      tooltipTitle.style.opacity = "1";
      tooltipTitle.style.opacity = "1";
      tooltipDesc.style.opacity = "1";
      // Unlock
      window.isGameTransitioning = false;
    }, 500);
  }

  // 5.5 Update Stage in State
  if (gameManager.getState().progress.currentStage !== "code") {
    gameManager.updateProgress("progress", { currentStage: "code" });
  }

  // 6. Hydrate Previous Progress (Fix for login restoration)
  const { resumeSudokuState } = await import("./sudoku.js");
  const { resumePeaksState } = await import("./peaks.js");
  const { resumeCodeState } = await import("./code.js");

  await resumeSudokuState();
  await resumePeaksState();
  await resumeCodeState();

  // 7. Initialize Code Game AFTER hydration
  initCode();
}

function triggerEasterEgg(overrideEmoji = null) {
  const overlay = document.createElement("div");
  overlay.className = "easter-egg-overlay";

  // Use override if provided, else random
  const emoji = overrideEmoji || (Math.random() < 0.5 ? "💜" : "❓");
  overlay.textContent = emoji;

  const gameSection = document.getElementById("game-section");
  if (gameSection) {
    gameSection.appendChild(overlay);
    // Remove after animation (2s)
    setTimeout(() => {
      overlay.remove();
    }, 2000);
  }
}

// --- DEBUG / BETA HELP ---
export function debugSolveSearch() {
  provideSearchHint();
}
