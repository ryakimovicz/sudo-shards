import { translations } from "./translations.js";

export let currentLang = "es"; // Default

export function getCurrentLang() {
  return currentLang;
}

// Internal: Updates state and UI without persisting
function applyLanguage(lang) {
  if (translations[lang]) {
    currentLang = lang;
    document.documentElement.lang = lang; // Ensure DOM reflects state for CSS/other scripts
    updateTexts();
    updateLanguageSelector(lang);

    // Dispatch event
    window.dispatchEvent(
      new CustomEvent("languageChanged", { detail: { lang } }),
    );
  }
}

// Public: Changes language AND saves preference (User Intent)
export function setLanguage(lang) {
  if (translations[lang]) {
    localStorage.setItem("jigsudo_lang", lang);
    applyLanguage(lang);
  }
}

export function initLanguage() {
  // 1. Check LocalStorage (User Override)
  const savedLang = localStorage.getItem("jigsudo_lang");

  if (savedLang && translations[savedLang]) {
    // If user previously chose a language, respect it
    applyLanguage(savedLang);
  } else {
    // 2. No override? Check Browser (Auto)
    const browserLang = navigator.language.split("-")[0]; // 'es-ES' -> 'es'
    const supportedLang = translations[browserLang] ? browserLang : "es";

    // Apply detection, but DO NOT save to localStorage yet.
    // This allows the user to change browser lang later and see the change
    // until they explicitly lock it via the dropdown.
    applyLanguage(supportedLang);
  }

  setupLanguageSelectorListener();
}

function updateTexts() {
  const t = translations[currentLang];
  const jigsawMode = document
    .getElementById("game-section")
    ?.classList.contains("jigsaw-mode");

  // 1. Text Content
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    let key = el.getAttribute("data-i18n");

    // Override mechanisms for Jigsaw Mode - REMOVED faulty remapping
    // if (jigsawMode) {
    //   if (key === "game_memory") key = "jigsaw_help_title"; // Reuse for Title
    // }

    if (t[key]) el.textContent = t[key];
  });

  // 2. Inner HTML (for rich text)
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (t[key]) el.innerHTML = t[key];
  });

  // 3. Aria Labels (for icon buttons)
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (t[key]) el.setAttribute("aria-label", t[key]);
  });

  // Jigsaw/Sudoku Tooltip Special Case (Manual Override if in mode)
  if (jigsawMode) {
    const titleEl = document.querySelector(".header-title-container h2");
    if (titleEl && t.game_jigsaw) titleEl.textContent = t.game_jigsaw;

    const tooltipTitle = document.querySelector(".info-tooltip h3");
    const tooltipDesc = document.querySelector(".info-tooltip p");
    if (tooltipTitle && t.jigsaw_help_title)
      tooltipTitle.textContent = t.jigsaw_help_title;
    if (tooltipDesc && t.jigsaw_help_desc)
      tooltipDesc.innerHTML = t.jigsaw_help_desc;
  } else if (
    document.getElementById("game-section")?.classList.contains("sudoku-mode")
  ) {
    const titleEl = document.querySelector(".header-title-container h2");
    if (titleEl && t.game_sudoku) titleEl.textContent = t.game_sudoku;

    const tooltipTitle = document.querySelector(".info-tooltip h3");
    const tooltipDesc = document.querySelector(".info-tooltip p");
    if (tooltipTitle && t.sudoku_help_title)
      tooltipTitle.textContent = t.sudoku_help_title;
    if (tooltipDesc && t.sudoku_help_desc)
      tooltipDesc.innerHTML = t.sudoku_help_desc;
  } else if (
    document.getElementById("game-section")?.classList.contains("peaks-mode")
  ) {
    // Peaks Mode Override
    const titleEl = document.querySelector(".header-title-container h2");
    if (titleEl && t.game_peaks) titleEl.textContent = t.game_peaks;

    const tooltipTitle = document.querySelector(".info-tooltip h3");
    const tooltipDesc = document.querySelector(".info-tooltip p");
    if (tooltipTitle && t.peaks_help_title)
      tooltipTitle.textContent = t.peaks_help_title;
    if (tooltipDesc && t.peaks_help_desc)
      tooltipDesc.innerHTML = t.peaks_help_desc;
  } else if (
    document.getElementById("game-section")?.classList.contains("search-mode")
  ) {
    // Search Mode Override
    const titleEl = document.querySelector(".header-title-container h2");
    if (titleEl && t.game_search) titleEl.textContent = t.game_search;

    const tooltipTitle = document.querySelector(".info-tooltip h3");
    const tooltipDesc = document.querySelector(".info-tooltip p");
    if (tooltipTitle && t.search_help_title)
      tooltipTitle.textContent = t.search_help_title;
    if (tooltipDesc && t.search_help_desc)
      tooltipDesc.innerHTML = t.search_help_desc;
  } else if (
    document.getElementById("game-section")?.classList.contains("code-mode")
  ) {
    // Code Mode Override
    const titleEl = document.querySelector(".header-title-container h2");
    if (titleEl && t.game_code) titleEl.textContent = t.game_code;

    const tooltipTitle = document.querySelector(".info-tooltip h3");
    const tooltipDesc = document.querySelector(".info-tooltip p");
    if (tooltipTitle && t.code_help_title)
      tooltipTitle.textContent = t.code_help_title;
    if (tooltipDesc && t.code_help_desc)
      tooltipDesc.innerHTML = t.code_help_desc;
  }
}

function updateLanguageSelector(lang) {
  const select = document.getElementById("language-select");
  if (select) {
    select.value = lang;
  }
}

function setupLanguageSelectorListener() {
  const select = document.getElementById("language-select");
  if (select) {
    select.addEventListener("change", (e) => {
      setLanguage(e.target.value);
    });
    // Prevent closing dropdown when clicking select
    select.addEventListener("click", (e) => e.stopPropagation());
  }
}
