import { CONFIG } from "./config.js";
import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";
import { transitionToSudoku } from "./sudoku.js";
import { getChunksFromBoard, createMiniGrid } from "./memory.js";
import { getConflicts } from "./sudoku-logic.js";
import { getCurrentLang } from "./i18n.js";

// DOM Elements Reference
let boardContainer;
let collectedLeft;
let collectedRight;
let memorySection;

// State
let selectedPieceElement = null;
let dragClone = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
// Deferred Drag State
let potentialDragTarget = null;
let dragStartX = 0;
let dragStartY = 0;
const DRAG_THRESHOLD = 5; // px

export function initJigsaw(elements) {
  boardContainer = elements.boardContainer;
  collectedLeft = elements.collectedLeft;
  collectedRight = elements.collectedRight;
  memorySection = elements.memorySection;

  // Initialize Drag & Drop
  initDragAndDrop();

  // Initialize resizing listener for Jigsaw pieces
  window.addEventListener("resize", () => {
    fitCollectedPieces();
  });

  // Global click listener for deselection
  document.addEventListener("click", (e) => {
    if (!selectedPieceElement) return;

    // Check if we clicked "empty" space (not a piece or board slot)
    const isGameElement = e.target.closest(
      ".collected-piece, .sudoku-chunk-slot",
    );
    if (!isGameElement) {
      deselectPiece();
    }
  });
}

// =========================================
// Jigsaw Logic
// =========================================

export function createPanelPlaceholders() {
  if (!collectedLeft || !collectedRight) return;

  collectedLeft.innerHTML = "";
  collectedRight.innerHTML = "";

  // Left Panel: Generic Placeholders
  for (let i = 0; i < 4; i++) {
    createPlaceholder(collectedLeft, null);
  }

  // Right Panel: Generic Placeholders
  for (let i = 0; i < 4; i++) {
    createPlaceholder(collectedRight, null);
  }

  fitCollectedPieces();
}

function createPlaceholder(container, index) {
  const p = document.createElement("div");
  p.classList.add("collected-piece", "placeholder");

  // Attach selection listener immediately
  p.addEventListener("click", () => handlePieceSelect(p));

  container.appendChild(p);
}

export function placeInPanel(chunkIndex) {
  const allPlaceholders = document.querySelectorAll(
    ".collected-piece.placeholder",
  );
  const available = Array.from(allPlaceholders).find((p) => !p.hasChildNodes());

  if (!available) {
    console.error(`No available placeholder for chunk ${chunkIndex}!`);
    return;
  }

  // Assign Identity NOW
  const placeholder = available;
  placeholder.dataset.chunkIndex = chunkIndex;

  const state = gameManager.getState();
  const chunks = getChunksFromBoard(state.data.initialPuzzle);
  const chunkData = chunks[chunkIndex];

  // "Hydrate" the placeholder
  placeholder.innerHTML = "";
  placeholder.appendChild(createMiniGrid(chunkData, chunkIndex));

  placeholder.classList.remove("placeholder");
  placeholder.classList.add("spawn-anim");

  fitCollectedPieces();
}

