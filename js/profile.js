import { getCurrentUser, logoutUser } from "./auth.js";
import { getCurrentLang, updateTexts } from "./i18n.js";
import { translations } from "./translations.js";
import { gameManager } from "./game-manager.js";
import { getRankData, calculateRP } from "./ranks.js";
import { formatTime } from "./ui.js";

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

  // Listen for Language Changes to re-render Profile (Rank, Calendar, etc.)
  window.addEventListener("languageChanged", () => {
    if (window.location.hash === "#profile") {
      updateProfileData();
    }
  });

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

  // Share Stats Button
  const shareBtn = document.getElementById("btn-share-stats");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => handleShareStats());
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

  // Optimized Cache Strategy (Only use cache if it has stage data)
  const hasCache =
    stats.stageTimesAccumulated &&
    Object.keys(stats.stageTimesAccumulated).length > 0 &&
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

  const fmtTime = (ms) => formatTime(ms);

  // Helper for consistent localized numbers (e.g. 9,50 in AR vs 9.50 in US)
  const fmtNumber = (num, decimals = 2) => {
    if (num === undefined || num === null) return "0";
    // Sync with Game Language (es -> es-ES, en -> en-US)
    const lang = getCurrentLang() || "es";
    return num.toLocaleString(lang, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  console.log("[Profile] Stage Sums:", stageSums);
  console.log("[Profile] Stage Counts:", stageCounts);

  // Set Values
  if (document.getElementById("stat-max-score")) {
    const bScore = stats.bestScore;
    document.getElementById("stat-max-score").textContent =
      bScore !== undefined && bScore > 0
        ? fmtNumber(bScore, 3)
        : fmtNumber(calculateRP(maxScore), 3);
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
  if (rankNameEl) {
    let lang = getCurrentLang() || "es";
    // Safety: Ensure we use 'es' if 'es-ES' is passed and not found
    if (!translations[lang]) lang = lang.split("-")[0];

    // Safety: Ensure we use 'es' if 'es-ES' is passed and not found
    if (!translations[lang]) lang = lang.split("-")[0];

    if (translations[lang] && translations[lang][rankData.rank.nameKey]) {
      rankNameEl.textContent = translations[lang][rankData.rank.nameKey];
    } else {
      rankNameEl.textContent = rankData.rank.nameKey;
    }
  }

  if (rankLevelEl) {
    const lang = getCurrentLang() || "es";
    const prefix = translations[lang]?.rank_level_prefix || "Nvl.";
    rankLevelEl.textContent = `${prefix} ${rankData.level}`;
  }

  if (progressFill) progressFill.style.width = `${rankData.progress}%`;

  if (rpCurrentEl) rpCurrentEl.textContent = fmtNumber(currentRP, 3);
  if (rpNextEl) {
    // If max rank, show infinite or current
    const nextGoal = rankData.nextRank ? rankData.nextRank.minRP : "MAX";
    rpNextEl.textContent =
      typeof nextGoal === "number" ? fmtNumber(nextGoal, 0) : nextGoal;
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

  // 5. Force UI Text Update (for static translations like Buttons/Headers)
  updateTexts();
}

function renderWeekdayStats(stats) {
  const container = document.getElementById("daily-time-chart");
  if (!container) return;

  container.innerHTML = "";

  const history = stats.history || {};
  const cache = stats.weekdayStatsAccumulated;

  // Dynamic Day Labels based on Locale
  const lang = getCurrentLang() || "es";
  // Generate [Mon, Tue, ...] letters
  // Start from Sunday? Existing logic assumes 0=Sun (Date.getDay)
  // Let's generate standard week starting Sunday?
  // We need 7 days starting from a known Sunday.
  // Jan 5 2025 is a Sunday.
  const formatter = new Intl.DateTimeFormat(lang, { weekday: "narrow" });

  let days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2025, 0, 5 + i); // Sun, Mon...
    const label = formatter.format(d).toUpperCase();
    days.push({ label, sum: 0, count: 0, sumErrors: 0, sumScore: 0 });
  }

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
      // Changed to >= 0 to include debug/instant wins
      if (data.status === "won" && data.totalTime >= 0) {
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
    const lang = getCurrentLang() || "es";
    const msg = translations[lang]?.no_data || "Sin datos suficientes";
    container.innerHTML = `<div style="color: #888; padding: 20px; text-align: center; grid-column: 1/-1;">${msg}</div>`;
    return;
  }

  // Render Cards
  // Generate Day Names dynamically (Sunday...Saturday)
  const formatterLong = new Intl.DateTimeFormat(lang, { weekday: "long" });
  const dayNames = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2025, 0, 5 + i); // Sun...Sat
    let name = formatterLong.format(d);
    name = name.charAt(0).toUpperCase() + name.slice(1);
    dayNames.push(name);
  }

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
    let timeStr = formatTime(avgTime);
    const timeCol = createMetricCol("⏱️", timeStr, "Tiempo Promedio");

    // B. Errors
    const avgErrors = d.count > 0 ? d.sumErrors / d.count : 0;
    const errorStr = d.count > 0 ? avgErrors.toFixed(1) : "--";
    const errorCol = createMetricCol("❌", errorStr, "Errores Promedio");

    // C. Score
    // Calculate raw avg first, then convert to RP scale? Or convert each?
    // Conversion is linear, so avg(RP) == convert(avg(Score))
    const avgScoreRaw = d.count > 0 ? d.sumScore / d.count : 0;
    const avgScoreRP = d.count > 0 ? calculateRP(avgScoreRaw).toFixed(3) : "--";
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
    const headers = [];
    const isEnglish = locale.startsWith("en");
    // EN: "short" -> "Sun", "Mon" -> Slice(0,2) -> "Su", "Mo"
    // ES: "narrow" -> "D", "L", "M"
    const formatterHeaders = new Intl.DateTimeFormat(locale, {
      weekday: isEnglish ? "short" : "narrow",
    });

    for (let i = 0; i < 7; i++) {
      // Start from Sunday (Jan 5 2025)
      const d = new Date(2025, 0, 5 + i);
      let dayName = formatterHeaders.format(d).toUpperCase();
      if (isEnglish) dayName = dayName.slice(0, 2);
      headers.push(dayName);
    }

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

