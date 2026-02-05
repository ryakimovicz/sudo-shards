import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";
import { transitionToPeaks } from "./peaks.js";
// State
let selectedCell = null;
let pencilMode = false;
let lockedNumber = null; // New State

export function transitionToSudoku() {
  console.log("Transitioning to Sudoku Stage...");
  const lang = getCurrentLang();
  const t = translations[lang];

  // 1. Update Title
  const titleEl = document.querySelector(".header-title-container h2");
  if (titleEl) {
    titleEl.style.transition = "opacity 0.5s ease";
    titleEl.style.opacity = "0";
    setTimeout(() => {
      titleEl.textContent = t.game_sudoku || "Sudoku";
      titleEl.style.opacity = "1";
    }, 500);
  }

  // 2. Update Tooltip
  const tooltipTitle = document.querySelector(".info-tooltip h3");
  const tooltipDesc = document.querySelector(".info-tooltip p");
  if (tooltipTitle && tooltipDesc) {
    tooltipTitle.style.transition = "opacity 0.5s ease";
    tooltipDesc.style.transition = "opacity 0.5s ease";
    tooltipTitle.style.opacity = "0";
    tooltipDesc.style.opacity = "0";
    setTimeout(() => {
      tooltipTitle.textContent = t.sudoku_help_title;
      tooltipDesc.innerHTML = t.sudoku_help_desc;
      tooltipTitle.style.opacity = "1";
      tooltipDesc.style.opacity = "1";
    }, 500);
  }

  // 3. Switch Mode
  const gameSection = document.getElementById("game-section");
  const sudokuControls = document.getElementById("sudoku-controls");

  if (gameSection) {
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        gameSection.classList.remove("jigsaw-mode");
        gameSection.classList.add("sudoku-mode");

        // CLEANUP JIGSAW STATE INTERNALLY
        const board = document.getElementById("memory-board");
        if (board) {
          board.classList.remove("board-complete", "board-error");
          // Remove leftover Jigsaw classes from slots if any (though usually fine)
        }

        if (sudokuControls) sudokuControls.classList.remove("hidden");

        // Hide Collected Pieces (Performance)
        const collectedWrapper = document.querySelector(".collected-wrapper");
        if (collectedWrapper) collectedWrapper.style.display = "none";

        // Update Title/Text instantly here so it cross-fades with the view transition
        if (titleEl) {
          titleEl.textContent = t.game_sudoku || "Sudoku";
          titleEl.style.opacity = "1";
        }
        if (tooltipTitle && tooltipDesc) {
          tooltipTitle.textContent = t.sudoku_help_title;
          tooltipDesc.innerHTML = t.sudoku_help_desc;
          tooltipTitle.style.opacity = "1";
          tooltipDesc.style.opacity = "1";
        }

        gameManager.updateProgress("progress", { currentStage: "sudoku" });
      });
    } else {
      // Fallback
      gameSection.classList.remove("jigsaw-mode");
      gameSection.classList.add("sudoku-mode");
      if (sudokuControls) sudokuControls.classList.remove("hidden");

      // CLEANUP BOARD STATE
      const board = document.getElementById("memory-board");
      if (board) {
        board.classList.remove("board-complete", "board-error");
      }

      // Hide Collected Pieces
      const collectedWrapper = document.querySelector(".collected-wrapper");
      if (collectedWrapper) collectedWrapper.style.display = "none";

      if (titleEl) {
        titleEl.textContent = t.game_sudoku || "Sudoku";
        titleEl.style.opacity = "1";
      }
      if (tooltipTitle && tooltipDesc) {
        tooltipTitle.textContent = t.sudoku_help_title;
        tooltipDesc.innerHTML = t.sudoku_help_desc;
        tooltipTitle.style.opacity = "1";
        tooltipDesc.style.opacity = "1";
      }

      gameManager.updateProgress("progress", { currentStage: "sudoku" });
    }
  }
}

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

      // Check if number is globally completed
      if (btn.classList.contains("key-completed")) {
        highlightSimilarCells(val);
        return;
      }

      // If we are in "Lock Mode" (Paint Mode)
      if (lockedNumber) {
        if (lockedNumber === val) {
          // Click active lock -> Unlock
          unlockNumber();
        } else {
          // Click different number -> Switch Lock
          lockNumber(val);
        }
      } else {
        // Normal Mode -> Apply number to selected cell
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

  /* Help button handled centrally by memory.js */

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

  // Global Click Listener for "Outside Unlock"
  document.addEventListener("click", (e) => {
    // If nothing locked, ignore - REMOVED so we can deselect cells too!
    // if (!lockedNumber) return;

    // If click is inside board, controls, or specific buttons, ignore
    const isControl = e.target.closest(".sudoku-controls");
    const isBoard = e.target.closest("#memory-board");
    const isPencil = e.target.closest("#sudoku-pencil");
    const isUndo = e.target.closest("#sudoku-back");
    const isClear = e.target.closest("#sudoku-clear");
    const isModal = e.target.closest(".modal");

    if (
      !isControl &&
      !isBoard &&
      !isPencil &&
      !isUndo &&
      !isClear &&
      !isModal
    ) {
      if (lockedNumber) unlockNumber();
      deselectCurrentCell(); // Always deselect cell if clicking outside
      highlightSimilarCells(null); // Clear highlights
    }
  });

  // Physical Keyboard Support
  document.addEventListener("keydown", (e) => {
    const gameSection = document.getElementById("game-section");
    if (!gameSection || !gameSection.classList.contains("sudoku-mode")) return;

    // Ignore if modal is open
    if (!document.getElementById("confirm-modal")?.classList.contains("hidden"))
      return;

    const key = e.key;

    // Numbers 1-9
    if (key >= "1" && key <= "9") {
      handleNumberInput(key);
      return;
    }

    // Backspace / Delete
    if (key === "Backspace" || key === "Delete") {
      clearSelectedCell();
      return;
    }

    // Escape -> Deselect / Unlock
    if (key === "Escape") {
      if (lockedNumber) unlockNumber();
      deselectCurrentCell();
      highlightSimilarCells(null);
      return;
    }

    // Custom Shortcuts (Q=Undo, W=Notes, E=Clear) - User Preference
    const lowerKey = key.toLowerCase();

    // Q -> Undo, Backspace (if just navigation)
    if (lowerKey === "q") {
      handleUndo();
      return;
    }

    // W -> Pencil/Notes Mode
    if (lowerKey === "w" || lowerKey === "p" || lowerKey === "n") {
      togglePencilMode();
      return;
    }

    // E -> Eraser/Clear
    if (lowerKey === "e") {
      clearSelectedCell();
      return;
    }
  });
}

