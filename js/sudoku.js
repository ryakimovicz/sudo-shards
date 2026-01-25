import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";

let selectedCell = null;
let pencilMode = false;
let lockedNumber = null; // New State

export function initSudoku() {
  console.log("Initializing Sudoku Stage...");

  // Add listeners to keypad
  const numButtons = document.querySelectorAll(".sudoku-num");
  numButtons.forEach((btn) => {
    const val = btn.dataset.value;

    // Normal Click
    btn.addEventListener("click", (e) => {
      if (btn.dataset.longPressed === "true") {
        btn.dataset.longPressed = "false";
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // If we click a number while locked:
      // 1. If it's the SAME number, maybe unlock? or just apply?
      // 2. If it's a DIFFERENT number, just apply normally to selected cell?
      // Let's keep it simple: Click always attempts to apply to *selectedCell* if one exists.
      // BUT if we are in "Lock Mode", clicking the locked number again should probably UNLOCK it.
      if (lockedNumber === val) {
        unlockNumber();
      } else {
        // If another number was locked, unlock it first?
        // Or just apply this number momentarily?
        // Let's strict: Click applies number to selection.
        handleNumberInput(val);
      }
    });

    // Long Press to Lock
    const startPress = (e) => {
      btn.dataset.longPressed = "false";
      btn.dataset.pressTimer = setTimeout(() => {
        btn.dataset.longPressed = "true";
        toggleLockNumber(val);
      }, 600); // 600ms for number lock
    };

    const cancelPress = (e) => {
      const timer = btn.dataset.pressTimer;
      if (timer) clearTimeout(timer);
    };

    btn.addEventListener("mousedown", startPress);
    btn.addEventListener("touchstart", startPress, { passive: true });
    btn.addEventListener("mouseup", cancelPress);
    btn.addEventListener("mouseleave", cancelPress);
    btn.addEventListener("touchend", cancelPress);
  });

  document
    .getElementById("sudoku-pencil")
    ?.addEventListener("click", togglePencilMode);
  document.getElementById("sudoku-back")?.addEventListener("click", handleUndo);

  // Clear Button with Long Press Logic
  const clearBtn = document.getElementById("sudoku-clear");
  if (clearBtn) {
    // Normal click/tap for single cell
    clearBtn.addEventListener("click", (e) => {
      // If long press triggered, ignore this click
      if (clearBtn.dataset.longPressed === "true") {
        clearBtn.dataset.longPressed = "false";
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      clearSelectedCell();
    });

    // Mouse / Touch Events for Long Press
    const startPress = (e) => {
      clearBtn.dataset.longPressed = "false";
      clearBtn.dataset.pressTimer = setTimeout(() => {
        clearBtn.dataset.longPressed = "true";
        initiateClearBoard();
      }, 800); // 800ms threshold
    };

    const cancelPress = (e) => {
      const timer = clearBtn.dataset.pressTimer;
      if (timer) clearTimeout(timer);
    };

    clearBtn.addEventListener("mousedown", startPress);
    clearBtn.addEventListener("touchstart", startPress, { passive: true });

    clearBtn.addEventListener("mouseup", cancelPress);
    clearBtn.addEventListener("mouseleave", cancelPress);
    clearBtn.addEventListener("touchend", cancelPress);
  }

  // Modal Listeners
  document
    .getElementById("modal-cancel")
    ?.addEventListener("click", closeConfirmModal);
  document
    .getElementById("modal-confirm")
    ?.addEventListener("click", confirmClearBoard);
  document.getElementById("sudoku-back")?.addEventListener("click", handleUndo);

  const helpBtn = document.getElementById("debug-help-btn");
  if (helpBtn) {
    helpBtn.addEventListener("click", provideHint);
  }

  // Board cell selection
  const board = document.getElementById("memory-board");
  if (board) {
    board.addEventListener("click", (e) => {
      const cell = e.target.closest(".mini-cell");
      if (cell) {
        selectCell(cell);
      }
    });
  }
}

export function transitionToSudoku() {
  console.log("Transitioning to Sudoku...");

  const gameSection = document.getElementById("memory-game");
  const controls = document.getElementById("sudoku-controls");

  if (!gameSection || !controls) return;

  // Change mode with forced reflow for smooth animation
  gameSection.classList.remove("jigsaw-mode");
  gameSection.classList.remove("selection-active");
  gameSection.classList.remove("jigsaw-selection-active");

  // Force reflow to capture the starting state for transitions
  void gameSection.offsetWidth;

  gameSection.classList.add("sudoku-mode");

  // Show controls
  controls.classList.remove("hidden");

  // CLEANUP BOARD STATE: Remove jigsaw-related victory classes
  const board = document.getElementById("memory-board");
  if (board) {
    board.classList.remove("board-complete", "board-error");
  }

  // Update header title/desc if needed via gameManager or manually
  const headerTitle = gameSection.querySelector(".header-title-container h2");
  if (headerTitle) {
    headerTitle.textContent =
      translations[gameManager.getState().language]?.game_sudoku || "Sudoku";
  }

  // Deselect any jigsaw pieces
  document
    .querySelectorAll(".selected")
    .forEach((el) => el.classList.remove("selected"));

  // Update Tooltip Info for Sudoku
  const lang = getCurrentLang();
  const t = translations[lang];
  const tooltipTitle = document.querySelector(".info-tooltip h3");
  const tooltipDesc = document.querySelector(".info-tooltip p");

  if (tooltipTitle && tooltipDesc) {
    tooltipTitle.style.transition = "opacity 0.5s ease";
    tooltipDesc.style.transition = "opacity 0.5s ease";
    tooltipTitle.style.opacity = "0";
    tooltipDesc.style.opacity = "0";

    setTimeout(() => {
      tooltipTitle.textContent = t.sudoku_help_title || "Sudoku";
      tooltipDesc.innerHTML = t.sudoku_help_desc || "";
      tooltipTitle.style.opacity = "1";
      tooltipDesc.style.opacity = "1";
    }, 500);
  }
}

/* Keypad Feedback Helper */
/* Keypad Feedback Helper */
function updateKeypadHighlights(cell) {
  // 1. Reset all keys (except locked ones)
  document.querySelectorAll(".sudoku-num").forEach((btn) => {
    btn.classList.remove("key-present", "key-disabled");
  });

  if (!cell) return;

  const presentNumbers = new Set();
  let hasNotes = false;

  // 2. Check content
  if (cell.querySelector(".notes-grid")) {
    hasNotes = true;
    const slots = cell.querySelectorAll(".note-slot");
    slots.forEach((slot) => {
      if (slot.textContent) presentNumbers.add(slot.dataset.note);
    });
  } else {
    const val = cell.textContent.trim();
    if (val) presentNumbers.add(val);
  }

  // 3. Highlight and Disable logic
  document.querySelectorAll(".sudoku-num").forEach((btn) => {
    const val = btn.dataset.value;

    // Highlight if present
    if (presentNumbers.has(val)) {
      btn.classList.add("key-present");
    }

    // Disable if: Not Pencil Mode AND Has Notes AND This number is NOT in notes
    // This enforces "Using candidates as constraints"
    if (!pencilMode && hasNotes && !presentNumbers.has(val)) {
      btn.classList.add("key-disabled");
    }
  });
}

function highlightSimilarCells(val) {
  // 1. Clear previous highlights
  const board = document.getElementById("memory-board");
  if (board) {
    board
      .querySelectorAll(".highlight-match")
      .forEach((el) => el.classList.remove("highlight-match"));
  }

  if (!val) return;

  // 2. Highlight matches
  if (board) {
    board.querySelectorAll(".mini-cell").forEach((cell) => {
      // Only match main numbers, ignoring notes for now (or strictly matching main text)
      if (cell.textContent === val && !cell.classList.contains("has-notes")) {
        cell.classList.add("highlight-match");
      }
    });
  }
}

function selectCell(cell, skipPaint = false) {
  // Guard: Only allow selection in Sudoku Mode
  const gameSection = document.getElementById("memory-game");
  if (!gameSection || !gameSection.classList.contains("sudoku-mode")) {
    return;
  }

  // Can't edit pre-filled cells (initial puzzle numbers)
  if (
    cell.classList.contains("has-number") &&
    !cell.classList.contains("user-filled")
  ) {
    updateKeypadHighlights(cell); // Still show feedback for pre-filled cells!
    return;
  }

  // PAINT MODE: If we have a locked number, apply it immediately!
  if (lockedNumber && !skipPaint) {
    // Select it briefly for feedback? OR just apply.
    // Let's set it as selectedCell temporarily so handleNumberInput works on it
    if (selectedCell) selectedCell.classList.remove("selected-cell");
    selectedCell = cell;
    selectedCell.classList.add("selected-cell");

    handleNumberInput(lockedNumber);
    // handleNumberInput will call updateKeypadHighlights
    return;
  }

  if (selectedCell) {
    selectedCell.classList.remove("selected-cell");
  }

  selectedCell = cell;
  selectedCell.classList.add("selected-cell");
  updateKeypadHighlights(cell);

  // Highlight similar numbers
  const val = cell.textContent.trim();
  if (val && !cell.classList.contains("has-notes")) {
    highlightSimilarCells(val);
  } else {
    // If empty or notes, clear highlights
    highlightSimilarCells(null);
  }
}

/* Locking Logic Helper */
function toggleLockNumber(num) {
  if (lockedNumber === num) {
    unlockNumber();
  } else {
    lockNumber(num);
  }
}

function lockNumber(num) {
  lockedNumber = num;
  // Update UI
  document.querySelectorAll(".sudoku-num").forEach((btn) => {
    if (btn.dataset.value === num) btn.classList.add("locked-num");
    else btn.classList.remove("locked-num");
  });
  // Highlight all instances of this number
  highlightSimilarCells(num);
}

function unlockNumber() {
  lockedNumber = null;
  document.querySelectorAll(".sudoku-num").forEach((btn) => {
    btn.classList.remove("locked-num");
  });

  // If we have a selected cell, revert to highlighting ITS value
  if (selectedCell) {
    const val = selectedCell.textContent.trim();
    if (val && !selectedCell.classList.contains("has-notes")) {
      highlightSimilarCells(val);
    } else {
      highlightSimilarCells(null);
    }
  } else {
    highlightSimilarCells(null);
  }
}

function handleNumberInput(num) {
  if (!selectedCell) return;

  // NOTE CONSTRAINT CHECK:
  // If not pencil mode, and cell has notes, and num is NOT in notes -> Block it.
  if (!pencilMode && selectedCell.classList.contains("has-notes")) {
    const notesGrid = selectedCell.querySelector(".notes-grid");
    if (notesGrid) {
      const noteSlot = notesGrid.querySelector(`[data-note="${num}"]`);
      // If slot is empty (text content is empty), then this number is NOT a candidate
      if (!noteSlot || !noteSlot.textContent) {
        console.log("Input blocked by Note Constraint");
        return;
      }
    }
  }

  // Track History
  pushAction(selectedCell);

  if (pencilMode) {
    // Implement notes logic
    console.log("Pencil note:", num);
    toggleNote(selectedCell, num, true); // Pass true to skip inner history push (already pushed above)
  } else {
    selectedCell.textContent = num;
    selectedCell.classList.add("user-filled");
    selectedCell.classList.remove("has-notes");
    // Clear any notes
    const notesGrid = selectedCell.querySelector(".notes-grid");
    if (notesGrid) notesGrid.remove();

    // REMOVE ERROR CLASS ON EDIT
    selectedCell.classList.remove("error");

    // VALIDATE BOARD AFTER FILL
    validateBoard();
    updateKeypadHighlights(selectedCell);
    highlightSimilarCells(num);
  }
}

function togglePencilMode() {
  pencilMode = !pencilMode;
  const btn = document.getElementById("sudoku-pencil");
  if (btn) {
    btn.classList.toggle("active", pencilMode);
  }
  updateKeypadHighlights(selectedCell);
}

function clearSelectedCell() {
  if (!selectedCell) return;
  pushAction(selectedCell); // Track clear
  selectedCell.textContent = "";
  selectedCell.classList.remove("user-filled", "has-notes", "error");
  const notesGrid = selectedCell.querySelector(".notes-grid");
  if (notesGrid) notesGrid.remove();

  updateKeypadHighlights(selectedCell);

  // Clear highlighting since the cell is now empty
  highlightSimilarCells(null);
}

// History for Undo
let undoStack = [];

function pushAction(cell) {
  // Capture snapshot BEFORE change
  const hasNotes = !!cell.querySelector(".notes-grid");

  const action = {
    cell: cell,
    // If it has a grid, the "text content" is just the concatenation of notes,
    // which we don't want to restore as a big number.
    // We only care about textContent if it's a real user value (no grid).
    previousText: hasNotes ? "" : cell.textContent,
    previousClasses: [...cell.classList],
    previousNotes: cell.querySelector(".notes-grid")?.cloneNode(true),
  };
  undoStack.push(action);
}

function handleUndo() {
  if (undoStack.length === 0) {
    console.log("Nothing to undo");
    return;
  }

  const action = undoStack.pop();
  const cell = action.cell;

  // Restore State
  cell.textContent = action.previousText;
  cell.className = ""; // Reset first
  action.previousClasses.forEach((c) => cell.classList.add(c));

  // Restore Notes if any
  const existingNotes = cell.querySelector(".notes-grid");
  if (existingNotes) existingNotes.remove();

  if (action.previousNotes) {
    cell.appendChild(action.previousNotes);
  }

  // Restore selection to the undone cell for continuity, but properly skip Paint Mode
  selectCell(cell, true);

  // Re-validate to clear any global error states potentially caused by this move
  validateBoard();
}

function toggleNote(cell, num, skipHistory = true) {
  if (!skipHistory) pushAction(cell); // Only push if not already pushed by caller

  // Check if we are converting a real number to notes
  const existingVal = cell.textContent;
  const wasUserFilled = cell.classList.contains("user-filled");
  const hasExistingNotes = !!cell.querySelector(".notes-grid");

  cell.classList.add("has-notes");
  cell.classList.remove("error"); // Pencil marks clear error state
  cell.classList.remove("user-filled"); // No longer a "final" answer

  let notesGrid = cell.querySelector(".notes-grid");

  // If no grid exists, create it (and clear any single number interacting)
  if (!notesGrid) {
    cell.textContent = ""; // Clear main number to make room for grid

    notesGrid = document.createElement("div");
    notesGrid.classList.add("notes-grid");
    cell.appendChild(notesGrid);

    // Initialize 9 empty slots
    for (let i = 1; i <= 9; i++) {
      const slot = document.createElement("div");
      slot.classList.add("note-slot");
      slot.dataset.note = i;
      notesGrid.appendChild(slot);
    }

    // Capture the existing number as a note if it was a user entry
    if (wasUserFilled && existingVal && !hasExistingNotes) {
      const oldSlot = notesGrid.querySelector(`[data-note="${existingVal}"]`);
      if (oldSlot) oldSlot.textContent = existingVal;
    }
  }

  const slot = notesGrid.querySelector(`[data-note="${num}"]`);
  if (slot) {
    // Toggle: if empty set num, if num set empty
    slot.textContent = slot.textContent ? "" : num;
  }

  updateKeypadHighlights(cell);
}

function validateBoard() {
  const gameSection = document.getElementById("memory-game");
  if (!gameSection || !gameSection.classList.contains("sudoku-mode")) return;

  const board = document.getElementById("memory-board");
  // Be surgical: only slots inside the board
  const slots = Array.from(board.querySelectorAll(".sudoku-chunk-slot"));

  if (slots.length !== 9) {
    console.warn("Sudoku validation: expected 9 slots, found", slots.length);
    return;
  }

  // 1. Check if Board is Full
  let isFull = true;
  const allCells = [];
  let missingCells = 0;

  slots.forEach((slot) => {
    // Slot index is fixed in DOM order 0-8
    const slotIndex = parseInt(slot.dataset.slotIndex);
    const cells = Array.from(slot.querySelectorAll(".mini-cell"));

    cells.forEach((cell, localIndex) => {
      const val = cell.textContent.trim();
      const hasNotes = cell.classList.contains("has-notes");

      // Store cell with its mapped coordinates
      const row = Math.floor(slotIndex / 3) * 3 + Math.floor(localIndex / 3);
      const col = (slotIndex % 3) * 3 + (localIndex % 3);
      allCells.push({ element: cell, row, col, val });

      if (val === "" || hasNotes) {
        isFull = false;
        missingCells++;
      }
    });
  });

  if (!isFull) {
    if (missingCells < 5)
      console.log(`Sudoku: ${missingCells} cells remaining...`);
    return;
  }

  if (allCells.length !== 81) {
    console.warn(
      "Sudoku validation: expected 81 cells, found",
      allCells.length,
    );
    return;
  }

  console.log("Sudoku Board Full - Validating Matrix...");

  const state = gameManager.getState();
  const solution = state.data.solution;
  let errorCount = 0;

  allCells.forEach((cellData) => {
    const correctValue = solution[cellData.row][cellData.col];
    const userValue = parseInt(cellData.val);

    if (userValue !== correctValue) {
      if (cellData.element.classList.contains("user-filled")) {
        cellData.element.classList.add("error");
      }
      errorCount++;
    } else {
      cellData.element.classList.remove("error");
    }
  });

  if (errorCount === 0) {
    console.log("Sudoku Solved! Triggering success feedback...");
    handleSudokuWin();
  } else {
    console.log(`Sudoku: Board full but ${errorCount} errors found.`);
  }
}

function handleSudokuWin() {
  const board = document.getElementById("memory-board");
  if (board) {
    board.classList.add("board-complete");

    // Advance Stage after animation
    setTimeout(() => {
      board.classList.remove("board-complete");

      // Localized Browser Alert
      const lang = getCurrentLang();
      const msg =
        translations[lang].alert_next_peaks || translations.es.alert_next_peaks;
      alert(msg);

      gameManager.advanceStage();
    }, 1500);
  }
}

function provideHint() {
  const gameSection = document.getElementById("memory-game");
  if (!gameSection || !gameSection.classList.contains("sudoku-mode")) return;

  const board = document.getElementById("memory-board");
  const slots = Array.from(board.querySelectorAll(".sudoku-chunk-slot"));

  if (slots.length !== 9) return;

  const state = gameManager.getState();
  const solution = state.data.solution;

  // 1. Gather all cells with their mapped coordinates
  const allCells = [];
  slots.forEach((slot) => {
    const slotIndex = parseInt(slot.dataset.slotIndex);
    const cells = Array.from(slot.querySelectorAll(".mini-cell"));
    cells.forEach((cell, localIndex) => {
      const row = Math.floor(slotIndex / 3) * 3 + Math.floor(localIndex / 3);
      const col = (slotIndex % 3) * 3 + (localIndex % 3);
      allCells.push({ element: cell, row, col });
    });
  });

  // 2. Sort by reading order (row then col)
  allCells.sort((a, b) => a.row - b.row || a.col - b.col);

  // 3. Find the FIRST empty or incorrect cell
  const target = allCells.find((cell) => {
    const val = cell.element.textContent.trim();
    const isIncorrect =
      cell.element.classList.contains("user-filled") &&
      parseInt(val) !== solution[cell.row][cell.col];
    const isEmpty = val === "" || cell.element.classList.contains("has-notes");
    return isEmpty || isIncorrect;
  });

  if (target) {
    const correctVal = solution[target.row][target.col];
    target.element.textContent = correctVal;
    target.element.classList.add("user-filled");
    target.element.classList.remove("has-notes", "error");

    // Clean up notes grid if any
    const notesGrid = target.element.querySelector(".notes-grid");
    if (notesGrid) notesGrid.remove();

    // Trigger validation (only triggers win if this was the last cell)
    validateBoard();
  }
}
// Long Press Clear Board Logic
function initiateClearBoard() {
  const skipConfirm =
    localStorage.getItem("jigsudo_skip_clear_confirm") === "true";

  if (skipConfirm) {
    clearBoard();
  } else {
    showConfirmModal();
  }
}

function showConfirmModal() {
  const modal = document.getElementById("confirm-modal");
  if (modal) modal.classList.remove("hidden");
}

function closeConfirmModal() {
  const modal = document.getElementById("confirm-modal");
  if (modal) modal.classList.add("hidden");
}

function confirmClearBoard() {
  // Check preference
  const dontAsk = document.getElementById("modal-dont-ask");
  if (dontAsk && dontAsk.checked) {
    localStorage.setItem("jigsudo_skip_clear_confirm", "true");
  }

  clearBoard();
  closeConfirmModal();
}

function clearBoard() {
  const board = document.getElementById("memory-board");
  if (!board) return;

  // Track as a single massive undoable action?
  // For now, let's keep it simple mostly because undoing a full board clear is heavy.
  // But strictly we should probably clear the history stack to avoid inconsistencies
  undoStack = []; // Reset history on full clear

  const slots = Array.from(board.querySelectorAll(".sudoku-chunk-slot"));
  let changesMade = false;

  slots.forEach((slot) => {
    const cells = Array.from(slot.querySelectorAll(".mini-cell"));
    cells.forEach((cell) => {
      // Only clear user-filled cells, not initial puzzle numbers
      if (
        cell.classList.contains("user-filled") ||
        cell.classList.contains("has-notes")
      ) {
        cell.textContent = "";
        cell.classList.remove(
          "user-filled",
          "has-notes",
          "error",
          "selected-cell",
        );

        const notes = cell.querySelector(".notes-grid");
        if (notes) notes.remove();

        changesMade = true;
      }
    });
  });

  // Re-select active cell if any remained (probably not needed if we cleared selection)
  selectedCell = null;

  if (changesMade) {
    console.log("Board cleared by user.");
    validateBoard(); // Remove any global error states
  }
}
