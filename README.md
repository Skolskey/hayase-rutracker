# hayase-anilibria

Расширение для [Hayase](https://hayase.watch) — ищет аниме-раздачи с русской
озвучкой и субтитрами через публичный API [AniLibria](https://anilibria.top).

## Почему AniLibria

- **Русская локализация** — все релизы AniLibria с озвучкой/субтитрами на русском.
- **Публичный API, без логина** — не нужны ни аккаунт, ни cookie. Поэтому расширение
  работает в песочнице Hayase без проблем с авторизацией (в отличие от приватных
  трекеров вроде RuTracker, куда браузерная песочница Hayase не может передать cookie).
- Отдаёт готовые торренты с magnet-ссылками, хэшами, сидами и размером.

## Как это работает

1. Hayase передаёт список названий тайтла (ромадзи + синонимы).
2. Расширение ищет релиз через `app/search/releases`.
3. Для найденных релизов запрашивает торренты `anime/torrents/release/{id}`.
4. Возвращает раздачи (обычно полные сезоны — batch), отфильтрованные по разрешению.

Поиск строковый по названию, но по кураторской аниме-базе AniLibria, поэтому
`accuracy` = `medium`.

## Сборка

```bash
npm install
npm run build   # → dist/anilibria.js (ESM-бандл)
```

## Локальный тест

```bash
npm run build
node test/local-test.mjs
RT_QUERY="Cowboy Bebop" node test/local-test.mjs   # другой тайтл
```

## Установка в Hayase

**Settings → Extensions → Repositories** → вставьте:

```
https://raw.githubusercontent.com/Skolskey/hayase-rutracker/main/index.json
```

→ **Import Extensions**. Расширение «AniLibria» появится в списке и сразу готово к
работе — никаких настроек не требуется. Раздачи появятся, когда вы откроете аниме
и выберете серию для просмотра.

## Субтитры (RU/EN)

Отдельное расширение типа `subtitle` подгружает русские и английские субтитры к
любой раздаче через агрегатор [Wyzie](https://sub.wyzie.io) (проксирует
OpenSubtitles/SubDL). Позволяет смотреть оригинал/англ. озвучку с русскими сабами.

Импорт — **отдельной ссылкой**:

```
https://raw.githubusercontent.com/Skolskey/hayase-rutracker/main/subtitles.json
```

После импорта откройте настройки расширения «Subtitles (RU/EN)» и вставьте
бесплатный **Wyzie API-ключ** (получить: <https://store.wyzie.io/redeem>). Языки по
умолчанию — `ru,en`, можно поменять.

Субтитры подтягиваются по IMDb/TMDB ID тайтла, поэтому для аниме без такого маппинга
результат может быть пустым — это ожидаемо.

## Обновление

После правок: `npm run build`, поднимите `version` в соответствующем манифесте
(`index.json` или `subtitles.json`), затем `git commit -am "..." && git push`.
Hayase подтянет новую версию по полю `update`.
