// AniLibria torrent extension for Hayase.
// Public API, no auth. Every release is Russian dub/sub.
// Runs in a sandboxed Web Worker; network only via query.fetch.

const BASE = 'https://anilibria.top'
const API = `${BASE}/api/v1`
const MAX_RELEASES = 3 // how many search hits to pull torrents for

async function getJson (fetch, url) {
  let res
  try {
    res = await fetch(url)
  } catch (e) {
    throw new Error('AniLibria недоступна: проверьте интернет-соединение.')
  }
  if (!res.ok) {
    throw new Error(`AniLibria вернула ошибку ${res.status}. Попробуйте позже.`)
  }
  try {
    return await res.json()
  } catch (e) {
    throw new Error('AniLibria вернула неожиданный ответ (не JSON).')
  }
}

// searches for releases by title, returns their numeric ids
async function findReleaseIds (fetch, term) {
  const url = `${API}/app/search/releases?query=${encodeURIComponent(term)}`
  const data = await getJson(fetch, url)
  if (!Array.isArray(data)) return []
  return data.map(r => r?.id).filter(id => typeof id === 'number')
}

function isBatch (torrent) {
  const desc = String(torrent.description ?? '')
  return desc.includes('-') || desc.includes(',') || /\bTV\b/i.test(torrent.label ?? '')
}

function matchesResolution (torrent, resolution) {
  if (!resolution) return true
  const q = String(torrent.quality?.value ?? '')
  return q.includes(resolution)
}

function matchesExclusions (label, exclusions = []) {
  const lower = String(label).toLowerCase()
  return exclusions.some(word => lower.includes(String(word).toLowerCase()))
}

function toResult (torrent) {
  const hash = String(torrent.hash ?? '').toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(hash)) return null
  const link = torrent.magnet || `magnet:?xt=urn:btih:${hash}`
  return {
    title: torrent.label || torrent.filename || 'AniLibria release',
    link,
    hash,
    id: typeof torrent.id === 'number' ? torrent.id : undefined,
    seeders: Math.max(0, Number(torrent.seeders ?? 0)),
    leechers: Math.max(0, Number(torrent.leechers ?? 0)),
    downloads: Math.max(0, Number(torrent.completed_times ?? 0)),
    size: Math.max(0, Number(torrent.size ?? 0)),
    date: torrent.created_at ? new Date(torrent.created_at) : new Date(),
    accuracy: 'medium',
    type: isBatch(torrent) ? 'batch' : undefined
  }
}

async function search (query) {
  const { fetch, titles = [], exclusions = [], resolution } = query

  // find matching releases; stop at the first title that yields hits
  let releaseIds = []
  for (const title of titles.slice(0, 4)) {
    releaseIds = await findReleaseIds(fetch, title)
    if (releaseIds.length) break
  }
  releaseIds = releaseIds.slice(0, MAX_RELEASES)
  if (!releaseIds.length) return []

  const torrentLists = await Promise.all(
    releaseIds.map(id => getJson(fetch, `${API}/anime/torrents/release/${id}`).catch(() => []))
  )

  const seen = new Set()
  const results = []
  for (const list of torrentLists) {
    if (!Array.isArray(list)) continue
    for (const torrent of list) {
      const result = toResult(torrent)
      if (!result || seen.has(result.hash)) continue
      if (!matchesResolution(torrent, resolution)) continue
      if (matchesExclusions(result.title, exclusions)) continue
      seen.add(result.hash)
      results.push(result)
    }
  }

  results.sort((a, b) => b.seeders - a.seeders)
  return results
}

export default {
  async test () {
    // test() gets no query.fetch, use the worker global fetch
    const data = await getJson(globalThis.fetch, `${API}/app/search/releases?query=frieren`)
    if (!Array.isArray(data)) throw new Error('AniLibria API ответила в неожиданном формате.')
    return true
  },
  async single (query) {
    return search(query)
  },
  async batch (query) {
    return search(query)
  },
  async movie (query) {
    return search(query)
  }
}