/* Keypad Feedback Helper */
function updateKeypadHighlights(cell) {
  // 1. Reset all keys (except locked ones)
  const board = document.getElementById("memory-board");

  document.querySelectorAll(".sudoku-num").forEach((btn) => {
    btn.classList.remove("key-present", "key-disabled", "key-completed");
  });

  // Calculate Global Counts
  const globalCounts = {};
  if (board) {
    board.querySelectorAll(".mini-cell").forEach((c) => {
      const v = c.textContent.trim();
      if (v && !c.classList.contains("has-notes")) {
        globalCounts[v] = (globalCounts[v] || 0) + 1;
      }
    });
  }

  // 2. Local Context Logic
  if (cell) {
    const presentNumbers = new Set();
    let visibleNotesCount = 0;
    let hasNotes = false;

    // Check content
    if (cell.querySelector(".notes-grid")) {
      hasNotes = true;
      const slots = cell.querySelectorAll(".note-slot");
      slots.forEach((slot) => {
        if (slot.textContent) {
          presentNumbers.add(slot.dataset.note);
          visibleNotesCount++;
        }
      });
    } else {
      const val = cell.textContent.trim();
      if (val) presentNumbers.add(val);
    }

    // 3. Highlight and Disable logic
    document.querySelectorAll(".sudoku-num").forEach((btn) => {
      const val = btn.dataset.value;

      // Global Check first
      if (globalCounts[val] >= 9) {
        btn.classList.add("key-completed");
        // If completed, we shouldn't really disable it locally in a way that hides completion
        // But maybe we want visual priority? key-completed should override.
      } else {
        // Highlight if present LOCALLY
        if (presentNumbers.has(val)) {
          btn.classList.add("key-present");
        }

        // Disable if: Not Pencil Mode AND Has Notes AND This number is NOT in notes AND there are visible notes
        if (
          !pencilMode &&
          hasNotes &&
          !presentNumbers.has(val) &&
          visibleNotesCount > 0
        ) {
          btn.classList.add("key-disabled");
        }
      }
    });
  } else {
    // Even if no cell selected, show completed numbers
    document.querySelectorAll(".sudoku-num").forEach((btn) => {
      const val = btn.dataset.value;
      if (globalCounts[val] >= 9) {
        btn.classList.add("key-completed");
      }
    });
  }
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
  } else {
    highlightSimilarCells(null);
  }
}

