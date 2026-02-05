import {
  initJigsaw,
  placeInPanel,
  transitionToJigsaw,
  handleSlotClick_v2,
  debugJigsawPlace,
  createPanelPlaceholders,
  fitCollectedPieces, // imported if we want to expose it or use it during resize loop?
  handlePieceSelect,
  checkBoardCompletion,
} from "./jigsaw.js";
import { provideHint as provideSudokuHint } from "./sudoku.js";
import { providePeaksHint } from "./peaks.js";
import { provideSearchHint } from "./search.js";
import { gameManager } from "./game-manager.js";
import { CONFIG } from "./config.js";
import { startTimer } from "./timer.js";
import { debugSolveCode } from "./code.js";

// DOM Elements
let memorySection;
let boardContainer;
let cardsContainer;
let collectedLeft;
let collectedRight;

// State
let cards = [];
let flippedCards = [];
let isLocked = false;
let matchesFound = 0;
// let panelCount = 0; // Removed
const TOTAL_PAIRS = 9;

// Timer State (Moved to timer.js)

export function initMemoryGame() {
  console.log("Initializing Memory Game...");

  // Show Solve button (restore CSS control)
  const solveBtn = document.getElementById("debug-help-btn");
  if (solveBtn) solveBtn.style.display = ""; // Let CSS (debug-mode) handle it
  memorySection = document.getElementById("game-section"); // FIXED ID
  boardContainer = document.getElementById("memory-board");
  cardsContainer = document.getElementById("memory-cards");
  collectedLeft = document.getElementById("collected-left");
  collectedRight = document.getElementById("collected-right");

  // Start Stage Timer
  gameManager.startStageTimer("memory");

  // Init Jigsaw Logic Reference (Pass Elements)
  // Init Jigsaw Logic Reference (Pass Elements)
  try {
    initJigsaw({
      memorySection,
      boardContainer,
      collectedLeft,
      collectedRight,
    });

    // Info Icon Mobile Interaction
    const infoWrapper = document.querySelector(".info-icon-wrapper");
    const titleContainer = document.querySelector(".header-title-container");
    if (infoWrapper && titleContainer) {
      infoWrapper.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent closing immediately
        titleContainer.classList.toggle("active");
      });

      // Close when clicking outside
      document.addEventListener("click", () => {
        titleContainer.classList.remove("active");
      });
    }

    // 2. Show Section (and Hide Home)
    if (memorySection) {
      memorySection.classList.remove("hidden");
      document.getElementById("menu-content")?.classList.add("hidden");
    }

    // 3. Load Data
    const state = gameManager.getState();
    if (!state || !state.data || !state.data.initialPuzzle) {
      throw new Error("No game data found in state!");
    }

    // Reset State
    cards = [];
    flippedCards = [];
    isLocked = false;
    matchesFound = 0;
    cardsContainer.innerHTML = "";
    collectedLeft.innerHTML = "";
    collectedRight.innerHTML = "";

    // Reset Board Slots
    setupBoard(state.data.initialPuzzle);
    createPanelPlaceholders(); // <--- Imported from jigsaw.js

    // 5. Setup Cards
    const puzzleChunks = getChunksFromBoard(state.data.initialPuzzle);
    setupCards(puzzleChunks);

    // Initialize Resizing
    fitCollectedPieces(); // Imported
    fitMemoryCards();
    window.addEventListener("resize", () => {
      fitCollectedPieces();
      fitMemoryCards();
    });
  } catch (err) {
    console.error("[Memory] Initialization Failed:", err);
    alert("Error iniciando juego: " + err.message);
    // Try to recover home
    if (memorySection) memorySection.classList.add("hidden");
    document.getElementById("menu-content")?.classList.remove("hidden");
  }

  // Start Timer
  initTimer();

  // Debug Button matching
  const debugBtn = document.getElementById("debug-help-btn");
  if (debugBtn) {
    debugBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Debug button clicked");
      debugAutoMatch();
    };
  }
}