export function fitCollectedPieces() {
  const wrapper = document.querySelector(".collected-wrapper");
  const pieces = document.querySelectorAll(".collected-piece");

  if (!wrapper || !collectedLeft || !collectedRight) return;

  // DESKTOP RESET: Trust CSS > 768px (except for laptop specific override handled in CSS)
  if (window.innerWidth > 768) {
    // Preserve critical transition styles during mode switch
    const preserveStyles = (el) => {
      if (!el) return null;
      return {
        vt: el.style.viewTransitionName,
        tr: el.style.transition,
      };
    };

    const restoreStyles = (el, saved) => {
      if (!el || !saved) return;
      if (saved.vt) el.style.viewTransitionName = saved.vt;
      if (saved.tr) el.style.transition = saved.tr;
    };

    const wrapperSaved = preserveStyles(wrapper);
    const leftSaved = preserveStyles(collectedLeft);
    const rightSaved = preserveStyles(collectedRight);

    wrapper.style.cssText = "";
    collectedLeft.style.cssText = "";
    collectedRight.style.cssText = "";

    restoreStyles(wrapper, wrapperSaved);
    restoreStyles(collectedLeft, leftSaved);
    restoreStyles(collectedRight, rightSaved);

    pieces.forEach((p) => {
      const vtName = p.style.viewTransitionName;
      const trNorm = p.style.transition;
      p.style.cssText = "";
      if (vtName) p.style.viewTransitionName = vtName;
      if (trNorm) p.style.transition = trNorm;
    });
    return;
  }

  const isJigsaw =
    memorySection && memorySection.classList.contains("jigsaw-mode");
  const config = getCollectedPieceSize(isJigsaw);
  if (!config) return;

  const { size, isOneRow, gap } = config;

  // Apply Element Styles in a micro-task or next frame to ensure layout stabilizes
  // This prevents pieces from "flying in" from the container origin (0,0)
  const applyStyles = () => {
    pieces.forEach((p) => {
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.fontSize = `${size * 0.5}px`;
      p.style.margin = `${gap / 2}px`;
    });
  };

  // Immediate call to ensure sync with Jigsaw Mode class addition
  applyStyles();

  // Apply Container Layout
  // Use the same height factor as getCollectedPieceSize for layout consistency
  const hFactor = isJigsaw ? 0.45 : 0.13;
  const zoneHeight =
    (window.visualViewport
      ? window.visualViewport.height
      : window.innerHeight) * hFactor;
  const rowWidth = (size + gap) * 4;

  if (isOneRow) {
    wrapper.style.flexDirection = "row";
    wrapper.style.height = `${zoneHeight}px`;
    wrapper.style.justifyContent = "center";
    wrapper.style.alignItems = "center";

    collectedLeft.style.width = `${rowWidth}px`;
    collectedLeft.style.height = "100%";
    collectedLeft.style.flexDirection = "row"; // FORCE horizontal
    collectedLeft.style.flexWrap = "nowrap";
    collectedLeft.style.justifyContent = "flex-start";
    collectedLeft.style.display = "flex";

    collectedRight.style.width = `${rowWidth}px`;
    collectedRight.style.height = "100%";
    collectedRight.style.flexDirection = "row"; // FORCE horizontal
    collectedRight.style.flexWrap = "nowrap";
    collectedRight.style.justifyContent = "flex-start";
    collectedRight.style.display = "flex";
  } else {
    wrapper.style.flexDirection = "column";
    wrapper.style.height = `${zoneHeight}px`;
    wrapper.style.justifyContent = "center";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "2px"; // Keep rows close

    collectedLeft.style.width = `${rowWidth}px`;
    collectedLeft.style.height = "auto";
    collectedLeft.style.flexDirection = "row"; // FORCE horizontal
    collectedLeft.style.flexWrap = "nowrap";
    collectedLeft.style.justifyContent = "flex-start";
    collectedLeft.style.display = "flex";

    collectedRight.style.width = `${rowWidth}px`;
    collectedRight.style.height = "auto";
    collectedRight.style.flexDirection = "row"; // FORCE horizontal
    collectedRight.style.flexWrap = "nowrap";
    collectedRight.style.justifyContent = "flex-start";
    collectedRight.style.display = "flex";
  }
}

function getCollectedPieceSize(isJigsaw = false) {
  if (window.innerWidth > 768) return null;

  // Increase height factor in Jigsaw mode to use card space
  const hFactor = isJigsaw ? 0.45 : 0.13;
  const zoneHeight =
    (window.visualViewport
      ? window.visualViewport.height
      : window.innerHeight) * hFactor;
  const containerWidth = window.innerWidth;
  const gap = isJigsaw ? 12 : 4;
  const padding = 10;

  // OPTION A: 2 Rows -> Add safety buffer (-4px)
  const hSizeA = zoneHeight / 2 - 2 * gap - 2;
  const wSizeA = (containerWidth - padding - 5 * gap) / 4;
  const sizeA = Math.min(hSizeA, wSizeA);

  // OPTION B: 1 Row -> Add safety buffer (-4px)
  const hSizeB = zoneHeight - 2 * gap - 4;
  const wSizeB = (containerWidth / 2 - padding - 5 * gap) / 4;
  const sizeB = Math.min(hSizeB, wSizeB);

  // Pick Winner
  let finalSize, isOneRow;
  if (sizeB >= sizeA) {
    finalSize = sizeB;
    isOneRow = true;
  } else {
    finalSize = sizeA;
    isOneRow = false;
  }

  return { size: finalSize, isOneRow, gap };
}

