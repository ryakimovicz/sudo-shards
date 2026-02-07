/* Authentication Module */
import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  deleteUser,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";

export async function updateUsername(newUsername) {
  const user = auth.currentUser;
  if (!user) return { success: false, error: "No user logged in." };

  try {
    const { checkUsernameAvailability, saveUserStats } =
      await import("./db.js");

    if (user.displayName === newUsername) return { success: true };

    const isAvailable = await checkUsernameAvailability(newUsername);
    if (!isAvailable) {
      const t = translations[getCurrentLang()] || translations["es"];
      return { success: false, error: t.err_user_exists };
    }

    await updateProfile(user, { displayName: newUsername });

    const currentStats = gameManager.state.stats;
    await saveUserStats(user.uid, currentStats, newUsername);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: translateAuthError(error.code) || error.message,
    };
  }
}

let currentUser = null;
let isRegistering = false; // Flag to skip clearAllData during registration

export function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      console.log(
        "User signed in:",
        user.uid,
        user.isAnonymous ? "(Anonymous)" : "(Permanent)",
      );

      if (user.isAnonymous) {
        // GUEST FLOW (Anonymous UID for security/read access)
        gameManager.setUserId(user.uid);
        updateUIForLogout(); // Maintain Guest UI for anonymous sessions

        // Dispatch custom event to signal that auth is ready (even as guest)
        window.dispatchEvent(
          new CustomEvent("authReady", { detail: { user } }),
        );
        return;
      }

      // PERMANENT USER FLOW
      const storedUid = gameManager.getUserId();
      console.log(
        `[Auth] Checking context: storedUid=${storedUid}, firebaseUid=${user.uid}`,
      );

      if (isRegistering) {
        console.log(
          "[Auth] User registration: Preserving guest data for migration.",
        );
        gameManager.setUserId(user.uid);
      } else if (storedUid && storedUid === user.uid) {
        console.log("[Auth] Session resumed: Skipping data wipe.");
      } else {
        console.log(
          `[Auth] Context switch (Mismatch: ${storedUid} -> ${user.uid}): Wiping local data.`,
        );
        gameManager.isWiping = true; // LOCK ON
        await gameManager.clearAllData(false);
        gameManager.setUserId(user.uid);
      }

      const wasPlaying = !document.body.classList.contains("home-active");
      updateUIForLogin(user);

      // 2. LOAD SYNC
      document.body.classList.add("syncing-account");
      try {
        console.log(`[Auth] Step 2: Syncing account data for ${user.uid}...`);
        const { loadUserProgress, listenToUserProgress } =
          await import("./db.js");

        // Await the fetch and the handleCloudSync call inside it
        await loadUserProgress(user.uid);

        console.log(
          `[Auth] Sync phase complete. Local state exists:`,
          !!gameManager.getState(),
        );

        listenToUserProgress(user.uid); // Start Real-time Conflict Detection

        if (!gameManager.getState()) {
          console.log(
            "[Auth] No compatible cloud progress found. Initializing fresh daily game.",
          );
          await gameManager.prepareDaily();
        }

        const isNowPlaying = !document.body.classList.contains("home-active");
        if (wasPlaying || isNowPlaying) {
          const state = gameManager.getState();
          const currentStage = state.progress.currentStage || "memory";
          console.log(`[Auth] Routing to stage: ${currentStage}`);
          const memoryModule = await import("./memory.js");
          memoryModule.resumeToStage(currentStage);
        }
      } catch (err) {
        console.error("[Auth] Error during sync phase:", err);
        if (!gameManager.getState()) await gameManager.prepareDaily();
      } finally {
        gameManager.isWiping = false; // LOCK OFF
        document.body.classList.remove("syncing-account");
        console.log("[Auth] Session initialization complete. Lock released.");

        // Dispatch custom event to signal that auth and data are ready
        window.dispatchEvent(
          new CustomEvent("authReady", { detail: { user } }),
        );
      }
    } else {
      currentUser = null;
      console.log("User signed out. Triggering anonymous sign-in...");

      // Before anonymous sign-in, ensure UI reflects logged-out state (Guest)
      updateUIForLogout();
      gameManager.setUserId(null);

      // Trigger anonymous sign-in for guests
      try {
        const result = await signInAnonymously(auth);
        console.log("[Auth] Anonymous login success:", result.user.uid);
      } catch (err) {
        console.error("[Auth] Anonymous login failed:", err);
        // Fallback: Notify app that auth is ready even if sign-in failed
        window.dispatchEvent(
          new CustomEvent("authReady", { detail: { user: null } }),
        );
      }
    }
  });
}

