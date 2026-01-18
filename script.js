// Game Configuration and State
const DEBUG_MODE = true;

// Init Debug Button visibility
document.addEventListener("DOMContentLoaded", () => {
  const hintBtn = document.getElementById("hint-btn");
  if (hintBtn && !DEBUG_MODE) {
    hintBtn.style.display = "none";
  }
});

const gameState = {
  currentStage: 0, // 0: Memory, 1: Jigsaw, 2: Sudoku, 3: Nonogram
  // State populated by generator
  sudokuSolution: [],
  sudokuPuzzle: [],
  jigsawCorrectness: Array(9).fill(null),
  currentNumber: 1,

  // Memory Game State
  memoryCards: [], // Array of { id, pieceId, isFlipped, isMatched }
  flippedCards: [], // IDs of currently flipped cards
  matchedPairs: 0,
  isLocked: false,

  // Peaks & Valleys State
  peaksTargets: [], // Array of {r, c}
  peaksFound: 0,

  // Number Search State
  searchTargets: [], // Array of objects { sequence: "123", id: "Target1" }
  foundTargets: [], // Array of target IDs found
  isSelecting: false,
  selectionStart: null, // {r, c}
  selectionPath: [], // Array of {r, c}
};

let uiScale = 1;

function resizeGame() {
  const scaler = document.getElementById("game-scaler");
  const container = document.querySelector(".game-container");

  if (!scaler || !container) return;

  // 1. Reset transform and width to let browser layout natural responsive size
  scaler.style.transform = "none";
  scaler.style.transformOrigin = "center top"; // Ensure we scale from top
  scaler.style.width = "100%";
  scaler.style.height = "auto";

  // 2. Measure actual size
  const contentWidth = Math.max(container.scrollWidth, container.offsetWidth);
  const contentHeight = Math.max(
    container.scrollHeight,
    container.offsetHeight,
  );

  const availableWidth = window.innerWidth;
  const availableHeight = window.innerHeight;

  // 3. Calculate Scale
  // Dynamic buffers based on screen size (width AND height)

  const isMobile = availableWidth < 768;
  const isShortScreen = availableHeight < 900; // e.g. 1366x768, laptops

  // X Buffer: Minimal on mobile, generous on desktop
  const safetyBufferX = isMobile ? 0 : 80;

  // Y Buffer: Minimal on mobile, dependent on height for desktop
  let safetyBufferY = 80; // Default generous buffer
  if (isMobile) {
    safetyBufferY = 0;
  } else if (isShortScreen) {
    // User reported "too much margin" on 1366x768.
    // Reducing strictly to 0 allows full height usage.
    // CSS padding/centering will handle the rest.
    safetyBufferY = 0;
  }

  const scaleX = (availableWidth - safetyBufferX) / contentWidth;
  const scaleY = (availableHeight - safetyBufferY) / contentHeight;

  // Use smaller scale to fit both
  uiScale = Math.min(scaleX, scaleY);

  // 4. Apply Scale - DISABLED because layout is now responsive via CSS
  // scaler.style.transform = `scale(${uiScale})`;

  // Set to 1 explicitly to ensure no residual scaling
  scaler.style.transform = "none";
  scaler.style.width = "100%";
  scaler.style.height = "100%"; // Ensure full height for centering
}

window.addEventListener("resize", resizeGame);
window.addEventListener("load", () => {
  // Slight delay to ensure layout is stable
  setTimeout(resizeGame, 100);
});

// ... (initGame, initJigsaw, etc - lines 45-420 unchanged)

// DOM Elements
const instructionText = document.getElementById("instruction-text");
const memoryStage = document.getElementById("memory-stage");
const jigsawStage = document.getElementById("jigsaw-stage");
const sudokuStage = document.getElementById("sudoku-stage");
const peaksStage = document.getElementById("peaks-stage");
const searchStage = document.getElementById("search-stage");
const winScreen = document.getElementById("win-screen");

// Shared Board
const mainBoard = document.getElementById("main-board");

// --- Sudoku Generator ---

function generateSudokuData() {
  // 1. Generate full valid board
  const solution = Array(9)
    .fill()
    .map(() => Array(9).fill(0));
  fillDiagonal(solution);
  fillRemaining(solution, 0, 3);
  gameState.sudokuSolution = JSON.parse(JSON.stringify(solution)); // Deep copy

  // 2. Remove digits to create puzzle
  const puzzle = JSON.parse(JSON.stringify(solution));
  removeDigits(puzzle, 40); // Remove 40 digits -> ~41 clues remaining (Easy/Medium)
  gameState.sudokuPuzzle = puzzle;
}

function fillDiagonal(grid) {
  for (let i = 0; i < 9; i = i + 3) {
    fillBox(grid, i, i);
  }
}

function fillBox(grid, row, col) {
  let num;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      do {
        num = Math.floor(Math.random() * 9) + 1;
      } while (!isSafeInBox(grid, row, col, num));
      grid[row + i][col + j] = num;
    }
  }
}

function isSafeInBox(grid, rowStart, colStart, num) {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (grid[rowStart + i][colStart + j] === num) {
        return false;
      }
    }
  }
  return true;
}

function isSafe(grid, row, col, num) {
  return (
    !usedInRow(grid, row, num) &&
    !usedInCol(grid, col, num) &&
    !isSafeInBox(grid, row - (row % 3), col - (col % 3), num) === false // wait, isSafeInBox returns false if used.
  );
}
// Fix isSafe logic helper:
function checkIfSafe(grid, i, j, num) {
  return (
    !usedInRow(grid, i, num) &&
    !usedInCol(grid, j, num) &&
    !usedInBox(grid, i - (i % 3), j - (j % 3), num)
  );
}

function usedInRow(grid, i, num) {
  for (let j = 0; j < 9; j++) {
    if (grid[i][j] === num) return true;
  }
  return false;
}

function usedInCol(grid, j, num) {
  for (let i = 0; i < 9; i++) {
    if (grid[i][j] === num) return true;
  }
  return false;
}

function usedInBox(grid, rowStart, colStart, num) {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (grid[rowStart + i][colStart + j] === num) return true;
    }
  }
  return false;
}

function fillRemaining(grid, i, j) {
  if (j >= 9 && i < 8) {
    i = i + 1;
    j = 0;
  }
  if (i >= 9 && j >= 9) return true;

  if (i < 3) {
    if (j < 3) j = 3;
  } else if (i < 6) {
    if (j === Math.floor(i / 3) * 3) j = j + 3;
  } else {
    if (j === 6) {
      i = i + 1;
      j = 0;
      if (i >= 9) return true;
    }
  }

  for (let num = 1; num <= 9; num++) {
    if (checkIfSafe(grid, i, j, num)) {
      grid[i][j] = num;
      if (fillRemaining(grid, i, j + 1)) return true;
      grid[i][j] = 0;
    }
  }
  return false;
}

function countSolutions(grid) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        let solutions = 0;
        for (let num = 1; num <= 9; num++) {
          if (checkIfSafe(grid, r, c, num)) {
            grid[r][c] = num;
            solutions += countSolutions(grid);
            grid[r][c] = 0;
            if (solutions > 1) return solutions; // Optimization: stop if multiple found
          }
        }
        return solutions;
      }
    }
  }
  return 1; // Filled board is 1 solution
}

