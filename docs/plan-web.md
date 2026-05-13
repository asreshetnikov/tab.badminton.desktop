# План реализации публичного сайта турнира

## Концепция

URL известен с момента создания турнира (`/[tournamentId]`).
До первой публикации сайт показывает «турнир ещё не опубликован».

Поток данных:
```
Electron (SQLite) → ExportService → Proxy API → Vercel Blob → Astro-сайт → браузер
```

Приложение никогда не обращается к Vercel Blob напрямую — только через прокси-API,
который хранит blob-токен на сервере и привязывает каждую публикацию к организатору.

---

## Разделение по репозиториям

| Репозиторий | Что содержит | Шаги |
|---|---|---|
| `tab.badminton` | Electron-приложение: ExportService, IPC handler, кнопка Publish | 1, 2, 3, 5 |
| `tab.badminton.web` | Astro-сайт: прокси-API, страница турнира, хостинг | 4, 6, 7, 8 |

### Общий тип `TournamentSnapshot`

Тип определяется в `tab.badminton` (шаг 1) и **копируется** в `tab.badminton.web/src/lib/snapshot.ts`.
Источник истины — `tab.badminton`. При изменении схемы обновлять оба места вручную.
Для pet-проекта с одним разработчиком это приемлемо.

---

## Шаг 1 — Тип `TournamentSnapshot` · `tab.badminton`

**Файл:** `src/shared/types/tournament-snapshot.ts`

Единый контракт между Electron-приложением и публичным сайтом.
Копируется в `tab.badminton.web/src/lib/snapshot.ts` (источник истины — этот файл).

```ts
interface TournamentSnapshot {
  exportedAt: string          // ISO timestamp последней публикации
  tournament: {
    id: string
    name: string
    date_start: string
    date_end: string
    status: TournamentStatus
    venue: { name: string; address: string | null } | null
  }
  courts: Array<{ id: string; name: string }>
  events: Array<SnapshotEvent>
  players: Array<SnapshotPlayer>  // без birth_year и gender
}

interface SnapshotPlayer {
  id: string
  first_name: string
  last_name: string
  club: string | null
}

interface SnapshotEvent {
  id: string
  name: string
  category: EventCategory   // MS | WS | MD | WD | XD
  order: number
  rounds: Array<SnapshotRound>
}

interface SnapshotRound {
  id: string
  name: string
  type: RoundType           // round_robin | playoff
  order: number
  teams: Array<{ id: string; name: string; player_ids: string[] }>
  matches: Array<SnapshotMatch>
  standings?: Array<SnapshotStandingRow>  // только для round_robin
}

interface SnapshotMatch {
  id: string
  team1_id: string | null
  team2_id: string | null
  winner_id: string | null
  sets: Array<{ s1: number; s2: number }>
  status: MatchStatus
  scheduled_at: string | null
  court_id: string | null
  // playoff-связи для построения сетки
  win_match_id: string | null
  left_match_id: string | null
  right_match_id: string | null
  tour: number | null        // для round_robin: номер тура
}

interface SnapshotStandingRow {
  team_id: string
  wins: number
  losses: number
  sets_won: number
  sets_lost: number
  points_won: number
  points_lost: number
  position: number | null
}
```

---

## Шаг 2 — `ExportService` · `tab.badminton`

**Файл:** `src/main/services/export.service.ts`

Читает из SQLite через существующие репозитории и собирает `TournamentSnapshot`.

Порядок сборки:
1. `tournaments.getById(id)` + `venues.getById(venueId)`
2. `courts.listByTournament(id)`
3. `events.listByTournament(id)`
4. Для каждого event:
   - `rounds.listByEvent(eventId)`
   - Для каждого round:
     - `roundTeams.listByRound(roundId)` → команды с игроками
     - `matches.listByRound(roundId)` + `match_sets` для каждого матча
     - Если `round.type === 'round_robin'`: `roundTeams.listTableByRound(roundId)`
5. `tournament_players` (accepted) → список игроков

Персональные данные (birth_year, gender) — не включать в снапшот.

---

## Шаг 3 — IPC handler и токен организатора · `tab.badminton`

**Файлы:**
- `src/main/ipc/router.ts` — новый handler `export:publish`
- `src/shared/types/ipc.ts` — добавить namespace `exportApi`
- `src/shared/types/app-settings.ts` — добавить поле `publishToken: string`

Handler `export:publish(tournamentId: string)`:
1. Вызывает `ExportService.build(tournamentId)`
2. Отправляет снапшот на прокси-API (см. шаг 4)
3. Возвращает `{ url: string; publishedAt: string }`

Токен организатора хранится в `AppSettings.publishToken`.
Вводится один раз в настройках приложения — выдаётся разработчиком вручную (см. ниже).

### Процесс выдачи токена

1. Организатор обращается к разработчику (любым способом)
2. Разработчик генерирует токен: `crypto.randomBytes(16).toString('hex')`
3. Добавляет запись в реестр на сервере: `{ "tok_abc123": "ivanov" }`
4. Отправляет токен организатору — тот вводит его в настройки приложения

Никакой регистрации и форм. Разработчик полностью контролирует список.

---

## Шаг 4 — Прокси-API и хранилище · `tab.badminton.web`

### Прокси-API

Serverless-функция размещается в том же Vercel-проекте, что и публичный сайт
(файл `src/pages/api/publish.ts` в Astro или отдельный Vercel Function).

Endpoint: `POST https://[site-domain]/api/publish`

