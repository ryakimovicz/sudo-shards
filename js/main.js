/* Main Entry Point */
import { initHome } from "./home.js";
import { initLanguage } from "./i18n.js";
import { initSudoku } from "./sudoku.js";
import { gameManager } from "./game-manager.js";
import { CONFIG } from "./config.js"; // Keep CONFIG for displayVersion

// Boot Sequence
// Capture native logging before suppression
const systemLog = console.log;

async function startApp() {
  // Handle Debug Mode
  if (CONFIG.debugMode) {
    document.body.classList.add("debug-mode");
    systemLog("DEBUG MODE ACTIVE");
  } else {
    // Suppress console.log in production/non-debug
    console.log = function () {};
  }

  // Handle Beta Mode (Help Button)
  if (CONFIG.betaMode) {
    document.body.classList.add("beta-mode");
  }

  console.log("Jigsudo App Starting...");

  // Wait for Game Manager to fetch static puzzle or generate local
  await gameManager.ready;

  initLanguage();
  initHome();
  initSudoku();
}

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}

console.log("Main Loaded. Daily Seed:", gameManager.currentSeed);

// Display Version
function displayVersion() {
  const footerP = document.querySelector(".main-footer p");
  if (footerP) {
    // Separator (normal size)
    footerP.appendChild(document.createTextNode(" | "));

    // Version Tag (smaller)
    const versionSpan = document.createElement("a");
    versionSpan.href = "https://github.com/ryakimovicz/jigsudo/commits/main";
    versionSpan.target = "_blank";
    versionSpan.className = "version-tag";
    versionSpan.innerText = CONFIG.version;
    footerP.appendChild(versionSpan);
  }
  systemLog(
    `%c JIGSUDO ${CONFIG.version} cargado correctamente`,
    "background: #F37825; color: white; padding: 2px 5px; border-radius: 3px;",
  );
}

displayVersion();
