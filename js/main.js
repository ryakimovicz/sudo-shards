/* Main Entry Point */
import { initHome } from "./home.js";
import { initLanguage } from "./i18n.js";
import { initSudoku } from "./sudoku.js";
import { gameManager } from "./game-manager.js";
import { initAuth, loginUser, registerUser, logoutUser } from "./auth.js"; // Auth Import
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
  initAuth(); // Initialize Firebase Auth listener

  attachAuthListeners();
}

function attachAuthListeners() {
  const loginModal = document.getElementById("login-modal");
  const btnLoginTrigger = document.getElementById("btn-login-trigger");
  const btnLogout = document.getElementById("btn-logout");
  const closeBtn = document.getElementById("login-modal-cancel");

  // Open Modal
  if (btnLoginTrigger) {
    btnLoginTrigger.addEventListener("click", () => {
      loginModal.classList.remove("hidden");
      // Hide Profile Dropdown
      document.getElementById("profile-dropdown")?.classList.add("hidden");
    });
  }

  // Close Modal
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      loginModal.classList.add("hidden");
    });
  }

  // Switch Forms
  const linkRegister = document.getElementById("switch-to-register");
  const linkLogin = document.getElementById("switch-to-login");
  const formLogin = document.getElementById("login-form");
  const formRegister = document.getElementById("register-form");

  if (linkRegister) {
    linkRegister.addEventListener("click", (e) => {
      e.preventDefault();
      formLogin.classList.add("hidden");
      formLogin.classList.remove("active");
      formRegister.classList.remove("hidden");
      setTimeout(() => formRegister.classList.add("active"), 10);
    });
  }

  if (linkLogin) {
    linkLogin.addEventListener("click", (e) => {
      e.preventDefault();
      formRegister.classList.add("hidden");
      formRegister.classList.remove("active");
      formLogin.classList.remove("hidden");
      setTimeout(() => formLogin.classList.add("active"), 10);
    });
  }

  // Logout
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      await logoutUser();
      document.getElementById("profile-dropdown")?.classList.add("hidden");
    });
  }

  // Toggle Password Visibility
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      // Find the input associated with this button
      const wrapper = e.currentTarget.closest(".password-wrapper"); // Use currentTarget for button
      const input = wrapper.querySelector("input");

      const newType = input.type === "password" ? "text" : "password";

      // Update this input
      input.type = newType;
      e.currentTarget.textContent = newType === "text" ? "🙈" : "👁️";

      // If this is the Register Password field, also toggle the Confirm field
      if (input.id === "register-password") {
        const confirmInput = document.getElementById(
          "register-password-confirm",
        );
        if (confirmInput) {
          confirmInput.type = newType;
        }
      }
    });
  });

  // Submit Handlers
  formLogin?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const pass = document.getElementById("login-password").value;
    const errBox = document.getElementById("auth-error-msg");

    errBox.classList.add("hidden");

    const res = await loginUser(email, pass);
    if (!res.success) {
      errBox.textContent = res.error;
      errBox.classList.remove("hidden");
    } else {
      loginModal.classList.add("hidden");
    }
  });

  formRegister?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = document.getElementById("register-username").value;
    const email = document.getElementById("register-email").value;
    const pass = document.getElementById("register-password").value;
    const confirmPass = document.getElementById(
      "register-password-confirm",
    ).value;
    const errBox = document.getElementById("auth-error-msg");

    errBox.classList.add("hidden");

    if (pass !== confirmPass) {
      errBox.textContent =
        document.documentElement.lang === "es"
          ? "Las contraseñas no coinciden."
          : "Passwords do not match.";
      errBox.classList.remove("hidden");
      return;
    }

    const res = await registerUser(email, pass, user);
    if (!res.success) {
      errBox.textContent = res.error;
      errBox.classList.remove("hidden");
    } else {
      loginModal.classList.add("hidden");
    }
  });
}

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}

console.log("Main Loaded. Daily Seed:", gameManager.currentSeed);

// Display Version
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