async function handleShareStats() {
  const card = document.getElementById("stats-social-card");
  if (!card) return;

  // html2canvas is loaded via CDN in index.html, it should be global
  if (typeof html2canvas === "undefined") {
    console.error("html2canvas not loaded");
    const { showToast } = await import("./ui.js");
    showToast("Error: html2canvas no está cargado ❌");
    return;
  }

  try {
    const { showToast } = await import("./ui.js");
    showToast("Generando imagen... ⏳");

    // Ensure everything is translated for the card (in case it was hidden)
    updateTexts();

    const lang = getCurrentLang();
    const t = translations[lang] || translations["es"];
    const user = getCurrentUser();

    // 1. Populate Header & Basic Stats
    const logoContainer = document.getElementById("sc-logo-container");
    const usernameEl = document.getElementById("sc-username");
    const rankEl = document.getElementById("sc-rank");
    const dateEl = document.getElementById("sc-date");
    const playedEl = document.getElementById("sc-stat-played");
    const rpEl = document.getElementById("sc-stat-rp");
    const streakEl = document.getElementById("sc-stat-streak");

    // Handle Logo Injection (Inlined for reliability)
    if (logoContainer) {
      const isDarkMode = document.body.classList.contains("dark-mode");
      const svgLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="216.831" y="128.255">1</text><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="166.576" y1="-1.106" x2="166.718" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="333.588" y1="-1.106" x2="333.436" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="0" y1="167.339" x2="500.154" y2="166.718"/><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="0" y1="333.479" x2="500.154" y2="333.436"/><text style="fill: rgb(24, 91, 147); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="49.191" y="125.381">J</text><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="381.02" y="125.859">6</text><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="31.317" y="302.394">5</text><text style="fill: rgb(24, 91, 147); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="204.759" y="302.394">U</text><text style="fill: rgb(24, 91, 147); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="198.205" y="479.26">D</text><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="381.95" y="479.26">0</text></svg>`;
      const svgDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="216.831" y="128.255">1</text><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="166.576" y1="-1.106" x2="166.718" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="333.588" y1="-1.106" x2="333.436" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="0" y1="167.339" x2="500.154" y2="166.718"/><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="0" y1="333.479" x2="500.154" y2="333.436"/><text style="fill: rgb(58, 136, 201); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="49.191" y="125.381">J</text><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="381.02" y="125.859">6</text><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="31.317" y="302.394">5</text><text style="fill: rgb(58, 136, 201); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="204.759" y="302.394">U</text><text style="fill: rgb(58, 136, 201); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="198.205" y="479.26">D</text><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="381.95" y="479.26">0</text></svg>`;
      logoContainer.innerHTML = isDarkMode ? svgDark : svgLight;
    }

    if (usernameEl)
      usernameEl.textContent = user
        ? user.displayName || t.user_default || "Usuario"
        : t.guest || "Invitado";

    const statsStr = localStorage.getItem("jigsudo_user_stats");
    const stats = statsStr
      ? JSON.parse(statsStr)
      : { history: {}, totalPlayed: 0, currentStreak: 0, currentRP: 0 };

    // RECALCULATE averages for the social card to ensure consistency
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

    if (stats.history) {
      Object.values(stats.history).forEach((day) => {
        if (day.stageTimes && day.status === "won") {
          for (const [stage, time] of Object.entries(day.stageTimes)) {
            if (stageSums[stage] !== undefined && time > 0) {
              stageSums[stage] += time;
              stageCounts[stage]++;
            }
          }
        }
      });
    }
    stats.avgTimesPerStage = {};
    for (const s in stageSums) {
      stats.avgTimesPerStage[s] = {
        sumTime: stageSums[s],
        count: stageCounts[s],
      };
    }
    // Also need errors for peaks
    let totalPeaksErrors = 0;
    let peaksErrorCount = 0;
    if (stats.history) {
      Object.values(stats.history).forEach((day) => {
        if (day.status === "won" && day.peaksErrors !== undefined) {
          totalPeaksErrors += day.peaksErrors;
          peaksErrorCount++;
        }
      });
    }
    if (stats.avgTimesPerStage.peaks) {
      stats.avgTimesPerStage.peaks.sumErrors = totalPeaksErrors;
    }

    if (rankEl) {
      const rankData = getRankData(stats.currentRP || 0);
      const rankKey = rankData.rank.nameKey;
      rankEl.textContent = t[rankKey] || rankKey;
    }

    if (dateEl) {
      const locale = t.date_locale || "es-ES";
      dateEl.textContent = new Date().toLocaleDateString(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }

    if (playedEl) playedEl.textContent = stats.totalPlayed || 0;
    if (rpEl)
      rpEl.textContent = (stats.currentRP || 0).toLocaleString(lang, {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      });
    if (streakEl) streakEl.textContent = stats.currentStreak || 0;

    // Set Global Average Time (calculated from history)
    const avgTimeEl = document.getElementById("sc-stat-avg-time-all");
    if (avgTimeEl) {
      let totalTime = 0;
      let wonCount = 0;
      if (stats.history) {
        Object.values(stats.history).forEach((h) => {
          if (h.status === "won" && h.totalTime > 0) {
            totalTime += h.totalTime;
            wonCount++;
          }
        });
      }
      avgTimeEl.textContent =
        wonCount > 0 ? formatTime(totalTime / wonCount) : "--:--";
    }

    // 2. Populate Stage Times (Average) - REDESIGNED as Cards
    const stageList = document.getElementById("sc-stage-list");
    if (stageList) {
      stageList.innerHTML = "";
      const lang = getCurrentLang() || "es";

      const stages = [
        { id: "p_game_memory", key: "memory" },
        { id: "p_game_jigsaw", key: "jigsaw" },
        { id: "p_game_sudoku", key: "sudoku" },
        { id: "p_game_peaks", key: "peaks" },
        { id: "p_game_search", key: "search" },
        { id: "p_game_code", key: "code" },
      ];

      stages.forEach((st) => {
        const d = stats.avgTimesPerStage && stats.avgTimesPerStage[st.key];
        const label = translations[lang][st.id] || st.id;
        const card = document.createElement("div");
        card.className = "sc-stage-item";

        let statsHtml = "";
        if (d && d.count > 0) {
          const avgTime = d.sumTime / d.count;
          statsHtml = `
            <div class="sc-mini-stat">
              <span class="sc-mini-icon">⏱️</span>
              <span class="sc-mini-val">${formatTime(avgTime)}</span>
            </div>
          `;
          // Add Errors for Picos y Valles
          if (st.key === "peaks") {
            const avgErrors =
              d.sumErrors !== undefined ? d.sumErrors / d.count : 0;
            statsHtml += `
              <div class="sc-mini-stat">
                <span class="sc-mini-icon">❌</span>
                <span class="sc-mini-val">${avgErrors.toFixed(1)}</span>
              </div>
            `;
          }
        } else {
          statsHtml = `<span class="sc-mini-val">--:--</span>`;
        }

        card.innerHTML = `
          <span class="sc-item-label">${label}</span>
          <div class="sc-item-stats">${statsHtml}</div>
        `;
        stageList.appendChild(card);
      });
    }

    // 3. Populate Weekday Stats Chart - REDESIGNED as Cards
    renderSocialWeekdayStats(stats);

    // 4. Capture
    // Increased delay to 500ms to ensure all assets (logos) and layouts settle
    await new Promise((r) => setTimeout(r, 500));

    const canvas = await html2canvas(card, {
      backgroundColor:
        getComputedStyle(document.body).getPropertyValue("--bg-paper") ||
        "#f8fafc",
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: 1080,
      windowHeight: 1920,
    });

    // 6. Share or Download
    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const dateStr = new Date().toISOString().split("T")[0];
      const fallbackName = user
        ? t.user_default || "Usuario"
        : t.guest || "Invitado";
      const nameClean = (user ? user.displayName || fallbackName : fallbackName)
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase();
      const fileName = `jigsudo-stats-${nameClean}-${dateStr}.png`;

      const file = new File([blob], fileName, { type: "image/png" });
      const shareData = {
        title: "Resumen Jigsudo",
        text: t.share_stats_msg || "¡Mira mi progreso en Jigsudo! 🧩✨",
        url: "https://jigsudo.com",
        files: [file],
      };

      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        );

      if (
        isMobile &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share(shareData);
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error("Share failed:", err);
            downloadFallback(canvas, fileName);
          }
        }
      } else {
        // Desktop or unsupported: Direct download
        downloadFallback(canvas, fileName);
      }
    }, "image/png");
  } catch (err) {
    console.error("Failed to generate social card:", err);
    const { showToast } = await import("./ui.js");
    showToast("Error al generar la imagen ❌");
  }
}

