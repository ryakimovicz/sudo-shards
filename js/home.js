/* Main Menu Logic */
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";

export function initHome() {
  console.log("Jigsudo Home Module Loaded");

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

  // Theme Logic
  const themeToggle = document.getElementById("theme-toggle");
  const autoThemeToggle = document.getElementById("auto-theme-toggle");
  const manualOption = document.querySelector(".option-manual");
  const body = document.body;
  const STORAGE_KEY = "jigsudo_theme";

  // Helper: Apply visual theme
  function applyVisualTheme(isDark) {
    if (isDark) {
      body.classList.add("dark-mode");
      if (themeToggle) themeToggle.checked = true;
    } else {
      body.classList.remove("dark-mode");
      if (themeToggle) themeToggle.checked = false;
    }
  }

  // Core Logic: Load and Apply
  function updateThemeState() {
    const savedTheme = localStorage.getItem(STORAGE_KEY) || "auto";

    if (savedTheme === "auto") {
      // Auto Mode
      if (autoThemeToggle) autoThemeToggle.checked = true;
      if (themeToggle) themeToggle.disabled = true;
      if (manualOption) manualOption.classList.add("disabled");

      // Apply System Preference
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      applyVisualTheme(systemPrefersDark);
    } else {
      // Manual Mode
      if (autoThemeToggle) autoThemeToggle.checked = false;
      if (themeToggle) themeToggle.disabled = false;
      if (manualOption) manualOption.classList.remove("disabled");

      // Apply Manual Preference
      applyVisualTheme(savedTheme === "dark");
    }
  }

  // 1. Initialize on Load
  updateThemeState();

  // 2. Auto Toggle Listener
  if (autoThemeToggle) {
    autoThemeToggle.addEventListener("change", () => {
      if (autoThemeToggle.checked) {
        localStorage.setItem(STORAGE_KEY, "auto");
      } else {
        // When switching to manual, inherit current state
        const isDarkCurrently = body.classList.contains("dark-mode");
        localStorage.setItem(STORAGE_KEY, isDarkCurrently ? "dark" : "light");
      }
      updateThemeState();
    });
  }

  // 3. Manual Toggle Listener
  if (themeToggle) {
    themeToggle.addEventListener("change", () => {
      // Only works if auto is NOT checked (which is handled by UI disabled state too)
      if (!autoThemeToggle.checked) {
        const isDark = themeToggle.checked;
        localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
        updateThemeState();
      }
    });
  }

  // 4. System Preference Listener
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      // Only react if we are in auto mode
      if (localStorage.getItem(STORAGE_KEY) === "auto") {
        updateThemeState();
      }
    });
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
      formattedDate = dateStr.replace(/\b\w+/g, (word) => {
        return word === "de" || word === "en" || word === "del"
          ? word
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      });
    } else {
      // English / Generic Title Case
      formattedDate = dateStr.replace(/\b\w+/g, (word) => {
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

  // Listen for Language Changes to re-render date
  window.addEventListener("languageChanged", () => {
    updateHeaderInfo();
  });

  // Placeholders for other buttons
  // --- Home Tabs Logic ---
  const tabs = document.querySelectorAll(".tab-btn");
  const panelDaily = document.getElementById("panel-daily");
  const panelCustom = document.getElementById("panel-custom");
  let currentMode = "daily"; // 'daily' | 'custom'

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab; // 'daily' or 'custom'

      // 1. Update Tabs styling
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // 2. Update Panels (Deck Logic)
      // Toggle 'active' class: Active panel gets it, others lose it.
      if (target === "daily") {
        currentMode = "daily";
        panelDaily.classList.add("active");
        panelCustom.classList.remove("active");
      } else {
        currentMode = "custom";
        panelCustom.classList.add("active");
        panelDaily.classList.remove("active");
      }
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
  startBtn.replaceWith(startBtn.cloneNode(true)); // Remove old listeners
  const newStartBtn = document.getElementById("start-btn"); // Get fresh reference

  newStartBtn.addEventListener("click", () => {
    if (currentMode === "daily") {
      console.log("Starting Daily Game...");
      alert("¡Empezando el Desafío Diario! (Próximamente)");
    } else {
      console.log("Starting Custom Game...");
      alert("Modo Personalizado: ¡Configura tu juego! (Próximamente)");
    }
  });

  // Placeholders for other buttons
  document.getElementById("btn-stats")?.addEventListener("click", () => {
    alert("Estadísticas: Próximamente");
  });
}