function removeDigits(grid, targetToRemove) {
  // Generate list of all cell positions
  let cells = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      cells.push({ r, c });
    }
  }

  // Shuffle to randomize removal order
  cells.sort(() => Math.random() - 0.5);

  let removedCount = 0;

  for (let i = 0; i < cells.length; i++) {
    let { r, c } = cells[i];

    if (grid[r][c] !== 0) {
      let backup = grid[r][c];
      grid[r][c] = 0; // Tentative remove

      // Check uniqueness using a COPY of the grid because countSolutions uses backtracking
      // Actually countSolutions unwinds grid modifications if it backtracks,
      // but if it finds a solution it returns.
      // Wait, countSolutions modifies 'grid' in place but resets to 0 on backtrack.
      // However, when it returns 1 (found), the board is full from the *recursive* perspective?
      // No, let's trace:
      // If full -> return 1.
      // If we find 1 solution, we backtrack (reset to 0) to find MORE solutions.
      // So 'grid' is restored to original state (with 0 at r,c) after countSolutions returns.
      // So we can pass 'grid' directly.

      let solutions = countSolutions(grid);

      if (solutions !== 1) {
        // Not unique (or 0 solutions, which shouldn't happen here), restore
        grid[r][c] = backup;
      } else {
        // Unique solution maintained, keep it removed
        removedCount++;
        if (removedCount >= targetToRemove) break;
      }
    }
  }
  console.log(`Sudoku Generated: Removed ${removedCount} digits.`);
}

// --- Initialization ---
// --- Initialization ---
function initGame() {
  generateSudokuData();
  setupJigsawStructure(); // Prepare board slots and pools
  initMemoryGame();
  initSudokuControls();

  // Initial State Override for Start Menu
  const startMenu = document.getElementById("start-menu");
  const subtitle = document.getElementById("game-subtitle");
  const panelHeader = document.querySelector(".panel-header");
  const globalHeader = document.querySelector("header");
  const hintBtn = document.getElementById("hint-btn");

  if (startMenu) {
    // Hide Game Elements
    mainBoard.classList.add("hidden");
    if (panelHeader) panelHeader.classList.add("hidden");
    if (globalHeader) globalHeader.style.display = "none";
    if (hintBtn) hintBtn.style.display = "none";

    // Ensure Jigsaw Overlay is hidden (it would intercept clicks)
    jigsawStage.classList.add("hidden");
    jigsawStage.classList.remove("active");

    // Ensure Memory Stage is hidden
    memoryStage.classList.add("hidden");
    memoryStage.classList.remove("active");

    // Show Start Menu
    startMenu.classList.remove("hidden");
    startMenu.classList.add("active");

    if (subtitle) subtitle.innerText = "Jigsudo";

    document
      .getElementById("start-btn")
      .addEventListener("click", startGameFlow);
  } else {
    // Fallback if no menu
    startGameFlow();
  }

  // Trigger initial resize
  setTimeout(resizeGame, 0);

  initTooltip();
}

function startGameFlow() {
  const startMenu = document.getElementById("start-menu");
  const subtitle = document.getElementById("game-subtitle");
  const panelHeader = document.querySelector(".panel-header");
  const hintBtn = document.getElementById("hint-btn");
  const appTitle = document.getElementById("app-title");

  // Game Elements (ensure we have references)
  const mainBoard = document.getElementById("main-board");
  const memoryStage = document.getElementById("memory-stage");
  const jigsawStage = document.getElementById("jigsaw-stage");

  // 1. Trigger Title Animation (Move from Center to Top)
  if (appTitle) {
    appTitle.classList.remove("start-mode");
    appTitle.classList.add("game-mode");
  }

  // 2. Animate Menu Fade Out
  if (startMenu) {
    startMenu.classList.add("fade-out");

    // Wait for transition (0.6s) before switching state
    setTimeout(() => {
      startMenu.classList.add("hidden");
      startMenu.classList.remove("active");

      // 3. Reveal Game Interface
      if (mainBoard) mainBoard.classList.remove("hidden");
      if (panelHeader) panelHeader.classList.remove("hidden"); // Correct class handling

      if (hintBtn && DEBUG_MODE) hintBtn.style.display = "block";

      // Activate Memory Stage
      if (memoryStage) {
        memoryStage.classList.remove("hidden");
        // Slight delay for fade-in effect if desired, or instant
        setTimeout(() => {
          memoryStage.classList.add("active");
        }, 50);
      }

      // Activate Jigsaw Overlay (Persisting existing logic)
      if (jigsawStage) {
        jigsawStage.classList.remove("hidden");
        jigsawStage.classList.add("active");
      }

      if (subtitle) subtitle.innerText = "Juego de memoria";

      // Final Layout Adjustment
      resizeGame();
    }, 600); // Sync with CSS transition
  } else {
    // Fallback if no start menu exists (Direct Start)
    initGame(); // This might lack some UI setups if skipped, but safe for dev
  }
}

function initTooltip() {
  const trigger = document.getElementById("info-trigger");
  const tooltip = document.getElementById("info-tooltip");

  if (!trigger || !tooltip) return;

  // Toggle on click (Mobile & Desktop click support)
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    tooltip.classList.toggle("hidden-tooltip");
  });

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (!trigger.contains(e.target) && !tooltip.contains(e.target)) {
      tooltip.classList.add("hidden-tooltip");
    }
  });
}

function setupJigsawStructure() {
  // Clear Main Board (Center)
  mainBoard.innerHTML = "";
  mainBoard.className = "drop-zone"; // Set as grid immediately

  // Clear Pool Wrapper
  const container = document.querySelector(".jigsaw-pools-wrapper");
  if (container) {
    container.innerHTML = "";
    // Allow dropping on background (Free Drop)
    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("drop", handleDrop);
  }

  // Generate 9 Slots (Empty)
  for (let i = 0; i < 9; i++) {
    const slot = document.createElement("div");
    slot.className = "jigsaw-slot";
    slot.dataset.slotId = i;
    slot.style.border = "1px dashed rgba(255,255,255,0.3)"; // Visible during memory? Maybe subtle.

    // Add event listeners now (ready for drag later)
    slot.addEventListener("dragover", handleDragOver);
    slot.addEventListener("drop", handleDrop);
    slot.addEventListener("click", handleSlotClick); // Add Click Support

    mainBoard.appendChild(slot);
  }
}

function renderJigsawPiece(blockId) {
  const piece = document.createElement("div");
  piece.className = "jigsaw-piece";
  piece.draggable = false; // Locked during memory
  piece.dataset.blockId = blockId;
  // Cells
  const startRow = Math.floor(blockId / 3) * 3;
  const startCol = (blockId % 3) * 3;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = document.createElement("div");
      cell.className = "jigsaw-cell";
      const value = gameState.sudokuPuzzle[startRow + r][startCol + c];
      cell.textContent = value !== 0 ? value : "";
      piece.appendChild(cell);
    }
  }
  return piece;
}