export async function registerUser(email, password, username) {
  isRegistering = true;
  try {
    const { checkUsernameAvailability, saveUserStats } =
      await import("./db.js");
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const user = userCredential.user;

    const isAvailable = await checkUsernameAvailability(username);
    if (!isAvailable) {
      try {
        await deleteUser(user);
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError);
      }
      const t = translations[getCurrentLang()] || translations["es"];
      return { success: false, error: t.err_user_exists };
    }

    await updateProfile(user, { displayName: username });
    updateUIForLogin(user);
    await saveUserStats(user.uid, { registeredAt: new Date() }, username);

    const guestStatsStr = localStorage.getItem("jigsudo_user_stats");
    if (guestStatsStr) {
      try {
        const guestStats = JSON.parse(guestStatsStr);
        if (guestStats.currentRP > 0 || guestStats.wins > 0) {
          await saveUserStats(user.uid, guestStats, username);
        }
      } catch (e) {
        console.warn("[Auth] Failed to migrate guest stats:", e);
      }
    }

    try {
      await gameManager.forceCloudSave(user.uid);
    } catch (e) {
      console.warn("[Auth] Failed to migrate guest state:", e);
    }

    return { success: true, user };
  } catch (error) {
    console.error("Registration Error:", error.code, error.message);
    return { success: false, error: translateAuthError(error.code) };
  } finally {
    setTimeout(() => {
      isRegistering = false;
    }, 1000);
  }
}

export async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error("Login Error:", error.code, error.message);
    return { success: false, error: translateAuthError(error.code) };
  }
}

export async function logoutUser() {
  try {
    const { stopListeningAndCleanup } = await import("./db.js");
    stopListeningAndCleanup();

    // Force sync before wiping local data
    try {
      await gameManager.forceCloudSave();
    } catch (e) {
      console.warn("[Auth] Cloud save before logout failed:", e);
    }

    await gameManager.clearAllData();
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function reauthenticateUser(user, currentPassword) {
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  try {
    await reauthenticateWithCredential(user, credential);
    return { success: true };
  } catch (error) {
    return { success: false, error: translateAuthError(error.code) };
  }
}

export async function updateUserPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) return { success: false, error: "No user logged in." };

  const authResult = await reauthenticateUser(user, currentPassword);
  if (!authResult.success) return authResult;

  try {
    await updatePassword(user, newPassword);
    return { success: true };
  } catch (error) {
    return { success: false, error: translateAuthError(error.code) };
  }
}

export async function deleteUserAccount(currentPassword) {
  const user = auth.currentUser;
  if (!user) return { success: false, error: "No user logged in." };

  // CRITICAL: Block all background saves during the deletion process
  gameManager.isWiping = true;

  const authResult = await reauthenticateUser(user, currentPassword);
  if (!authResult.success) {
    gameManager.isWiping = false; // Reset if auth fails
    return authResult;
  }

  try {
    const { wipeUserData } = await import("./db.js");
    await wipeUserData(user.uid);
  } catch (e) {
    console.error("Wipe data failed, proceeding to delete account anyway:", e);
  }

  try {
    await deleteUser(user);
    // CRITICAL: Wipe local data after account deletion so the resulting guest session starts clean.
    await gameManager.clearAllData();
    return { success: true };
  } catch (error) {
    return { success: false, error: translateAuthError(error.code) };
  }
}

export function getCurrentUser() {
  return currentUser;
}