function deselectCurrentCell() {
  if (selectedCell) {
    selectedCell.classList.remove("selected-cell");
    selectedCell = null;
    // Clear keypad feedback
    updateKeypadHighlights(null);
    // Clear board highlights (matching numbers)
    highlightSimilarCells(null);
  }
}

function selectCell(cell, skipPaint = false) {
  // Guard: Only allow selection in Sudoku Mode
  const gameSection = document.getElementById("game-section");
  if (!gameSection || !gameSection.classList.contains("sudoku-mode")) {
    return;
  }

  // Can't edit pre-filled cells (initial puzzle numbers)
  if (
    cell.classList.contains("has-number") &&
    !cell.classList.contains("user-filled")
  ) {
    deselectCurrentCell();
    // highlightSimilarCells(cell.textContent.trim()); // But keep board highlighting!
    // Actually, deselectCurrentCell calls updateKeypadHighlights(null) which is fine.
    // The previous highlightSimilarCells call was for smart highlighting.
    // We should ensure deselectCurrentCell doesn't break smart highlighting if we want to keep it.

    // User asked: "entonces al hacer click sobre un numero fijo del tablero se tiene que deseleccionar la casilla seleccionada."
    // This implies we lose the *edit* selection.
    // Does it imply we lose the *smart highlight*?
    // "Al hacer click sobre numero que ya venían en el tablero, el keypad marca el nuemor en gris. Eso no tiene que pasar."

    // So:
    // 1. Deselect active cell.
    // 2. Clear keypad highlights (handled by deselectCurrentCell -> updateKeypadHighlights(null)).
    // 3. Highlight board similar cells? previous turn implies yes ("el tablero SÍ se ilumina").

    const val = cell.textContent.trim();
    highlightSimilarCells(val);
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

  // UX Improvement: If a cell is currently selected, apply the locked number to it!
  if (selectedCell) {
    // Only if editable (not pre-filled)
    if (
      !selectedCell.classList.contains("has-number") ||
      selectedCell.classList.contains("user-filled")
    ) {
      handleNumberInput(num);
    }
  }
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
      // Check if ANY note is visible
      const visibleNotes = Array.from(
        notesGrid.querySelectorAll(".note-slot"),
      ).filter((slot) => slot.textContent).length;

      // Only enforce constraint if there are actually visible notes
      if (visibleNotes > 0) {
        const noteSlot = notesGrid.querySelector(`[data-note="${num}"]`);
        // If slot is empty (text content is empty), then this number is NOT a candidate
        if (!noteSlot || !noteSlot.textContent) {
          console.log("Input blocked by Note Constraint");
          return;
        }
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

    updateNoteVisibility(); // Check constraints
    updateKeypadHighlights(selectedCell);
    highlightSimilarCells(num);

    // VALIDATE BOARD AFTER FILL (Last step to ensure win cleans up)
    validateBoard();
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
  updateNoteVisibility(); // Recalculate visibility (restore suppressed notes)
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
  updateNoteVisibility();
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
      // Default: Not active
      slot.dataset.userActive = "false";
      notesGrid.appendChild(slot);
    }

    // Capture the existing number as a note if it was a user entry
    if (wasUserFilled && existingVal && !hasExistingNotes) {
      const oldSlot = notesGrid.querySelector(`[data-note="${existingVal}"]`);
      if (oldSlot) {
        oldSlot.dataset.userActive = "true";
        oldSlot.textContent = existingVal;
      }
    }
  }

  const slot = notesGrid.querySelector(`[data-note="${num}"]`);
  if (slot) {
    // Toggle based on VISIBILITY, not just intent.
    // If it's hidden (suppressed) but active, we want to SHOW it (User Override).
    const isVisible = !!slot.textContent;
    const shouldBeVisible = !isVisible; // Toggle

    slot.dataset.userActive = shouldBeVisible ? "true" : "false";

    // Check if we are forcing a conflict
    if (shouldBeVisible) {
      const coords = getCellCoordinates(cell);
      const conflictCount = getConflictCount(coords, num);
      if (conflictCount > 0) {
        slot.dataset.pinnedConflictCount = conflictCount;
      } else {
        slot.dataset.pinnedConflictCount = "0";
      }
    } else {
      slot.dataset.pinnedConflictCount = "0";
    }

    slot.textContent = shouldBeVisible ? num : "";

    // Only promote if we REMOVED a note (potentially leaving 1).
    // If we added a note, we are building up candidates, don't auto-promote 0->1.
    if (!shouldBeVisible) {
      promoteSingleCandidatesGlobal();
    }
  }

  updateKeypadHighlights(cell);
}