function collectPiece(pieceId) {
  const blockId = parseInt(pieceId);
  const piece = renderJigsawPiece(blockId);

  // Determine Destination
  if (blockId === 4) {
    // Center Piece -> Center Slot (Slot 4)
    const centerSlot = mainBoard.children[4];
    piece.style.position = "static";

    // NUCLEAR LOCK (Moved from initJigsaw to Memory Collection Logic)
    piece.id = "center-fixed-piece";
    piece.classList.add("fixed-piece");
    piece.classList.add("locked-unique-piece");

    piece.style.pointerEvents = "none";
    piece.style.userSelect = "none";
    // piece.style.border = "4px solid #ff0000"; // disable or keep for debug? User said "no border seen"
    // Let's keep a subtle indicator or none if standard usage.
    // User complained about "not seeing distinct border".
    // I previously added red border to debug.
    // I will use a subtle lock indicator now that logic is fixed.
    piece.style.boxShadow = "inset 0 0 10px rgba(0,0,0,0.5)";

    piece.setAttribute("draggable", "false");
    piece.draggable = false;

    centerSlot.appendChild(piece);
  } else {
    // Side Pool
    const container = document.querySelector(".jigsaw-pools-wrapper");
    container.appendChild(piece);

    // Sequential Filling Logic
    const index = gameState.sidePiecesFound;
    gameState.sidePiecesFound++; // Increment for next piece

    let isLeft = false;
    let colPos = 0;

    if (index < 4) {
      isLeft = true;
      colPos = index;
    } else {
      isLeft = false;
      colPos = index - 4;
    }

    // Responsive Positioning: Desktop (hugging board) vs Mobile (edges)
    const isDesktop = window.matchMedia("(min-width: 600px)").matches;
    let leftStyle;

    if (isDesktop) {
      const centerX = window.innerWidth / 2;

      if (isLeft) {
        // Target: Center - 440px. Clamp so it never goes below 20px (left wall)
        const target = centerX - 440;
        leftStyle = Math.max(20, target) + "px";
      } else {
        // Target: Center + 320px. Clamp so it never exceeds Right Wall - 140px (piece width)
        const target = centerX + 320;
        const maxRight = window.innerWidth - 140;
        leftStyle = Math.min(maxRight, target) + "px";
      }
    } else {
      leftStyle = isLeft ? "2%" : "86%";
    }

    // Adjust Vertical Step based on Piece Size
    // If intermediate (768-1023), pieces are 90px -> Step 110px
    // If full desktop (>1023), pieces are 120px -> Step 140px
    const isIntermediate = window.matchMedia(
      "(min-width: 768px) and (max-width: 1023px)",
    ).matches;
    const verticalStep = isIntermediate ? 110 : 140;

    const posY = 20 + colPos * verticalStep;

    piece.style.position = "absolute";
    /* piece.style.left = `${posX}%`; replaced by: */
    piece.style.left = leftStyle;
    piece.style.top = `${posY}px`;

    // Animate Enter
    piece.style.transform = "scale(0)";
    setTimeout(() => (piece.style.transform = "scale(1)"), 50);
  }
}

// --- UI Helpers ---
function updateGameSubtitle(text) {
  const subtitle = document.getElementById("game-subtitle");
  if (subtitle) {
    subtitle.innerText = text;
  }
}

// --- Stage 0: Memory Game ---
function initMemoryGame() {
  const subtitle = document.getElementById("game-subtitle");
  if (subtitle) subtitle.innerText = "Juego de memoria";
  instructionText.innerText =
    "Encuentra los pares para recolectar las piezas del rompecabezas.";

  const board = document.getElementById("memory-board");
  board.innerHTML = "";

  gameState.matchedPairs = 0;
  gameState.sidePiecesFound = 0; // Track for sequential filling
  gameState.flippedCards = [];
  gameState.isLocked = false;

  // Create pairs. We need 9 pieces (0-8), so 18 cards.
  let cards = [];
  for (let i = 0; i < 9; i++) {
    cards.push({ id: `card-${i}-a`, pieceId: i });
    cards.push({ id: `card-${i}-b`, pieceId: i });
  }

  // Shuffle
  cards.sort(() => Math.random() - 0.5);
  gameState.memoryCards = cards;

  cards.forEach((cardData) => {
    const card = createMemoryCard(cardData);
    board.appendChild(card);
  });
}

function createMemoryCard(cardData) {
  const card = document.createElement("div");
  // ... (rest of createMemoryCard is fine, but I'm in a replace block covering collectPiece first?)
  // Wait, collectPiece is BEFORE initMemoryGame in the file order I saw in Step 516.
  // Step 516: collectPiece is around 220? No.
  // I need to confirm file order.
  // Step 516:
  // function collectPiece(pieceId) { ... }
  // // --- Stage 0: Memory Game ---
  // function initMemoryGame() { ... }

  // So I can replace the block containing both.
  // I'll re-include createMemoryCard or just cut before it if possible.

  // Actually, I can just replace collectPiece and initMemoryGame bodies separately?
  // Or together.

  card.className = "memory-card";
  card.dataset.id = cardData.id;
  card.dataset.pieceId = cardData.pieceId;
  card.onclick = handleCardClick;

  const inner = document.createElement("div"); // Not used really?

  const back = document.createElement("div");
  back.className = "card-back";
  back.innerText = "?";

  const front = document.createElement("div");
  front.className = "card-front";

  // Render mini piece inside front (Full piece actually?)
  // We use renderJigsawPiece now? No, cards are small 70x70.
  // initJigsaw uses renderJigsawPiece (120x120).
  // Cards used renderMiniPiece?
  // Let's check renderMiniPiece existence. It might be gone or legacy.
  // Step 516 didn't show renderMiniPiece.
  // It showed renderJigsawPiece.
  // But collectPiece uses renderJigsawPiece.
  // createMemoryCard (line 243 in legacy) used renderMiniPiece.
  // I should check if renderMiniPiece exists.

  const miniPiece = renderJigsawPiece(cardData.pieceId); // Reuse full piece logic?
  // Ideally yes, but scaled via CSS (.memory-card .jigsaw-piece) logic?
  // .memory-card logic in CSS handles children?
  // I'll stick to renderJigsawPiece logic inside card?
  // Let's assume renderJigsawPiece is fine.

  front.appendChild(miniPiece);

  card.appendChild(front);
  card.appendChild(back);

  return card;
}

function renderMiniPiece(blockId) {
  const startRow = Math.floor(blockId / 3) * 3;
  const startCol = (blockId % 3) * 3;

  const piece = document.createElement("div");
  piece.className = "mini-piece";

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = document.createElement("div");
      cell.className = "jigsaw-cell";
      const value = gameState.sudokuPuzzle[startRow + r][startCol + c];
      cell.textContent = value !== 0 ? value : "";
      piece.appendChild(cell);
    }
  }
  return piece;
}

function handleCardClick() {
  if (gameState.isLocked) return;
  if (this.classList.contains("flipped")) return; // Already flipped
  if (this.classList.contains("matched")) return; // Already matched

  const id = this.dataset.id;
  this.classList.add("flipped");
  gameState.flippedCards.push(this);

  if (gameState.flippedCards.length === 2) {
    checkMemoryMatch();
  }
}

