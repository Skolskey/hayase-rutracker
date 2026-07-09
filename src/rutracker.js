// RuTracker torrent extension for Hayase
// Runs inside a sandboxed Web Worker: no DOM, network only via query.fetch.
// RuTracker specifics: cp1251 encoding everywhere, search requires auth.

const DECODER = new TextDecoder('windows-1251')

const DEFAULT_MIRROR = 'https://rutracker.org'
const MAX_MAGNET_FETCHES = 10

// module-level session state, survives between queries within one worker
const cookieJar = {}

// ---------- helpers ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»' }

function decodeEntities (s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/g, (_, name) => ENTITIES[name] ?? `&${name};`)
}

function stripTags (s) {
  return decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

// percent-encode a string as cp1251 (rutracker's login form expects it);
// ASCII is passed through, Cyrillic is mapped manually
function encodeCp1251 (str) {
  let out = ''
  for (const ch of str) {
    const code = ch.codePointAt(0)
    if (code < 0x80) {
      out += encodeURIComponent(ch)
    } else if (code >= 0x410 && code <= 0x44F) { // А..я
      out += '%' + (code - 0x410 + 0xC0).toString(16).toUpperCase().padStart(2, '0')
    } else if (code === 0x401) { // Ё
      out += '%A8'
    } else if (code === 0x451) { // ё
      out += '%B8'
    } else {
      out += '%3F' // '?' for anything unrepresentable
    }
  }
  return out
}

function baseUrl (options) {
  return (options?.mirror || DEFAULT_MIRROR).replace(/\/+$/, '')
}

// collect rutracker cookies (bb_session etc.) from a response;
// getSetCookie() exists in Node/Electron, plain get() is the browser fallback
function rememberCookies (res) {
  const lines = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean)
  for (const line of lines) {
    for (const [, pair] of line.matchAll(/(?:^|[,;]\s*)(bb_\w+=[^;,\s]+)/g)) {
      const [name, value] = pair.split('=')
      cookieJar[name] = value
    }
  }
}

function cookieHeader (options) {
  const parts = []
  if (options?.cookie?.trim()) parts.push(options.cookie.trim().replace(/;\s*$/, ''))
  for (const [name, value] of Object.entries(cookieJar)) {
    if (!parts.some(p => p.includes(`${name}=`))) parts.push(`${name}=${value}`)
  }
  return parts.join('; ')
}

async function request (fetch, url, init = {}, options) {
  const headers = { ...(init.headers || {}) }
  const cookie = cookieHeader(options)
  if (cookie) headers.cookie = cookie
  let res
  try {
    res = await fetch(url, { ...init, headers })
  } catch (e) {
    throw new Error('RuTracker недоступен: проверьте интернет или укажите рабочее зеркало в настройках расширения.')
  }
  // redirect: 'manual' yields 30x (Node) or type 'opaqueredirect' (browser) — both are expected
  if (!res.ok && !(res.status >= 300 && res.status < 400) && res.type !== 'opaqueredirect') {
    throw new Error(`RuTracker вернул ошибку ${res.status}. Попробуйте позже или смените зеркало.`)
  }
  rememberCookies(res)
  const buf = await res.arrayBuffer()
  return { res, html: DECODER.decode(buf) }
}

function isLoginPage (html, res) {
  return /login\.php\?redirect/.test(res.url || '') ||
    (html.includes('login-form') && !html.includes('tor-tbl'))
}

async function login (fetch, options) {
  const username = options?.username?.trim()
  const password = options?.password
  if (options?.cookie?.trim()) return // manual cookie is sent by cookieHeader()
  if (!username || !password) {
    throw new Error('RuTracker требует авторизацию: укажите логин и пароль (или cookie bb_session) в настройках расширения.')
  }
  const body =
    `login_username=${encodeCp1251(username)}` +
    `&login_password=${encodeCp1251(password)}` +
    '&login=%E2%F5%EE%E4' // "вход" in cp1251

  // manual redirect: bb_session arrives in the Set-Cookie of the 302 response
  // and would be lost if the fetch followed the redirect
  const { res, html } = await request(fetch, `${baseUrl(options)}/forum/login.php`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual'
  }, options)
  if (cookieJar.bb_session) return // logged in
  if (html.includes('cap_sid')) {
    throw new Error('RuTracker требует капчу при входе, автоматический вход по паролю невозможен. Войдите на rutracker.org в браузере и скопируйте cookie bb_session в настройки расширения (DevTools → Application → Cookies).')
  }
  if (res.status === 200 && html.includes('login-form')) {
    throw new Error('RuTracker не принял логин/пароль. Проверьте данные в настройках расширения.')
  }
  // opaqueredirect and similar: cookies unreadable, hope the environment's cookie jar kept them
}

