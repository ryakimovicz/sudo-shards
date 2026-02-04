import { getCurrentUser, logoutUser } from "./auth.js";
import { getCurrentLang } from "./i18n.js";
import { gameManager } from "./game-manager.js";
import { getRankData } from "./ranks.js";

export let currentViewDate = new Date();

export function initProfile() {
  console.log("Profile Module Loaded");

  // Calendar Listeners
  const prevBtn = document.getElementById("cal-prev-btn");
  const nextBtn = document.getElementById("cal-next-btn");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => changeMonth(-1));
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => changeMonth(1));
  }

  // Handle Initial Hash
  handleRouting();

  // Listen for Hash Changes
  window.addEventListener("hashchange", handleRouting);

  // Back Button
  const backBtn = document.getElementById("profile-back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      // Go back in history (simulating native back), or force home if no history
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.hash = "";
      }
    });
  }

  // Logout Button
  const logoutBtn = document.getElementById("btn-profile-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (confirm("¿Cerrar sesión?")) {
        await logoutUser();
        // Redirect to home/login after logout
        window.location.hash = "";
      }
    });
  }
}

// Router Handler
function handleRouting() {
  const hash = window.location.hash;

  if (hash === "#profile") {
    _showProfileUI();
  } else {
    _hideProfileUI();
  }
}

// Public method now just sets the hash
export function showProfile() {
  window.location.hash = "profile";
}

// Public method now just clears hash
export function hideProfile() {
  window.location.hash = "";
}

// Internal UI Manipulation
function _showProfileUI() {
  const section = document.getElementById("profile-section");
  const menu = document.getElementById("menu-content"); // Main Home Content
  // We might need to hide specific sections depending on what's active (home vs game)
  const gameSection = document.getElementById("game-section");
  // const appHeader = document.querySelector(".main-header"); // Corrected Selector

  if (section) section.classList.remove("hidden");

  // Hide everything else
  if (menu) menu.classList.add("hidden");
  if (gameSection) gameSection.classList.add("hidden");
  // if (appHeader) appHeader.classList.add("hidden");

  updateProfileData();

  // Update Header Button to Close Icon
  const btnStats = document.getElementById("btn-stats");
  if (btnStats) btnStats.textContent = "✕"; // Close Cross
}

function _hideProfileUI() {
  const section = document.getElementById("profile-section");
  const menu = document.getElementById("menu-content");
  // const appHeader = document.querySelector(".main-header");

  if (section) section.classList.add("hidden");

  // Restore Home (Or Game? Simple state for now: return to Home)
  // Ideally we track previous state, but Home is safe default.
  if (menu) menu.classList.remove("hidden");
  // if (appHeader) appHeader.classList.remove("hidden");

  // Restore Header Button to Stats Icon
  const btnStats = document.getElementById("btn-stats");
  if (btnStats) btnStats.textContent = "📊";
}