function getCellCoordinates(cell) {
  const slot = cell.closest(".sudoku-chunk-slot");
  const slotIndex = parseInt(slot.dataset.slotIndex);
  const cells = Array.from(slot.querySelectorAll(".mini-cell"));
  const localIndex = cells.indexOf(cell);

  const row = Math.floor(slotIndex / 3) * 3 + Math.floor(localIndex / 3);
  const col = (slotIndex % 3) * 3 + (localIndex % 3);

  return { slotIndex, row, col };
}

function getConflictCount(coords, num) {
  const board = document.getElementById("memory-board");
  const slots = Array.from(board.querySelectorAll(".sudoku-chunk-slot"));
  let count = 0;

  slots.forEach((slot, sIdx) => {
    const cells = slot.querySelectorAll(".mini-cell");
    cells.forEach((cell, lIdx) => {
      const val = cell.textContent.trim();
      if (!val || cell.classList.contains("has-notes")) return;

      if (val === num) {
        const r = Math.floor(sIdx / 3) * 3 + Math.floor(lIdx / 3);
        const c = (sIdx % 3) * 3 + (lIdx % 3);

        if (r === coords.row || c === coords.col || sIdx === coords.slotIndex) {
          count++;
        }
      }
    });
  });
  return count;
}

// New Helper: Hides notes if conflicting number exists
export function updateNoteVisibility() {
  const board = document.getElementById("memory-board");
  if (!board) return;

  const slots = Array.from(board.querySelectorAll(".sudoku-chunk-slot"));
  if (slots.length !== 9) return;

  // Update Notes visibility
  slots.forEach((slot, slotIndex) => {
    const cells = slot.querySelectorAll(".mini-cell");
    cells.forEach((cell, localIndex) => {
      if (!cell.classList.contains("has-notes")) return;

      const notesGrid = cell.querySelector(".notes-grid");
      if (!notesGrid) return;

      const r = Math.floor(slotIndex / 3) * 3 + Math.floor(localIndex / 3);
      const c = (slotIndex % 3) * 3 + (localIndex % 3);
      const coords = { slotIndex, row: r, col: c };

      const noteSlots = notesGrid.querySelectorAll(".note-slot");
      noteSlots.forEach((nSlot) => {
        const num = nSlot.dataset.note;
        const userWants = nSlot.dataset.userActive === "true";

        if (!userWants) {
          nSlot.textContent = "";
          return;
        }

        // Check constraints using strict counting
        const currentConflictCount = getConflictCount(coords, num);

        if (currentConflictCount > 0) {
          const pinnedCount = parseInt(nSlot.dataset.pinnedConflictCount) || 0;

          // If the situation is NOT WORSE than when we pinned it -> Show
          if (currentConflictCount <= pinnedCount) {
            nSlot.textContent = num;
          } else {
            nSlot.textContent = "";
            nSlot.dataset.pinnedConflictCount = "0";
          }
        } else {
          // No conflict, Clear Pin and Show
          nSlot.dataset.pinnedConflictCount = "0";
          nSlot.textContent = num;
        }
      });
    });
  });

  // Trigger Promotion Logic (Singles Chain)
  promoteSingleCandidatesGlobal();
}

