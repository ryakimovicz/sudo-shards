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
  const rankings = {
    daily: await getTop10("dailyRP", true),
    monthly: await getTop10("monthlyRP", true),
    allTime: await getTop10("totalRP"),
  };

  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ timestamp: now, data: rankings }),
  );
  return rankings;
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

  const data = rankings[currentCategory] || [];
  const lang = getCurrentLang();

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
    data.forEach((user, index) => {
      const isTop3 = index < 3;
      const medal =
        index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";

      html += `
        <tr class="${isTop3 ? "top-player" : ""}">
          <td class="rank-col">${medal || index + 1}</td>
          <td class="user-col">${user.username}</td>
          <td class="score-col">${user.score.toFixed(1)}</td>
        </tr>
      `;
    });
  }

  html += `</tbody></table>`;
  container.innerHTML = html;
}

export function clearRankingCache() {
  localStorage.removeItem(CACHE_KEY);
}