function debugAutoMatch() {
  const gameSection = document.getElementById("game-section"); // FIXED ID
  if (!gameSection) return;

  if (gameSection.classList.contains("jigsaw-mode")) {
    debugJigsawPlace();
    return;
  }

  if (gameSection.classList.contains("sudoku-mode")) {
    provideSudokuHint();
    return;
  }

  if (gameSection.classList.contains("peaks-mode")) {
    providePeaksHint();
    return;
  }

  if (gameSection.classList.contains("search-mode")) {
    provideSearchHint();
    return;
  }

  if (gameSection.classList.contains("code-mode")) {
    debugSolveCode();
    return;
  }

  // 1. Find unmatched chunks (Memory Logic)
  const availableCards = Array.from(
    document.querySelectorAll(".memory-card:not(.matched)"),
  );
  if (availableCards.length === 0) return;

  // 2. Group by chunkIndex
  const pairs = {};
  availableCards.forEach((card) => {
    const idx = card.dataset.chunkIndex;
    if (!pairs[idx]) pairs[idx] = [];
    pairs[idx].push(card);
  });

  // 3. Pick random pair
  const indices = Object.keys(pairs);
  if (indices.length === 0) return;
  const randomIdx = indices[Math.floor(Math.random() * indices.length)];
  const pairToMatch = pairs[randomIdx];

  // 4. Force Match Directly (Bypass Game Loop to prevent spam race conditions)
  if (pairToMatch && pairToMatch.length === 2) {
    const [c1, c2] = pairToMatch;

    // IMMEDIATE LOCK: Mark as matched visually to prevent re-selection
    c1.classList.add("matched");
    c2.classList.add("matched");
    c1.classList.add("flipped");
    c2.classList.add("flipped");
    c1.classList.add("match-anim");
    c2.classList.add("match-anim");

    // Clear global flipped if we stole them
    if (flippedCards.includes(c1) || flippedCards.includes(c2)) {
      flippedCards = [];
    }

    // A. Spawn Piece FAST (100ms)
    setTimeout(() => {
      handleMatchSuccess(randomIdx);
    }, 100);

    // B. Finalize Card State (300ms)
    setTimeout(() => {
      disableCards([c1, c2]);
    }, 300);
  }
}

