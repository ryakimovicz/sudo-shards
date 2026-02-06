/* Ranking Module for Jigsudo */
import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";
import { getCurrentUser } from "./auth.js";

const CACHE_KEY = "jigsudo_ranking_cache";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function fetchRankings(forceRefresh = false) {
  const now = Date.now();
  const cached = localStorage.getItem(CACHE_KEY);

  if (!forceRefresh && cached) {
    const { timestamp, data } = JSON.parse(cached);
    if (now - timestamp < CACHE_TTL) {
      console.log("[Ranking] Using cached data");
      return data;
    }
  }

  console.log("[Ranking] Fetching fresh data from Firestore");
  const { getUserRank } = await import("./db.js");
  const user = getCurrentUser();

  const rankings = {
    daily: await getTopRankings("dailyRP", 10, user, getUserRank),
    monthly: await getTopRankings("monthlyRP", 10, user, getUserRank),
    allTime: await getTopRankings("totalRP", 10, user, getUserRank),
  };

  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ timestamp: now, data: rankings }),
  );
  return rankings;
}

async function getTopRankings(fieldName, limitCount, user, getUserRankFn) {
  const top10 = await getTop10(fieldName, true);

  const result = {
    top: top10,
    personal: null,
  };

  if (user) {
    // 1. Check if user is in top 10
    const inTop10 = top10.findIndex((u) => u.id === user.uid);
    const userScore = user.stats ? user.stats[fieldName] || 0 : 0;

    if (inTop10 !== -1) {
      result.personal = {
        rank: inTop10 + 1,
        score: userScore,
        username: user.displayName || "Usuario",
        inTop: true,
      };
    } else {
      // 2. Fetch actual rank using aggregation query (1 read)
      const actualRank = await getUserRankFn(fieldName, userScore);
      result.personal = {
        rank: actualRank,
        score: userScore,
        username: user.displayName || "Usuario",
        inTop: false,
      };
    }
  }

  return result;
}

async function getTop10(fieldName, retryOnEmpty = false) {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, orderBy(fieldName, "desc"), limit(10));
    let querySnapshot = await getDocs(q);

    if (retryOnEmpty && querySnapshot.empty) {
      console.log(`[Ranking] ${fieldName} empty, retrying in 1.5s...`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      querySnapshot = await getDocs(q);
    }

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      username: doc.data().username || "Anonymous",
      score: doc.data()[fieldName] || 0,
    }));
  } catch (error) {
    console.error(`[Ranking] Error fetching ${fieldName}:`, error);
    return [];
  }
}

export function renderRankings(container, rankings, currentCategory = "daily") {
  if (!container) return;

  const categoryData = rankings[currentCategory] || { top: [], personal: null };
  const data = categoryData.top || [];
  const personal = categoryData.personal;
  const user = getCurrentUser();

  // Create Table
  let html = `
    <table class="ranking-table">
      <thead>
        <tr>
          <th class="rank-col">#</th>
          <th class="user-col">Usuario</th>
          <th class="score-col">Puntos</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (data.length === 0) {
    html += `<tr><td colspan="3" class="empty-row">No hay datos todavía</td></tr>`;
  } else {
    data.forEach((entry, index) => {
      const isTop3 = index < 3;
      const isCurrentUser = user && entry.id === user.uid;
      const medal =
        index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";

      html += `
        <tr class="${isTop3 ? "top-player" : ""} ${isCurrentUser ? "current-user-row" : ""}">
          <td class="rank-col">${medal || index + 1}</td>
          <td class="user-col">${entry.username} ${isCurrentUser ? "(Tú)" : ""}</td>
          <td class="score-col">${entry.score.toFixed(1)}</td>
        </tr>
      `;
    });

    // If user is NOT in top 10, add a separator and their personal rank row
    if (personal && !personal.inTop && personal.rank > 10) {
      html += `
        <tr class="ranking-separator">
          <td colspan="3">...</td>
        </tr>
        <tr class="current-user-row personal-rank-row">
          <td class="rank-col">#${personal.rank}</td>
          <td class="user-col">${personal.username} (Tú)</td>
          <td class="score-col">${personal.score.toFixed(1)}</td>
        </tr>
      `;
    }
  }

  html += `</tbody></table>`;
  container.innerHTML = html;
}

export function clearRankingCache() {
  localStorage.removeItem(CACHE_KEY);
}