function checkMemoryMatch() {
  gameState.isLocked = true;
  const [card1, card2] = gameState.flippedCards;
  const match = card1.dataset.pieceId === card2.dataset.pieceId;

  if (match) {
    gameState.matchedPairs++;
    card1.classList.add("matched");
    card2.classList.add("matched");
    gameState.flippedCards = [];
    gameState.isLocked = false;

    // Animate collection
    collectPiece(card1.dataset.pieceId);

    if (gameState.matchedPairs === 9) {
      setTimeout(transitionToJigsawAnimated, 500);
    }
  } else {
    setTimeout(() => {
      card1.classList.remove("flipped");
      card2.classList.remove("flipped");
      gameState.flippedCards = [];
      gameState.isLocked = false;
    }, 1000);
  }
}

// collectPiece removed (moved to top with initGame)

// --- Transition 0->1 (Animated) ---
function transitionToJigsawAnimated() {
  gameState.currentStage = 1;
  const subtitle = document.getElementById("game-subtitle");
  if (subtitle) subtitle.innerText = "Rompecabezas";
  instructionText.innerText = "Arma el rompecabezas para revelar el tablero.";

  // Hide Memory UI (Fade out cards provided by memory-board container? Or just the stage?)
  // Memory stage container currently holds instructions/controls?
  memoryStage.classList.add("hidden");
  memoryStage.classList.remove("active");

  // Unlock Jigsaw Pieces (Enable Drag)
  const pieces = document.querySelectorAll(".jigsaw-piece");
  pieces.forEach((p) => {
    // Skip the fixed center piece
    if (
      p.id === "center-fixed-piece" ||
      p.classList.contains("fixed-piece") ||
      p.dataset.blockId === "4"
    ) {
      p.style.cursor = "default";
      return;
    }

    p.draggable = true;
    p.addEventListener("dragstart", handleDragStart);
    p.addEventListener("click", handlePieceClick); // Add Click Support
    // Visual cue they are now active?
    p.style.cursor = "grab";
  });

  // Enable Background Drops
  jigsawStage.classList.add("interactive");

  // Remove Memory Cards if any remain (should be all matched/gone?)
  // Actually matched cards might still be in DOM?
  // Memory logic usually keeps them as "matched".
  // We can clear memory-board to be safe/clean.
  document.getElementById("memory-board").innerHTML = "";

  // Check auto-completion if solved by memory alone? (Unlikely)
  checkJigsawCompletion();
}

// Deprecated simple transition
function transitionToJigsaw() {
  // ...
}

// --- Stage 1: Jigsaw ---
// --- Stage 1: Jigsaw ---
function initJigsaw() {
  const container = document.querySelector(".jigsaw-pools-wrapper");
  const dropZone = mainBoard;

  // Clear previous pieces
  container.innerHTML = "";
  dropZone.innerHTML = "";

  let pieces = [];

  for (let block = 0; block < 9; block++) {
    const startRow = Math.floor(block / 3) * 3;
    const startCol = (block % 3) * 3;

    const piece = document.createElement("div");
    piece.className = "jigsaw-piece";
    piece.draggable = true;
    piece.dataset.blockId = block;
    // Essential for absolute positioning
    piece.style.position = "absolute";

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cell = document.createElement("div");
        cell.className = "jigsaw-cell";
        const value = gameState.sudokuPuzzle[startRow + r][startCol + c];
        cell.textContent = value !== 0 ? value : "";
        piece.appendChild(cell);
      }
    }

    const slot = document.createElement("div");
    slot.className = "jigsaw-slot";
    slot.dataset.slotId = block;
    slot.style.border = "1px dashed rgba(255,255,255,0.3)";
    slot.addEventListener("dragover", handleDragOver);
    slot.addEventListener("drop", handleDrop);
    slot.addEventListener("click", handleSlotClick); // Click handler
    dropZone.appendChild(slot);

    if (block === 4) {
      // Center piece fixed in slot
      piece.id = "center-fixed-piece";
      piece.style.position = "static";
      piece.classList.add("locked-unique-piece"); // New unique class

      // NUCLEAR OPTION: INLINE STYLES to bypass cache/CSS issues
      piece.style.pointerEvents = "none";
      piece.style.userSelect = "none";
      piece.style.border = "4px solid #ff0000"; // Red border for verification
      piece.style.boxShadow = "0 0 20px rgba(255,0,0,0.5)";

      piece.setAttribute("draggable", "false");
      piece.draggable = false;

      slot.appendChild(piece);
    } else {
      piece.addEventListener("dragstart", handleDragStart);
      piece.addEventListener("click", handlePieceClick); // Click handler
      pieces.push(piece);
    }
  }

  // Scatter remaining pieces on sides (Ordered Columns)
  // Left Side: Indices 0, 1, 2, 3
  // Right Side: Indices 4, 5, 6, 7

  pieces.forEach((p, index) => {
    container.appendChild(p);

    const isLeft = index < 4;
    const colIndex = index % 4; // 0..3

    // Fixed positions for tidy start
    // Left: 2%, Right: 82%
    // Top: Fixed pixels to avoid collapse

    const posX = isLeft ? 2 : 86;
    const posY = 20 + colIndex * 140; // 140px step (120 piece + 20 gap)

    p.style.left = `${posX}%`;
    p.style.top = `${posY}px`;
  });

  updateJigsawState();

  // Allow dropping anywhere on main wrapper
  container.addEventListener("dragover", handleDragOver);
  container.addEventListener("drop", handleDrop);

  // Click interaction for wrapper (Deselect or Move to Pool)
  container.addEventListener("click", handleWrapperClick);
}

let draggedPiece = null;
let selectedPiece = null; // New Selection State
let grabOffset = { x: 0, y: 0 }; // To track mouse offset

