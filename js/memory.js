import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";

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
let panelCount = 0;
const TOTAL_PAIRS = 9;

export function initMemoryGame() {
  console.log("Initializing Memory Game...");

  // 1. Get Elements
  memorySection = document.getElementById("memory-game");
  boardContainer = document.getElementById("memory-board");
  cardsContainer = document.getElementById("memory-cards");
  collectedLeft = document.getElementById("collected-left");
  collectedRight = document.getElementById("collected-right");

  // Info Icon Mobile Interaction
  const infoWrapper = document.querySelector(".info-icon-wrapper");
  if (infoWrapper) {
    infoWrapper.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent closing immediately
      infoWrapper.classList.toggle("active");
    });

    // Close when clicking outside
    document.addEventListener("click", () => {
      infoWrapper.classList.remove("active");
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
    console.error("No game data found!");
    return;
  }

  // Reset State
  cards = [];
  flippedCards = [];
  isLocked = false;
  matchesFound = 0;
  panelCount = 0;
  cardsContainer.innerHTML = "";
  collectedLeft.innerHTML = "";
  collectedRight.innerHTML = "";

  // Reset Board Slots
  setupBoard(state.data.initialPuzzle);

  // 5. Setup Cards
  const puzzleChunks = getChunksFromBoard(state.data.initialPuzzle);
  setupCards(puzzleChunks);

  // Initialize Resizing
  fitCollectedPieces();
  fitMemoryCards();
  window.addEventListener("resize", () => {
    fitCollectedPieces();
    fitMemoryCards();
  });

  // Debug Button matching
  const debugBtn = document.getElementById("debug-help-btn");
  if (debugBtn) {
    debugBtn.onclick = debugAutoMatch;
  }
}

function debugAutoMatch() {
  // 1. Find unmatched chunks
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

// Mobile Responsive Sizing for Memory Cards (Green Zone)
// Mobile Responsive Sizing for Memory Cards (Green Zone)
function fitMemoryCards() {
  const cardsContainer = document.getElementById("memory-cards");
  if (!cardsContainer) return;

  // Desktop Cleanup / Guard
  if (window.innerWidth > 768) {
    cardsContainer.style = "";
    const cards = document.querySelectorAll(".memory-card");
    cards.forEach((card) => {
      card.style.width = "";
      card.style.height = "";
      card.style.margin = "";
    });
    return;
  }

  // Mobile Logic
  const vh = window.innerHeight;

  // Available Height Strategy:
  // 1. Measure the container itself (best if flex works)
  // 2. Measure the green panel (good reference)
  // 3. Fallback calculation

  // Strategy 1: Container ClientHeight (since we set flex:1 in CSS)
  let h1 = cardsContainer.clientHeight;
  if (h1 < 50) h1 = 9999;

  // Strategy 2: Green Panel
  let h2 = 9999;
  const greenPanel = document.querySelector(".test-panel.green");
  if (greenPanel) {
    h2 = greenPanel.clientHeight;
  }

  // Strategy 3: Math Fallback
  // Total Height - (Header 60 + Red (calc) + Yellow 13vh) - Footer ~30-40
  // Red is calc(43.5vh - header), Yellow 13vh.
  // Top of Green = 60 + (43.5vh - 60) + 13vh = 56.5vh.
  // Height = (100vh - 40px) - 56.5vh = 43.5vh - 40px.
  const h3 = vh * 0.435 - 40;

  // Pick the SAFEST (smallest valid) height
  let availableHeight = Math.min(h1, h2, h3);

  // If measured heights are invalid (e.g. 0), fall back to math
  if (availableHeight < 50) availableHeight = h3;

  // Apply Safety Buffer (40px total for padding/margins)
  availableHeight -= 40;

  const availableWidth = cardsContainer.clientWidth || window.innerWidth;

  // Padding/Gap settings
  const gap = 6;
  const padding = 10;

  const totalCards = 18;

  let bestConfig = { size: 0, cols: 3 };

  // Iterate to find best fit
  for (let cols = 3; cols <= 6; cols++) {
    const rows = Math.ceil(totalCards / cols);
    const wSize = (availableWidth - padding * 2 - (cols - 1) * gap) / cols;
    const hSize = (availableHeight - padding * 2 - (rows - 1) * gap) / rows;
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
  cardsContainer.style.alignContent = "center";
  cardsContainer.style.width = "100%";
  // Force height to match what we calculated to prevent overflow if flex expanded too much
  cardsContainer.style.height = `${availableHeight}px`;
  cardsContainer.style.gap = `${gap}px`;
  cardsContainer.style.padding = `${padding}px`;
  cardsContainer.style.boxSizing = "border-box";
  cardsContainer.style.position = "relative";
  cardsContainer.style.zIndex = "10002";

  // Overflow handling
  cardsContainer.style.overflow = "hidden";

  const cards = document.querySelectorAll(".memory-card");
  cards.forEach((card) => {
    card.style.width = `${finalSize}px`;
    card.style.height = `${finalSize}px`;
    card.style.margin = "0";
  });
}

function getChunksFromBoard(board) {
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

  // Shuffle
  shuffleArray(deck);

  // Render
  deck.forEach((cardData) => {
    const cardEl = createCardElement(cardData);
    cardsContainer.appendChild(cardEl);
    cards.push(cardEl);
  });

  // Preview Phase
  previewCards();
}

function previewCards() {
  isLocked = true;
  // Flip all to show content
  cards.forEach((card) => card.classList.add("flipped"));

  setTimeout(() => {
    // Unflip all
    cards.forEach((card) => card.classList.remove("flipped"));
    isLocked = false;
  }, 2000); // 2 Seconds
}

// Helper to render mini grid
function createMiniGrid(chunkData) {
  const table = document.createElement("div");
  table.classList.add("mini-sudoku-grid");
  chunkData.forEach((row) => {
    row.forEach((num) => {
      const cell = document.createElement("div");
      cell.classList.add("mini-cell");
      cell.textContent = num !== 0 ? num : "";
      if (num !== 0) cell.classList.add("has-number");
      table.appendChild(cell);
    });
  });
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

  back.appendChild(createMiniGrid(data.chunkData));

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
    }, 300);
  } else {
    unflipCards();
  }
}