export function handlePieceSelect(pieceElement) {
  // GUARD: Only in Jigsaw Mode
  if (!memorySection || !memorySection.classList.contains("jigsaw-mode"))
    return;

  // If we click the same piece, deselect
  if (selectedPieceElement === pieceElement) {
    deselectPiece();
    return;
  }

  // If a piece is already selected, try to Interact (Move/Swap)
  if (selectedPieceElement) {
    const source = selectedPieceElement;
    const target = pieceElement;
    const isTargetEmpty = target.classList.contains("placeholder");
    const isSourceBoard = source.classList.contains("sudoku-chunk-slot");
    const isTargetBoard = target.classList.contains("sudoku-chunk-slot");

    // --- CASE: Panel to Panel -> Change Selection OR Move to Empty ---
    if (!isSourceBoard && !isTargetBoard) {
      if (!isTargetEmpty) {
        // Target is an occupied slot in panel -> Just switch selection
        deselectPiece();
        handlePieceSelect(target);
        return;
      }
      // Target is an empty placeholder in panel -> Proceed to MOVE logic below
    }

    // --- CASE: Interactions involving the board (Source or Target) ---
    // Or Panel to Empty Panel slot (continues here)
    const sourceContent = source.querySelector(".mini-sudoku-grid");
    const targetContent = target.querySelector(".mini-sudoku-grid"); // may be null

    if (!sourceContent) {
      // Should not happen if selected, but safe fail
      deselectPiece();
      return;
    }

    // --- LOGIC: SWAP or MOVE ---
    // If Target is Occupied -> SWAP
    if (!isTargetEmpty && targetContent) {
      // Move Target Content -> Source
      source.innerHTML = "";
      source.appendChild(targetContent);

      // Update Source State
      if (isSourceBoard) {
        source.classList.add("filled");
        targetContent.style.width = "100%";
        targetContent.style.height = "100%";
      } else {
        // Source is Panel
        source.classList.remove("placeholder", "filled");
        source.classList.add("collected-piece");
        source.dataset.chunkIndex = targetContent.dataset.chunkIndex; // ID Transfer
      }

      // Move Source Content -> Target
      target.innerHTML = "";
      target.appendChild(sourceContent);
      // Target is Panel
      target.classList.remove("placeholder");
      target.classList.add("collected-piece");
      target.dataset.chunkIndex = sourceContent.dataset.chunkIndex; // ID Transfer

      // Resize if needed
      fitCollectedPieces();
      checkBoardCompletion(); // Validate board (clear errors if any)
      deselectPiece();
      return;
    }
    // If Target is Empty -> MOVE
    else {
      target.appendChild(sourceContent);

      // Update Target State (Panel)
      target.classList.remove("placeholder");
      target.classList.add("collected-piece");
      target.dataset.chunkIndex = sourceContent.dataset.chunkIndex;

      // Update Source State (Empty it)
      source.innerHTML = "";
      if (isSourceBoard) {
        source.classList.remove("filled");
      } else {
        source.classList.add("placeholder");
        delete source.dataset.chunkIndex;
      }

      fitCollectedPieces();
      checkBoardCompletion(); // Validate board (clear errors if any)
      deselectPiece();
      return;
    }
  }

  // Select new (Only if nothing selected previously fell through, or first selection)
  // If we click a placeholder without a selected source, ignore it.
  if (pieceElement.classList.contains("placeholder")) return;

  selectedPieceElement = pieceElement;
  selectedPieceElement.classList.add("selected");
  if (memorySection) memorySection.classList.add("selection-active");
}

function deselectPiece() {
  if (selectedPieceElement) {
    selectedPieceElement.classList.remove("selected");
    selectedPieceElement = null;
  }
  if (memorySection) memorySection.classList.remove("selection-active");
}

