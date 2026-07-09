// Local smoke test outside Hayase: emulates a worker query via Node's fetch.
// Credentials come from env vars:
//   RT_LOGIN=... RT_PASSWORD=... npm test
//   RT_COOKIE="bb_session=..." npm test
import extension from '../dist/rutracker.js'

const options = {
  username: process.env.RT_LOGIN ?? '',
  password: process.env.RT_PASSWORD ?? '',
  cookie: process.env.RT_COOKIE ?? '',
  mirror: process.env.RT_MIRROR ?? 'https://rutracker.org'
}

const query = {
  fetch: globalThis.fetch,
  titles: [process.env.RT_QUERY ?? 'Sousou no Frieren'],
  episode: 1,
  resolution: '1080',
  exclusions: [],
  anilistId: 154587
}

console.log('test():', await extension.test())

if (!options.username && !options.cookie) {
  console.log('\nRT_LOGIN/RT_PASSWORD (или RT_COOKIE) не заданы — проверяю, что расширение внятно сообщает об отсутствии авторизации...')
  try {
    await extension.single(query, options)
    console.error('ОШИБКА: ожидалось исключение об авторизации')
    process.exit(1)
  } catch (e) {
    console.log('OK, получено ожидаемое сообщение:', e.message)
  }
} else {
  const results = await extension.single(query, options)
  console.log(`\nНайдено раздач: ${results.length}`)
  for (const r of results.slice(0, 5)) {
    console.log(`- [${r.seeders}s/${r.leechers}l] ${(r.size / 2 ** 30).toFixed(2)} GiB | ${r.title}`)
    console.log(`  hash: ${r.hash}`)
  }
}
