/* Main Entry Point */
import "./menu.js";
import { gameManager } from "./game-manager.js";
import { CONFIG } from "./config.js";

console.log("Main Loaded. Daily Seed:", gameManager.currentSeed);

// Display Version
function displayVersion() {
  const footerP = document.querySelector(".main-footer p");
  if (footerP) {
    // Separator (normal size)
    footerP.appendChild(document.createTextNode(" | "));

    // Version Tag (smaller)
    const versionSpan = document.createElement("span");
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