// ---------- parsing ----------

function parseSearchPage (html, base) {
  // rows look like: <tr id="trs-tr-6807886" class="tCenter hl-tr" data-topic_id="6807886">
  const rows = html.split(/<tr id="trs-tr-\d+"/).slice(1)
  const results = []
  for (const chunk of rows) {
    const id = /data-topic_id="(\d+)"/.exec(chunk)?.[1]
    // title cell: <a ... class="...tLink..." href="viewtopic.php?t=ID">TITLE</a>
    const title = /class="[^"]*tLink[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(chunk)?.[1]
    if (!id || !title) continue
    const size = /tor-size"\s+data-ts_text="(\d+)"/.exec(chunk)?.[1]
    const seeders = /seedmed"[^>]*>\s*(\d+)/.exec(chunk)?.[1]
    const leechers = /leechmed[^"]*"[^>]*>\s*(\d+)/.exec(chunk)?.[1]
    const downloads = /number-format"[^>]*>\s*(\d+)/.exec(chunk)?.[1]
    // date is the last data-ts_text in the row (size is the first, seed-count the middle)
    const tsMatches = [...chunk.matchAll(/data-ts_text="(\d+)"/g)]
    const date = tsMatches.length ? tsMatches[tsMatches.length - 1][1] : null
    results.push({
      id: Number(id),
      topicUrl: `${base}/forum/viewtopic.php?t=${id}`,
      title: stripTags(title),
      size: Number(size ?? 0),
      seeders: Math.max(0, Number(seeders ?? 0)),
      leechers: Number(leechers ?? 0),
      downloads: Number(downloads ?? 0),
      date: date ? new Date(Number(date) * 1000) : new Date()
    })
  }
  return results
}

async function fetchMagnet (fetch, row, options) {
  const { html } = await request(fetch, row.topicUrl, {}, options)
  const magnet = /href="(magnet:\?xt=urn:btih:[^"]+)"/.exec(html)?.[1]
  if (!magnet) return null
  const hash = /urn:btih:([0-9A-Fa-f]{40})/.exec(magnet)?.[1]
  if (!hash) return null
  return { link: decodeEntities(magnet), hash: hash.toLowerCase() }
}

// ---------- search ----------

async function searchOnce (fetch, options, term) {
  const base = baseUrl(options)
  // o=10 — sort by seeders, s=2 — descending
  const url = `${base}/forum/tracker.php?nm=${encodeURIComponent(term)}&o=10&s=2`
  let { res, html } = await request(fetch, url, {}, options)
  if (isLoginPage(html, res)) {
    await login(fetch, options)
    ;({ res, html } = await request(fetch, url, {}, options))
    if (isLoginPage(html, res)) {
      throw new Error('Не удалось войти на RuTracker: проверьте логин/пароль или укажите cookie bb_session в настройках расширения.')
    }
  }
  return parseSearchPage(html, base)
}

function matchesExclusions (title, exclusions = []) {
  const lower = title.toLowerCase()
  return exclusions.some(word => lower.includes(word.toLowerCase()))
}

async function search (query, options) {
  const { fetch, titles = [], exclusions = [], resolution } = query
  const seen = new Set()
  let rows = []
  // try titles one by one until something is found (usually romaji hits first)
  for (const title of titles.slice(0, 3)) {
    const found = await searchOnce(fetch, options, title)
    for (const row of found) {
      if (!seen.has(row.id)) {
        seen.add(row.id)
        rows.push(row)
      }
    }
    if (rows.length) break
  }

  rows = rows.filter(row => !matchesExclusions(row.title, exclusions))
  if (resolution) {
    const preferred = rows.filter(row => row.title.includes(resolution))
    if (preferred.length) rows = preferred
  }
  rows.sort((a, b) => b.seeders - a.seeders)
  rows = rows.slice(0, MAX_MAGNET_FETCHES)

  const results = await Promise.all(rows.map(async row => {
    const magnet = await fetchMagnet(fetch, row, options).catch(() => null)
    if (!magnet) return null
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
      accuracy: 'low'
    }
  }))
  return results.filter(Boolean)
}

// ---------- Hayase extension API ----------

export default {
  async test () {
    return true
  },
  async single (query, options) {
    return search(query, options)
  },
  async batch (query, options) {
    return search(query, options)
  },
  async movie (query, options) {
    return search(query, options)
  }
}
