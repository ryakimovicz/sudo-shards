/**
 * Mulberry32 - Seeded Pseudo-Random Number Generator
 * @param {number} seed - Integer seed
 * @returns {function} - Returns a random number between 0 and 1
 */
export function createGenerator(seed) {
  return function () {
    var t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a unique seed based on the user's local date (YYYYMMDD)
 * @returns {number} - The daily seed (e.g., 20260118)
 */
export function getDailySeed() {
  const today = new Date();
  // Format: YYYYMMDD
  return (
    today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
  );
}