function renderSocialWeekdayStats(stats) {
  const container = document.getElementById("sc-weekday-chart");
  if (!container) return;
  container.innerHTML = "";

  const lang = getCurrentLang() || "es";
  const formatter = new Intl.DateTimeFormat(lang, { weekday: "long" });
  const cache = stats.weekdayStatsAccumulated;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2025, 0, 5 + i);
    let label = formatter.format(d);
    label = label.charAt(0).toUpperCase() + label.slice(1);
    days.push({ label, sumTime: 0, sumScore: 0, sumErrors: 0, count: 0 });
  }

  if (cache) {
    for (let i = 0; i < 7; i++) {
      if (cache[i] && cache[i].count > 0) {
        days[i].sumTime = cache[i].sumTime || 0;
        days[i].sumScore = cache[i].sumScore || 0;
        days[i].sumErrors = cache[i].sumErrors || 0;
        days[i].count = cache[i].count;
      }
    }
  }

  days.forEach((d) => {
    const card = document.createElement("div");
    card.className = "sc-weekday-item";

    const avgTime = d.count > 0 ? d.sumTime / d.count : 0;
    const avgErrors = d.count > 0 ? d.sumErrors / d.count : 0;
    const avgScoreRaw = d.count > 0 ? d.sumScore / d.count : 0;
    const avgScoreRP = d.count > 0 ? calculateRP(avgScoreRaw) : 0;

    card.innerHTML = `
      <span class="sc-item-label">${d.label}</span>
      <div class="sc-item-stats">
        <div class="sc-mini-stat">
          <span class="sc-mini-icon">⏱️</span>
          <span class="sc-mini-val">${formatTime(avgTime)}</span>
        </div>
        <div class="sc-mini-stat">
          <span class="sc-mini-icon">❌</span>
          <span class="sc-mini-val">${d.count > 0 ? avgErrors.toFixed(1) : "0"}</span>
        </div>
        <div class="sc-mini-stat">
          <span class="sc-mini-icon">⭐</span>
          <span class="sc-mini-rp">${avgScoreRP.toLocaleString(lang, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function downloadFallback(canvas, fileName = "jigsudo-stats.png") {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.click();
}