function handleDragStart(e) {
  if (this.classList.contains("fixed-piece")) {
    e.preventDefault();
    return;
  }

  draggedPiece = this;
  e.dataTransfer.effectAllowed = "move";
  this.classList.add("dragging");

  const rect = this.getBoundingClientRect();
  grabOffset.x = e.clientX - rect.left;
  grabOffset.y = e.clientY - rect.top;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

// Global Drag Blocker for Fixed Pieces
document.addEventListener(
  "dragstart",
  (e) => {
    const isLocked =
      e.target.id === "center-fixed-piece" ||
      e.target.classList.contains("locked-unique-piece") ||
      e.target.classList.contains("fixed-piece");

    if (isLocked) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  },
  true,
);

function handleDrop(e) {
  e.preventDefault();
  draggedPiece.classList.remove("dragging");

  const targetSlot = e.target.closest(".jigsaw-slot");
  const targetWrapper = e.target.closest(".jigsaw-pools-wrapper");
  const mainBoardEl = document.getElementById("main-board");

  // Check if we dropped ON the board but not in a slot (ignore?)
  if (mainBoardEl.contains(e.target) && !targetSlot) {
    return; // Invalid drop area on grid
  }

  // Capture Origin Info BEFORE moving anything
  const originParent = draggedPiece.parentNode;
  const originIsSlot = originParent.classList.contains("jigsaw-slot");
  const originLeft = draggedPiece.style.left;
  const originTop = draggedPiece.style.top;

  if (targetSlot) {
    // Dropping into a slot
    if (targetSlot.children.length > 0) {
      // Use firstElementChild to ensure we get the DIV, not a text node
      const existing = targetSlot.firstElementChild;

      // CRITICAL: Check if existing piece is locked (center piece)
      if (existing) {
        const isLocked =
          existing.id === "center-fixed-piece" ||
          existing.classList.contains("locked-unique-piece");
        if (isLocked) return;
      }

      if (existing !== draggedPiece) {
        // SWAP LOGIC
        // 1. Move existing piece to where dragged piece came from
        originParent.appendChild(existing);

        if (originIsSlot) {
          // Swapped with another slot -> Become static
          existing.style.position = "static";
          existing.style.transform = "none";
          existing.style.left = "";
          existing.style.top = "";
        } else {
          // Swapped with pool -> Become absolute at dragged piece's old pos
          existing.style.position = "absolute";
          existing.style.left = originLeft;
          existing.style.top = originTop;
        }
      }
    }

    // 2. Move dragged piece to target slot
    targetSlot.appendChild(draggedPiece);
    draggedPiece.style.position = "static";
    draggedPiece.style.transform = "none";
    draggedPiece.style.left = "";
    draggedPiece.style.top = "";

    checkJigsawCompletion();
  } else if (targetWrapper) {
    // Dropping freely on background
    targetWrapper.appendChild(draggedPiece); // Re-append to be child of wrapper

    // Calculate position relative to container
    const containerRect = targetWrapper.getBoundingClientRect();

    // Adjust for User Interface Scale
    const x = (e.clientX - containerRect.left - grabOffset.x) / uiScale;
    const y = (e.clientY - containerRect.top - grabOffset.y) / uiScale;

    draggedPiece.style.position = "absolute";
    draggedPiece.style.left = `${x}px`;
    draggedPiece.style.top = `${y}px`;

    updateJigsawState();
  }

  draggedPiece = null;
}

// --- Click Interaction Handlers ---

function handlePieceClick(e) {
  // Prevent propagation so we don't trigger slot/wrapper clicks
  e.stopPropagation();

  if (
    this.id === "center-fixed-piece" ||
    this.classList.contains("fixed-piece")
  )
    return;

  if (selectedPiece === this) {
    deselectPiece();
  } else {
    if (selectedPiece) {
      // Swap with previously selected piece
      performSwap(selectedPiece, this);
    } else {
      selectPiece(this);
    }
  }
}

function handleSlotClick(e) {
  if (!selectedPiece) return;

  // Move selected piece to this slot
  const slot = this;

  // If slot is not empty, the piece click handler would have fired (swapping),
  // unless the events didn't propagate or we clicked the gap?
  // If we click the slot itself (gap), proceed.

  if (slot.children.length === 0) {
    slot.appendChild(selectedPiece);
    selectedPiece.style.position = "static";
    selectedPiece.style.left = "";
    selectedPiece.style.top = "";
    selectedPiece.style.transform = "none";

    checkJigsawCompletion();
    deselectPiece();
  }
}

function handleWrapperClick(e) {
  if (!selectedPiece) return;

  // Check if we clicked on a slot or piece (should be handled by stops, but double check target)
  if (e.target.closest(".jigsaw-slot") || e.target.closest(".jigsaw-piece"))
    return;

  // Move to pool area at click location
  const container = document.querySelector(".jigsaw-pools-wrapper");
  const rect = container.getBoundingClientRect();

  // Center the piece (120x120 -> 60 offset)
  // Ensure we stay within bounds?
  // For now simple translation.

  let x = e.clientX - rect.left - 60;
  let y = e.clientY - rect.top - 60;

  container.appendChild(selectedPiece);
  selectedPiece.style.position = "absolute";
  selectedPiece.style.left = `${x}px`;
  selectedPiece.style.top = `${y}px`;
  selectedPiece.style.transform = "none";

  updateJigsawState();
  deselectPiece();
}

function selectPiece(piece) {
  if (selectedPiece) deselectPiece();
  selectedPiece = piece;
  piece.classList.add("selected");
}

function deselectPiece() {
  if (selectedPiece) {
    selectedPiece.classList.remove("selected");
    selectedPiece = null;
  }
}

function performSwap(pieceA, pieceB) {
  // Swap pieceA (selected) with pieceB (clicked target)

  // Logic mostly mirrors handleDrop swap but cleaner
  const parentA = pieceA.parentNode;
  const parentB = pieceB.parentNode;

  const isSlotA = parentA.classList.contains("jigsaw-slot");
  const isSlotB = parentB.classList.contains("jigsaw-slot");

  // Positional Data for restoring positions if swapping to/from pool
  const styleA_left = pieceA.style.left;
  const styleA_top = pieceA.style.top;
  const styleA_pos = pieceA.style.position;

  const styleB_left = pieceB.style.left;
  const styleB_top = pieceB.style.top;
  const styleB_pos = pieceB.style.position;

  // Move A to Parent B
  parentB.appendChild(pieceA);
  if (isSlotB) {
    pieceA.style.position = "static";
    pieceA.style.left = "";
    pieceA.style.top = "";
  } else {
    pieceA.style.position = styleB_pos;
    pieceA.style.left = styleB_left;
    pieceA.style.top = styleB_top;
  }

  // Move B to Parent A
  parentA.appendChild(pieceB);
  if (isSlotA) {
    pieceB.style.position = "static";
    pieceB.style.left = "";
    pieceB.style.top = "";
  } else {
    pieceB.style.position = styleA_pos;
    pieceB.style.left = styleA_left;
    pieceB.style.top = styleA_top;
  }

  checkJigsawCompletion();
  deselectPiece();
}

function moveToWrapper(piece) {
  const container = document.querySelector(".jigsaw-pools-wrapper");
  container.appendChild(piece);
  piece.style.position = "absolute";
  // Place randomly on left to ensure visibility
  piece.style.left = "5%";
  piece.style.top = `${10 + Math.random() * 60}%`;
}

function updateJigsawState() {
  // Re-scan all slots to update correctness array
  const slots = document.querySelectorAll(".jigsaw-slot");
  gameState.jigsawCorrectness.fill(null);

  slots.forEach((slot) => {
    if (slot.children.length > 0) {
      const piece = slot.firstChild;
      const slotId = parseInt(slot.dataset.slotId);
      const pieceId = parseInt(piece.dataset.blockId);
      gameState.jigsawCorrectness[slotId] = pieceId;
    }
  });
}

function checkJigsawCompletion() {
  updateJigsawState();

  let filled = 0;
  let correct = 0;

  gameState.jigsawCorrectness.forEach((val, idx) => {
    if (val !== null) {
      filled++;
      if (val === idx) correct++;
    }
  });

  if (filled === 9) {
    if (correct === 9) {
      console.log("Jigsaw complete! Transitioning...");
      // Animation: Fuse pieces
      const dropZone = mainBoard;
      dropZone.classList.add("jigsaw-completed");

      // Wait for fusion animation then transition
      setTimeout(() => transitionToSudoku(), 1500);
    } else {
      console.log("Jigsaw filled but incorrect.");
      instructionText.innerText =
        "El rompecabezas está completo pero incorrecto. Revisa las piezas.";
      instructionText.style.color = "#ff7675";
    }
  }
}

// --- Transition 1->2 ---
function transitionToSudoku() {
  console.log("transitionToSudoku started");
  gameState.currentStage = 2;
  updateGameSubtitle("Sudoku");
  instructionText.innerText = "¡Bien! Ahora completa el Sudoku.";
  instructionText.style.color = "#fff";

  jigsawStage.classList.add("hidden");
  jigsawStage.classList.remove("active");

  sudokuStage.classList.remove("hidden");

  // Clean mainBoard from Jigsaw classes
  mainBoard.classList.remove("drop-zone", "jigsaw-completed");
  mainBoard.classList.add("sudoku-container");

  // Render Sudoku (Rebuilds flat grid)
  renderSudokuBoard();

  setTimeout(() => {
    sudokuStage.classList.add("active");
    resizeGame();
  }, 50);
}

// --- Stage 2: Sudoku ---
function renderSudokuBoard() {
  const board = mainBoard;
  board.innerHTML = "";

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement("div");
      cell.className = "sudoku-cell";
      const value = gameState.sudokuPuzzle[r][c];

      if (value !== 0) {
        cell.textContent = value;
        cell.classList.add("fixed");
      } else {
        cell.textContent = "";
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.addEventListener("click", selectSudokuCell);
      }
      board.appendChild(cell);
    }
  }
}

