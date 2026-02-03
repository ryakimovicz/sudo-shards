/* Authentication Module */
import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { gameManager } from "./game-manager.js";

let currentUser = null;

export function initAuth() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is signed in
      currentUser = user;
      console.log("User signed in:", user.uid);
      updateUIForLogin(user);

      // Load cloud save? handled by gameManager listener or explicit call
      // gameManager.onUserLogin(user);
      import("./db.js").then((module) => {
        module.loadUserProgress(user.uid);
      });
    } else {
      // User is signed out
      currentUser = null;
      console.log("User signed out");
      updateUIForLogout();
    }
  });
}

export async function registerUser(email, password, username) {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const user = userCredential.user;

    // Set Display Name
    await updateProfile(user, {
      displayName: username,
    });

    return { success: true, user };
  } catch (error) {
    console.error("Registration Error:", error.code, error.message);
    return { success: false, error: translateAuthError(error.code) };
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
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function getCurrentUser() {
  return currentUser;
}

// UI Helpers
function updateUIForLogin(user) {
  const profileBtn = document.getElementById("btn-profile"); // Correct ID
  if (profileBtn) {
    profileBtn.classList.add("authenticated");
  }

  const loginModal = document.getElementById("login-modal");
  if (loginModal) loginModal.classList.add("hidden");

  // Update Dropdown UI
  const btnLoginTrigger = document.getElementById("btn-login-trigger");
  const loggedInView = document.getElementById("logged-in-view");
  const nameSpan = document.getElementById("user-display-name");

  if (btnLoginTrigger) btnLoginTrigger.classList.add("hidden");
  if (loggedInView) loggedInView.classList.remove("hidden");
  if (nameSpan) {
    // Use displayName if available, otherwise email prefix
    const displayName = user.displayName || user.email.split("@")[0];
    nameSpan.textContent = displayName;
  }
}

function updateUIForLogout() {
  const profileBtn = document.getElementById("btn-profile"); // Correct ID
  if (profileBtn) {
    profileBtn.classList.remove("authenticated");
  }

  // Update Dropdown UI
  const btnLoginTrigger = document.getElementById("btn-login-trigger");
  const loggedInView = document.getElementById("logged-in-view");

  if (btnLoginTrigger) btnLoginTrigger.classList.remove("hidden");
  if (loggedInView) loggedInView.classList.add("hidden");
}

function translateAuthError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "El correo ya está registrado.";
    case "auth/invalid-email":
      return "Correo inválido.";
    case "auth/weak-password":
      return "La contraseña es muy débil (mínimo 6 caracteres).";
    case "auth/user-not-found":
      return "Usuario no encontrado.";
    case "auth/wrong-password":
      return "Contraseña incorrecta.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Intenta más tarde.";
    default:
      return "Error de autenticación: " + code;
  }
}