function updateUIForLogin(user) {
  const authBtn = document.getElementById("btn-auth");
  if (authBtn) authBtn.classList.add("authenticated");

  const loginModal = document.getElementById("login-modal");
  if (loginModal) loginModal.classList.add("hidden");

  const profileActions = document.querySelector(".profile-actions");
  if (profileActions) profileActions.classList.remove("hidden");

  const guestActions = document.querySelector(".guest-actions");
  if (guestActions) guestActions.classList.add("hidden");

  const loginWrapper = document.getElementById("login-wrapper");
  const loggedInView = document.getElementById("logged-in-view");
  const nameSpan = document.getElementById("user-display-name");

  if (loginWrapper) loginWrapper.classList.add("hidden");
  if (loggedInView) loggedInView.classList.remove("hidden");

  if (nameSpan) {
    const displayName = user.displayName || user.email.split("@")[0];
    nameSpan.textContent = displayName;
  }

  const menu = document.getElementById("menu-content");
  const gameSection = document.getElementById("game-section");
  if (menu) menu.classList.remove("hidden");
  if (gameSection) {
    gameSection.classList.add("hidden");
    document.body.classList.add("home-active");
    gameSection.classList.remove(
      "memory-mode",
      "jigsaw-mode",
      "sudoku-mode",
      "peaks-mode",
      "search-mode",
      "code-mode",
    );
  }

  const profileEmail = document.getElementById("profile-email-display");
  const profileNameLarge = document.getElementById("profile-name-large");

  if (profileEmail) profileEmail.textContent = user.email;
  if (profileNameLarge)
    profileNameLarge.textContent = user.displayName || "Usuario";

  const btnChangeName = document.getElementById("btn-profile-change-name");
  if (btnChangeName)
    btnChangeName.onclick = () => showPasswordModal("change_username");

  const btnChangePass = document.getElementById("btn-profile-change-pw");
  if (btnChangePass)
    btnChangePass.onclick = () => showPasswordModal("change_password");

  const btnDelete = document.getElementById("btn-profile-delete");
  if (btnDelete) btnDelete.onclick = () => showPasswordModal("delete_account");

  import("./profile.js").then((module) => {
    module.updateProfileData();
  });

  // Force a cloud save to ensure username is synced to Firestore rankings
  gameManager.forceCloudSave(user.uid);

  const btnLogout = document.getElementById("btn-profile-logout");
  if (btnLogout) {
    btnLogout.onclick = () => {
      const modal = document.getElementById("logout-confirm-modal");
      if (modal) modal.classList.remove("hidden");
    };
  }

  const btnCancelLogout = document.getElementById("btn-cancel-logout-modal");
  const btnConfirmLogout = document.getElementById("btn-confirm-logout-modal");
  const logoutModal = document.getElementById("logout-confirm-modal");

  if (btnCancelLogout && logoutModal) {
    btnCancelLogout.onclick = () => {
      logoutModal.classList.add("hidden");
    };
  }

  if (btnConfirmLogout && logoutModal) {
    btnConfirmLogout.onclick = async () => {
      const { showToast } = await import("./ui.js");
      btnConfirmLogout.textContent = "Saliendo...";
      btnConfirmLogout.disabled = true;
      const result = await logoutUser();
      btnConfirmLogout.textContent = "Cerrar Sesión";
      btnConfirmLogout.disabled = false;
      logoutModal.classList.add("hidden");
      if (result.success) showToast("Sesión cerrada correctamente.");
      else showToast("Error al cerrar sesión: " + result.error);
    };
  }
}

function updateUIForLogout() {
  const authBtn = document.getElementById("btn-auth");
  if (authBtn) authBtn.classList.remove("authenticated");

  const loginWrapper = document.getElementById("login-wrapper");
  const loggedInView = document.getElementById("logged-in-view");

  if (loginWrapper) loginWrapper.classList.remove("hidden");
  if (loggedInView) loggedInView.classList.add("hidden");

  const profileEmail = document.getElementById("profile-email-display");
  if (profileEmail) profileEmail.textContent = "";

  import("./db.js").then((module) => {
    module.stopListeningAndCleanup();
  });

  const guestActions = document.querySelector(".guest-actions");
  if (guestActions) guestActions.classList.remove("hidden");

  import("./profile.js").then((module) => {
    module.updateProfileData();
  });

  const menu = document.getElementById("menu-content");
  const gameSection = document.getElementById("game-section");
  if (menu) menu.classList.remove("hidden");
  if (gameSection) {
    gameSection.classList.add("hidden");
    document.body.classList.add("home-active");
    gameSection.classList.remove(
      "memory-mode",
      "jigsaw-mode",
      "sudoku-mode",
      "peaks-mode",
      "search-mode",
      "code-mode",
    );
  }

  const debugBtn = document.getElementById("debug-help-btn");
  if (debugBtn) debugBtn.style.display = "none";

  const btnGuestLogin = document.getElementById("btn-profile-login-guest");
  if (btnGuestLogin) {
    btnGuestLogin.onclick = () => {
      const loginModal = document.getElementById("login-modal");
      if (loginModal) loginModal.classList.remove("hidden");
    };
  }
}

