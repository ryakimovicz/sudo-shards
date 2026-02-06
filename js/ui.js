import { translations } from "./translations.js";
import { getCurrentLang, updateTexts } from "./i18n.js";
import { getCurrentUser } from "./auth.js";
import { getRankData } from "./ranks.js";

export function showToast(message, duration = 3000) {
  let container = document.getElementById("toast-container");

  // Create container if missing
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  // Create Toast Element
  const toast = document.createElement("div");
  toast.className = "toast-notification";
  toast.textContent = message;

  container.appendChild(toast);

  // Animate In
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  // Remove after duration
  setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, duration);
}

export function formatTime(ms) {
  if (ms === undefined || ms === null || isNaN(ms) || ms === Infinity) {
    return "--:--";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
}

export function showVictorySummary(stats, isHome = false) {
  if (!stats) return;

  const modal = document.getElementById("victory-summary-modal");
  const timeEl = document.getElementById("victory-total-time");
  const streakEl = document.getElementById("victory-streak");
  const errorsEl = document.getElementById("victory-errors");
  const scoreEl = document.getElementById("victory-score");
  const stageTimesContainer = document.getElementById("victory-stage-times");
  const btnHome = document.getElementById("btn-victory-home");

  if (!modal) return;

  const lang = getCurrentLang();

  // Update button text based on mode
  if (btnHome) {
    const btnKey = isHome ? "btn_close" : "btn_back_home";
    btnHome.dataset.i18n = btnKey;
    btnHome.textContent =
      translations[lang][btnKey] || (isHome ? "Cerrar" : "Volver al Inicio");
  }

  // Populating main stats
  if (timeEl) timeEl.textContent = formatTime(stats.totalTime);
  if (streakEl) streakEl.textContent = stats.streak || "1";
  if (errorsEl) errorsEl.textContent = stats.errors || "0";
  if (scoreEl) scoreEl.textContent = `+${stats.score.toFixed(3)}`;

  // Populating breakdown
  if (stageTimesContainer) {
    stageTimesContainer.innerHTML = "";

    // Ordered categories for display
    const stages = [
      { key: "memory", icon: "🧠" },
      { key: "jigsaw", icon: "🧩" },
      { key: "sudoku", icon: "🔢" },
      { key: "peaks", icon: "⛰️" },
      { key: "search", icon: "🔍" },
      { key: "code", icon: "📟" },
    ];

    stages.forEach((stage) => {
      const timeMs = stats.stageTimes[stage.key] || 0;
      const stageName = translations[lang].stage_names[stage.key] || stage.key;

      const row = document.createElement("div");
      row.className = "stage-time-row";
      row.innerHTML = `
        <span class="stage-name">${stage.icon} ${stageName}</span>
        <span class="stage-val">${formatTime(timeMs)}</span>
      `;
      stageTimesContainer.appendChild(row);
    });
  }

  // Share Button Logic
  const shareBtn = document.getElementById("btn-victory-share");
  if (shareBtn) {
    shareBtn.onclick = () => handleShareVictory(stats);
  }

  // Home Button Logic
  if (btnHome) {
    btnHome.onclick = async () => {
      modal.classList.add("hidden");

      if (!isHome) {
        // Clear ranking cache to ensure fresh data on reload
        try {
          const { clearRankingCache } = await import("./ranking.js");
          clearRankingCache();
        } catch (err) {
          console.warn("Failed to clear ranking cache:", err);
        }

        window.location.reload(); // Simplest way to go back to Home state
      }
    };
  }

  // Show Modal
  modal.classList.remove("hidden");
}

async function handleShareVictory(stats) {
  const card = document.getElementById("victory-social-card");
  if (!card) return;

  try {
    showToast("Generando imagen... ⏳");

    // Ensure everything is translated for the card
    updateTexts();

    const lang = getCurrentLang();
    const t = translations[lang] || translations["es"];
    const user = getCurrentUser();

    // 1. Populate Header
    const logoContainer = document.getElementById("vsc-logo-container");
    const usernameEl = document.getElementById("vsc-username");
    const rankEl = document.getElementById("vsc-rank");
    const dateEl = document.getElementById("vsc-date");

    if (logoContainer) {
      const isDarkMode = document.body.classList.contains("dark-mode");
      const svgLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="216.831" y="128.255">1</text><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="166.576" y1="-1.106" x2="166.718" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="333.588" y1="-1.106" x2="333.436" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="0" y1="167.339" x2="500.154" y2="166.718"/><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="0" y1="333.479" x2="500.154" y2="333.436"/><text style="fill: rgb(24, 91, 147); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="49.191" y="125.381">J</text><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="381.02" y="125.859">6</text><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="31.317" y="302.394">5</text><text style="fill: rgb(24, 91, 147); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="204.759" y="302.394">U</text><text style="fill: rgb(24, 91, 147); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="198.205" y="479.26">D</text><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="381.95" y="479.26">0</text></svg>`;
      const svgDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="216.831" y="128.255">1</text><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="166.576" y1="-1.106" x2="166.718" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="333.588" y1="-1.106" x2="333.436" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="0" y1="167.339" x2="500.154" y2="166.718"/><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="0" y1="333.479" x2="500.154" y2="333.436"/><text style="fill: rgb(58, 136, 201); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="49.191" y="125.381">J</text><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="381.02" y="125.859">6</text><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="31.317" y="302.394">5</text><text style="fill: rgb(58, 136, 201); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="204.759" y="302.394">U</text><text style="fill: rgb(58, 136, 201); font-family: ' Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="198.205" y="479.26">D</text><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="381.95" y="479.26">0</text></svg>`;
      logoContainer.innerHTML = isDarkMode ? svgDark : svgLight;
    }

    if (usernameEl)
      usernameEl.textContent = user
        ? user.displayName || t.user_default || "Usuario"
        : t.guest || "Invitado";

    if (rankEl) {
      // Get current RP from localstorage to show rank
      const statsStr = localStorage.getItem("jigsudo_user_stats");
      const currentRP = statsStr ? JSON.parse(statsStr).currentRP || 0 : 0;
      const rankData = getRankData(currentRP);
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

    // 2. Populate Session Stats
    document.getElementById("vsc-stat-time").textContent = formatTime(
      stats.totalTime,
    );
    document.getElementById("vsc-stat-streak").textContent =
      stats.streak || "1";
    document.getElementById("vsc-stat-errors").textContent =
      stats.errors || "0";
    document.getElementById("vsc-stat-score").textContent =
      stats.score.toFixed(3);

    // 3. Populate Breakdown Grid
    const stageList = document.getElementById("vsc-stage-list");
    if (stageList) {
      stageList.innerHTML = "";
      const stages = [
        { id: "p_game_memory", key: "memory" },
        { id: "p_game_jigsaw", key: "jigsaw" },
        { id: "p_game_sudoku", key: "sudoku" },
        { id: "p_game_peaks", key: "peaks" },
        { id: "p_game_search", key: "search" },
        { id: "p_game_code", key: "code" },
      ];

      stages.forEach((st) => {
        const timeMs = stats.stageTimes[st.key] || 0;
        const label = translations[lang][st.id] || st.id;
        const card = document.createElement("div");
        card.className = "sc-stage-item";

        let statsHtml = `
          <div class="sc-mini-stat">
            <span class="sc-mini-icon">⏱️</span>
            <span class="sc-mini-val">${formatTime(timeMs)}</span>
          </div>
        `;

        card.innerHTML = `
          <span class="sc-item-label">${label}</span>
          <div class="sc-item-stats">${statsHtml}</div>
        `;
        stageList.appendChild(card);
      });
    }

    // 4. Capture
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
    });

    // 5. Filename Generation
    const dateStr = new Date().toISOString().split("T")[0];
    const fallbackName = user
      ? t.user_default || "Usuario"
      : t.guest || "Invitado";
    const nameClean = (user ? user.displayName || fallbackName : fallbackName)
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const fileName = `jigsudo-victory-${nameClean}-${dateStr}.png`;

    // 6. Share or Download
    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const file = new File([blob], fileName, { type: "image/png" });
      const shareUrl = "https://jigsudo.com";
      const shareData = {
        title: t.victory_share_title || "DESAFÍO COMPLETADO",
        text:
          (t.share_stats_msg || "¡Mira mi progreso en Jigsudo! 🧩✨") +
          `\n\n${shareUrl}`,
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
        downloadFallback(canvas, fileName);
      }
    }, "image/png");
  } catch (err) {
    console.error("Failed to generate victory card:", err);
    showToast("Error al generar la imagen ❌");
  }
}

function downloadFallback(canvas, fileName = "jigsudo-result.png") {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.click();
}