let isPromoting = false; // Guard to prevent infinite re-entry if logic flaws exist

function promoteSingleCandidatesGlobal() {
  if (isPromoting) return;
  isPromoting = true;

  const board = document.getElementById("memory-board");
  if (!board) {
    isPromoting = false;
    return;
  }

  const slots = Array.from(board.querySelectorAll(".sudoku-chunk-slot"));

  // Find ONE candidate to promote (to facilitate chain visualization)
  // Or promote all?
  // Safety: Promote ALL that are ready in this pass.

  const cellsToPromote = [];

  slots.forEach((slot) => {
    const cells = slot.querySelectorAll(".mini-cell");
    cells.forEach((cell) => {
      if (!cell.classList.contains("has-notes")) return;

      const notesGrid = cell.querySelector(".notes-grid");
      if (!notesGrid) return;

      // Count VISIBLE notes
      const visibleNotes = Array.from(
        notesGrid.querySelectorAll(".note-slot"),
      ).filter((n) => n.textContent !== ""); // Only currently visible ones

      if (visibleNotes.length === 1) {
        cellsToPromote.push({
          cell: cell,
          num: visibleNotes[0].dataset.note,
        });
      }
    });
  });

  // Apply promotions
  cellsToPromote.forEach((action) => {
    // Re-check validity (in case previous promotion in loop invalidated this one?
    // e.g. two cells waiting for "1" - impossible if logic is sound but safety first)
    // Actually, if we have two cells with only "1" visible in same row, both trying to promote...
    // The first one fills "1". The second one now conflicts.
    // `handleNumberInput` triggers `updateNoteVisibility` which hides the note in 2nd cell.
    // So 2nd cell has 0 notes visible.
    // So we should strictly check before applying.

    if (action.cell.classList.contains("has-notes")) {
      // Select it to emulate user interaction properly for handleNumberInput
      // Or refactor handleNumberInput to accept cell?
      // handleNumberInput uses `selectedCell`.

      // Force Selection
      selectCell(action.cell, true);
      console.log("Auto-Promoting Candidate:", action.num);

      // Force Real Number Input
      const wasPencil = pencilMode;
      pencilMode = false;
      handleNumberInput(action.num);
      pencilMode = wasPencil;
    }
  });

  isPromoting = false;
}