```ts
// src/pages/api/publish.ts (Astro API route)
export async function POST({ request }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')

  // реестр токенов → organizerId (из переменной окружения на сервере)
  const registry: Record<string, string> = JSON.parse(process.env.ORGANIZER_TOKENS)
  const organizerId = registry[token]
  if (!organizerId) return new Response('Unauthorized', { status: 401 })

  const { tournamentId, snapshot } = await request.json()

  // blob-токен хранится только на сервере, приложение его не знает
  await put(`data/${tournamentId}.json`, JSON.stringify({ ...snapshot, _organizerId: organizerId }), {
    access: 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })

  return Response.json({ publishedAt: new Date().toISOString() })
}
```

Запрос из Electron:
```ts
await fetch('https://[site-domain]/api/publish', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${publishToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ tournamentId, snapshot }),
})
```

### Хранилище

**Vercel Blob** — бесплатный tier, публичное чтение, запись только через API.

Путь: `data/{tournamentId}.json`
Публичный URL: `https://[blob-store].public.blob.vercel-storage.com/data/{tournamentId}.json`

Поле `_organizerId` в JSON позволяет в будущем строить список турниров по организатору
и запрещать перезапись чужих данных.

### Переменные окружения на сервере (Vercel)

| Переменная            | Содержимое                                        |
|-----------------------|---------------------------------------------------|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (только на сервере)           |
| `ORGANIZER_TOKENS`    | JSON-объект `{"tok_...": "organizerId", ...}`     |

---

## Шаг 5 — Кнопка «Publish» в UI · `tab.badminton`

**Файл:** `src/renderer/src/pages/TournamentDetail.tsx` (или отдельный компонент)

Элементы:
- Постоянная ссылка на публичную страницу (показывается всегда, даже до публикации)
- Кнопка «Publish» → вызывает `window.api.exportApi.publish(tournamentId)`
- Спиннер во время загрузки
- После успеха: дата последней публикации + кнопка «Copy link»
- При ошибке: текст ошибки (токен не задан / сеть недоступна)

Публичная ссылка: `https://[site-domain]/[tournamentId]` — известна заранее.

---

## Шаг 6 — Публичный сайт (scaffold) · `tab.badminton.web`

**Новый репозиторий:** `tab.badminton.web`

Стек: **Astro** (статика + SSR по необходимости, минимальный JS)

```
tab.badminton.web/
├── src/
│   ├── pages/
│   │   ├── index.astro               ← заглушка / будущий список турниров
│   │   ├── [id].astro                ← страница турнира
│   │   └── api/
│   │       └── publish.ts            ← прокси-endpoint (шаг 4)
│   └── lib/
│       ├── snapshot.ts               ← fetch + тип TournamentSnapshot
│       └── blob-url.ts               ← формирует URL по tournamentId
├── astro.config.mjs                  ← output: 'hybrid' (нужен SSR для API route)
└── package.json
```

`src/lib/snapshot.ts` — копия типов из `tab.badminton/src/shared/types/tournament-snapshot.ts`.

---

## Шаг 7 — Хостинг и домен · `tab.badminton.web`

- **Хостинг:** Vercel (бесплатно, CI из git автоматически)
- **Деплой:** git push → Vercel пересобирает сайт
- **Домен:** любой, настраивается в Vercel dashboard

URL-структура:
```
/                      → заглушка (будущий список турниров)
/[tournamentId]        → страница конкретного турнира
```

---

## Шаг 8 — Страница турнира (минимальная) · `tab.badminton.web`

**Файл:** `src/pages/[id].astro`

Логика:
1. `fetch(getBlobUrl(id))` → `TournamentSnapshot | null`
2. Если 404 → показать «Информация о турнире ещё не опубликована»
3. Если данные есть → отобразить:
   - Название, даты, площадка
   - Список событий (категория + название)
   - Для каждого события: список матчей по турам/раундам в виде таблицы
   - Счёт и статус каждого матча
   - Standings для round_robin этапов

На этом шаге никакого дизайна — только читаемая структура данных.
Дата последней публикации из `exportedAt` — в footer или header.

---

## Итоговый поток

```
Разработчик выдаёт организатору токен (вручную)
  → Организатор вводит токен в настройки приложения один раз

Организатор создаёт турнир
  → получает постоянную ссылку /[id] (показывается в приложении сразу)

Организатор нажимает «Publish»
  → ExportService собирает снапшот из SQLite
  → Electron отправляет POST /api/publish с токеном организатора
  → Прокси-API валидирует токен, добавляет organizerId, пишет в Vercel Blob
  → Приложение показывает дату публикации

Участник переходит по ссылке
  → Astro SSR делает fetch JSON из Blob
  → Отображает расписание, результаты, сетки
```

---

## Зависимости между шагами

```
1 → 2 → 3 → 5   (Electron-сторона, последовательно)
             ↑
         4 ──┘   (прокси-API, часть сайта — нужен до тестирования шага 5)

6 → 4 → 7 → 8   (сайт: scaffold → API endpoint → хостинг → страница)
```

Шаги 1–3, 5 — изменения в основном проекте `tab.badminton`.
Шаги 4, 6–8 — новый репозиторий `tab.badminton.web`.

Практический порядок работы:
1. Сначала сделать шаги 1–3 (тип + ExportService + IPC)
2. Параллельно или сразу после — шаги 6–4–7 (scaffold сайта с API endpoint, деплой)
3. Затем шаг 5 (кнопка в UI) — тестируется против реального endpoint
4. Шаг 8 (страница турнира) — в конце

---

## Что остаётся за рамками этого плана

- Дизайн и UX публичного сайта
- Bracket-визуализация на сайте
- Online-регистрация участников
- Многотурнирный раздел (список всех турниров)
- Инкрементальные обновления (сейчас — полная перезапись снапшота)
- Авторизация для приватных турниров
