/* Firestore Database Module */
import { db } from "./firebase-config.js";
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  deleteField,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { gameManager } from "./game-manager.js";

// ... (rest of imports/vars)

// Real-time listener unsubscribe function
let unsubscribeProgress = null;

export function listenToUserProgress(userId) {
  if (!userId) return;

  // Unsubscribe previous if exists
  if (unsubscribeProgress) {
    unsubscribeProgress();
    unsubscribeProgress = null;
  }

  const userRef = doc(db, "users", userId);

  console.log(`[DB] Starting real-time listener for ${userId}`);
  unsubscribeProgress = onSnapshot(userRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      // Pass data to GameManager for conflict checking
      gameManager.handleCloudSync(data.progress, data.stats);
    }
  });
}

export function stopListeningAndCleanup() {
  if (unsubscribeProgress) {
    unsubscribeProgress();
    unsubscribeProgress = null;
    console.log("[DB] Real-time listener stopped.");
  }
}

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

export async function checkUsernameAvailability(username) {
  if (!username) return false;
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", username));
    const querySnapshot = await getDocs(q);
    return querySnapshot.empty; // True if no documents found (available)
  } catch (error) {
    console.error("Availability check failed:", error);
    return true; // Fail open or closed? Let's fail open to avoid blocking if network issues, or handle error upstream.
    // Ideally fail open but warn.
  }
}

export async function saveUserStats(userId, statsData, username = null) {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);

    const updateData = {
      stats: statsData,
      lastUpdated: serverTimestamp(),
    };

    // If username is provided, save it as a top-level searchable field
    if (username) {
      updateData.username = username;
    }

    await setDoc(userRef, updateData, { merge: true });
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
  } catch (error) {
    console.error("Error wiping user data:", error);
  }
}