// Mobile/Tablet Responsive Sizing for Memory Cards
function fitMemoryCards() {
  const cardsContainer = document.getElementById("memory-cards");
  if (!cardsContainer) return;

  const vw = window.innerWidth;
  const vh = window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;

  // Desktop Cleanup / Guard (Let CSS Grid handle these cases)
  if (vw > 768) {
    cardsContainer.style = "";
    const cards = document.querySelectorAll(".memory-card");
    cards.forEach((card) => {
      card.style.width = "";
      card.style.height = "";
      card.style.margin = "";
    });
    return;
  }

  // Sizing Strategy:
  let availableHeight = 0;
  let availableWidth = cardsContainer.clientWidth || vw;

  if (vw <= 768) {
    // --- Mobile Logic ---
    const greenPanel = document.querySelector(".test-panel.green");
    const h2 = greenPanel ? greenPanel.clientHeight : 0;
    const h3 = vh * 0.4;
    availableHeight = h2 > 0 ? h2 : h3;
    availableHeight -= 15; // Increased safety buffer for tall screens
  } else {
    // --- Tablet/Laptop Short Logic ---
    // Target space: From Board Bottom to Footer Top
    const board = document.getElementById("memory-board");
    const footer = document.querySelector("footer");

    if (board && footer) {
      const boardRect = board.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      // Calculate gap between board and footer
      // Using 20px buffer to avoid touching footer
      availableHeight = footerRect.top - boardRect.bottom - 20;
    } else {
      // Fallback if elements not measured
      availableHeight = vh * 0.35;
    }
  }

  if (availableHeight < 50) availableHeight = 100; // Sanity check

  // Padding/Gap settings - Minimal
  const gap = 4;
  const padding = 15; /* Increased to prevent touching screen edges */

  const totalCards = 18;

  let bestConfig = { size: 0, cols: 3 };

  // Iterate to find best fit (Restrict to 4-6 columns per user request)
  for (let cols = 4; cols <= 6; cols++) {
    const rows = Math.ceil(totalCards / cols);
    // Calc max width per card
    const wSize = (availableWidth - padding * 2 - (cols - 1) * gap) / cols;
    // Calc max height per card
    const hSize = (availableHeight - padding * 2 - (rows - 1) * gap) / rows;

    // The limiting factor is the smaller of the two dimensions
    const size = Math.min(wSize, hSize);

    if (size > bestConfig.size) {
      bestConfig = { size, cols };
    }
  }

  let finalSize = Math.floor(bestConfig.size);
  if (finalSize < 30) finalSize = 30; // Min safe size

  // Apply Styles
  cardsContainer.style.display = "flex";
  cardsContainer.style.flexWrap = "wrap";
  cardsContainer.style.justifyContent = "center";
  cardsContainer.style.alignContent = "center"; // Center the grid in the available space
  cardsContainer.style.width = "100%";

  // Force height to Match Green Panel EXACTLY
  cardsContainer.style.height = `${availableHeight}px`;
  cardsContainer.style.maxHeight = "none";

  cardsContainer.style.gap = `${gap}px`;
  cardsContainer.style.padding = `${padding}px`;
  cardsContainer.style.boxSizing = "border-box";
  cardsContainer.style.position = "relative";
  cardsContainer.style.zIndex = "10002";

  // Overflow handling
  cardsContainer.style.overflow = "hidden";

  // Force wrap at specific columns (4-6) to prevent long rows on wide screens
  const containerMaxWidth =
    finalSize * bestConfig.cols + gap * (bestConfig.cols - 1) + padding * 2;
  cardsContainer.style.maxWidth = `${containerMaxWidth}px`;
  cardsContainer.style.margin = "0 auto"; // Center the container if width is restricted

  const cards = document.querySelectorAll(".memory-card");
  cards.forEach((card) => {
    card.style.width = `${finalSize}px`;
    card.style.height = `${finalSize}px`;
    card.style.margin = "0";
  });
}

export function getChunksFromBoard(board) {
  const chunks = [];
  for (let tr = 0; tr < 3; tr++) {
    for (let tc = 0; tc < 3; tc++) {
      const chunk = [];
      for (let r = 0; r < 3; r++) {
        const row = [];
        for (let c = 0; c < 3; c++) {
          row.push(board[tr * 3 + r][tc * 3 + c]);
        }
        chunk.push(row);
      }
      chunks.push(chunk);
    }
  }
  return chunks;
}

function setupBoard() {
  boardContainer.innerHTML = "";
  // Create 9 placeholder slots for the chunks to land in.
  for (let i = 0; i < 9; i++) {
    const slot = document.createElement("div");
    slot.classList.add("sudoku-chunk-slot");
    slot.dataset.slotIndex = i;
    // Add Jigsaw Slot Listener
    slot.addEventListener("click", () => handleSlotClick_v2(i));
    boardContainer.appendChild(slot);
  }
}

function setupCards(chunks) {
  // Generate 18 cards (9 pairs)
  const deck = [];

  chunks.forEach((chunk, index) => {
    // Pair 1
    deck.push({ id: `pair-${index}-a`, chunkIndex: index, chunkData: chunk });
    // Pair 2
    deck.push({ id: `pair-${index}-b`, chunkIndex: index, chunkData: chunk });
  });

  // Render (Ordered Pairs)
  deck.forEach((cardData) => {
    const cardEl = createCardElement(cardData);
    cardsContainer.appendChild(cardEl);
    cards.push(cardEl);
  });

  // Force Layout Update
  fitMemoryCards();

  // Preview Phase
  previewCards();
}

