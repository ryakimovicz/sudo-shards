import { gameManager } from "./game-manager.js";

let timerInterval = null;

export function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

export function startTimer() {
  stopTimer();
  // Ensure we have a start time in state
  if (!gameManager.state?.meta?.startedAt) {
    if (gameManager.state) {
      gameManager.state.meta.startedAt = new Date().toISOString();
      gameManager.save();
    }
  }

  timerInterval = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}

export function resetTimer() {
  stopTimer();
  const timerElement = document.getElementById("memory-timer");
  if (timerElement) timerElement.textContent = "⏱ 00:00";
}

function updateTimerDisplay() {
  if (!gameManager.state?.meta?.startedAt) return;

  const start = new Date(gameManager.state.meta.startedAt).getTime();
  const now = Date.now();
  const elapsed = Math.max(0, now - start); // Avoid negative

  const totalSeconds = Math.floor(elapsed / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const timerElement = document.getElementById("memory-timer");
  if (timerElement) {
    if (hrs > 0) {
      timerElement.textContent = `⏱ ${hrs.toString().padStart(2, "0")}:${mins
        .toString()
        .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
      timerElement.textContent = `⏱ ${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
  }
}