// Updated V2: Handles Panel Pieces AND Board Pieces
export function handleSlotClick_v2(slotIndex) {
  // GUARD: Only in Jigsaw Mode
  if (!memorySection || !memorySection.classList.contains("jigsaw-mode"))
    return;

  const slot = boardContainer.querySelector(`[data-slot-index="${slotIndex}"]`);
  if (!slot) return;

  // CASE 1: Interact with Selected Piece (Move or Swap)
  if (selectedPieceElement) {
    // Ignore locked center piece interaction as Target
    if (slotIndex === 4) {
      // Allow selecting it? No, users can't select locked piece.
      // Allow dropping on it? No.
      console.warn("Center piece is locked.");
      return;
    }

    // Ignore self-click
    if (selectedPieceElement === slot) {
      deselectPiece();
      return;
    }

    const source = selectedPieceElement;
    const target = slot;
    const isTargetFilled = target.classList.contains("filled");
    const isSourceBoard = source.classList.contains("sudoku-chunk-slot");

    const sourceContent = source.querySelector(".mini-sudoku-grid");
    const targetContent = target.querySelector(".mini-sudoku-grid"); // may be null

    if (!sourceContent) {
      deselectPiece();
      return;
    }

    // Safety check for Panel Source chunks
    if (
      !isSourceBoard &&
      !source.dataset.chunkIndex &&
      source.dataset.chunkIndex !== "0"
    ) {
      // Invalid panel source?
      // console.warn("Panel source missing ID");
      // might be just empty placeholder selected by accident logic?
    }

    // --- LOGIC: SWAP or MOVE ---
    if (isTargetFilled && targetContent) {
      // SWAP
      // Move Target -> Source
      source.innerHTML = "";
      source.appendChild(targetContent);

      if (isSourceBoard) {
        source.classList.add("filled");
      } else {
        // Source is Panel
        source.classList.remove("placeholder", "filled");
        source.classList.add("collected-piece");
        source.dataset.chunkIndex = targetContent.dataset.chunkIndex; // ID Transfer
        // Reset Style for Panel
        // fitCollectedPieces will handle size, but we might need to reset width/height if it came from board
        // Actually fitCollectedPieces calls getCollectedPieceSize() and applies styles.
        // But valid to clear inline styles just in case
        targetContent.style.width = "";
        targetContent.style.height = "";
      }

      // Move Source -> Target
      target.innerHTML = "";
      target.appendChild(sourceContent);
      target.classList.add("filled");
      // Reset Style for Board (Fill Slot)
      sourceContent.style.width = "100%";
      sourceContent.style.height = "100%";

      fitCollectedPieces(); // Update Panel
      deselectPiece();
    } else {
      // MOVE (Target Empty)
      target.innerHTML = "";
      target.appendChild(sourceContent);
      target.classList.add("filled");
      // Reset Style for Board
      sourceContent.style.width = "100%";
      sourceContent.style.height = "100%";

      // Clear Source
      source.innerHTML = "";
      if (isSourceBoard) {
        source.classList.remove("filled");
      } else {
        // Panel
        source.classList.add("placeholder");
        delete source.dataset.chunkIndex;
      }

      fitCollectedPieces();
      deselectPiece();
    }

    // Check Board State after move/swap
    checkBoardCompletion();

    return;
  }

  // CASE 2: No piece selected -> Select this slot if it has content
  else {
    if (slot.classList.contains("filled")) {
      // Ignore locked center piece
      if (slotIndex === 4) return;

      handlePieceSelect(slot);
    }
  }
}