function previewCards() {
  isLocked = true;
  // Staggered Flip UP
  cards.forEach((card, i) => {
    setTimeout(() => {
      card.classList.add("flipped");
    }, i * 30); // Fast ripple (30ms per card)
  });

  setTimeout(() => {
    // Staggered Flip DOWN
    cards.forEach((card, i) => {
      setTimeout(() => {
        card.classList.remove("flipped");
      }, i * 30);
    });

    // Start Visual Shuffle after last unflip finishes
    setTimeout(
      () => {
        visualShuffle();
      },
      500 + cards.length * 30,
    ); // Wait for sequence + buffer
  }, 3000); // 3 Seconds Preview
}

function visualShuffle() {
  // 1. Record Initial Positions (First)
  const firstRects = new Map();
  cards.forEach((card) => {
    firstRects.set(card, card.getBoundingClientRect());
  });

  // 2. Shuffle DOM Order (Last)
  // We can just shuffle the 'cards' array and re-append
  shuffleArray(cards);
  cards.forEach((card) => cardsContainer.appendChild(card));

  // Force layout update (fit cards might need re-run if layout engine is weird, but usually flex just reflows)
  // fitMemoryCards(); // Ensure sizing is still correct

  // 3. Invert (Calculate delta)
  cards.forEach((card) => {
    const first = firstRects.get(card);
    const last = card.getBoundingClientRect();
    const deltaX = first.left - last.left;
    const deltaY = first.top - last.top;

    // Apply Transform to put card back at start position
    card.style.transition = "none";
    card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
  });

  // 4. Play (Animate to new position) with STAGGER
  // Shuffle phase: Randomize delay for each card to create chaotic feel
  const baseDelay = 50;

  cards.forEach((card, index) => {
    // Random delay between 0 and 300ms
    const randomDelay = Math.random() * 300;

    setTimeout(() => {
      requestAnimationFrame(() => {
        // Enable transition
        card.style.transition =
          "transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1)";
        // Clear transform to move to natural shuffled position
        card.style.transform = "";
      });
    }, baseDelay + randomDelay);
  });

  // Unlock after animation
  setTimeout(() => {
    isLocked = false;
    // Clean up inline styles
    cards.forEach((card) => {
      card.style.transition = "";
      card.style.transform = "";
    });
  }, 600 + 350); // Max delay ~350
}

// Helper to render mini grid
// Helper to render mini grid
export function createMiniGrid(chunkData, chunkIndex = null) {
  const table = document.createElement("div");
  table.classList.add("mini-sudoku-grid");
  if (chunkIndex !== null) {
    table.dataset.chunkIndex = chunkIndex;
  }

  // If chunkData has 'chunkData' property (nested object issue ref line 301)
  // Ensure we are iterating the 2D array
  const gridData = Array.isArray(chunkData[0])
    ? chunkData
    : chunkData.chunkData;

  if (gridData) {
    gridData.forEach((row) => {
      row.forEach((num) => {
        const cell = document.createElement("div");
        cell.classList.add("mini-cell");
        cell.textContent = num !== 0 ? num : "";
        if (num !== 0) cell.classList.add("has-number");
        table.appendChild(cell);
      });
    });
  }
  return table;
}

function createCardElement(data) {
  const card = document.createElement("div");
  card.classList.add("memory-card");
  card.dataset.chunkIndex = data.chunkIndex;

  const inner = document.createElement("div");
  inner.classList.add("memory-card-inner");

  const front = document.createElement("div");
  front.classList.add("memory-card-front");
  front.textContent = "?";

  const back = document.createElement("div");
  back.classList.add("memory-card-back");

  back.appendChild(createMiniGrid(data.chunkData, data.chunkIndex));

  inner.appendChild(front);
  inner.appendChild(back);
  card.appendChild(inner);

  card.addEventListener("click", () => handleCardClick(card));

  return card;
}

function handleCardClick(card) {
  if (isLocked) return;
  if (card === flippedCards[0]) return; // Clicked same card
  if (card.classList.contains("flipped")) return; // Already matched/flipped

  flipCard(card);
  flippedCards.push(card);

  if (flippedCards.length === 2) {
    checkForMatch();
  }
}

function flipCard(card) {
  card.classList.add("flipped");
}

