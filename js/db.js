/* Firestore Database Module */
import { db } from "./firebase-config.js";
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  deleteField,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { gameManager } from "./game-manager.js";

// ... (rest of imports/vars)

export async function cleanupLegacyStats(userId) {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(
      userRef,
      {
        currentStreak: deleteField(),
        distribution: deleteField(),
        // history: deleteField(), // CAREFUL: Make sure we migrated history first?
        // User said "history (map)" at root likely legacy if new stats has its own history.
        // But to be safe, I'll only delete if I am sure.
        // User's dump shows 'stats.history' is the new one. Root 'history' is old.
        // Yes, delete root history.
        history: deleteField(),
        sudoku: deleteField(),
      },
      { merge: true },
    );
    console.log("Legacy fields cleaned up.");
  } catch (e) {
    console.error("Cleanup failed:", e);
  }
}

export async function saveUserStats(userId, statsData) {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);

    // Auto-cleanup on save (one-time check could be better but this ensures consistency)
    // We can just include the deletes here? No, better separate to avoid bloated writes every time.
    // I'll call it once from GameManager init or similar.

    await setDoc(
      userRef,
      {
        stats: statsData,
        lastUpdated: serverTimestamp(),
      },
      { merge: true },
    );
    console.log("Stats saved to cloud.");
  } catch (error) {
    console.error("Error saving stats:", error);
  }
}

export async function saveUserProgress(userId, progressData) {
  if (!userId) return;

  try {
    const userRef = doc(db, "users", userId);
    await setDoc(
      userRef,
      {
        progress: progressData,
        lastUpdated: serverTimestamp(),
      },
      { merge: true },
    );

    console.log("Progress saved to cloud.");
    showSaveIndicatorWithMessage("Guardado en nube");
  } catch (error) {
    console.error("Error saving progress:", error);
  }
}

export async function loadUserProgress(userId) {
  if (!userId) return;

  try {
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const remoteProgress = data.progress;
      const remoteStats = data.stats; // New field

      console.log("Remote data found:", data);

      // Use GameManager to handle merge logic
      gameManager.handleCloudSync(remoteProgress, remoteStats);
    } else {
      console.log("No remote progress found. Creating new entry on next save.");
    }
  } catch (error) {
    console.error("Error loading progress:", error);
  }
}

function showSaveIndicatorWithMessage(msg) {
  // Reuse existing save indicator logic or create one
  const indicator = document.getElementById("save-indicator");
  if (indicator) {
    indicator.textContent = msg;
    indicator.classList.add("visible");
    setTimeout(() => {
      indicator.classList.remove("visible");
      // Reset text
      setTimeout(() => (indicator.textContent = "Guardando..."), 300);
    }, 2000);
  }
}

export async function wipeUserData(userId) {
  if (!userId) {
    console.error("No user ID provided for wipe.");
    return;
  }
  try {
    const userRef = doc(db, "users", userId);
    // Instead of deleting the whole doc, just delete game data
    await setDoc(
      userRef,
      {
        progress: deleteField(),
        stats: deleteField(),
        history: deleteField(), // legacy
        sudoku: deleteField(), // legacy
        currentStreak: deleteField(), // legacy
        distribution: deleteField(), // legacy
      },
      { merge: true },
    );

    console.warn(`🔥 User Game Data Wiped for ${userId}`);
    alert("Progreso y estadísticas borrados. Tu cuenta sigue activa.");
  } catch (error) {
    console.error("Error wiping user data:", error);
    alert("Error al borrar datos. Revisa la consola.");
  }
}