function updateProfileData() {
  const user = getCurrentUser();

  // If no user, maybe redirect? For now, show "Guest"
  const avatarEl = document.getElementById("profile-avatar");
  const nameEl = document.getElementById("profile-username");
  const emailEl = document.getElementById("profile-email");

  if (user) {
    const displayName = user.displayName || "Usuario";
    const initial = displayName.charAt(0).toUpperCase();

    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = user.email;
    if (avatarEl) {
      avatarEl.textContent = initial;
      avatarEl.style.backgroundColor = ""; // Reset
    }
  } else {
    // Guest
    if (nameEl) nameEl.textContent = "Invitado";
    if (emailEl) emailEl.textContent = "Sin cuenta";

    // Guest Avatar
    if (avatarEl) {
      avatarEl.textContent = "I";
      avatarEl.style.backgroundColor = "#94a3b8";
    }
  }

  // Stats from Global Storage
  const statsStr = localStorage.getItem("jigsudo_user_stats");
  const stats = statsStr
    ? JSON.parse(statsStr)
    : {
        totalPlayed: 0,
        wins: 0,
        currentStreak: 0,
        maxStreak: 0,
        currentRP: 0,
      };

  // 1. Basic Stats
  if (document.getElementById("stat-played"))
    document.getElementById("stat-played").textContent = stats.totalPlayed;
  if (document.getElementById("stat-streak"))
    document.getElementById("stat-streak").textContent = stats.currentStreak;
  if (document.getElementById("stat-max-streak"))
    document.getElementById("stat-max-streak").textContent = stats.maxStreak;

  // 2. Aggregate History Stats
  let maxScore = 0;
  let bestTime = Infinity;
  let totalTime = 0;
  let wonCount = 0;

  // Stage Accumulators
  const stageSums = {
    memory: 0,
    jigsaw: 0,
    sudoku: 0,
    peaks: 0,
    search: 0,
    code: 0,
  };
  const stageCounts = {
    memory: 0,
    jigsaw: 0,
    sudoku: 0,
    peaks: 0,
    search: 0,
    code: 0,
  };
  let totalPeaksErrors = 0;
  let peaksErrorCount = 0;

  if (stats.history) {
    Object.values(stats.history).forEach((day) => {
      if (day.score && day.score > maxScore) maxScore = day.score;

      if (day.totalTime && day.status === "won") {
        if (day.totalTime < bestTime) bestTime = day.totalTime;
        totalTime += day.totalTime;
        wonCount++;
      }

      if (day.stageTimes) {
        for (const [stage, time] of Object.entries(day.stageTimes)) {
          if (stageSums[stage] !== undefined && time > 0) {
            stageSums[stage] += time;
            stageCounts[stage]++;
          }
        }
      }

      if (day.peaksErrors !== undefined) {
        totalPeaksErrors += day.peaksErrors;
        peaksErrorCount++;
      }
    });
  }

  // Format Helper
  const fmtTime = (ms) => {
    if (ms === Infinity || ms === 0 || isNaN(ms)) return "--:--";
    const seq = Math.floor(ms / 1000);
    const m = Math.floor(seq / 60);
    const s = seq % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Set Values
  if (document.getElementById("stat-max-score"))
    document.getElementById("stat-max-score").textContent =
      maxScore.toLocaleString();
  if (document.getElementById("stat-best-time"))
    document.getElementById("stat-best-time").textContent =
      wonCount > 0 ? fmtTime(bestTime) : "--:--";
  if (document.getElementById("stat-avg-time"))
    document.getElementById("stat-avg-time").textContent =
      wonCount > 0 ? fmtTime(totalTime / wonCount) : "--:--";

  // Stage Averages
  if (document.getElementById("stat-avg-memory"))
    document.getElementById("stat-avg-memory").textContent = stageCounts.memory
      ? fmtTime(stageSums.memory / stageCounts.memory)
      : "--:--";
  if (document.getElementById("stat-avg-jigsaw"))
    document.getElementById("stat-avg-jigsaw").textContent = stageCounts.jigsaw
      ? fmtTime(stageSums.jigsaw / stageCounts.jigsaw)
      : "--:--";
  if (document.getElementById("stat-avg-sudoku"))
    document.getElementById("stat-avg-sudoku").textContent = stageCounts.sudoku
      ? fmtTime(stageSums.sudoku / stageCounts.sudoku)
      : "--:--";
  if (document.getElementById("stat-avg-search"))
    document.getElementById("stat-avg-search").textContent = stageCounts.search
      ? fmtTime(stageSums.search / stageCounts.search)
      : "--:--";
  if (document.getElementById("stat-avg-code"))
    document.getElementById("stat-avg-code").textContent = stageCounts.code
      ? fmtTime(stageSums.code / stageCounts.code)
      : "--:--";

  if (document.getElementById("stat-avg-peaks")) {
    const avgPeaksTime = stageCounts.peaks
      ? fmtTime(stageSums.peaks / stageCounts.peaks)
      : "--:--";
    const avgPeaksErr = peaksErrorCount
      ? (totalPeaksErrors / peaksErrorCount).toFixed(1)
      : "0";
    document.getElementById("stat-avg-peaks").textContent = avgPeaksTime;
    if (document.getElementById("stat-avg-peaks-err"))
      document.getElementById("stat-avg-peaks-err").textContent =
        `(${avgPeaksErr} err)`;
  }

  // Rank UI
  const currentRP = stats.currentRP || 0;
  const rankData = getRankData(currentRP);

  const rankIconEl = document.getElementById("profile-rank-icon");
  const rankNameEl = document.getElementById("profile-rank-name");
  const rankLevelEl = document.getElementById("profile-rank-level");
  const progressFill = document.getElementById("profile-rank-progress");
  const rpCurrentEl = document.getElementById("profile-rp-current");
  const rpNextEl = document.getElementById("profile-rp-next");

  if (rankIconEl) rankIconEl.textContent = rankData.rank.icon;
  if (rankNameEl) rankNameEl.textContent = rankData.rank.name;
  if (rankLevelEl) rankLevelEl.textContent = `Nvl. ${rankData.level}`;

  if (progressFill) progressFill.style.width = `${rankData.progress}%`;

  if (rpCurrentEl) rpCurrentEl.textContent = currentRP.toLocaleString();
  if (rpNextEl) {
    // If max rank, show infinite or current
    const nextGoal = rankData.nextRank ? rankData.nextRank.minRP : "MAX";
    rpNextEl.textContent =
      typeof nextGoal === "number" ? nextGoal.toLocaleString() : nextGoal;
  }

  // 3. Render Calendar
  renderCalendar(stats.history || {});
}

function changeMonth(delta) {
  const target = new Date(
    currentViewDate.getFullYear(),
    currentViewDate.getMonth() + delta,
    1,
  );
  const today = new Date();

  // Reset time for fair comparison
  target.setHours(0, 0, 0, 0);
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // If target is in the future relative to current month start, block it
  if (target > currentMonthStart) {
    return;
  }

  currentViewDate = target;
  updateProfileData();
}

function renderCalendar(history = {}) {
  const grid = document.getElementById("calendar-grid");
  const label = document.getElementById("cal-month-label");
  if (!grid) {
    console.error("Calendar Grid Element NOT FOUND");
    return;
  }

  // Ensure we are not stacking
  while (grid.firstChild) {
    grid.removeChild(grid.firstChild);
  }

  // Fallback dates
  if (!currentViewDate || isNaN(currentViewDate.getTime())) {
    console.warn("Recovering currentViewDate");
    currentViewDate = new Date();
  }

  console.log(
    "Rendering Calendar ->",
    currentViewDate.toLocaleDateString(),
    "History Keys:",
    history ? Object.keys(history).length : 0,
  );

  try {
    // Validate Date
    if (isNaN(currentViewDate.getTime())) {
      console.error("Invalid View Date, resetting");
      currentViewDate = new Date();
    }

    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();

    // Update Label (Safe Locale)
    let locale = "es-ES";
    try {
      locale = getCurrentLang() || "es-ES";
    } catch (e) {
      console.warn("Locale fetch failed", e);
    }

    let monthName = "Mes";
    try {
      monthName = new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(currentViewDate);
    } catch (err) {
      monthName = currentViewDate.toDateString(); // Extreme fallback
    }

    // Days in Month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    if (label) {
      label.textContent =
        monthName.charAt(0).toUpperCase() + monthName.slice(1);
    }

    // Headers (D L M X J V S)
    const headers = ["D", "L", "M", "X", "J", "V", "S"];
    headers.forEach((h) => {
      const el = document.createElement("div");
      el.className = "calendar-day header-day";
      el.innerText = h; // Use innerText to ensuring rendering
      grid.appendChild(el);
    });

    // Padding Days
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement("div");
      empty.className = "calendar-day empty";
      grid.appendChild(empty);
    }

    // Real Days
    for (let d = 1; d <= daysInMonth; d++) {
      const dayEl = document.createElement("div");
      dayEl.className = "calendar-day";
      dayEl.textContent = d;

      // Check Status
      // Format YYYY-MM-DD
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

      if (history && history[dateStr]) {
        if (history[dateStr].status === "won") {
          dayEl.classList.add("win");
        } else {
          dayEl.classList.add("loss");
        }
      }

      grid.appendChild(dayEl);
    }
  } catch (e) {
    console.error("Calendar Error:", e);
    grid.innerHTML =
      "<div style='color:red; grid-column: 1/-1;'>Error cargando calendario</div>";
  }
}