export function transitionToJigsaw() {
  console.log("Transitioning to Jigsaw Stage...");
  const lang = getCurrentLang();
  const t = translations[lang];

  // 1. Update Title with Fade
  const titleEl = document.querySelector(".header-title-container h2");
  if (titleEl) {
    titleEl.style.transition = "opacity 0.5s ease";
    titleEl.style.opacity = "0";
    setTimeout(() => {
      titleEl.textContent = t.game_jigsaw || "Rompecabezas";
      titleEl.style.opacity = "1";
    }, 500);
  }

  // 2. Add Jigsaw Mode Class
  if (memorySection) {
    if (document.startViewTransition) {
      const leftPieces = collectedLeft.querySelectorAll(".collected-piece");
      const rightPieces = collectedRight.querySelectorAll(".collected-piece");

      // RESTORED: Assign unique VT names to track pieces during the morph
      leftPieces.forEach((p, i) => {
        p.style.viewTransitionName = `piece-left-${i}`;
      });
      rightPieces.forEach((p, i) => {
        p.style.viewTransitionName = `piece-right-${i}`;
      });

      const board = document.querySelector(".memory-board");
      if (board) board.style.viewTransitionName = "board-main";

      // OPTIMIZATION: Do not transition the layout wrapper.
      // Nesting VTs is expensive (hole punching).
      // Let the browser cross-fade the container while we morph the board/pieces.
      const gridLayout = document.querySelector(".memory-grid-layout");
      // if (gridLayout) gridLayout.style.viewTransitionName = "main-layout";

      // Animate the wrapper, not individual pieces
      const wrapper = document.querySelector(".collected-wrapper");
      // if (wrapper) wrapper.style.viewTransitionName = "wrapper-main"; // Optional, might look better without

      const transition = document.startViewTransition(() => {
        const start = performance.now();
        if (CONFIG.debugMode)
          console.log("[Perf] Start ViewTransition Callback");

        // PERFORMANCE: Reduce rendering quality during heavy transition
        document.body.classList.add("perf-optimization-active");

        // CRITICAL: Disable all CSS transitions during the DOM update phase.
        if (board) board.style.transition = "none";
        // if (gridLayout) gridLayout.style.transition = "none"; // Optimization: gridLayout VT disabled
        if (wrapper) wrapper.style.transition = "none";
        collectedLeft.style.transition = "none";
        collectedRight.style.transition = "none";

        // We still need to disable CSS transitions on pieces so they snap to new positions
        // inside the container immediately (for the VT snapshot to work right if we animated containers)
        // But since we aren't VT-animating them, standard CSS transition might be better?
        // No, let's keep them snappy for the layout change.
        document
          .querySelectorAll(".collected-piece")
          .forEach((p) => (p.style.transition = "none"));

        memorySection.classList.add("jigsaw-mode");

        // UI/Layout updates MUST happen inside the transition callback
        gameManager.updateProgress("progress", { currentStage: "jigsaw" });
        deselectPiece();

        if (CONFIG.debugMode) console.time("[Perf] fitCollectedPieces");
        fitCollectedPieces();
        if (CONFIG.debugMode) console.timeEnd("[Perf] fitCollectedPieces");

        if (CONFIG.debugMode)
          console.log(
            `[Perf] Callback Duration: ${(performance.now() - start).toFixed(2)}ms`,
          );
      });

      transition.finished.finally(() => {
        // Restore rendering quality
        document.body.classList.remove("perf-optimization-active");

        // Clean up names and restore transition capabilities
        leftPieces.forEach((p) => (p.style.viewTransitionName = ""));
        rightPieces.forEach((p) => (p.style.viewTransitionName = ""));

        const cleanup = (el) => {
          if (el) {
            el.style.viewTransitionName = "";
            el.style.transition = "";
          }
        };

        cleanup(board);
        cleanup(gridLayout);
        // cleanup(wrapper);

        document
          .querySelectorAll(".collected-piece")
          .forEach((p) => (p.style.transition = ""));
      });
    } else {
      memorySection.classList.add("jigsaw-mode");
      // Fallback update
      gameManager.updateProgress("progress", { currentStage: "jigsaw" });
      deselectPiece(); // Ensure clear state
      fitCollectedPieces(); // Force layout update
    }
  }

  // 3. Update Tooltip Info
  const tooltipTitle = document.querySelector(".info-tooltip h3");
  const tooltipDesc = document.querySelector(".info-tooltip p");

  if (tooltipTitle && tooltipDesc) {
    tooltipTitle.style.transition = "opacity 0.5s ease";
    tooltipDesc.style.transition = "opacity 0.5s ease";
    tooltipTitle.style.opacity = "0";
    tooltipDesc.style.opacity = "0";

    setTimeout(() => {
      tooltipTitle.textContent = t.jigsaw_help_title;
      tooltipDesc.innerHTML = t.jigsaw_help_desc;
      tooltipTitle.style.opacity = "1";
      tooltipDesc.style.opacity = "1";
    }, 500);
  }
}

// =========================================
// Drag & Drop
// =========================================
export function initDragAndDrop() {
  document.addEventListener("pointerdown", handlePointerDown, {
    passive: false,
  });
  document.addEventListener("pointermove", handlePointerMove, {
    passive: false,
  });
  document.addEventListener("pointerup", handlePointerUp, { passive: false });
}

export function handlePointerDown(e) {
  if (e.pointerType === "touch") return; // Mouse/Pen only

  // GUARD: Only allow interaction in Jigsaw Mode
  if (!memorySection || !memorySection.classList.contains("jigsaw-mode"))
    return;

  const target = e.target.closest(".collected-piece, .sudoku-chunk-slot");
  if (!target) return;
  // Center locked
  if (target.dataset.slotIndex === "4") return;

  // Only drag/select if it has content (and not a placeholder)
  // Actually, for pure selection we might want to allow selecting placeholders?
  // No, selection logic currently ignores placeholders unless dropping.
  if (target.classList.contains("placeholder") || target.children.length === 0)
    return;

  // STOP: Do NOT prevent default yet. Allow Click to propagate.
  // e.preventDefault();

  // Store Potential Drag
  potentialDragTarget = target;
  dragStartX = e.clientX;
  dragStartY = e.clientY;

  // Do NOT select immediately. Wait for Click (handled by click listeners) OR Drag (handled by pointermove).
}

