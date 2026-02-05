/* Firebase Configuration & Initialization */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

// Your web app's Firebase configuration
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDfedxV6IBkIAgSIcfMhuYdo_nQGP9y06Q", // Default Prod Key
  authDomain: "jigsudo-app.firebaseapp.com",
  projectId: "jigsudo-app",
  storageBucket: "jigsudo-app.firebasestorage.app",
  messagingSenderId: "1025750914441",
  appId: "1:1025750914441:web:6e9fc04514059625ae3d58",
  measurementId: "G-H72L0HS2TL",
};

// Check for Localhost / Dev Environment
const isLocalhost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

if (isLocalhost) {
  try {
    const secrets = await import("./utils/secrets.js");
    if (secrets.API_KEY_DEV) {
      console.log("[Firebase] Using DEV API Key");
      firebaseConfig.apiKey = secrets.API_KEY_DEV;
    }
  } catch (e) {
    console.warn(
      "[Firebase] Could not load secrets.js for localhost. Using Default Key.",
      e,
    );
  }
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log("Firebase Initialized");

export { auth, db };