let selectedSudokuCell = null;

function initSudokuControls() {
  const numpad = document.getElementById("numpad");
  // 1-9
  for (let i = 1; i <= 9; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = "num-btn";
    btn.onclick = () => fillSudokuCell(i);
    numpad.appendChild(btn);
  }
  // Delete btn
  const delBtn = document.createElement("button");
  delBtn.textContent = "❌";
  delBtn.className = "num-btn";
  delBtn.onclick = () => fillSudokuCell(0);
  numpad.appendChild(delBtn);

  document
    .getElementById("check-sudoku")
    .addEventListener("click", checkSudokuSolution);
}

function selectSudokuCell() {
  if (this.classList.contains("fixed")) return;

  if (selectedSudokuCell) selectedSudokuCell.classList.remove("selected");
  selectedSudokuCell = this;
  selectedSudokuCell.classList.add("selected");
}

function fillSudokuCell(num) {
  if (!selectedSudokuCell) return;

  const r = parseInt(selectedSudokuCell.dataset.row);
  const c = parseInt(selectedSudokuCell.dataset.col);

  // Visual update
  selectedSudokuCell.textContent = num === 0 ? "" : num;

  // State update (temporary, usually we don't update source of truth until check, but let's do it for tracking)
  // Actually better to keep `sudokuPuzzle` as initial state and read from DOM or a separate workingCopy
  // Let's use DOM for validation to be simple or a working copy array.
  // I'll read from DOM on check.

  // Remove error class if present
  selectedSudokuCell.classList.remove("error");
}

function checkSudokuSolution() {
  const cells = document.querySelectorAll(".sudoku-cell:not(.fixed)");
  let isCorrect = true;

  cells.forEach((cell) => {
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    const val = parseInt(cell.textContent) || 0;

    if (val !== gameState.sudokuSolution[r][c]) {
      isCorrect = false;
      cell.classList.add("error");
    } else {
      cell.classList.remove("error");
    }
  });

  if (isCorrect) {
    setTimeout(() => transitionToPeaks(), 500);
  } else {
    instructionText.innerText =
      "Hay errores en el Sudoku. Las celdas incorrectas están en rojo.";
    instructionText.style.color = "#ff7675";
  }
}

// --- Transition 2->3 ---
// --- Transition 2->3 ---
// --- Transition 2->3 ---
// --- Transition 2->3 ---
function transitionToPeaks() {
  gameState.currentStage = 3;
  const subtitle = document.getElementById("game-subtitle");
  if (subtitle) subtitle.innerText = "Picos y Valles";
  instructionText.innerText =
    "¡Picos y Valles! Encuentra los números mayores o menores que sus vecinos. (Solo horizontales y verticales)";
  instructionText.style.color = "#fff";

  sudokuStage.classList.add("hidden");
  sudokuStage.classList.remove("active");

  peaksStage.classList.remove("hidden");
  setTimeout(() => {
    peaksStage.classList.add("active");
    resizeGame();
  }, 50);

  // Switch Main Board Mode
  mainBoard.classList.remove("sudoku-container");
  mainBoard.classList.add("sudoku-container"); // Reuse grid style
  // Maybe add specific peaks class if needed for global styling overrides

  initPeaksGame();
}

// --- Stage 3: Peaks and Valleys ---

function initPeaksGame() {
  const board = mainBoard;
  board.innerHTML = "";

  gameState.peaksTargets = identifyPeaksAndValleys();
  gameState.peaksFound = 0;

  updatePeaksCount();

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement("div");
      // Reuse basic styling but add specific class
      cell.className = "sudoku-cell peaks-cell";
      cell.textContent = gameState.sudokuSolution[r][c]; // Show full solution
      cell.dataset.r = r;
      cell.dataset.c = c;

      cell.addEventListener("click", handlePeakClick);
      board.appendChild(cell);
    }
  }
}

function identifyPeaksAndValleys() {
  const grid = gameState.sudokuSolution;
  const targets = [];

  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = grid[r][c];

      // Rule: Ignore 1 and 9
      if (val === 1 || val === 9) continue;

      const neighbors = [];
      directions.forEach(([dr, dc]) => {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
          neighbors.push(grid[nr][nc]);
        }
      });

      if (neighbors.length === 0) continue; // Should not happen in 9x9

      const isPeak = neighbors.every((n) => val > n);
      const isValley = neighbors.every((n) => val < n);

      if (isPeak || isValley) {
        targets.push({ r, c });
      }
    }
  }
  return targets;
}

function handlePeakClick() {
  if (this.classList.contains("found")) return;

  const r = parseInt(this.dataset.r);
  const c = parseInt(this.dataset.c);

  // Check if valid target
  const isTarget = gameState.peaksTargets.some((t) => t.r === r && t.c === c);

  if (isTarget) {
    this.classList.add("found");
    this.classList.add("cracked"); // Add Crack Visual
    gameState.peaksFound++;
    updatePeaksCount();

    if (gameState.peaksFound === gameState.peaksTargets.length) {
      setTimeout(transitionToNumberSearch, 1000);
    }
  } else {
    this.classList.add("error");
    setTimeout(() => this.classList.remove("error"), 500);
  }
}

function updatePeaksCount() {
  const countEl = document.getElementById("peaks-remaining");
  if (countEl) {
    countEl.textContent = gameState.peaksTargets.length - gameState.peaksFound;
  }
}

// --- Transition 3->4 ---
function transitionToNumberSearch() {
  gameState.currentStage = 4;
  updateGameSubtitle("Sopa de números");

  instructionText.innerText =
    "¡Juego de Agudeza! Encuentra las secuencias numéricas ocultas en el tablero.";
  instructionText.style.color = "#fff";

  peaksStage.classList.add("hidden");
  peaksStage.classList.remove("active");

  searchStage.classList.remove("hidden");
  setTimeout(() => {
    searchStage.classList.add("active");
    resizeGame();
  }, 50);

  // Switch Main Board Mode
  mainBoard.classList.remove("sudoku-container"); // Remove Peaks/Sudoku style
  mainBoard.classList.add("search-container"); // Add Search style

  generateSearchTargets();
  renderSearchBoard();
  renderSearchTargets();
}