export function handlePointerMove(e) {
  // 1. Check if we need to START dragging
  if (potentialDragTarget && !dragClone) {
    const dx = Math.abs(e.clientX - dragStartX);
    const dy = Math.abs(e.clientY - dragStartY);

    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
      // START DRAG
      const target = potentialDragTarget;

      // Now we take over interactions
      // e.preventDefault(); (Will do in next frame or now)

      // Deselect previous (Drag overrides Click-Swap intent)
      deselectPiece();
      selectedPieceElement = target;
      selectedPieceElement.classList.add("selected");
      if (memorySection) memorySection.classList.add("selection-active");
      selectedPieceElement.classList.add("dragging-source");

      // Init Clone
      const content = target.querySelector(".mini-sudoku-grid");
      if (!content) {
        potentialDragTarget = null;
        return;
      }

      dragClone = content.cloneNode(true);
      dragClone.classList.add("dragging-clone");

      // Normalize Size: Always use the size of a Panel Piece
      const referencePiece =
        document.querySelector(".collected-piece") || target;
      const refRect = referencePiece.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      // 1. Start with ORIGINAL size
      dragClone.style.width = `${targetRect.width}px`;
      dragClone.style.height = `${targetRect.height}px`;

      document.body.appendChild(dragClone);

      // 2. Force DOM Reflow so the browser registers the starting size
      void dragClone.offsetWidth;

      // 3. Set FINAL size (animates due to CSS transition)
      dragClone.style.width = `${refRect.width}px`;
      dragClone.style.height = `${refRect.height}px`;

      // Hide the original content to mimic "lifting"
      content.style.opacity = "0";

      // Center the clone on the cursor for better feel when resizing
      dragOffsetX = refRect.width / 2;
      dragOffsetY = refRect.height / 2;

      updateDragPosition(e.clientX, e.clientY);
    }
  }

  // 2. Handle Active Drag
  if (!dragClone) return;

  e.preventDefault(); // Stop native selection/scrolling
  updateDragPosition(e.clientX, e.clientY);

  // Highlight drop targets
  const elements = document.elementsFromPoint(e.clientX, e.clientY);
  const dropTarget = elements.find(
    (el) =>
      (el.classList.contains("sudoku-chunk-slot") ||
        el.classList.contains("collected-piece")) &&
      el.dataset.slotIndex !== "4", // Not center
  );

  document
    .querySelectorAll(".drop-hover")
    .forEach((el) => el.classList.remove("drop-hover"));
  if (dropTarget) {
    dropTarget.classList.add("drop-hover");
  }
}

export function handlePointerUp(e) {
  // Clear Potential
  potentialDragTarget = null;

  if (!dragClone) {
    // It was a Click!
    // Allow native click event to fire.
    return;
  }

  // It was a Drag!
  e.preventDefault(); // Stop click from firing on drop target (optional, but good practice)

  const elements = document.elementsFromPoint(e.clientX, e.clientY);
  const dropTarget = elements.find(
    (el) =>
      (el.classList.contains("sudoku-chunk-slot") ||
        el.classList.contains("collected-piece")) &&
      el.dataset.slotIndex !== "4",
  );

  // Restore Opacity (Always)
  const sourceContent = selectedPieceElement.querySelector(".mini-sudoku-grid");
  if (sourceContent) sourceContent.style.opacity = "";

  if (dropTarget && dropTarget !== selectedPieceElement) {
    // Execute Move/Swap
    // 1. Get Source Content (from dragClone or source)
    // Source is `selectedPieceElement`

    // sourceContent is already defined above
    const targetContent = dropTarget.querySelector(".mini-sudoku-grid"); // Might be null

    if (sourceContent) {
      // Move Source -> Target
      dropTarget.innerHTML = "";
      dropTarget.appendChild(sourceContent);
      dropTarget.classList.remove("placeholder", "filled");
      dropTarget.classList.add("filled"); // It has content now
      // If dropTarget was a placeholder, remove placeholder class

      if (targetContent) {
        // Swap: Target Content -> Source
        selectedPieceElement.innerHTML = "";
        selectedPieceElement.appendChild(targetContent);
        selectedPieceElement.classList.add("filled");
        selectedPieceElement.classList.remove("placeholder");
      } else {
        // Target empty: Source becomes empty
        // If source is slot, make empty
        if (selectedPieceElement.classList.contains("sudoku-chunk-slot")) {
          selectedPieceElement.classList.remove("filled");
        } else {
          // If source is panel, make placeholder
          selectedPieceElement.classList.add("placeholder");
          delete selectedPieceElement.dataset.chunkIndex; // Remove ID
        }
      }

      // If dropping INTO Panel (and target was placeholder)
      // We need to ensure we set the ID on the target container
      if (dropTarget.classList.contains("collected-piece")) {
        const newContent = dropTarget.querySelector(".mini-sudoku-grid");
        if (newContent && newContent.dataset.chunkIndex) {
          dropTarget.dataset.chunkIndex = newContent.dataset.chunkIndex;
        }
      }
    }

    // Check Board State after drop
    checkBoardCompletion();
  }

  // Cleanup
  dragClone.remove();
  dragClone = null;
  if (selectedPieceElement)
    selectedPieceElement.classList.remove("dragging-source");
  document
    .querySelectorAll(".drop-hover")
    .forEach((el) => el.classList.remove("drop-hover"));
  deselectPiece();
}

