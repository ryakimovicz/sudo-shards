/* Peaks Logic */
import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";

export function initPeaks() {
  console.log("Initializing Peaks Stage...");
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
      titleEl.textContent = t.game_peaks || "Picos y Valles"; // Ensure key exists
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
      tooltipDesc.innerHTML = t.peaks_help_desc || "Encuentra el camino...";
      tooltipTitle.style.opacity = "1";
      tooltipDesc.style.opacity = "1";
    }, 500);
  }

  // 5. Update Game Manager Logic (if needed)
  // gameManager.advanceStage() might have already been called by sudoku.js?
  // We need to coordinate who calls what.
  // In sudoku.js, handleSudokuWin called advanceStage.
  // If we change handleSudokuWin to call transitionToPeaks, then HERE we should call updateProgress/advanceStage.

  // Let's assume sudoku.js -> calls gameManager.advanceStage() -> dispatches event?
  // OR sudoku.js -> calls transitionToPeaks directly.
  // Implementation Plan said: "Connect Sudoku victory to transitionToPeaks in sudoku.js"
  // So we should handle the state update here or in sudoku.js.
  // To match memory.js pattern, let's allow explicit call.

  // Check if we need to update state
  if (gameManager.getState().progress.currentStage !== "peaks") {
    gameManager.updateProgress("progress", { currentStage: "peaks" });
  }

  // 6. Initialize Peaks Logic
  initPeaks();
}
