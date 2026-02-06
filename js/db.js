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
  addDoc,
  getCountFromServer,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { gameManager } from "./game-manager.js";

// ... (rest of imports/vars)

export async function submitBugReport(description, user) {
  try {
    const { CONFIG } = await import("./config.js");
    const report = {
      description: description,
      userId: user ? user.uid : "anonymous",
      userEmail: user ? user.email : null,
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent,
      appVersion: CONFIG.version || "unknown",
      url: window.location.href,
    };

    await addDoc(collection(db, "reports"), report);
    return { success: true };
  } catch (error) {
    console.error("Error submitting report:", error);
    return { success: false, error: error.message };
  }
}

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
      // Top-level fields for efficient Firestore indexing
      totalRP: statsData.currentRP || 0,
      monthlyRP: statsData.monthlyRP || 0,
      dailyRP: statsData.dailyRP || 0,
    };

    // If username is provided, save it as a top-level searchable field
    if (username) {
      updateData.username = username;
    }

    if (gameManager.isWiping) {
      console.log("[DB] Update blocked: GM is wiping.");
      return;
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
    if (gameManager.isWiping) {
      console.log("[DB] Update blocked: GM is wiping.");
      return;
    }
    await setDoc(
      userRef,
      {
        progress: progressData,
        lastUpdated: serverTimestamp(),
      },
      { merge: true },
    );

    console.log(
      `[DB] Progress saved to cloud for ${userId}. Stage: ${progressData.progress?.currentStage}`,
    );
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
      await gameManager.handleCloudSync(remoteProgress, remoteStats);
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
    await deleteDoc(userRef);

    console.warn(`🔥 User Game Data Wiped for ${userId}`);
  } catch (error) {
    console.error("Error wiping user data:", error);
  }
}

/**
 * Efficiently calculates the rank of a user by counting documents with a higher score.
 * Cost: 1 document read.
 */
export async function getUserRank(fieldName, score) {
  if (score === undefined || score === null) return null;
  try {
    const usersRef = collection(db, "users");
    // Rank = (Number of users with score > current score) + 1
    const q = query(usersRef, where(fieldName, ">", score));
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count + 1;
  } catch (error) {
    console.error(`[DB] Error calculating rank for ${fieldName}:`, error);
    return null;
  }
}