function updateDragPosition(x, y) {
  if (dragClone) {
    dragClone.style.left = `${x - dragOffsetX}px`;
    dragClone.style.top = `${y - dragOffsetY}px`;
  }
}

// Debug Support
export function debugJigsawPlace() {
  const chunks = 9; // 0-8
  for (let i = 0; i < chunks; i++) {
    if (i === 4) continue; // Locked center

    const slot = boardContainer.querySelector(`[data-slot-index="${i}"]`);
    if (!slot) continue;

    const currentPiece = slot.firstChild;
    let isCorrect = false;

    // Check if correct piece is already here
    if (currentPiece && currentPiece.dataset.chunkIndex == i) {
      isCorrect = true;
    }

    if (!isCorrect) {
      console.log(`Debug: Fixing slot ${i}...`);

      // 1. Find the Correct Piece
      const correctGrid = Array.from(
        document.querySelectorAll(".mini-sudoku-grid"),
      ).find((el) => el.dataset.chunkIndex == i);

      if (!correctGrid) {
        console.error("Debug: Correct piece not found!");
        return;
      }

      const correctPieceParent = correctGrid.parentElement;

      // 2. Clear destination slot if occupied
      if (slot.hasChildNodes()) {
        const wrongGrid = slot.firstChild;

        // SWAP
        correctPieceParent.appendChild(wrongGrid);
        slot.appendChild(correctGrid);

        // Fix classes for Source
        if (correctPieceParent.closest(".collected-piece")) {
          if (correctPieceParent.classList.contains("sudoku-chunk-slot")) {
            // Just swapped, all good
          } else {
            // Panel
            correctPieceParent.classList.remove("placeholder");
            correctPieceParent.classList.add("collected-piece");
            correctPieceParent.style.opacity = "";
            correctPieceParent.style.pointerEvents = "";
            correctPieceParent.style.border = "";
          }
        }
      } else {
        // Destination Empty: Just Move
        slot.appendChild(correctGrid);
        slot.classList.add("filled");

        // Fix Source
        if (correctPieceParent.classList.contains("sudoku-chunk-slot")) {
          correctPieceParent.classList.remove("filled");
        } else {
          // Panel
          correctPieceParent.classList.add("placeholder");
          correctPieceParent.style.pointerEvents = "auto";
        }
      }
      // Validate immediately and Stop (Piece by Piece)
      checkBoardCompletion();
      return;
    }
  }
  console.log("Debug: All pieces checked/fixed.");
  checkBoardCompletion();
}