function validateBoard() {
  const gameSection = document.getElementById("game-section");
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

    // SYNC STATE: Collect current board for persistence
    syncSudokuState();
    gameManager.save();
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

  const solution = gameManager.getTargetSolution();
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

/**
 * Reads the board from DOM and updates GameManager state
 */
export function syncSudokuState() {
  const board = document.getElementById("memory-board");
  if (!board) return;

  const slots = Array.from(board.querySelectorAll(".sudoku-chunk-slot"));
  const currentBoard = Array(9)
    .fill()
    .map(() => Array(9).fill(0));

  slots.forEach((slot, slotIndex) => {
    const cells = Array.from(slot.querySelectorAll(".mini-cell"));
    cells.forEach((cell, localIndex) => {
      const row = Math.floor(slotIndex / 3) * 3 + Math.floor(localIndex / 3);
      const col = (slotIndex % 3) * 3 + (localIndex % 3);
      const val = cell.textContent.trim();

      // If it has notes, it's effectively 0 in currentBoard logic
      if (val && !cell.classList.contains("has-notes")) {
        currentBoard[row][col] = parseInt(val) || 0;
      } else {
        currentBoard[row][col] = 0;
      }
    });
  });

  gameManager.updateProgress("sudoku", { currentBoard });
}

function handleSudokuWin() {
  // Deselect any active cell so it doesn't carry over to Peaks
  deselectCurrentCell();

  const board = document.getElementById("memory-board");
  if (board) {
    board.classList.add("board-complete");

    // Advance Stage after animation
    setTimeout(() => {
      board.classList.remove("board-complete");

      // Timer Transition
      gameManager.stopStageTimer(); // End Sudoku
      gameManager.startStageTimer("peaks"); // Start Peaks

      // Transition to Peaks
      transitionToPeaks();

      // We can also advance state here if not handled by transition
      // gameManager.advanceStage(); // move this inside transitionToPeaks if preferred, or keep here
      // Let's keep state logic separate or call it here?
      // transitionToPeaks() has UI logic.
      // gameManager.advanceStage() has Data logic.
      // Best to call both or have one call the other.
      // memory.js called transitionToSudoku() which called gameManager.updateProgress.

      // Let's call the manager here for correctness
      gameManager.advanceStage();
    }, 600);
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
    // Sync with settings menu (Logic: Checked = Ask, Unchecked = Skip)
    const toggle = document.getElementById("confirm-clear-toggle");
    if (toggle) toggle.checked = false;
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

// Helper for Debug/Hint Button
// Helper for Debug/Hint Button
export function provideHint() {
  console.log("Debug: Solving Sudoku (Smart 3x3)...");
  // Use the TRANSFORMED solution, not the raw one from state!
  // This ensures we respect Jigsaw variations (LR, TB, HV)
  const solution = gameManager.getTargetSolution();
  if (!solution) {
    console.error("No solution found via gameManager!");
    return;
  }

  const board = document.getElementById("memory-board");
  if (!board) return;

  const slots = Array.from(board.querySelectorAll(".sudoku-chunk-slot"));

  /* LOGIC: Find FIRST slot that is not fully correct */
  const targetSlot = slots.find((slot) => {
    const slotIndex = parseInt(slot.dataset.slotIndex);
    const cells = Array.from(slot.querySelectorAll(".mini-cell"));

    // Check if ANY cell in this slot is empty or incorrect
    return cells.some((cell, localIndex) => {
      const row = Math.floor(slotIndex / 3) * 3 + Math.floor(localIndex / 3);
      const col = (slotIndex % 3) * 3 + (localIndex % 3);
      const val = cell.textContent.trim();
      const correctVal = solution[row][col];

      const isIncorrect =
        cell.classList.contains("user-filled") && parseInt(val) !== correctVal;
      // Also strictly check against solution for pre-filled to be safe, though they should be correct.
      // Actually pre-filled match solution.

      const isEmpty = val === "" || cell.classList.contains("has-notes");

      return isEmpty || isIncorrect;
    });
  });

  if (targetSlot) {
    const slotIndex = parseInt(targetSlot.dataset.slotIndex);
    const cells = Array.from(targetSlot.querySelectorAll(".mini-cell"));

    console.log(`Debug: Fixing Slot ${slotIndex}...`);

    // Fill the ENTIRE block
    cells.forEach((cell, localIndex) => {
      const row = Math.floor(slotIndex / 3) * 3 + Math.floor(localIndex / 3);
      const col = (slotIndex % 3) * 3 + (localIndex % 3);
      const correctVal = solution[row][col];

      // Only update if not already correct (avoid unnecessary DOM writes)
      // Check content AND class state
      const currentVal = cell.textContent.trim();
      if (
        currentVal != correctVal ||
        cell.classList.contains("has-notes") ||
        cell.classList.contains("error")
      ) {
        cell.textContent = correctVal;
        cell.classList.add("user-filled");
        cell.classList.remove(
          "has-notes",
          "error",
          "selected-cell",
          "highlight-match",
        );

        // Clean up notes grid if any
        const notesGrid = cell.querySelector(".notes-grid");
        if (notesGrid) notesGrid.remove();
      }
    });

    // Validate immediately
    validateBoard();
  } else {
    console.log("Debug: Board appears complete.");
    validateBoard();
  }
}
