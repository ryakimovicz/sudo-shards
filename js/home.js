/* Main Menu Logic */
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";
import { showProfile, hideProfile } from "./profile.js";
import { getDailySeed } from "./utils/random.js";
import { gameManager } from "./game-manager.js";
import { fetchRankings, renderRankings, clearRankingCache } from "./ranking.js";
import { getCurrentUser } from "./auth.js";

// Global UI Helpers
window.toggleAuthPassword = function (btn) {
  if (!btn) return;
  try {
    const wrapper = btn.closest(".password-wrapper");
    const input = wrapper ? wrapper.querySelector("input") : null;
    if (!input) return;

    const isPassword = input.type === "password";

    // Toggle Type
    input.type = isPassword ? "text" : "password";

    // Toggle Icon (👁️ = Show, 🙈 = Hide/Monkey)
    btn.textContent = isPassword ? "🙈" : "👁️";

    // Sync Logic for New Password -> Verify Password
    if (input.id === "new-password-input") {
      const verifyInput = document.getElementById("verify-password-input");
      if (verifyInput) verifyInput.type = input.type;
    }
  } catch (e) {
    console.error("Toggle error:", e);
  }
};

export function initHome() {
  console.log("Jigsudo Home Module Loaded");

  // Hide Solve button on Home
  const solveBtn = document.getElementById("debug-help-btn");
  if (solveBtn) solveBtn.style.display = "none";

  // Enforce Home State Class for CSS overrides
  document.body.classList.add("home-active");

  // Show Footer on Home
  const footer = document.querySelector(".main-footer");
  if (footer) footer.classList.remove("hidden");

  // ... (existing constants) ...

  // Sidebar elements removed
  const startBtn = document.getElementById("start-btn");

  // Sidebar Interactions - REMOVED per user request
  // (Sidebar and menu-toggle elements have been removed from HTML)

  // Start Game - Logic moved to end of function to support tabs

  // Profile Dropdown Logic
  const btnProfile = document.getElementById("btn-profile");
  const profileDropdown = document.getElementById("profile-dropdown");

  if (btnProfile && profileDropdown) {
    btnProfile.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent closing immediately
      profileDropdown.classList.toggle("hidden");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (
        !profileDropdown.classList.contains("hidden") &&
        !profileDropdown.contains(e.target) &&
        e.target !== btnProfile
      ) {
        profileDropdown.classList.add("hidden");
      }
    });

    // Prevent closing when clicking inside the dropdown
    profileDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // --- Theme Logic (Segmented Control) ---
  const themeInputs = document.querySelectorAll('input[name="theme"]');
  const body = document.body;
  const THEME_KEY = "jigsudo_theme";

  // Helper: Apply visual theme
  function applyVisualTheme(theme) {
    if (theme === "auto") {
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      if (systemPrefersDark) {
        body.classList.add("dark-mode");
      } else {
        body.classList.remove("dark-mode");
      }
    } else {
      if (theme === "dark") {
        body.classList.add("dark-mode");
      } else {
        body.classList.remove("dark-mode");
      }
    }
  }

  // 1. Initialize Theme on Load
  const savedTheme = localStorage.getItem(THEME_KEY) || "auto";
  applyVisualTheme(savedTheme);

  // Set UI State (Radio Buttons)
  const activeInput = document.querySelector(
    `input[name="theme"][value="${savedTheme}"]`,
  );
  if (activeInput) activeInput.checked = true;

  // 2. Listen for Changes
  themeInputs.forEach((input) => {
    input.addEventListener("change", (e) => {
      if (e.target.checked) {
        const newTheme = e.target.value;
        localStorage.setItem(THEME_KEY, newTheme);
        applyVisualTheme(newTheme);
      }
    });
  });

  // 3. System Preference Listener (for Auto mode)
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (localStorage.getItem(THEME_KEY) === "auto") {
        applyVisualTheme("auto");
      }
    });

  // --- Gameplay Settings ---

  // 1. Confirm Clear (Positive Logic: Checked = Ask)
  const confirmToggle = document.getElementById("confirm-clear-toggle");
  if (confirmToggle) {
    // Stored as "jigsudo_skip_clear_confirm": "true" (Skip) or "false" (Ask)
    const isSkipping =
      localStorage.getItem("jigsudo_skip_clear_confirm") === "true";

    // Toggle = "Confirmar Borrado". Checked means "Ask" (Not skipping)
    confirmToggle.checked = !isSkipping;

    confirmToggle.addEventListener("change", () => {
      const wantConfirmation = confirmToggle.checked;
      // If we want confirmation, skip is FALSE.
      const shouldSkip = !wantConfirmation;
      localStorage.setItem(
        "jigsudo_skip_clear_confirm",
        shouldSkip ? "true" : "false",
      );
    });
  }

  // 2. Sound Toggle
  const soundToggle = document.getElementById("sound-toggle");
  if (soundToggle) {
    const soundOn = localStorage.getItem("jigsudo_sound") !== "false"; // Default ON
    soundToggle.checked = soundOn;

    soundToggle.addEventListener("change", () => {
      const isOn = soundToggle.checked;
      localStorage.setItem("jigsudo_sound", isOn ? "true" : "false");
      // Update global config if available, or manager
      // gameManager can read straight from LS or we can implement a setSound method later
    });
  }

  // 3. Vibration Toggle (Mobile Only)
  const vibToggle = document.getElementById("vibration-toggle");
  const vibContainer = document.getElementById("setting-vibration-container");

  // Strict check: API exists AND device is primarily touch (excludes Desktop)
  const hasVibration = "vibrate" in navigator;
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  const showVibration = hasVibration && isTouchDevice;

  if (vibContainer) {
    if (!showVibration) {
      // Hide on non-mobile devices
      vibContainer.style.display = "none";
    } else {
      const vibOn = localStorage.getItem("jigsudo_vibration") !== "false"; // Default ON
      vibToggle.checked = vibOn;

      vibToggle.addEventListener("change", () => {
        const isOn = vibToggle.checked;
        localStorage.setItem("jigsudo_vibration", isOn ? "true" : "false");

        // Haptic Feedback for the toggle itself
        if (isOn && navigator.vibrate) {
          try {
            navigator.vibrate(20);
          } catch (e) {}
        }
      });
    }
  }
  // --- Header Info (Date & Challenge #) ---
  function updateHeaderInfo() {
    const dateEl = document.getElementById("current-date");
    const challengeEl = document.getElementById("challenge-num");

    if (!dateEl || !challengeEl) return;

    const now = new Date();
    const lang = getCurrentLang();
    const t = translations[lang];
    const locale = t ? t.date_locale : "es-ES";

    // Date
    const dateStr = now.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    let formattedDate = dateStr;

    if (lang === "es") {
      // Regex accepts accents (Latin-1 Supplement block \u00C0-\u00FF)
      formattedDate = dateStr.replace(/[a-zA-Z\u00C0-\u00FF]+/g, (word) => {
        return word === "de" || word === "en" || word === "del"
          ? word
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      });
    } else {
      // English / Generic Title Case
      formattedDate = dateStr.replace(/[a-zA-Z\u00C0-\u00FF]+/g, (word) => {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      });
    }

    dateEl.textContent = formattedDate;

    // Challenge #: Days since Jan 18, 2026 (Launch Day = #001)
    const todayZero = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startZero = new Date(2026, 0, 18); // Jan 18, 2026

    const diffTime = todayZero - startZero;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

    challengeEl.textContent = `#${String(diffDays).padStart(3, "0")}`;
  }

  updateHeaderInfo();

  // Listen for Language Changes to re-render date and rankings
  window.addEventListener("languageChanged", () => {
    updateHeaderInfo();
    refreshStartButton();
    // Re-render rankings to update localized decimal formatting
    if (typeof loadAndRenderAllRankings === "function") {
      loadAndRenderAllRankings();
    }
  });

  // Placeholders for other buttons
  // --- Home Tabs Logic ---
  const tabs = document.querySelectorAll(".tab-btn");
  const panelDaily = document.getElementById("panel-daily");
  const panelCustom = document.getElementById("panel-custom");
  // startBtn is already defined at line 11
  let currentMode = "daily"; // 'daily' | 'custom'

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab; // 'daily' or 'custom'

      // 1. Update Tabs styling
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // 2. Update Panels (Deck Logic)
      if (target === "daily") {
        currentMode = "daily";
        panelDaily.classList.add("active");
        panelCustom.classList.remove("active");
      } else {
        currentMode = "custom";
        panelCustom.classList.add("active");
        panelDaily.classList.remove("active");
      }

      // Update Start Button state based on the new mode and win status
      refreshStartButton();
    });
  });

  // --- Custom Mode: Difficulty Control ---
  const diffBtns = document.querySelectorAll(".seg-btn");
  diffBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      diffBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      console.log(`Difficulty set to: ${btn.dataset.diff}`);
    });
  });

  // Start Game Button Logic Update
  if (startBtn) {
    // Remove old listener (clone node trick or just use a flag if we can't remove anonymous)
    // Since we are inside initHome which runs once, we can just replace the logic
    // BUT startBtn already has a listener from lines 17-22.
    // Let's modify the existing listener or handling there.
    // For now, I'll assume I can just add a new one that checks logic,
    // but better to replace the previous block or use the variable.
  }

  // Re-implementing Start Button logic cleanly:
  // Using direct onclick assignment to avoid listener stacking/loss

  // Define handler
  const handleStart = async () => {
    if (currentMode === "daily") {
      console.log("Preparing Daily Game...");

      // Visual Feedback
      if (startBtn) {
        startBtn.textContent = "Cargando...";
        startBtn.disabled = true; // Prevent double-clicks
      }

      try {
        if (gameManager.isWiping) {
          console.warn("[Home] Sync in progress. Blocking start.");
          return;
        }
        // 1. Refresh Seed & State (Ensures fresh date if tab was open)
        await gameManager.prepareDaily();

        // Remove Home State
        document.body.classList.remove("home-active");

        // 2. Load Memory Game (Routing)
        const state = gameManager.getState();
        const currentStage = state.progress.currentStage || "memory";
        const module = await import("./memory.js");

        if (currentStage === "memory") {
          module.initMemoryGame();
        } else {
          console.log(`[Home] Resuming session at stage: ${currentStage}`);
          if (module.resumeToStage) {
            module.resumeToStage(currentStage);
          } else {
            // Fallback (should not happen if all stages implemented)
            module.initMemoryGame();
          }
        }

        // Note: initMemoryGame hides home, so button state reset isn't strictly needed immediately,
        // but good practice if user comes back.
        if (startBtn) {
          startBtn.textContent =
            translations[getCurrentLang()]?.btn_start || "EMPEZAR";
          startBtn.disabled = false;
        }
      } catch (err) {
        console.error("Failed to start Memory Game", err);
        if (startBtn) {
          startBtn.textContent = "Error";
          startBtn.disabled = false;
        }
      }
    } else {
      console.log("Starting Custom Game...");
      alert("Modo Personalizado: ¡Configura tu juego! (Próximamente)");
    }
  };

  const handleViewResults = async () => {
    try {
      const stats = JSON.parse(
        localStorage.getItem("jigsudo_user_stats") || "{}",
      );
      const seedStr = getDailySeed().toString();
      const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
      const todayStats = stats.history?.[today];

      if (todayStats) {
        // Adapt saved history stats to the format expected by showVictorySummary
        const sessionStats = {
          totalTime: todayStats.totalTime,
          score: todayStats.score,
          streak: stats.currentStreak,
          errors: todayStats.peaksErrors || 0,
          stageTimes: todayStats.stageTimes || {},
        };

        const { showVictorySummary } = await import("./ui.js");
        showVictorySummary(sessionStats, true);
      }
    } catch (e) {
      console.error("Failed to view results:", e);
    }
  };

  // Check if daily puzzle is already won
  const checkDailyWin = () => {
    try {
      const stats = JSON.parse(
        localStorage.getItem("jigsudo_user_stats") || "{}",
      );
      // ALWAYS use the actual today's seed for the button state
      const realTodaySeed = getDailySeed();
      const seedStr = realTodaySeed.toString();
      const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
      return stats.history?.[today]?.status === "won";
    } catch (e) {
      return false;
    }
  };

  const refreshStartButton = () => {
    if (!startBtn) return;
    const isWon = checkDailyWin();
    const lang = getCurrentLang();

    if (isWon && currentMode === "daily") {
      startBtn.dataset.i18n = "btn_view_results";
      startBtn.textContent =
        translations[lang]?.btn_view_results || "Ver Resultado";
      startBtn.disabled = false;
      startBtn.classList.add("btn-won");
      startBtn.onclick = handleViewResults;
    } else {
      startBtn.dataset.i18n =
        currentMode === "daily" ? "btn_start" : "btn_coming_soon";
      startBtn.textContent = translations[lang]
        ? translations[lang][startBtn.dataset.i18n]
        : currentMode === "daily"
          ? "EMPEZAR"
          : "PRÓXIMAMENTE";
      startBtn.disabled = currentMode !== "daily";
      startBtn.classList.remove("btn-won");
      startBtn.onclick = handleStart;
    }
  };

  // Initial State
  refreshStartButton();

  // Re-check when coming back to the tab (midnight transition)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshStartButton();
    }
  });

  // REAL-TIME: If user stays on page, unlock exactly at midnight
  const setupMidnightTimer = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    // Schedule refresh at midnight
    setTimeout(() => {
      console.log("Midnight reached! Refreshing daily game state.");
      refreshStartButton();
      // Schedule the next one
      setupMidnightTimer();
    }, msUntilMidnight + 100); // 100ms buffer
  };
  setupMidnightTimer();

  // Home Navigation (Title Click)
  const appTitle = document.querySelector(".app-title");
  if (appTitle) {
    appTitle.style.cursor = "pointer";
    appTitle.addEventListener("click", () => {
      // 1. Close Profile
      hideProfile();

      // 2. Reset to Home (if in Game)
      const menu = document.getElementById("menu-content");
      const gameSection = document.getElementById("game-section");

      if (menu) menu.classList.remove("hidden");
      if (gameSection) gameSection.classList.add("hidden");

      // 3. Reset URL
      window.location.hash = "";

      // 4. Update Header Info
      refreshStartButton();

      // 5. Hide Debug/Beta Button (Redundant but safe)
      const debugBtn = document.getElementById("debug-help-btn");
      if (debugBtn) debugBtn.style.display = "none";

      // Restore Home State
      document.body.classList.add("home-active");

      // Show Footer when returning Home
      const footer = document.querySelector(".main-footer");
      if (footer) footer.classList.remove("hidden");
    });
  }

  // --- Ranking Logic ---
  const containerDaily = document.getElementById("ranking-daily-wrapper");
  const containerMonthly = document.getElementById("ranking-monthly-wrapper");
  const containerAllTime = document.getElementById("ranking-alltime-wrapper");
  const refreshBtn = document.getElementById("btn-refresh-ranking");

  let currentRankings = null;

  async function loadAndRenderAllRankings(force = false) {
    if (containerDaily)
      containerDaily.innerHTML = '<div class="loader-small"></div>';
    if (containerMonthly)
      containerMonthly.innerHTML = '<div class="loader-small"></div>';
    if (containerAllTime)
      containerAllTime.innerHTML = '<div class="loader-small"></div>';

    currentRankings = await fetchRankings(force);

    renderRankings(containerDaily, currentRankings, "daily");
    renderRankings(containerMonthly, currentRankings, "monthly");
    renderRankings(containerAllTime, currentRankings, "allTime");
  }

  // Initial Load
  loadAndRenderAllRankings();

  // Refresh Listener
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadAndRenderAllRankings(true);
    });
  }

  // Listen for auth state initialization to re-render rankings with user highlighting
  // This ensures the current user's row is highlighted from the first load
  window.addEventListener("authReady", () => {
    console.log(
      "[Home] Auth ready, re-rendering rankings to show user highlight",
    );
    loadAndRenderAllRankings();
  });
}
