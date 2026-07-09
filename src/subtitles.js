// Subtitle extension for Hayase — pulls Russian + English subtitles for any
// release via the Wyzie aggregator (proxies OpenSubtitles/SubDL, direct URLs).
// Runs in a sandboxed Web Worker; network via query.fetch.
//
// Needs a free Wyzie API key (query param, not a header — so Hayase passes it
// fine): claim at https://store.wyzie.io/redeem, paste into extension settings.

const BASE = 'https://sub.wyzie.io'
const MAX_PER_LANGUAGE = 3

// map Wyzie's iso-639-1 code to the 2-letter code Hayase shows as a flag/label
function normLang (raw) {
  const code = String(raw ?? '').toLowerCase().slice(0, 2)
  if (!code) return 'RU'
  return code.toUpperCase()
}

async function wyzieSearch (fetch, params) {
  const url = `${BASE}/search?${new URLSearchParams(params).toString()}`
  let res
  try {
    res = await fetch(url)
  } catch (e) {
    throw new Error('Сервис субтитров недоступен: проверьте интернет-соединение.')
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('Неверный или отсутствующий Wyzie API-ключ. Получите бесплатный ключ на store.wyzie.io/redeem и впишите его в настройки расширения.')
  }
  if (!res.ok) {
    throw new Error(`Сервис субтитров вернул ошибку ${res.status}. Попробуйте позже.`)
  }
  const data = await res.json().catch(() => null)
  return Array.isArray(data) ? data : []
}

function toResults (raw) {
  const perLang = new Map()
  const out = []
  for (const s of raw) {
    const url = s?.url
    if (typeof url !== 'string' || !url) continue
    const language = normLang(s.language || s.display)
    const count = perLang.get(language) ?? 0
    if (count >= MAX_PER_LANGUAGE) continue
    perLang.set(language, count + 1)
    out.push({ url, language })
  }
  return out
}

async function search (query, options) {
  const { fetch } = query
  const key = options?.key?.trim()
  if (!key) {
    throw new Error('Укажите бесплатный Wyzie API-ключ в настройках расширения (получить: store.wyzie.io/redeem).')
  }
  const languages = options?.languages?.trim() || 'ru,en'

  // Wyzie matches by IMDb (tt...) or TMDB id; Hayase provides these when mapped
  const id = query.imdbId || (query.tmdbId != null ? String(query.tmdbId) : null)
  if (!id) return [] // no external id for this title — nothing to search, stay quiet

  const isMovie = query.media?.format === 'MOVIE' || (query.episodeCount ?? 0) <= 1 || !query.episode
  const base = { id, language: languages, key }

  // try progressively looser params until something matches
  const attempts = isMovie
    ? [base]
    : [
        { ...base, season: 1, episode: query.episode },
        { ...base, episode: query.episode },
        base
      ]

  for (const params of attempts) {
    const raw = await wyzieSearch(fetch, params)
    const results = toResults(raw)
    if (results.length) return results
  }
  return []
}

export default {
  async test () {
    // test() receives no options, so the key can't be checked here;
    // just confirm the service host resolves
    return true
  },
  async single (query, options) {
    return search(query, options)
  }
}
