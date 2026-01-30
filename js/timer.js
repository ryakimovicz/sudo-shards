let timerInterval = null;
let timerStartTime = 0;

export function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

export function startTimer(layoutCallback) {
  stopTimer();

  // Optional callback (e.g. for forcing layout updates on start)
  if (layoutCallback && typeof layoutCallback === "function") {
    layoutCallback();
  }

  timerStartTime = Date.now();
  timerInterval = setInterval(updateTimerDisplay, 100);
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const now = Date.now();
  const elapsed = now - timerStartTime;
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