// --- Stage 3: Number Search --- (Stage 5 actually)

// --- Stage 3: Number Search --- (Stage 5 actually)

function generateSearchTargets() {
  const grid = gameState.sudokuSolution;
  const potentialTargets = [];
  const directions = [
    [0, 1], // Horizontal
    [1, 0], // Vertical
    [1, 1], // Diagonal \
    [1, -1], // Diagonal /
  ];

  // Blocked Set: Peaks & Valleys (Cracked Cells)
  const blockedSet = new Set();
  gameState.peaksTargets.forEach((t) => blockedSet.add(`${t.r},${t.c}`));

  // Attempt to find sequences of length 3 to 4 (User requested 3-4, reduced max 5)
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      directions.forEach(([dr, dc]) => {
        let seq = "";
        let path = [];
        // Max length 4 as per request
        for (let k = 0; k < 4; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;

          if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
            // CRITICAL: Check if cell is cracked
            if (blockedSet.has(`${nr},${nc}`)) {
              break; // Sequence broken by crack, stop extending
            }

            seq += grid[nr][nc];
            path.push({ r: nr, c: nc });

            if (seq.length >= 3) {
              potentialTargets.push({ sequence: seq, path: [...path] });
            }
          } else {
            break;
          }
        }
      });
    }
  }

  // Pick 5 random unique targets
  potentialTargets.sort(() => Math.random() - 0.5);
  const selected = [];
  const seenStr = new Set();

  for (const t of potentialTargets) {
    if (selected.length >= 5) break;
    if (!seenStr.has(t.sequence)) {
      selected.push(t);
      seenStr.add(t.sequence);
    }
  }

  // Fallback if not enough targets found (should contain at least some, if not, maybe relax length?)
  // Given 81 cells and ~20 peaks, 60 cells free, should be fine.

  gameState.searchTargets = selected.map((t, idx) => ({
    ...t,
    id: idx,
    found: false,
  }));
  gameState.foundTargets = [];
}

function renderSearchTargets() {
  const container = document.getElementById("search-targets");
  container.innerHTML = "";

  gameState.searchTargets.forEach((t) => {
    const el = document.createElement("div");
    el.className = `target-item ${t.found ? "done" : ""}`;
    el.textContent = t.sequence;
    container.appendChild(el);
  });
}

function renderSearchBoard() {
  const board = mainBoard;
  board.innerHTML = "";

  // Create blocked set for fast lookup
  const blockedSet = new Set();
  if (gameState.peaksTargets) {
    gameState.peaksTargets.forEach((t) => blockedSet.add(`${t.r},${t.c}`));
  }

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement("div");
      // MANTENEMOS la clase sudoku-cell para que el tablero se vea IDÉNTICO
      // Agregamos 'search-mode' por si necesitamos overrides especificos de cursor/interaccion
      cell.className = "sudoku-cell search-mode";

      // Persist Visual Cracks
      if (blockedSet.has(`${r},${c}`)) {
        cell.classList.add("cracked");
      }

      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.textContent = gameState.sudokuSolution[r][c];

      // Events for drag selection
      cell.addEventListener("mousedown", handleSearchStart);
      cell.addEventListener("mousemove", handleSearchMove);
      cell.addEventListener("mouseup", handleSearchEnd);

      board.appendChild(cell);
    }
  }

  // Global mouseup to catch releases outside cells
  document.addEventListener("mouseup", () => {
    if (gameState.isSelecting) {
      handleSearchEnd();
    }
  });
}

function handleSearchStart(e) {
  if (gameState.foundTargets.length === gameState.searchTargets.length) return; // Game over

  gameState.isSelecting = true;
  gameState.selectionPath = [];

  const r = parseInt(this.dataset.r);
  const c = parseInt(this.dataset.c);
  gameState.selectionStart = { r, c };

  updateSelectionPath(r, c);
}

function handleSearchMove(e) {
  if (!gameState.isSelecting) return;

  // Calculate position within cell to avoid corner-triggering
  const rect = this.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const w = rect.width;
  const h = rect.height;

  // Margin of error (e.g., 20% from each side)
  const margin = 0.2;

  if (
    x < w * margin ||
    x > w * (1 - margin) ||
    y < h * margin ||
    y > h * (1 - margin)
  ) {
    return; // Ignore if too close to edge
  }

  const r = parseInt(this.dataset.r);
  const c = parseInt(this.dataset.c);
  updateSelectionPath(r, c);
}

function updateSelectionPath(currentR, currentC) {
  const start = gameState.selectionStart;
  const dr = currentR - start.r;
  const dc = currentC - start.c;

  // Determine direction
  // Snap to closest valid direction (Horizontal, Vertical, Diagonal)
  // Directions: [0,1], [0,-1], [1,0], [-1,0], [1,1], [-1,-1], [1,-1], [-1,1]

  let stepR = 0;
  let stepC = 0;

  if (dr === 0 && dc === 0) {
    // Same cell
  } else if (Math.abs(dr) > Math.abs(dc) * 2) {
    // Vertical
    stepR = Math.sign(dr);
    stepC = 0;
  } else if (Math.abs(dc) > Math.abs(dr) * 2) {
    // Horizontal
    stepR = 0;
    stepC = Math.sign(dc);
  } else {
    // Diagonal attempt (if roughly 1:1 ratio)
    // Relax logic: if diffs are roughly equal, treat as diagonal
    // Or just strictly enforce based on larger diff?
    // Let's enforce 1:1.
    // Ideally user drags naturally.
    stepR = Math.sign(dr);
    stepC = Math.sign(dc);
  }

  // Create path from start to projected end
  // We project "distance" based on the dominant axis magnitude?
  // Let's iterate from start until we hit or pass currentR/currentC

  const path = [];

  // Distance
  const dist = Math.max(Math.abs(dr), Math.abs(dc));

  // Re-build path
  for (let k = 0; k <= dist; k++) {
    const nr = start.r + stepR * k;
    const nc = start.c + stepC * k;

    // Bounds check
    if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
      path.push({ r: nr, c: nc });
    }
  }

  // Update State
  gameState.selectionPath = path;

  // Update Visuals
  renderSelectionVisuals();
}

function renderSelectionVisuals() {
  // Clear all "selected" (but not "found")
  document
    .querySelectorAll(".sudoku-cell.selected")
    .forEach((el) => el.classList.remove("selected"));

  gameState.selectionPath.forEach((p) => {
    const cell = document.querySelector(
      `.sudoku-cell[data-r='${p.r}'][data-c='${p.c}']`,
    );
    if (cell && !cell.classList.contains("found")) {
      // Keep found green
      cell.classList.add("selected");
    }
  });
}

function handleSearchEnd() {
  if (!gameState.isSelecting) return;
  gameState.isSelecting = false;

  validateSelection();

  // Clear selection path
  gameState.selectionPath = [];
  renderSelectionVisuals();
}

