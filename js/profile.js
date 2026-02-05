import { getCurrentUser, logoutUser } from "./auth.js";
import { getCurrentLang } from "./i18n.js";
import { gameManager } from "./game-manager.js";
import { getRankData, calculateRP } from "./ranks.js";

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

  // Logout Button handled in auth.js via onclick/modal overrides
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

export function updateProfileData() {
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

  // Explicitly manage Actions visibility to prevent Guest leaks
  const profileActions = document.querySelector(".profile-actions");
  const guestActions = document.querySelector(".guest-actions");

  // Debug Log
  console.log("UpdateProfileData User:", user ? user.uid : "Guest");

  if (profileActions) {
    if (user) {
      profileActions.classList.remove("hidden");
      profileActions.style.display = "";

      if (guestActions) {
        guestActions.classList.add("hidden");
        guestActions.style.display = "none";
      }
    } else {
      profileActions.classList.add("hidden");
      profileActions.style.display = "none";

      if (guestActions) {
        guestActions.classList.remove("hidden");
        guestActions.style.display = "";
      }
    }
  }

  // Double Check: Hide individual buttons if guest (Nuclear Option)
  const sensitiveButtons = [
    "btn-profile-change-name",
    "btn-profile-change-pw",
    "btn-profile-logout",
    "btn-profile-delete",
  ];

  sensitiveButtons.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      if (user) {
        btn.style.display = ""; // Reset
        btn.closest(".profile-actions").classList.remove("hidden"); // Ensure parent is shown if user exists
      } else {
        btn.style.display = "none"; // Hide element
      }
    }
  });
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

  // Optimized Cache Strategy
  const hasCache =
    stats.stageTimesAccumulated !== undefined &&
    stats.totalTimeAccumulated !== undefined;

  if (hasCache) {
    // O(1) Access!
    bestTime = stats.bestTime || Infinity;
    totalTime = stats.totalTimeAccumulated || 0;
    wonCount = stats.wins || 0;
    totalPeaksErrors = stats.totalPeaksErrorsAccumulated || 0;
    peaksErrorCount = stats.wins || 0;

    for (const [stage, time] of Object.entries(stats.stageTimesAccumulated)) {
      if (stageSums[stage] !== undefined) {
        stageSums[stage] = time;
        stageCounts[stage] = stats.stageWinsAccumulated?.[stage] || 0;
      }
    }
  } else if (stats.history) {
    // Fallback: O(n) iteration for legacy data
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
  if (document.getElementById("stat-max-score")) {
    const bScore = stats.bestScore;
    document.getElementById("stat-max-score").textContent =
      bScore !== undefined && bScore > 0
        ? bScore.toFixed(2)
        : calculateRP(maxScore).toFixed(2);
  }

  if (document.getElementById("stat-best-time"))
    document.getElementById("stat-best-time").textContent =
      wonCount > 0 || bestTime !== Infinity ? fmtTime(bestTime) : "--:--";

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
  try {
    renderCalendar(stats.history || {});
  } catch (e) {
    console.error("Calendar Render Error:", e);
  }

  // 4. Render Weekday Stats
  try {
    renderWeekdayStats(stats);
  } catch (e) {
    console.error("Weekday Stats Render Error:", e);
  }
}

function renderWeekdayStats(stats) {
  const container = document.getElementById("daily-time-chart");
  if (!container) return;

  container.innerHTML = "";

  const history = stats.history || {};
  const cache = stats.weekdayStatsAccumulated;

  // 0=Sun, 1=Mon ... 6=Sat
  let days = [
    { label: "D", sum: 0, count: 0, sumErrors: 0, sumScore: 0 },
    { label: "L", sum: 0, count: 0, sumErrors: 0, sumScore: 0 },
    { label: "M", sum: 0, count: 0, sumErrors: 0, sumScore: 0 },
    { label: "X", sum: 0, count: 0, sumErrors: 0, sumScore: 0 },
    { label: "J", sum: 0, count: 0, sumErrors: 0, sumScore: 0 },
    { label: "V", sum: 0, count: 0, sumErrors: 0, sumScore: 0 },
    { label: "S", sum: 0, count: 0, sumErrors: 0, sumScore: 0 },
  ];

  let hasData = false;

  if (cache) {
    // Use Optimization Cache
    for (let i = 0; i < 7; i++) {
      if (cache[i] && cache[i].count > 0) {
        days[i].sum = cache[i].sumTime;
        days[i].sumErrors = cache[i].sumErrors;
        days[i].sumScore = cache[i].sumScore;
        days[i].count = cache[i].count;
        hasData = true;
      }
    }
  } else {
    // Fallback to History Iteration
    Object.entries(history).forEach(([dateStr, data]) => {
      if (data.status === "won" && data.totalTime > 0) {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
          const [y, m, d] = parts.map(Number);
          const date = new Date(y, m - 1, d);
          const dayIdx = date.getDay(); // 0-6

          if (!isNaN(dayIdx)) {
            days[dayIdx].sum += data.totalTime;
            days[dayIdx].sumErrors += data.peaksErrors || 0;
            days[dayIdx].sumScore += data.score || 0;
            days[dayIdx].count++;
            hasData = true;
          }
        }
      }
    });
  }

  if (!hasData) {
    container.innerHTML =
      "<div style='color: #888; padding: 20px; text-align: center; grid-column: 1/-1;'>Sin datos suficientes</div>";
    return;
  }

  // Render Cards
  const dayNames = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];

  days.forEach((d, i) => {
    const card = document.createElement("div");
    card.className = "daily-stat-card";

    // 1. Title (Day Name)
    const lbl = document.createElement("div");
    lbl.className = "daily-stat-label";
    lbl.textContent = dayNames[i];
    card.appendChild(lbl);

    // 2. Metrics Grid (3 Cols)
    const metricsGrid = document.createElement("div");
    metricsGrid.className = "daily-metrics-grid";

    // A. Time
    const avgTime = d.count > 0 ? d.sum / d.count : 0;
    let timeStr = "--";
    if (d.count > 0) {
      const seq = Math.floor(avgTime / 1000);
      const m = Math.floor(seq / 60);
      const s = seq % 60;
      timeStr = `${m}:${s.toString().padStart(2, "0")}`;
    }
    const timeCol = createMetricCol("⏱️", timeStr, "Tiempo Promedio");

    // B. Errors
    const avgErrors = d.count > 0 ? d.sumErrors / d.count : 0;
    const errorStr = d.count > 0 ? avgErrors.toFixed(1) : "--";
    const errorCol = createMetricCol("❌", errorStr, "Errores Promedio");

    // C. Score
    // Calculate raw avg first, then convert to RP scale? Or convert each?
    // Conversion is linear, so avg(RP) == convert(avg(Score))
    const avgScoreRaw = d.count > 0 ? d.sumScore / d.count : 0;
    const avgScoreRP = d.count > 0 ? calculateRP(avgScoreRaw).toFixed(2) : "--";
    const scoreCol = createMetricCol("⭐", avgScoreRP, "Puntaje Promedio");

    metricsGrid.appendChild(timeCol);
    metricsGrid.appendChild(errorCol);
    metricsGrid.appendChild(scoreCol);

    card.appendChild(metricsGrid);
    container.appendChild(card);
  });
}

function createMetricCol(icon, value, title) {
  const el = document.createElement("div");
  el.className = "metric-col";
  el.title = title;
  el.innerHTML = `
        <span class="metric-icon">${icon}</span>
        <span class="metric-val">${value}</span>
    `;
  return el;
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
