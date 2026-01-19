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

  // Start Game
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      console.log("Start Game Clicked!");
      // Future logic: Transition to Memory Game Stage
      alert("¡Empezando el juego! (Siguiente integración: Juego de Memoria)");
    });
  }

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

  // Helper: Apply Theme
  function applyTheme(isDark) {
    if (isDark) {
      body.classList.add("dark-mode");
      if (themeToggle) themeToggle.checked = true;
    } else {
      body.classList.remove("dark-mode");
      if (themeToggle) themeToggle.checked = false;
    }
  }

  // Helper: Handle Auto State
  function handleAutoTheme(isAuto) {
    if (isAuto) {
      manualOption.classList.add("disabled");
      if (themeToggle) themeToggle.disabled = true;

      // Check System Preference
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      applyTheme(systemPrefersDark);
    } else {
      manualOption.classList.remove("disabled");
      if (themeToggle) themeToggle.disabled = false;

      // Revert to manual saved preference
      const manualTheme = localStorage.getItem("theme") || "light";
      applyTheme(manualTheme === "dark");
    }
  }

  // 1. Initialize
  const savedAuto = localStorage.getItem("autoTheme") === "true";
  if (autoThemeToggle) autoThemeToggle.checked = savedAuto;

  if (savedAuto) {
    handleAutoTheme(true);
  } else {
    const savedTheme = localStorage.getItem("theme");
    applyTheme(savedTheme === "dark");
    handleAutoTheme(false);
  }

  // 2. Auto Toggle Listener
  if (autoThemeToggle) {
    autoThemeToggle.addEventListener("change", () => {
      const isAuto = autoThemeToggle.checked;
      localStorage.setItem("autoTheme", isAuto);
      handleAutoTheme(isAuto);
    });
  }

  // 3. Manual Toggle Listener
  if (themeToggle) {
    themeToggle.addEventListener("change", () => {
      if (!autoThemeToggle.checked) {
        const isDark = themeToggle.checked;
        applyTheme(isDark);
        localStorage.setItem("theme", isDark ? "dark" : "light");
      }
    });
  }

  // 4. System Preference Listener
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (autoThemeToggle.checked) {
        applyTheme(e.matches);
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
  document.getElementById("btn-stats")?.addEventListener("click", () => {
    alert("Estadísticas: Próximamente");
  });
}
