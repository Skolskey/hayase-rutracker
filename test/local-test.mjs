// Local smoke test outside Hayase: emulates a worker query via Node's fetch.
//   RT_QUERY="Cowboy Bebop" node test/local-test.mjs
import extension from '../dist/anilibria.js'

const query = {
  fetch: globalThis.fetch,
  titles: [process.env.RT_QUERY ?? 'Sousou no Frieren'],
  episode: 1,
  resolution: process.env.RT_RES ?? '1080',
  exclusions: []
}

console.log('test():', await extension.test())

const results = await extension.single(query)
console.log(`\nНайдено раздач: ${results.length}`)
for (const r of results.slice(0, 8)) {
  console.log(`- [${r.seeders}s/${r.leechers}l] ${(r.size / 2 ** 30).toFixed(2)} GiB | ${r.type ?? 'single'} | ${r.title}`)
  console.log(`  hash: ${r.hash}`)
}
