/* Main Entry Point */
import { initHome } from "./home.js";
import { initLanguage } from "./i18n.js";
import { gameManager } from "./game-manager.js";
import { CONFIG } from "./config.js"; // Keep CONFIG for displayVersion

// Boot Sequence
function startApp() {
  console.log("Jigsudo App Starting...");
  // gameManager initializes itself on import
  initLanguage(); // Initialize i18n
  initHome(); // Initialize Home Screen logic
}

startApp(); // Call the new boot sequence

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
  console.log(
    `%c JIGSUDO ${CONFIG.version} cargado correctamente`,
    "background: #F37825; color: white; padding: 2px 5px; border-radius: 3px;",
  );
}

displayVersion();