function disableCards(cardsToDisable) {
  const target = cardsToDisable || flippedCards;
  target.forEach((card) => {
    card.style.pointerEvents = "none";
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
  console.log(`Matched Pair for Chunk ${chunkIndex}!`);

  const idx = parseInt(chunkIndex);
  if (idx === 4) {
    placeInBoard(idx);
  } else {
    placeInPanel(idx);
  }

  // Check Win
  if (matchesFound === TOTAL_PAIRS) {
    setTimeout(() => {
      // 1. Hide Cards
      if (cardsContainer) cardsContainer.classList.add("cards-hidden");

      // 2. Pulse Board
      if (boardContainer) boardContainer.classList.add("board-complete");

      // 3. Official Alert
      setTimeout(() => {
        if (boardContainer) boardContainer.classList.remove("board-complete"); // Revert border
        alert("¡Juego Completado! Próximamente: Jigsaw Stage");
      }, 800); // Wait just enough for the 0.6s pulse to finish
    }, 500); // Small delay after last piece to start finale
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

    const content = createMiniGrid(chunkData);
    // Maybe ensure it fills the slot perfectly?
    content.style.width = "100%";
    content.style.height = "100%";

    slot.appendChild(content);
  }
}

// Mobile Responsive Sizing Logic (Moved to Module Scope)
function getCollectedPieceSize() {
  if (window.innerWidth > 768) return null;

  const zoneHeight = window.innerHeight * 0.13;
  const containerWidth = window.innerWidth;
  const gap = 4;
  const padding = 10;

  // OPTION A: 2 Rows
  const hSizeA = zoneHeight / 2 - 2 * gap;
  const wSizeA = (containerWidth - padding - 5 * gap) / 4;
  const sizeA = Math.min(hSizeA, wSizeA);

  // OPTION B: 1 Row
  const hSizeB = zoneHeight - 2 * gap;
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

function fitCollectedPieces() {
  const config = getCollectedPieceSize();
  if (!config) return;

  const { size, isOneRow, gap } = config;

  // Apply Element Styles
  const pieces = document.querySelectorAll(".collected-piece");
  pieces.forEach((p) => {
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.fontSize = `${size * 0.5}px`;
    p.style.margin = `${gap / 2}px`;
  });

  // Apply Container Styles via Wrapper
  const wrapper = document.querySelector(".collected-wrapper");
  const left = document.getElementById("collected-left");
  const right = document.getElementById("collected-right");

  if (wrapper && left && right) {
    const zoneHeight = window.innerHeight * 0.13;

    // Calculate Fixed Width for containers to ensure pieces don't shift
    // Each piece has margin gap/2 left and right. Total space per piece = size + gap.
    // Row holds 4 pieces.
    const rowWidth = (size + gap) * 4;

    if (isOneRow) {
      // 1 Row
      wrapper.style.flexDirection = "row";
      wrapper.style.height = `${zoneHeight}px`;
      wrapper.style.justifyContent = "center"; // Center the pair of containers

      left.style.width = `${rowWidth}px`; // Fixed width
      left.style.height = "100%";
      left.style.flexWrap = "nowrap";
      left.style.justifyContent = "flex-start"; // Fill from start

      right.style.width = `${rowWidth}px`; // Fixed width
      right.style.height = "100%";
      right.style.flexWrap = "nowrap";
      right.style.justifyContent = "flex-start"; // Fill from start
    } else {
      // 2 Rows
      wrapper.style.flexDirection = "column";
      wrapper.style.height = `${zoneHeight}px`;
      wrapper.style.alignItems = "center"; // Center the stack

      left.style.width = `${rowWidth}px`; // Fixed width
      left.style.height = "50%";
      left.style.flexWrap = "nowrap";
      left.style.justifyContent = "flex-start";

      right.style.width = `${rowWidth}px`; // Fixed width
      right.style.height = "50%";
      right.style.flexWrap = "nowrap";
      right.style.justifyContent = "flex-start";
    }
  }
}

function placeInPanel(chunkIndex) {
  panelCount++;
  // 1-4 -> Left, 5-8 -> Right
  let targetContainer = panelCount <= 4 ? collectedLeft : collectedRight;

  const state = gameManager.getState();
  const chunks = getChunksFromBoard(state.data.initialPuzzle);
  const chunkData = chunks[chunkIndex];

  const piece = document.createElement("div");
  piece.classList.add("collected-piece");
  piece.appendChild(createMiniGrid(chunkData));

  // PRE-APPLY SIZE
  const config = getCollectedPieceSize();
  if (config) {
    piece.style.width = `${config.size}px`;
    piece.style.height = `${config.size}px`;
    piece.style.fontSize = `${config.size * 0.5}px`;
    piece.style.margin = `${config.gap / 2}px`;
  }

  targetContainer.appendChild(piece);

  // Recalc layout
  fitCollectedPieces();
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
