export const RANKS = [
  { id: 0, nameKey: "rank_0", minRP: 0, icon: "🌱" },
  { id: 1, nameKey: "rank_1", minRP: 20, icon: "🥚" }, // ~2 días (2x10)
  { id: 2, nameKey: "rank_2", minRP: 70, icon: "🔨" }, // ~1 semana (7x10)
  { id: 3, nameKey: "rank_3", minRP: 180, icon: "📚" }, // ~2.5 semanas
  { id: 4, nameKey: "rank_4", minRP: 350, icon: "📈" }, // ~1.5 meses
  { id: 5, nameKey: "rank_5", minRP: 600, icon: "🧩" }, // ~2 meses
  { id: 6, nameKey: "rank_6", minRP: 900, icon: "♟️" }, // ~3 meses
  { id: 7, nameKey: "rank_7", minRP: 1200, icon: "🎖️" }, // ~4 meses
  { id: 8, nameKey: "rank_8", minRP: 1500, icon: "🎓" }, // ~5 meses
  { id: 9, nameKey: "rank_9", minRP: 1800, icon: "🥋" }, // ~6 meses
  { id: 10, nameKey: "rank_10", minRP: 2100, icon: "🦉" }, // ~7 meses
  { id: 11, nameKey: "rank_11", minRP: 2400, icon: "📜" },
  { id: 12, nameKey: "rank_12", minRP: 2700, icon: "👁️" },
  { id: 13, nameKey: "rank_13", minRP: 3000, icon: "✨" },
  { id: 14, nameKey: "rank_14", minRP: 3300, icon: "🔮" },
  { id: 15, nameKey: "rank_15", minRP: 3650, icon: "🌌" }, // ~1 año (365x10)
];

export const SCORING = {
  SECONDS_IN_DAY: 86400, // 24 * 60 * 60
  MAX_BONUS: 6.0,
  ERROR_PENALTY_RP: 0.5,
  MISSED_DAY_RP: 3,

  PARTIAL_RP: {
    memory: 0.5,
    jigsaw: 1.0,
    sudoku: 1.0,
    peaks: 0.5,
    search: 0.5,
    code: 0.5,
  },
};

/**
 * Calculates Time Bonus: Linear decay from 6.0 to 0 over 24 hours.
 */
export function calculateTimeBonus(totalSeconds) {
  const decayPerSecond = SCORING.MAX_BONUS / SCORING.SECONDS_IN_DAY;
  const penalty = totalSeconds * decayPerSecond;
  const bonus = SCORING.MAX_BONUS - penalty;
  // Return raw precision for Leaderboard sorting (e.g. 5.123414)
  return Math.max(0, Math.min(SCORING.MAX_BONUS, bonus));
}

/**
 * Helper to ensure float precision
 */
export function calculateRP(score) {
  return Number(score.toFixed(3));
}

/**
 * Get Rank Info based on Total RP
 * @param {number} currentRP
 * @returns {object} { rank, nextRank, progress, currentLevel }
 */
export function getRankData(currentRP) {
  // 1. Find Current Rank
  let rankIndex = RANKS.findIndex((r) => currentRP < r.minRP) - 1;
  // If undefined (too low? impossible with minRP 0) or max rank
  if (rankIndex < 0) rankIndex = RANKS.length - 1; // Highest rank if not found "below"

  // Correction: findIndex returns -1 if NO item matches (e.g. currentRP 9999999 > all minRPs)
  // Logic: "Find the first one I am NOT smaller than"? No.
  // "Find the last one where currentRP >= minRP"
  // Safer loop:
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (currentRP >= RANKS[i].minRP) {
      idx = i;
    } else {
      break;
    }
  }

  const current = RANKS[idx];
  const next = RANKS[idx + 1] || null;

  // 2. Progress Percentage
  let progress = 0;
  if (next) {
    const range = next.minRP - current.minRP;
    const gained = currentRP - current.minRP;
    progress = Math.min(100, Math.floor((gained / range) * 100));
  } else {
    progress = 100; // Max Rank
  }

  // 3. "Level" (Vanity Metric: Total RP / 1000 or just raw wins?)
  // Let's use RP / 1000 as "Level" for cleaner display
  // "Level 42" means 42,000 RP
  const level = Math.floor(currentRP / 1000);

  return {
    rank: current,
    nextRank: next,
    progress: progress,
    level: level,
  };
}