// Validation Logic
export function checkBoardCompletion() {
  // Guard 0: Prevent double-trigger logic
  if (gameManager.getState().progress.currentStage !== "jigsaw") return;
  if (boardContainer && boardContainer.classList.contains("board-complete"))
    return;

  // 1. Clear previous errors first
  clearBoardErrors();
  document
    .querySelectorAll(".error-slot")
    .forEach((el) => el.classList.remove("error-slot"));

  const slots = document.querySelectorAll(".sudoku-chunk-slot");
  const filledCount = document.querySelectorAll(
    ".sudoku-chunk-slot.filled",
  ).length;

  // 2. Reconstruct 9x9 Grid from DOM
  // We need to map the slots 0-8 to the grid rows/cols
  const currentBoard = Array.from({ length: 9 }, () => Array(9).fill(0));
  let reconstructionFailed = false;

  slots.forEach((slot) => {
    const sIndex = parseInt(slot.dataset.slotIndex);
    const content = slot.querySelector(".mini-sudoku-grid");

    // If empty slot, just leave 0s
    if (!content) return;

    // Identify which chunk of numbers this is.
    const chunkId = parseInt(content.dataset.chunkIndex);
    const state = gameManager.getState();
    const originalChunks = getChunksFromBoard(state.data.initialPuzzle);
    const chunkData = originalChunks[chunkId]; // 3x3 array of numbers

    if (!chunkData) {
      // Should not happen
      reconstructionFailed = true;
      return;
    }

    // Map this 3x3 chunk to the 9x9 board based on `sIndex` (Position)
    const startRow = Math.floor(sIndex / 3) * 3;
    const startCol = (sIndex % 3) * 3;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const val = chunkData[r][c];
        currentBoard[startRow + r][startCol + c] = val;
      }
    }
  });

  if (reconstructionFailed) return;

  // 3. Check for Conflicts (Real-time)
  const conflicts = getConflicts(currentBoard); // Returns Set of "row,col" strings

  // 4. Highlight Errors
  if (conflicts.size > 0) {
    // We need to map back from (row, col) to the DOM element (chunk -> cell)
    // There isn't a direct link, so we have to calculate it.

    // Iterate over slots again to find the cells corresponding to conflicts
    slots.forEach((slot) => {
      const sIndex = parseInt(slot.dataset.slotIndex);
      const startRow = Math.floor(sIndex / 3) * 3;
      const startCol = (sIndex % 3) * 3;

      // Check each cell in this 3x3 slot
      const miniCells = slot.querySelectorAll(".mini-cell");
      // The mini-cells are usually strictly ordered 0..8 in DOM?
      // Yes, createMiniGrid builds them in row-major order.

      miniCells.forEach((cell, idx) => {
        const rOffset = Math.floor(idx / 3);
        const cOffset = idx % 3;
        const absoluteRow = startRow + rOffset;
        const absoluteCol = startCol + cOffset;

        if (conflicts.has(`${absoluteRow},${absoluteCol}`)) {
          cell.classList.add("error-number");
        }
      });
    });

    if (boardContainer) {
      boardContainer.classList.remove("board-error");
      void boardContainer.offsetWidth;
      boardContainer.classList.add("board-error");
    }
  }

  // 5. Check Victory (Full Board AND No Conflicts)
  if (filledCount === 9 && conflicts.size === 0) {
    console.log("Jigsaw Solved! Valid Sudoku formed.");

    // Detect Variation to ensure Sudoku Phase uses correct map
    const currentChunks = [];
    slots.forEach((slot, i) => {
      const content = slot.querySelector(".mini-sudoku-grid");
      if (content) {
        currentChunks[i] = parseInt(content.dataset.chunkIndex);
      } else {
        currentChunks[i] = -1;
      }
    });

    const targets = {
      0: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      LR: [2, 1, 0, 5, 4, 3, 8, 7, 6],
      TB: [6, 7, 8, 3, 4, 5, 0, 1, 2],
      HV: [8, 7, 6, 5, 4, 3, 2, 1, 0],
    };

    let bestMatchKey = "0";
    let maxMatches = -1;

    for (const [key, target] of Object.entries(targets)) {
      let matches = 0;
      for (let i = 0; i < 9; i++) {
        if (currentChunks[i] === target[i]) matches++;
      }
      if (matches > maxMatches) {
        maxMatches = matches;
        bestMatchKey = key;
      }
    }

    console.log(
      `Detected Variation: [${bestMatchKey}] (${maxMatches}/9 matches)`,
    );
    gameManager.setJigsawVariation(bestMatchKey);

    // Clean errors and Add Victory Animation
    clearBoardErrors();
    if (boardContainer) {
      boardContainer.classList.add("board-complete");
    } else {
      document.querySelector(".memory-board")?.classList.add("board-complete");
    }

    // Delay advance
    setTimeout(() => {
      // Timer Transition
      gameManager.stopStageTimer();
      gameManager.startStageTimer("sudoku");

      transitionToSudoku();
    }, 600);
  }

  // SYNC STATE: Collect current board for persistence
  syncJigsawState();
  gameManager.save();
}

/**
 * Reads the Jigsaw board and updates GameManager state
 */
export function syncJigsawState() {
  const slots = Array.from(
    boardContainer.querySelectorAll(".sudoku-chunk-slot"),
  );
  const placedChunks = slots.map((slot) => {
    const content = slot.querySelector(".mini-sudoku-grid");
    return content ? parseInt(content.dataset.chunkIndex) : -1;
  });

  gameManager.updateProgress("jigsaw", { placedChunks });
}

function clearBoardErrors() {
  if (boardContainer) boardContainer.classList.remove("board-error");
  document
    .querySelectorAll(".error-number")
    .forEach((el) => el.classList.remove("error-number"));
}