function validateSelection() {
  // Construct string
  let seq = "";
  gameState.selectionPath.forEach((p) => {
    seq += gameState.sudokuSolution[p.r][p.c];
  });

  // Check if matches any *unfound* target
  // Also check reverse? Usually yes.
  const seqRev = seq.split("").reverse().join("");

  const match = gameState.searchTargets.find(
    (t) => !t.found && (t.sequence === seq || t.sequence === seqRev),
  );

  if (match) {
    match.found = true;
    gameState.foundTargets.push(match.id);

    // Mark cells as found permanently
    // But which cells? The ones in the path.
    gameState.selectionPath.forEach((p) => {
      // Use sudoku-cell instead of search-cell since we unified the classes
      const cell = document.querySelector(
        `.sudoku-cell[data-r='${p.r}'][data-c='${p.c}']`,
      );
      if (cell) {
        cell.classList.add("found");
        // Also clear selection style immediately so it turns green
        cell.classList.remove("selected");
      }
    });

    renderSearchTargets();

    if (gameState.foundTargets.length === gameState.searchTargets.length) {
      setTimeout(showWinScreen, 500);
    }
  }
}

function showWinScreen() {
  searchStage.classList.add("hidden");
  searchStage.classList.remove("active");

  winScreen.classList.remove("hidden");
  setTimeout(() => {
    winScreen.classList.add("active");
    resizeGame();
  }, 50);

  instructionText.innerText = "¡JUEGO COMPLETADO!";
}

// Start
initGame();

// --- Hints ---
document.getElementById("hint-btn").addEventListener("click", giveHint);

function giveHint() {
  switch (gameState.currentStage) {
    case 0:
      giveMemoryHint();
      break;
    case 1:
      giveJigsawHint();
      break;
    case 2:
      giveSudokuHint();
      break;
    case 3:
      givePeaksHint();
      break;
    case 4:
      giveSearchHint();
      break;
  }
}

function giveMemoryHint() {
  // Solve a pair permanently
  if (gameState.isLocked) return;

  // 1. Reset any current user interaction to avoid state conflicts
  if (gameState.flippedCards.length > 0) {
    gameState.flippedCards.forEach((card) => card.classList.remove("flipped"));
    gameState.flippedCards = [];
  }

  // 2. Find a pair that is not found yet
  const unmatchedCards = Array.from(
    document.querySelectorAll(".memory-card:not(.matched)"),
  );
  if (unmatchedCards.length < 2) return;

  // Pick one random card
  const card1 =
    unmatchedCards[Math.floor(Math.random() * unmatchedCards.length)];
  const pieceId = card1.dataset.pieceId;

  // Find its pair
  const card2 = unmatchedCards.find(
    (c) => c !== card1 && c.dataset.pieceId === pieceId,
  );

  if (card2) {
    // 3. Mark as flipped (Visual)
    card1.classList.add("flipped");
    card2.classList.add("flipped");

    // 4. Update State
    gameState.flippedCards = [card1, card2];

    // 5. Trigger Match Logic (Solving it)
    checkMemoryMatch();
  }
}

function givePeaksHint() {
  const targets = gameState.peaksTargets.filter((t) => {
    // Check if not already found (DOM check or state check)
    // Actually we only track found count, not specific ones in state array?
    // Wait, we don't track which ones are found in state, just the count.
    // We rely on DOM class 'found'.
    const cell = document.querySelector(
      `.peaks-cell[data-r='${t.r}'][data-c='${t.c}']`,
    );
    return cell && !cell.classList.contains("found");
  });

  if (targets.length > 0) {
    const target = targets[Math.floor(Math.random() * targets.length)];
    const cell = document.querySelector(
      `.peaks-cell[data-r='${target.r}'][data-c='${target.c}']`,
    );

    if (cell) {
      cell.style.background = "#fdcb6e"; // flash
      setTimeout(() => {
        if (!cell.classList.contains("found")) {
          cell.style.background = "";
        } else {
          cell.style.background = ""; // Reset inline so class takes over
        }
      }, 1000);
    }
  }
}

function giveJigsawHint() {
  const slots = document.querySelectorAll(".jigsaw-slot");
  let foundError = false;

  // 1. Check for ACTUAL ERRORS (Misplaced pieces)
  // We prefer showing an error over a hint if both exist.
  for (let i = 0; i < 9; i++) {
    const currentPieceId = gameState.jigsawCorrectness[i];

    // If there is a piece (not null) AND it is wrong (id != i)
    if (currentPieceId !== null && currentPieceId !== i) {
      const slot = slots[i];
      if (slot.firstChild) {
        const piece = slot.firstChild;
        piece.classList.add("error-highlight"); // Red shake
        setTimeout(() => piece.classList.remove("error-highlight"), 1500);
        foundError = true;
      }
      break; // Only show one error at a time
    }
  }

  if (foundError) return;

  // 2. If no errors, show a HINT (Visual only, no move)
  // Find the first empty slot
  let emptySlotIndex = -1;
  for (let i = 0; i < 9; i++) {
    if (gameState.jigsawCorrectness[i] === null) {
      emptySlotIndex = i;
      break;
    }
  }

  if (emptySlotIndex !== -1) {
    // Find the piece that belongs here
    const allPieces = [...document.querySelectorAll(".jigsaw-piece")];
    const targetPiece = allPieces.find(
      (p) => parseInt(p.dataset.blockId) === emptySlotIndex,
    );

    if (targetPiece) {
      // Highlight it visually (e.g. Yellow/Gold) to suggest "Use this one next"
      // We reuse a similar animation or style but different color?
      // Let's stick a simple transform or border.
      // Or just reuse error-highlight but with different color?
      // User asked for "mark wrong pieces". For hints, let's make it distinct.

      targetPiece.style.boxShadow = "0 0 15px 5px #fdcb6e";
      targetPiece.style.transform = "scale(1.1)";
      targetPiece.style.zIndex = "100";

      setTimeout(() => {
        targetPiece.style.boxShadow = "";
        targetPiece.style.transform = "";
        targetPiece.style.zIndex = "";
      }, 1500);
    }
  }
}

function giveSudokuHint() {
  const cells = document.querySelectorAll(".sudoku-cell:not(.fixed)");
  const candidates = [];

  cells.forEach((cell) => {
    const r = parseInt(cell.dataset.row);
    const c = parseInt(cell.dataset.col);
    const currentVal = parseInt(cell.textContent) || 0;
    const correctVal = gameState.sudokuSolution[r][c];

    // If empty or wrong, it's a candidate
    if (currentVal !== correctVal) {
      candidates.push({ cell, correctVal });
    }
  });

  if (candidates.length > 0) {
    const idx = Math.floor(Math.random() * candidates.length);
    const hint = candidates[idx];

    hint.cell.textContent = hint.correctVal;
    hint.cell.classList.add("fixed"); // Make it permanent/correct looking
    hint.cell.classList.remove("error");
    hint.cell.style.color = "#00b894"; // visual cue it was a hint
  }
}

function giveSearchHint() {
  // Find an unfound target
  const target = gameState.searchTargets.find((t) => !t.found);
  if (!target) return;

  // Flash the starting cell of this target
  const start = target.path[0];
  const cell = document.querySelector(
    `.search-cell[data-r='${start.r}'][data-c='${start.c}']`,
  );

  if (cell) {
    // Simple visual flash
    const originalBg = cell.style.background;
    cell.style.background = "#fdcb6e"; // Accent
    setTimeout(() => {
      cell.style.background = "";
    }, 1000);
  }
}
