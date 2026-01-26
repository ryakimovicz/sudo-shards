/* Web Worker for Search Sequence Generation */
import { generateSearchSequences } from "./search-gen.js";

self.onmessage = function (e) {
  const { board, seed, debugMode } = e.data;

  // Mock global CONFIG for the generator if needed, or pass it down
  // Since search-gen imports CONFIG, we might need to handle that dependency.
  // Actually, Web Workers support module imports, so imports inside search-gen will resolve relative to it.
  // But config.js might validly export an object.

  if (debugMode) {
    console.log("[Worker] Start Search Generation...");
  }

  try {
    // Run generation with extended timeout allowed by worker context
    const sequences = generateSearchSequences(board, seed, 60000); // Pass maxDuration if supported

    self.postMessage({ status: "success", sequences });
  } catch (err) {
    console.error("[Worker] Generation Failed:", err);
    self.postMessage({ status: "error", message: err.message });
  }
};