function unflipCards() {
  isLocked = true;
  setTimeout(() => {
    flippedCards.forEach((card) => card.classList.remove("flipped"));
    // 4. Update Stats
    updateStats();
    flippedCards = [];
    isLocked = false;
  }, 600);
}

function updateStats() {
  // Placeholder for stats update
}

function checkForMatch() {
  const [card1, card2] = flippedCards;
  const idx1 = card1.dataset.chunkIndex;
  const idx2 = card2.dataset.chunkIndex;

  if (idx1 === idx2) {
    // 1. Success Animation (Green Border)
    // Non-blocking: Clear global immediately so user can keep playing
    flippedCards = [];

    card1.classList.add("match-anim");
    card2.classList.add("match-anim");

    // 2. Wait for animation, then process match
    // A. Spawn Piece FAST (100ms) per user request
    setTimeout(() => {
      handleMatchSuccess(idx1);
    }, 100);

    // B. Finalize Card State (300ms) to match animation duration
    setTimeout(() => {
      disableCards([card1, card2]);
    }, 450);
  } else {
    unflipCards();
  }
}

function disableCards(cardsToDisable) {
  const target = cardsToDisable || flippedCards;
  target.forEach((card) => {
    card.style.pointerEvents = "none";
    // Remove the temporary green pulse so it settles to the neutral 'matched' state
    card.classList.remove("match-anim");
    // Optional: fade them out or keep them until we place the prize?
    // We will keep them for a moment then maybe remove them if we want to simulate "moving"
    // But for now we just spawn the prize and leave cards (or hide them).
    // Instead of hiding, we mark them as matched/disabled visually
    // card.style.visibility = "hidden"; // Removed per user request
    card.classList.add("matched");
  });
  if (!cardsToDisable) flippedCards = [];
}

function handleMatchSuccess(chunkIndex) {
  matchesFound++;

  // SYNC STATE: Save matches count
  gameManager.updateProgress("memory", { pairsFound: matchesFound });
  gameManager.save();

  console.log(`Matched Pair for Chunk ${chunkIndex}!`);

  const idx = parseInt(chunkIndex);
  if (idx === 4) {
    placeInBoard(idx);
  } else {
    placeInPanel(idx);
  }

  // Check Win
  if (matchesFound === TOTAL_PAIRS) {
    // 500ms delay removed per user request for immediate feedback
    // 1. Hide Cards
    if (cardsContainer) cardsContainer.classList.add("cards-hidden");

    // 2. Pulse Board
    if (boardContainer) boardContainer.classList.add("board-complete");

    // 3. Transition to Jigsaw (Keep Timer Running!)
    setTimeout(() => {
      if (boardContainer) boardContainer.classList.remove("board-complete");

      // Timer Transition
      gameManager.stopStageTimer();
      gameManager.startStageTimer("jigsaw");

      transitionToJigsaw();
    }, 700); // Wait for pulse/fade (0.6s) + buffer
  }
}

function placeInBoard(chunkIndex) {
  const slot = boardContainer.querySelector(
    `[data-slot-index="${chunkIndex}"]`,
  );
  if (slot) {
    slot.innerHTML = "";
    slot.classList.add("filled");

    const state = gameManager.getState();
    const chunks = getChunksFromBoard(state.data.initialPuzzle);
    const chunkData = chunks[chunkIndex];

    const content = createMiniGrid(chunkData, chunkIndex);
    // Maybe ensure it fills the slot perfectly?
    content.style.width = "100%";
    content.style.height = "100%";

    slot.appendChild(content);
  }
}

// Mobile Responsive Sizing Logic (Moved to Module Scope)

// Global Resize Listener with Debounce
let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    // Re-run sizing logic when window changes
    fitMemoryCards();
    fitCollectedPieces();
  }, 100);
});

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Timer Functions (Delegated to timer.js)
function initTimer() {
  startTimer(() => {
    // Force layout update in case viewport settled
    setTimeout(() => {
      fitMemoryCards();
      fitCollectedPieces();
    }, 500);
  });
}
