# hayase-rutracker

Расширение для [Hayase](https://hayase.watch), которое ищет раздачи на [RuTracker](https://rutracker.org).

## Как это работает

- Поиск идёт через `tracker.php` (сортировка по сидам). RuTracker не отдаёт поиск гостям,
  поэтому нужна авторизация.
- **Основной способ — cookie `bb_session`**: форма входа RuTracker всегда содержит капчу,
  так что автоматический вход по логину/паролю невозможен. Войдите на rutracker.org
  в браузере, откройте DevTools → Application (в Firefox — Storage) → Cookies →
  `https://rutracker.org`, скопируйте значение `bb_session` и вставьте в поле «cookie»
  настроек расширения в формате `bb_session=значение`. Ставьте галочку «запомнить»
  при входе — тогда сессия живёт долго.
- Логин/пароль оставлены как запасной вариант на случай, если капча исчезнет.
- Cookie задаётся в настройках расширения внутри Hayase и никуда, кроме RuTracker,
  не отправляется.
- Ответы трекера в кодировке cp1251 — декодируются вручную через `TextDecoder`.
- Для топ-10 найденных раздач расширение открывает страницы тем и достаёт magnet-ссылки
  (они видны даже без авторизации).
- Поиск строковый, без ID-маппинга, поэтому в манифесте честно указано `accuracy: low`.

## Сборка

```bash
npm install
npm run build   # → dist/rutracker.js (один ESM-бандл, как требует Hayase)
```

## Локальный тест (без Hayase)

```bash
npm run build
RT_COOKIE="bb_session=..." node test/local-test.mjs
# другой запрос:
RT_QUERY="Cowboy Bebop" RT_COOKIE="bb_session=..." node test/local-test.mjs
```

Без переменных окружения тест лишь проверяет, что расширение корректно сообщает
об отсутствии авторизации.

## Публикация

1. Создайте GitHub-репозиторий и запушьте проект **вместе с `dist/rutracker.js`**.
2. В `index.json` замените `YOUR_GITHUB_USER` в полях `update` и `code` на свой ник.
3. В Hayase: **Settings → Extensions → Repositories** → вставьте
   `https://raw.githubusercontent.com/YOUR_GITHUB_USER/hayase-rutracker/main/index.json`
   → **Import Extensions**.
4. В настройках появившегося расширения укажите логин/пароль (или cookie).

При обновлении кода не забывайте поднимать `version` в `index.json` — по этому полю
Hayase проверяет обновления.

## Структура

```
index.json          — манифест расширения (manifestVersion 2)
src/rutracker.js    — исходник: логин, поиск, парсинг, magnet
dist/rutracker.js   — собранный бандл, который загружает Hayase
test/local-test.mjs — smoke-тест через Node fetch
```
