/* Firestore Database Module */
import { db } from "./firebase-config.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { gameManager } from "./game-manager.js";

// Cloud Save Structure:
// users/{userId} -> {
//    progress: { ... },
//    lastUpdated: timestamp
// }

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
      const remoteData = docSnap.data().progress;
      const remoteTime = docSnap.data().lastUpdated;

      console.log("Remote progress found:", remoteData);

      // Determine Conflict Resolution: Remote vs Local
      // Simple strategy: Always prompt or Prefer Latest?
      // For seamless UX: Prefer Latest.
      // BUT if local is "fresh" session (empty), remote should overwrite.

      // Use GameManager to handle merge logic
      gameManager.handleCloudSync(remoteData);
    } else {
      console.log("No remote progress found. Creating new entry on next save.");
      // First save will happen automatically on next update
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
