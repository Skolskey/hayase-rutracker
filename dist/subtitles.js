// src/subtitles.js
var BASE = "https://sub.wyzie.io";
var MAX_PER_LANGUAGE = 3;
function normLang(raw) {
  const code = String(raw ?? "").toLowerCase().slice(0, 2);
  if (!code) return "RU";
  return code.toUpperCase();
}
async function wyzieSearch(fetch, params) {
  const url = `${BASE}/search?${new URLSearchParams(params).toString()}`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error("\u0421\u0435\u0440\u0432\u0438\u0441 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u043E\u0432 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D: \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442-\u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 Wyzie API-\u043A\u043B\u044E\u0447. \u041F\u043E\u043B\u0443\u0447\u0438\u0442\u0435 \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u044B\u0439 \u043A\u043B\u044E\u0447 \u043D\u0430 store.wyzie.io/redeem \u0438 \u0432\u043F\u0438\u0448\u0438\u0442\u0435 \u0435\u0433\u043E \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F.");
  }
  if (!res.ok) {
    throw new Error(`\u0421\u0435\u0440\u0432\u0438\u0441 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u043E\u0432 \u0432\u0435\u0440\u043D\u0443\u043B \u043E\u0448\u0438\u0431\u043A\u0443 ${res.status}. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435.`);
  }
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? data : [];
}
function toResults(raw) {
  const perLang = /* @__PURE__ */ new Map();
  const out = [];
  for (const s of raw) {
    const url = s?.url;
    if (typeof url !== "string" || !url) continue;
    const language = normLang(s.language || s.display);
    const count = perLang.get(language) ?? 0;
    if (count >= MAX_PER_LANGUAGE) continue;
    perLang.set(language, count + 1);
    out.push({ url, language });
  }
  return out;
}
async function search(query, options) {
  const { fetch } = query;
  const key = options?.key?.trim();
  if (!key) {
    throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u044B\u0439 Wyzie API-\u043A\u043B\u044E\u0447 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F (\u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C: store.wyzie.io/redeem).");
  }
  const languages = options?.languages?.trim() || "ru,en";
  const id = query.imdbId || (query.tmdbId != null ? String(query.tmdbId) : null);
  if (!id) return [];
  const isMovie = query.media?.format === "MOVIE" || (query.episodeCount ?? 0) <= 1 || !query.episode;
  const base = { id, language: languages, key };
  const attempts = isMovie ? [base] : [
    { ...base, season: 1, episode: query.episode },
    { ...base, episode: query.episode },
    base
  ];
  for (const params of attempts) {
    const raw = await wyzieSearch(fetch, params);
    const results = toResults(raw);
    if (results.length) return results;
  }
  return [];
}
var subtitles_default = {
  async test() {
    return true;
  },
  async single(query, options) {
    return search(query, options);
  }
};
export {
  subtitles_default as default
};