function translateAuthError(code) {
  const t = translations[getCurrentLang()] || translations["es"];
  switch (code) {
    case "auth/email-already-in-use":
      return t.err_auth_email_in_use;
    case "auth/invalid-email":
      return t.err_auth_invalid_email;
    case "auth/weak-password":
      return t.err_auth_weak_password;
    case "auth/user-not-found":
      return t.err_auth_user_not_found;
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return t.err_auth_wrong_password;
    case "auth/too-many-requests":
      return t.err_auth_too_many_requests;
    default:
      return t.err_auth_general + code;
  }
}

function showPasswordModal(actionType) {
  const modal = document.getElementById("password-confirm-modal");
  const title = document.getElementById("pwd-modal-title");
  const desc = document.getElementById("pwd-modal-desc");
  const newPassContainer = document.getElementById("new-password-container");
  const confirmInput = document.getElementById("confirm-password-input");
  const newPassInput = document.getElementById("new-password-input");
  const verifyPassInput = document.getElementById("verify-password-input");
  const textInput = document.getElementById("modal-text-input");
  const btnConfirm = document.getElementById("btn-confirm-pwd");
  const btnCancel = document.getElementById("btn-cancel-pwd");

  if (!modal) return;

  confirmInput.value = "";
  newPassInput.value = "";
  if (verifyPassInput) verifyPassInput.value = "";
  modal.classList.remove("hidden");

  if (!modal.dataset.toggleListenerAttached) {
    modal.addEventListener("click", (e) => {
      const btn = e.target.closest(".toggle-password");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const wrapper = btn.closest(".password-wrapper");
      const input = wrapper ? wrapper.querySelector("input") : null;
      if (input) {
        const isPassword = input.type === "password";
        const newType = isPassword ? "text" : "password";
        input.type = newType;
        btn.textContent = isPassword ? "🙈" : "👁️";
        const verifyPassInputRef = document.getElementById(
          "verify-password-input",
        );
        if (input.id === "new-password-input" && verifyPassInputRef) {
          verifyPassInputRef.type = newType;
        }
      }
    });
    modal.dataset.toggleListenerAttached = "true";
  }

  const lang = getCurrentLang() || "es";
  const t = translations[lang] || translations["es"];

  if (actionType === "change_username") {
    title.textContent = t.modal_change_name_title;
    desc.textContent = t.modal_change_name_desc;
    newPassContainer.classList.add("hidden");
    if (confirmInput.closest(".password-wrapper")) {
      confirmInput.closest(".password-wrapper").classList.add("hidden");
    } else {
      confirmInput.classList.add("hidden");
    }
    if (textInput) {
      textInput.classList.remove("hidden");
      textInput.placeholder = t.modal_new_name_placeholder;
      textInput.value = auth.currentUser.displayName || "";
      textInput.focus();
    }
    const newBtnConfirm = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);
    newBtnConfirm.textContent = t.btn_confirm;
    newBtnConfirm.onclick = async () => {
      const { showToast } = await import("./ui.js");
      const newName = textInput ? textInput.value.trim() : "";
      if (!newName) {
        showToast(t.toast_name_empty);
        return;
      }
      newBtnConfirm.disabled = true;
      newBtnConfirm.textContent = t.btn_saving;
      const result = await updateUsername(newName);
      newBtnConfirm.disabled = false;
      newBtnConfirm.textContent = t.btn_confirm;
      if (result.success) {
        showToast(t.toast_name_success);
        modal.classList.add("hidden");
        const nameSpan = document.getElementById("user-display-name");
        if (nameSpan) nameSpan.textContent = newName;
        const profileNameLarge = document.getElementById("profile-name-large");
        if (profileNameLarge) profileNameLarge.textContent = newName;
        try {
          const { updateProfileData } = await import("./profile.js");
          updateProfileData();
        } catch (e) {
          console.error("Error updating profile card:", e);
        }
      } else {
        alert("Error: " + result.error);
      }
    };
  } else if (actionType === "change_password") {
    title.textContent = t.modal_change_pw_title;
    desc.textContent = t.modal_change_pw_desc;
    newPassContainer.classList.remove("hidden");
    const currentWrapper = confirmInput.closest(".password-wrapper");
    if (currentWrapper) currentWrapper.classList.remove("hidden");
    else confirmInput.classList.remove("hidden");
    confirmInput.placeholder = t.placeholder_current_pw;
    newPassInput.placeholder = t.placeholder_new_pw;
    if (verifyPassInput) verifyPassInput.placeholder = t.placeholder_verify_pw;
    if (textInput) textInput.classList.add("hidden");
    const newBtnConfirm = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);
    newBtnConfirm.textContent = t.btn_confirm;
    newBtnConfirm.onclick = async () => {
      const { showToast } = await import("./ui.js");
      const currentPass = confirmInput.value;
      const newPass = newPassInput.value;
      const verifyPass = verifyPassInput ? verifyPassInput.value : "";
      if (!currentPass || !newPass || !verifyPass) {
        showToast(t.toast_pw_empty);
        return;
      }
      if (newPass !== verifyPass) {
        showToast(t.toast_pw_mismatch);
        return;
      }
      if (newPass.length < 6) {
        showToast(t.toast_pw_short);
        return;
      }
      newBtnConfirm.disabled = true;
      newBtnConfirm.textContent = t.btn_processing;
      const result = await updateUserPassword(currentPass, newPass);
      newBtnConfirm.disabled = false;
      newBtnConfirm.textContent = t.btn_confirm;
      if (result.success) {
        showToast(t.toast_pw_success);
        modal.classList.add("hidden");
      } else {
        showToast("Error: " + result.error);
      }
    };
  } else if (actionType === "delete_account") {
    title.textContent = t.modal_delete_account_title;
    desc.textContent = t.modal_delete_account_desc;
    title.style.color = "#ff5555";
    newPassContainer.classList.add("hidden");
    const currentWrapper = confirmInput.closest(".password-wrapper");
    if (currentWrapper) currentWrapper.classList.remove("hidden");
    else confirmInput.classList.remove("hidden");
    confirmInput.placeholder = t.placeholder_current_pw;
    if (textInput) textInput.classList.add("hidden");
    const newBtnConfirm = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);
    newBtnConfirm.textContent = t.btn_confirm;
    newBtnConfirm.onclick = async () => {
      const { showToast } = await import("./ui.js");
      const currentPass = confirmInput.value;
      if (!currentPass) {
        showToast(t.toast_pw_enter);
        return;
      }
      const deleteModal = document.getElementById(
        "delete-account-confirm-modal",
      );
      const btnCancelDelete = document.getElementById(
        "btn-cancel-delete-modal",
      );
      const btnConfirmDelete = document.getElementById(
        "btn-confirm-delete-modal",
      );
      if (deleteModal) {
        deleteModal.classList.remove("hidden");
        if (btnCancelDelete)
          btnCancelDelete.onclick = () => {
            deleteModal.classList.add("hidden");
          };
        if (btnConfirmDelete) {
          btnConfirmDelete.onclick = async () => {
            btnConfirmDelete.disabled = true;
            btnConfirmDelete.textContent = t.btn_deleting;
            const result = await deleteUserAccount(currentPass);
            if (result.success) {
              showToast(t.toast_delete_success);
              setTimeout(() => window.location.reload(), 2000);
            } else {
              btnConfirmDelete.disabled = false;
              btnConfirmDelete.textContent = t.btn_delete_all;
              showToast("Error: " + result.error);
              deleteModal.classList.add("hidden");
            }
          };
        }
      }
    };
  }
  btnCancel.onclick = () => {
    modal.classList.add("hidden");
    title.style.color = "";
  };
}
