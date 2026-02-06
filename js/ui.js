import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";

export function showToast(message, duration = 3000) {
  let container = document.getElementById("toast-container");

  // Create container if missing
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  // Create Toast Element
  const toast = document.createElement("div");
  toast.className = "toast-notification";
  toast.textContent = message;

  container.appendChild(toast);

  // Animate In
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  // Remove after duration
  setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, duration);
}

export function formatTime(ms) {
  if (ms === undefined || ms === null || isNaN(ms) || ms === Infinity) {
    return "--:--";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
}

export function showVictorySummary(stats, isHome = false) {
  if (!stats) return;

  const modal = document.getElementById("victory-summary-modal");
  const timeEl = document.getElementById("victory-total-time");
  const streakEl = document.getElementById("victory-streak");
  const errorsEl = document.getElementById("victory-errors");
  const scoreEl = document.getElementById("victory-score");
  const stageTimesContainer = document.getElementById("victory-stage-times");
  const btnHome = document.getElementById("btn-victory-home");

  if (!modal) return;

  const lang = getCurrentLang();

  // Update button text based on mode
  if (btnHome) {
    const btnKey = isHome ? "btn_close" : "btn_back_home";
    btnHome.dataset.i18n = btnKey;
    btnHome.textContent =
      translations[lang][btnKey] || (isHome ? "Cerrar" : "Volver al Inicio");
  }

  // Populating main stats
  if (timeEl) timeEl.textContent = formatTime(stats.totalTime);
  if (streakEl) streakEl.textContent = stats.streak || "1";
  if (errorsEl) errorsEl.textContent = stats.errors || "0";
  if (scoreEl) scoreEl.textContent = `+${stats.score.toFixed(1)}`;

  // Populating breakdown
  if (stageTimesContainer) {
    stageTimesContainer.innerHTML = "";

    // Ordered categories for display
    const stages = [
      { key: "memory", icon: "🧠" },
      { key: "jigsaw", icon: "🧩" },
      { key: "sudoku", icon: "🔢" },
      { key: "peaks", icon: "⛰️" },
      { key: "search", icon: "🔍" },
      { key: "code", icon: "📟" },
    ];

    stages.forEach((stage) => {
      const timeMs = stats.stageTimes[stage.key] || 0;
      const stageName = translations[lang].stage_names[stage.key] || stage.key;

      const row = document.createElement("div");
      row.className = "stage-time-row";
      row.innerHTML = `
        <span class="stage-name">${stage.icon} ${stageName}</span>
        <span class="stage-val">${formatTime(timeMs)}</span>
      `;
      stageTimesContainer.appendChild(row);
    });
  }

  // Home Button Logic
  if (btnHome) {
    btnHome.onclick = async () => {
      modal.classList.add("hidden");

      if (!isHome) {
        // Clear ranking cache to ensure fresh data on reload
        try {
          const { clearRankingCache } = await import("./ranking.js");
          clearRankingCache();
        } catch (err) {
          console.warn("Failed to clear ranking cache:", err);
        }

        window.location.reload(); // Simplest way to go back to Home state
      }
    };
  }

  // Show Modal
  modal.classList.remove("hidden");
}
