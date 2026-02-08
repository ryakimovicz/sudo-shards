/* Main Entry Point */

import { initHome } from "./home.js";
import { initLanguage } from "./i18n.js";
import { initSudoku } from "./sudoku.js";
import { gameManager } from "./game-manager.js";
import {
  initAuth,
  loginUser,
  registerUser,
  logoutUser,
  loginWithGoogle,
} from "./auth.js"; // Auth Import
import { initProfile, showProfile } from "./profile.js"; // Profile Import
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
    const debugBtn = document.getElementById("debug-help-btn");

    // Listener handling delegated to memory.js (debugAutoMatch) to avoid double-firing
    // and "No solver for this state" warnings.
  }

  console.log("Jigsudo App Starting...");

  console.log("Jigsudo App Starting...");

  // Wait for Game Manager to fetch static puzzle or generate local
  try {
    await gameManager.ready;
  } catch (err) {
    console.error("[Main] Game Manager failed to initialize:", err);
    // Ensure we don't block the UI entirely
  }

  initLanguage();
  initHome();
  initSudoku();
  initAuth(); // Initialize Firebase Auth listener
  initProfile(); // Profile Module

  attachAuthListeners();

  // DEBUG TOOLS: Exposed only in Debug Mode
  if (CONFIG.debugMode) {
    window.resetToday = () => gameManager.resetCurrentGame();

    window.resetAccount = async () => {
      const { getCurrentUser } = await import("./auth.js");
      const { wipeUserData } = await import("./db.js");
      const user = getCurrentUser();

      if (
        confirm(
          "¿Seguro que quieres borrar TODA TU CUENTA y progreso? Esto no se puede deshacer.",
        )
      ) {
        if (user) {
          console.log("Wiping remote data...");
          await wipeUserData(user.uid);
        }
        console.log("Clearing local storage...");
        localStorage.clear();
        console.log("Reloading...");
        window.location.reload();
      }
    };

    window.magicWand = async () => {
      const { debugAutoMatch } = await import("./memory.js");
      debugAutoMatch();
    };

    console.log("🛠️ Debug Commands Available:");
    console.log("- resetToday(): Resets only current puzzle progress.");
    console.log("- resetAccount(): Wipes entire account and local data.");
    console.log("- magicWand(): Automagically solves the current step.");
  }
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

  // Profile Navigation (Logged In)
  const btnViewProfile = document.getElementById("btn-view-profile");
  if (btnViewProfile) {
    btnViewProfile.addEventListener("click", () => {
      showProfile();
      document.getElementById("profile-dropdown")?.classList.add("hidden");
    });
  }

  // Profile Navigation (Guest)
  const btnGuestProfile = document.getElementById("btn-guest-profile");
  if (btnGuestProfile) {
    btnGuestProfile.addEventListener("click", () => {
      showProfile();
      document.getElementById("profile-dropdown")?.classList.add("hidden");
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

  // Logout - Removed from Menu
  // Profile logout handled in profile.js

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

  // Google Login Buttons
  document.querySelectorAll(".btn-login-google").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const errBox = document.getElementById("auth-error-msg");
      if (errBox) errBox.classList.add("hidden");

      const res = await loginWithGoogle();
      if (!res.success) {
        if (errBox) {
          errBox.textContent = res.error;
          errBox.classList.remove("hidden");
        }
      } else {
        loginModal.classList.add("hidden");
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
      const { translations } = await import("./translations.js");
      const { getCurrentLang } = await import("./i18n.js");
      const lang = getCurrentLang();
      const t = translations[lang];
      errBox.textContent = t.toast_pw_mismatch || "Passwords do not match.";
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

  // --- SOCIAL SHARE LOGIC ---
  window.shareApp = async function () {
    const { translations } = await import("./translations.js");
    const { getCurrentLang } = await import("./i18n.js");
    const lang = getCurrentLang();
    const t = translations[lang];

    const shareData = {
      title: "Jigsudo",
      text: t.share_text,
      url: window.location.href, // Or hardcoded 'https://jigsudo.com'
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        console.log("Shared successfully");
      } else {
        // Fallback for Desktop
        await navigator.clipboard.writeText(
          `${shareData.text} Juega gratis aquí: ${shareData.url}`,
        );
        const { showToast } = await import("./ui.js");
        showToast(t.toast_share_success);
      }
    } catch (err) {
      console.error("Error sharing:", err);
    }
  };
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
  const footerBottom = document.querySelector(".footer-bottom");
  if (footerBottom) {
    // Separator
    footerBottom.appendChild(document.createTextNode(" | "));

    // Version Tag
    const versionSpan = document.createElement("span");
    versionSpan.className = "version-tag";
    versionSpan.innerText = CONFIG.version;
    footerBottom.appendChild(versionSpan);
  }
  systemLog(
    `%c JIGSUDO ${CONFIG.version} cargado correctamente`,
    "background: #F37825; color: white; padding: 2px 5px; border-radius: 3px;",
  );
}

displayVersion();
