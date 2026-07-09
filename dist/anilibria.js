// src/anilibria.js
var BASE = "https://anilibria.top";
var API = `${BASE}/api/v1`;
var MAX_RELEASES = 3;
async function getJson(fetch, url) {
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error("AniLibria \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430: \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442-\u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435.");
  }
  if (!res.ok) {
    throw new Error(`AniLibria \u0432\u0435\u0440\u043D\u0443\u043B\u0430 \u043E\u0448\u0438\u0431\u043A\u0443 ${res.status}. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435.`);
  }
  try {
    return await res.json();
  } catch (e) {
    throw new Error("AniLibria \u0432\u0435\u0440\u043D\u0443\u043B\u0430 \u043D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u044B\u0439 \u043E\u0442\u0432\u0435\u0442 (\u043D\u0435 JSON).");
  }
}
async function findReleaseIds(fetch, term) {
  const url = `${API}/app/search/releases?query=${encodeURIComponent(term)}`;
  const data = await getJson(fetch, url);
  if (!Array.isArray(data)) return [];
  return data.map((r) => r?.id).filter((id) => typeof id === "number");
}
function isBatch(torrent) {
  const desc = String(torrent.description ?? "");
  return desc.includes("-") || desc.includes(",") || /\bTV\b/i.test(torrent.label ?? "");
}
function matchesResolution(torrent, resolution) {
  if (!resolution) return true;
  const q = String(torrent.quality?.value ?? "");
  return q.includes(resolution);
}
function matchesExclusions(label, exclusions = []) {
  const lower = String(label).toLowerCase();
  return exclusions.some((word) => lower.includes(String(word).toLowerCase()));
}
function toResult(torrent) {
  const hash = String(torrent.hash ?? "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(hash)) return null;
  const link = torrent.magnet || `magnet:?xt=urn:btih:${hash}`;
  return {
    title: torrent.label || torrent.filename || "AniLibria release",
    link,
    hash,
    id: typeof torrent.id === "number" ? torrent.id : void 0,
    seeders: Math.max(0, Number(torrent.seeders ?? 0)),
    leechers: Math.max(0, Number(torrent.leechers ?? 0)),
    downloads: Math.max(0, Number(torrent.completed_times ?? 0)),
    size: Math.max(0, Number(torrent.size ?? 0)),
    date: torrent.created_at ? new Date(torrent.created_at) : /* @__PURE__ */ new Date(),
    accuracy: "medium",
    type: isBatch(torrent) ? "batch" : void 0
  };
}
async function search(query) {
  const { fetch, titles = [], exclusions = [], resolution } = query;
  let releaseIds = [];
  for (const title of titles.slice(0, 4)) {
    releaseIds = await findReleaseIds(fetch, title);
    if (releaseIds.length) break;
  }
  releaseIds = releaseIds.slice(0, MAX_RELEASES);
  if (!releaseIds.length) return [];
  const torrentLists = await Promise.all(
    releaseIds.map((id) => getJson(fetch, `${API}/anime/torrents/release/${id}`).catch(() => []))
  );
  const seen = /* @__PURE__ */ new Set();
  const results = [];
  for (const list of torrentLists) {
    if (!Array.isArray(list)) continue;
    for (const torrent of list) {
      const result = toResult(torrent);
      if (!result || seen.has(result.hash)) continue;
      if (!matchesResolution(torrent, resolution)) continue;
      if (matchesExclusions(result.title, exclusions)) continue;
      seen.add(result.hash);
      results.push(result);
    }
  }
  results.sort((a, b) => b.seeders - a.seeders);
  return results;
}
var anilibria_default = {
  async test() {
    const data = await getJson(globalThis.fetch, `${API}/app/search/releases?query=frieren`);
    if (!Array.isArray(data)) throw new Error("AniLibria API \u043E\u0442\u0432\u0435\u0442\u0438\u043B\u0430 \u0432 \u043D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u043E\u043C \u0444\u043E\u0440\u043C\u0430\u0442\u0435.");
    return true;
  },
  async single(query) {
    return search(query);
  },
  async batch(query) {
    return search(query);
  },
  async movie(query) {
    return search(query);
  }
};
export {
  anilibria_default as default
};
