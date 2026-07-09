// src/rutracker.js
var DECODER = new TextDecoder("windows-1251");
var DEFAULT_MIRROR = "https://rutracker.org";
var MAX_MAGNET_FETCHES = 10;
var cookieJar = {};
var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "\xAB", raquo: "\xBB" };
function decodeEntities(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&([a-z]+);/g, (_, name) => ENTITIES[name] ?? `&${name};`);
}
function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}
function encodeCp1251(str) {
  let out = "";
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code < 128) {
      out += encodeURIComponent(ch);
    } else if (code >= 1040 && code <= 1103) {
      out += "%" + (code - 1040 + 192).toString(16).toUpperCase().padStart(2, "0");
    } else if (code === 1025) {
      out += "%A8";
    } else if (code === 1105) {
      out += "%B8";
    } else {
      out += "%3F";
    }
  }
  return out;
}
function baseUrl(options) {
  return (options?.mirror || DEFAULT_MIRROR).replace(/\/+$/, "");
}
function rememberCookies(res) {
  const lines = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  for (const line of lines) {
    for (const [, pair] of line.matchAll(/(?:^|[,;]\s*)(bb_\w+=[^;,\s]+)/g)) {
      const [name, value] = pair.split("=");
      cookieJar[name] = value;
    }
  }
}
function cookieHeader(options) {
  const parts = [];
  if (options?.cookie?.trim()) parts.push(options.cookie.trim().replace(/;\s*$/, ""));
  for (const [name, value] of Object.entries(cookieJar)) {
    if (!parts.some((p) => p.includes(`${name}=`))) parts.push(`${name}=${value}`);
  }
  return parts.join("; ");
}
async function request(fetch, url, init = {}, options) {
  const headers = { ...init.headers || {} };
  const cookie = cookieHeader(options);
  if (cookie) headers.cookie = cookie;
  let res;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (e) {
    throw new Error("RuTracker \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D: \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0438\u043D\u0442\u0435\u0440\u043D\u0435\u0442 \u0438\u043B\u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u0440\u0430\u0431\u043E\u0447\u0435\u0435 \u0437\u0435\u0440\u043A\u0430\u043B\u043E \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F.");
  }
  if (!res.ok && !(res.status >= 300 && res.status < 400) && res.type !== "opaqueredirect") {
    throw new Error(`RuTracker \u0432\u0435\u0440\u043D\u0443\u043B \u043E\u0448\u0438\u0431\u043A\u0443 ${res.status}. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435 \u0438\u043B\u0438 \u0441\u043C\u0435\u043D\u0438\u0442\u0435 \u0437\u0435\u0440\u043A\u0430\u043B\u043E.`);
  }
  rememberCookies(res);
  const buf = await res.arrayBuffer();
  return { res, html: DECODER.decode(buf) };
}
function isLoginPage(html, res) {
  return /login\.php\?redirect/.test(res.url || "") || html.includes("login-form") && !html.includes("tor-tbl");
}
async function login(fetch, options) {
  const username = options?.username?.trim();
  const password = options?.password;
  if (options?.cookie?.trim()) return;
  if (!username || !password) {
    throw new Error("RuTracker \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044E: \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043B\u043E\u0433\u0438\u043D \u0438 \u043F\u0430\u0440\u043E\u043B\u044C (\u0438\u043B\u0438 cookie bb_session) \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F.");
  }
  const body = `login_username=${encodeCp1251(username)}&login_password=${encodeCp1251(password)}&login=%E2%F5%EE%E4`;
  const { res, html } = await request(fetch, `${baseUrl(options)}/forum/login.php`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual"
  }, options);
  if (cookieJar.bb_session) return;
  if (html.includes("cap_sid")) {
    throw new Error("RuTracker \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u043A\u0430\u043F\u0447\u0443 \u043F\u0440\u0438 \u0432\u0445\u043E\u0434\u0435, \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0432\u0445\u043E\u0434 \u043F\u043E \u043F\u0430\u0440\u043E\u043B\u044E \u043D\u0435\u0432\u043E\u0437\u043C\u043E\u0436\u0435\u043D. \u0412\u043E\u0439\u0434\u0438\u0442\u0435 \u043D\u0430 rutracker.org \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435 \u0438 \u0441\u043A\u043E\u043F\u0438\u0440\u0443\u0439\u0442\u0435 cookie bb_session \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F (DevTools \u2192 Application \u2192 Cookies).");
  }
  if (res.status === 200 && html.includes("login-form")) {
    throw new Error("RuTracker \u043D\u0435 \u043F\u0440\u0438\u043D\u044F\u043B \u043B\u043E\u0433\u0438\u043D/\u043F\u0430\u0440\u043E\u043B\u044C. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F.");
  }
}
function parseSearchPage(html, base) {
  const rows = html.split(/<tr id="trs-tr-\d+"/).slice(1);
  const results = [];
  for (const chunk of rows) {
    const id = /data-topic_id="(\d+)"/.exec(chunk)?.[1];
    const title = /class="[^"]*tLink[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(chunk)?.[1];
    if (!id || !title) continue;
    const size = /tor-size"\s+data-ts_text="(\d+)"/.exec(chunk)?.[1];
    const seeders = /seedmed"[^>]*>\s*(\d+)/.exec(chunk)?.[1];
    const leechers = /leechmed[^"]*"[^>]*>\s*(\d+)/.exec(chunk)?.[1];
    const downloads = /number-format"[^>]*>\s*(\d+)/.exec(chunk)?.[1];
    const tsMatches = [...chunk.matchAll(/data-ts_text="(\d+)"/g)];
    const date = tsMatches.length ? tsMatches[tsMatches.length - 1][1] : null;
    results.push({
      id: Number(id),
      topicUrl: `${base}/forum/viewtopic.php?t=${id}`,
      title: stripTags(title),
      size: Number(size ?? 0),
      seeders: Math.max(0, Number(seeders ?? 0)),
      leechers: Number(leechers ?? 0),
      downloads: Number(downloads ?? 0),
      date: date ? new Date(Number(date) * 1e3) : /* @__PURE__ */ new Date()
    });
  }
  return results;
}
async function fetchMagnet(fetch, row, options) {
  const { html } = await request(fetch, row.topicUrl, {}, options);
  const magnet = /href="(magnet:\?xt=urn:btih:[^"]+)"/.exec(html)?.[1];
  if (!magnet) return null;
  const hash = /urn:btih:([0-9A-Fa-f]{40})/.exec(magnet)?.[1];
  if (!hash) return null;
  return { link: decodeEntities(magnet), hash: hash.toLowerCase() };
}
async function searchOnce(fetch, options, term) {
  const base = baseUrl(options);
  const url = `${base}/forum/tracker.php?nm=${encodeURIComponent(term)}&o=10&s=2`;
  let { res, html } = await request(fetch, url, {}, options);
  if (isLoginPage(html, res)) {
    await login(fetch, options);
    ({ res, html } = await request(fetch, url, {}, options));
    if (isLoginPage(html, res)) {
      throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u043E\u0439\u0442\u0438 \u043D\u0430 RuTracker: \u043F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043B\u043E\u0433\u0438\u043D/\u043F\u0430\u0440\u043E\u043B\u044C \u0438\u043B\u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 cookie bb_session \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F.");
    }
  }
  return parseSearchPage(html, base);
}
function matchesExclusions(title, exclusions = []) {
  const lower = title.toLowerCase();
  return exclusions.some((word) => lower.includes(word.toLowerCase()));
}
async function search(query, options) {
  const { fetch, titles = [], exclusions = [], resolution } = query;
  const seen = /* @__PURE__ */ new Set();
  let rows = [];
  for (const title of titles.slice(0, 3)) {
    const found = await searchOnce(fetch, options, title);
    for (const row of found) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        rows.push(row);
      }
    }
    if (rows.length) break;
  }
  rows = rows.filter((row) => !matchesExclusions(row.title, exclusions));
  if (resolution) {
    const preferred = rows.filter((row) => row.title.includes(resolution));
    if (preferred.length) rows = preferred;
  }
  rows.sort((a, b) => b.seeders - a.seeders);
  rows = rows.slice(0, MAX_MAGNET_FETCHES);
  const results = await Promise.all(rows.map(async (row) => {
    const magnet = await fetchMagnet(fetch, row, options).catch(() => null);
    if (!magnet) return null;
    return {
      title: row.title,
      link: magnet.link,
      hash: magnet.hash,
      id: row.id,
      seeders: row.seeders,
      leechers: row.leechers,
      downloads: row.downloads,
      size: row.size,
      date: row.date,
      accuracy: "low"
    };
  }));
  return results.filter(Boolean);
}
var rutracker_default = {
  async test() {
    return true;
  },
  async single(query, options) {
    return search(query, options);
  },
  async batch(query, options) {
    return search(query, options);
  },
  async movie(query, options) {
    return search(query, options);
  }
};
export {
  rutracker_default as default
};
