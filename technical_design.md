# Техническое проектирование: Менеджер турниров (Desktop)

## 1. Технологический стек

### 1.1 Рантайм и сборка

| Слой | Технология | Обоснование |
|---|---|---|
| Десктоп-оболочка | **Electron** | Кросс-платформенность (macOS / Windows / Linux), доступ к файловой системе |
| Бандлер | **electron-vite** | Vite под Electron, быстрый HMR, TypeScript out-of-the-box |
| Язык | **TypeScript** | Статическая типизация, необходима для сложной доменной модели |
| UI-фреймворк | **React 18** | Совместимость с shadcn/ui |
| UI-компоненты | **shadcn/ui + Radix UI** | Кастомизируемые, без runtime-зависимости от сторонней библиотеки |
| Стилизация | **Tailwind CSS v4** | Используется shadcn/ui |
| Локальная БД | **SQLite** через **better-sqlite3** | Встраиваемая, не требует сетевого демона, хорошая производительность |
| ORM | **Drizzle ORM** | TypeScript-first, синхронный API для SQLite, миграции |
| Управление состоянием | **Zustand** | Минималистичное, легко сочетается с IPC-моделью Electron |
| Локализация | **i18next** + **react-i18next** | Стандарт для React; JSON-файлы переводов; смена языка без перезапуска |
| Трекинг ошибок | **Sentry** (`@sentry/electron`) | Покрывает main и renderer процессы; crash reports, stack traces, релизы |
| Аналитика | **Mixpanel** | Продуктовая аналитика и бизнес-метрики; анонимные события |

---

## 2. Архитектура приложения

### 2.1 Процессная модель Electron

```
┌────────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                    │
│                                                            │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  SQLite DB   │   │  IPC Router  │   │  File Manager  │  │
│  │  (Drizzle)   │   │  (handlers)  │   │ (backup/export)│  │
│  └──────────────┘   └──────────────┘   └────────────────┘  │
│          │                 │                    │          │
└──────────┼─────────────────┼────────────────────┼──────────┘
           │       Electron IPC (invoke/handle)   │
┌──────────┼─────────────────┼────────────────────┼──────────┐
│  Renderer Process (React)  │                    │          │
│                                                            │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  UI Layer    │   │  async hooks │   │  Zustand Store │  │
│  │  (shadcn/ui) │   │  (lib/hooks) │   │  (UI + data)   │  │
│  └──────────────┘   └──────────────┘   └────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 2.2 Слои приложения

```
renderer/
  app/               — маршруты (React Router v7 или TanStack Router)
  features/          — модули по доменным областям (tournament, players, teams, rounds, ...)
  components/        — переиспользуемые UI-компоненты
  lib/
    api/             — типизированные обёртки над window.api.* (единственная точка связи с Electron)
    hooks/           — простые async-хуки для вызовов через lib/api/
    store/           — Zustand-сторы

main/
  db/
    schema/          — Drizzle-схемы таблиц
    migrations/      — SQL-миграции
    repositories/    — репозитории по сущностям (CRUD)
  ipc/
    handlers/        — обработчики IPC-каналов по доменам
  services/          — бизнес-логика (генерация сеток, tie-break, расписание)
  sync/              — модуль синхронизации с удалённым сервером (REST)
  export/            — PDF / CSV экспорт
  backup/            — автосохранение, локальные резервные копии

preload/
  index.ts           — contextBridge API, экспонирует только нужные методы
```

### 2.3 IPC-контракт (Preload / contextBridge)

Весь обмен между renderer и main идёт через типизированный контракт, который определяется один раз в `preload/` и переиспользуется в обоих процессах:

```typescript
// shared/ipc-types.ts
export interface TournamentAPI {
  tournament: {
    create(data: CreateTournamentDTO): Promise<Tournament>
    getById(id: string): Promise<Tournament>
    list(): Promise<TournamentSummary[]>
    update(id: string, data: UpdateTournamentDTO): Promise<Tournament>
    delete(id: string): Promise<void>
    publish(id: string): Promise<PublicationSnapshot>
  }
  players: { ... }
  teams: { ... }
  tournamentPlayers: { ... }
  tournamentTeams: { ... }
  rounds: { ... }
  matches: { ... }
  schedule: { ... }
  export: { ... }
  sync: { ... }
}
```

Renderer вызывает методы через `window.api.tournament.create(...)` — никаких прямых вызовов `ipcRenderer.invoke` в компонентах.

---

## 3. Доменная модель

### 3.1 Сущности и связи

```
Tournament
  ├── venues[]            (место проведения, корты)
  ├── events[]            (категории: MS, WS, MD, ...)
  │     └── rounds[]      (раунды: групповой, playoff)
  │           ├── round_teams[]    (команды раунда)
  │           ├── round_table[]    (турнирная таблица; только для round robin)
  │           └── matches[]        (двунаправленное бинарное дерево для playoff;
  │                                 left/right_match_id → предыдущие матчи,
  │                                 win_match_id → следующий матч)
  ├── tournament_players[] (заявки игроков на турнир, со статусом)
  └── tournament_teams[]  (команды, участвующие в турнире; формируются из зарегистрированных игроков)

// Глобальный реестр (не привязан к турниру):
Players[]  (физические игроки)
Teams[]    (участвующая единица; 1 игрок — singles, 2 — doubles/mixed)
  └── team_players[] (связка team → players, 1 или 2 записи)

```

### 3.2 Ключевые типы

```typescript
type TournamentStatus = 'draft' | 'registration_open' | 'registration_closed' | 'in_progress' | 'finished'

type RegistrationStatus = 'pending' | 'accepted' | 'rejected'  // tournament_players
type RoundTeamStatus = 'pending' | 'accepted' | 'rejected'     // round_teams

type MatchStatus = 'scheduled' | 'ready' | 'in_progress' | 'finished' | 'walkover' | 'retired'

type RoundType = 'round_robin' | 'playoff'

type PlayoffSize = 4 | 8 | 16 | 32 | 64

type EventCategory = 'MS' | 'WS' | 'MD' | 'WD' | 'XD'
// MS — Men's Singles, WS — Women's Singles
// MD — Men's Doubles, WD — Women's Doubles, XD — Mixed Doubles
// Размер команды определяется категорией:
// MS, WS → team_players: 1 запись; MD, WD, XD → 2 записи
```

### 3.3 Схема БД (Drizzle, SQLite)

Основные таблицы:

- `players` — id, first_name, last_name, club
- `teams` — id, name, category
- `team_players` — id, team_id, player_id, order (1 | 2)
- `venues` — id, name, address

- `tournaments` — id, name, date_start, date_end, venue_id, status, created_at, updated_at
- `tournament_players` — id, tournament_id, player_id, status, registered_at
- `tournament_teams` — id, tournament_id, team_id
- `courts` — id, tournament_id, name
- `events` — id, tournament_id, name, category, max_entries
- `rounds` — id, event_id, name, type (round_robin | playoff), order, qualification_rule (JSON)
- `round_teams` — id, round_id, team_id, status, seed, checked_in
- `round_table` — id, round_id, team_id, wins, losses, sets_won, sets_lost, points_won, points_lost, position
- `matches` — id, round_id, team1_id, team2_id, winner_team_id, s1, s2, status, scheduled_at, court_id, win_match_id (nullable), left_match_id (nullable), right_match_id (nullable)
- `match_sets` — id, match_id, order, s1, s2
- `publication_snapshots` — id, tournament_id, payload (JSON), published_at

> **Решение:** `round_teams` — единственный способ попасть в раунд: и singles, и doubles регистрируются как команда. Singles — команда с одним игроком в `team_players`. Матчи ссылаются на `team_id` напрямую; `round_teams` хранит контекст участия команды в раунде (статус, посев, явка).

> **Решение:** `round_table` хранится явно и обновляется сервисом после каждого ввода результата. Это позволяет отображать таблицу до начала матчей (все показатели = 0) и не пересчитывать её из матчей при каждом запросе.

> **Решение:** playoff bracket хранится как двунаправленное бинарное дерево прямо в `matches`: `left_match_id` / `right_match_id` — ссылки на два предыдущих матча, чьи победители образуют пару; `win_match_id` — матч, куда продвигается победитель. Финальный матч имеет `win_match_id = null`. Первые матчи сетки имеют `left_match_id = null` и `right_match_id = null`. Структура позволяет воспроизводимо строить и рендерить сетку обходом дерева в любую сторону.

> **Решение:** итоговый счёт матча в сетах хранится в `matches.s1` / `s2` (например, 2–1). Счёт по каждой партии — в отдельной таблице `match_sets` (order, s1, s2). Такое разделение упрощает запросы на результат и оставляет место для расширения в сторону командных соревнований, где одна встреча состоит из нескольких матчей.

---

## 4. Бизнес-логика (Main Process / Services)

### 4.1 RoundRobinService

- `generateMatches(roundId)` — генерация round robin по всем командам этапа `round_teams`: каждый против каждого внутри своей группы, уникальные пары
- `updateStandings(roundId)` — пересчёт и сохранение `round_table` после ввода результата матча:
  1. Победы / Поражения
  2. Разница сетов
  3. Разница очков
  4. Разница очков в личных встречах (при равенстве первых трёх)

### 4.2 PlayoffService

- `generateBracket(roundId, roundTeams[])` — создание playoff bracket: определение размера сетки (ближайшая степень 2 ≥ числа участников), расстановка bye, создание дерева матчей с заполненными `left_match_id` / `right_match_id` / `win_match_id`
- `advanceWinner(matchId)` — после ввода результата находит матч по `win_match_id` и заполняет в нём `team1_id` или `team2_id` в зависимости от того, `left_match_id` или `right_match_id` ссылается на текущий матч
- `seedFromGroups(roundId, qualifiers[])` — создаёт `round_teams` для playoff-этапа из квалифицировавшихся, с учётом правила «лидеры разных групп в разных частях сетки»

### 4.3 ScheduleService

- `assignSlot(matchId, { courtId, datetime })` — назначение матча на корт/время
- `validateConflicts(matchId, { teamId, datetime, duration })` — проверка что ни один из игроков команды не занят в пересекающемся слоте (разрешается через `team_players`)
- `getOrderOfPlay(tournamentId, date)` — список матчей на день, отсортированный по корту и времени

### 4.4 ExportService

- `exportPDF(type, id)` — генерация PDF через **jsPDF** + **jspdf-autotable** + **svg2pdf.js**:
  - order of play
  - таблицы групп
  - playoff bracket (SVG → PDF через svg2pdf.js)
- `exportCSV(tournamentId)` — выгрузка результатов и игроков

### 4.5 PublicationService

- `createSnapshot(tournamentId)` — сериализация актуального состояния турнира в JSON (`PublicationSnapshot`)
- Снэпшот содержит денормализованные данные для публичного сайта (без необходимости JOIN)
- Хранится локально; при наличии синхронизации — отправляется на сервер

---

## 5. Синхронизация с удалённым сервером

### 5.1 Принцип

Desktop-приложение — **источник правды**. Сервер — **реплика для публикации**. Синхронизация однонаправленная (desktop → server), запускается вручную кнопкой Publish.

### 5.2 Модуль `sync/` (MVP)

Минимальная реализация для MVP — одна функция:

```typescript
interface SyncConfig {
  serverUrl: string
  apiKey: string
}

interface SyncClient {
  publishSnapshot(snapshot: PublicationSnapshot): Promise<void>
}
```

`autoSync`, `syncIntervalMs`, `checkConnection`, `getSyncStatus` — за пределами MVP. Добавить при переходе к Фазе 4 (Online-first).

### 5.3 REST API контракт (будущий сервер)

Для MVP достаточно одного эндпоинта:

| Метод | Путь | Назначение |
|---|---|---|
| `PUT` | `/api/v1/tournaments/:id/snapshot` | Опубликовать снэпшот |

Остальные эндпоинты добавить по мере роста требований.

Аутентификация: `Authorization: Bearer <api_key>` в заголовке.

### 5.4 Хранение конфигурации синхронизации

Настройки (serverUrl, apiKey) хранятся в JSON-файле в AppData через Node.js `fs` — не в SQLite, так как не являются данными турнира. `electron-store` не нужен: дополнительная зависимость без реального выигрыша на MVP.

---

## 6. Структура проекта

```
tab.badminton/
  src/
    main/                   — main process
      db/
        schema.ts           — Drizzle table definitions
        migrations/         — SQL files
        client.ts           — DB connection singleton
        repositories/
          tournament.repo.ts
          tournament_player.repo.ts
          tournament_team.repo.ts
          player.repo.ts
          team.repo.ts
          round.repo.ts
          match.repo.ts
          match_set.repo.ts
      services/
        round_robin.service.ts
        playoff.service.ts
        schedule.service.ts
        export.service.ts
        publication.service.ts
      ipc/
        handlers/
          tournament.handler.ts
          tournament_players.handler.ts
          tournament_teams.handler.ts
          players.handler.ts
          teams.handler.ts
          rounds.handler.ts
          matches.handler.ts
          schedule.handler.ts
          export.handler.ts
          sync.handler.ts
        router.ts           — регистрация всех handlers
      sync/
        client.ts
        config.ts
      index.ts              — Electron main entry

    preload/
      index.ts              — contextBridge

    renderer/
      src/
        app/
          routes/           — страницы (TanStack Router)
        features/
          tournament/
          players/
          teams/
          rounds/
          playoff/
          schedule/
          publication/
        components/         — общие UI-блоки
        locales/
          en/               — английский (язык по умолчанию для MVP)
        lib/
          api/              — типизированные обёртки window.api.*
          hooks/            — async-хуки над lib/api/
          store/            — Zustand
          i18n.ts           — инициализация i18next, определение языка
        main.tsx
        App.tsx

    shared/
      types/                — DTO, domain types, IPC contract
      constants.ts

  electron.vite.config.ts
  drizzle.config.ts
  package.json
  tsconfig.json
```

---

## 7. Навигация и экраны

### 7.1 Маршруты

```
/                                          — Dashboard (список турниров)
/players                                   — Глобальный реестр игроков
/teams                                     — Глобальный реестр команд
/tournaments/new                           — Создать турнир
/tournaments/:id                           — Турнир (overview)
/tournaments/:id/players                   — Заявки игроков на турнир
/tournaments/:id/teams                     — Команды турнира
/tournaments/:id/events/:eid/rounds/:rid            — Раунд (overview)
/tournaments/:id/events/:eid/rounds/:rid/groups     — Групповой этап
/tournaments/:id/events/:eid/rounds/:rid/playoff    — Playoff bracket
/tournaments/:id/schedule                  — Расписание
/tournaments/:id/publish                   — Публикация
/settings                                  — Настройки (sync, backup)
```

### 7.2 Ключевые экраны

- **Dashboard** — карточки турниров, статус, кнопка создать
- **Tournament Setup** — wizard: название, место, даты, корты, категории (events)
- **Players (global)** — глобальный реестр игроков, создание, bulk-import CSV
- **Teams (global)** — глобальный реестр команд, состав (team_players)
- **Tournament Players** — заявки игроков на турнир, статус регистрации
- **Tournament Teams** — команды турнира, формирование из зарегистрированных игроков
- **Round View** — обзор раунда: список команд, тип (round robin / playoff)
- **Groups View** — drag-and-drop распределение команд по группам, таблица группы, матчи
- **Match Entry** — ввод результата (счёт по партиям через match_sets), статус матча
- **Playoff Bracket** — SVG/canvas визуализация сетки, кликабельные матчи
- **Schedule** — calendar/timeline по кортам и дням
- **Publish** — предпросмотр снэпшота, кнопка Publish, статус синхронизации

---

## 8. Надёжность и работа с данными

### 8.1 Autosave

- Все изменения записываются в SQLite синхронно (better-sqlite3 — синхронный API)
- Нет ручного сохранения: данные не теряются при закрытии

### 8.2 Backup

- При каждом запуске приложения — автоматическая копия `tournament.db` в `backups/YYYYMMDD_HHmmss.db`
- Хранить последние N копий (настраивается, по умолчанию 10)
- Ручной экспорт файла БД через меню

### 8.3 Миграции

- Drizzle migrations — применяются автоматически при запуске main process
- При невозможности применить миграцию — показать диалог с предложением восстановить backup

### 8.4 Трекинг ошибок

- **Sentry** (`@sentry/electron`) инициализируется при старте main process и renderer
- Собирает: необработанные исключения, падения процессов, ошибки renderer (React Error Boundary → Sentry)
- Каждый релиз тегируется версией приложения (`release`) — позволяет привязывать ошибки к конкретной сборке
- В отчёт не включаются данные турниров и персональные данные игроков (PII scrubbing через `beforeSend`)
- DSN хранится в конфигурации сборки, не в коде

### 8.5 Аналитика и метрики

**Инструмент:** Mixpanel (анонимный distinct_id генерируется при первом запуске и хранится локально).

Никакие персональные данные и содержимое турниров не передаются. Все события — анонимные счётчики и измерения.

**Offline-first доставка:**
Приложение работает без интернета без каких-либо ограничений. События не теряются:
- каждое событие сразу записывается в локальный файл-очередь (`analytics-queue.json` в AppData)
- фоновый воркер в main process каждые 30 секунд проверяет наличие сети и пытается отправить накопленные события в Mixpanel батчем
- при успешной отправке события удаляются из очереди
- пользователь не получает никаких уведомлений — процесс полностью прозрачен

**Метрики приложения:**
- запуск / закрытие приложения, версия, платформа
- навигация между экранами (screen_viewed)
- длительность сессии

**Метрики сервисов:**
- время выполнения ключевых операций: `generateMatches`, `generateBracket`, `updateStandings`, `createSnapshot`
- ошибки сервисов (тип ошибки без данных)

**Бизнес-метрики:**
| Событие | Что измеряем |
|---|---|
| `tournament_created` | кол-во созданных турниров |
| `tournament_published` | кол-во публикаций |
| `event_created` | кол-во категорий, `category` (MS/WS/MD/WD/XD) |
| `round_created` | тип раунда (round_robin / playoff) |
| `players_imported` | кол-во игроков, способ (csv / manual) |
| `bracket_generated` | размер сетки (4/8/16/32/64) |
| `match_result_entered` | кол-во введённых результатов |

### 8.6 Целостность данных

- Все FK — с `ON DELETE RESTRICT` по умолчанию (не удалить игрока или команду, если есть матчи)
- Каскадное удаление только там, где оно явно задокументировано (например, удаление турнира удаляет этапы турнира)
- Транзакции для операций, изменяющих несколько таблиц (генерация bracket, продвижение победителя)

---

## 9. Разработка и сборка

### 9.1 Команды

```bash
npm run dev          # Electron + Vite HMR
npm run build        # Production build
npm run dist         # Electron Builder: .dmg / .exe / .AppImage
npm run db:generate  # Drizzle: сгенерировать миграцию
npm run db:migrate   # Drizzle: применить миграции вручную
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
```

### 9.2 Electron Builder

Целевые платформы:

- macOS — `.dmg` (arm64 + x64)
- Windows — NSIS installer `.exe`
- Linux — `.AppImage`

### 9.3 Тестирование

| Уровень | Инструмент | Покрытие |
|---|---|---|
| Unit | **Vitest** | Services (RoundRobinService, PlayoffService, ScheduleService) |
| Integration | **Vitest** + in-memory SQLite | Repositories + Services вместе |

> Playwright E2E — за пределами MVP. Добавить после стабилизации ключевых сценариев.

---

## 10. Зависимости (package.json, основные)

```json
{
  "dependencies": {
    "electron": "^33",
    "better-sqlite3": "^11",
    "drizzle-orm": "^0.38",
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^7",
    "zustand": "^5",
    "i18next": "^24",
    "react-i18next": "^15",
    "tailwindcss": "^4",
    "@radix-ui/react-*": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "lucide-react": "latest",
    "jspdf": "^2",
    "jspdf-autotable": "^3",
    "svg2pdf.js": "^2",
    "@sentry/electron": "^5",
    "mixpanel": "^0.18"
  },
  "devDependencies": {
    "electron-vite": "^2",
    "electron-builder": "^25",
    "drizzle-kit": "^0.28",
    "typescript": "^5",
    "vitest": "^2",
    "eslint": "^9",
    "vite": "^6"
  }
}
```

---

## 11. Фазы проекта и связь с продуктовой дорожной картой

| Продуктовая итерация | Технические задачи |
|---|---|
| **Phase 1, It. 1** — Каркас турнира | Schema: tournaments, venues, courts, events, rounds; CRUD IPC; Dashboard + Setup wizard |
| **Phase 1, It. 2** — Участники | Schema: players, teams, team_players, tournament_players, tournament_teams, round_teams, round_table, match_sets; CSV-import; Players screen, Teams screen |
| **Phase 1, It. 3** — Round Robin | RoundRobinService.generateMatches, updateStandings; Groups screen с drag-and-drop |
| **Phase 1, It. 4** — Playoff | PlayoffService.generateBracket, seedFromGroups; Bracket screen |
| **Phase 1, It. 5** — Результаты | Match entry UI; advanceWinner; статусы матчей |
| **Phase 1, It. 6** — Расписание | ScheduleService; Schedule screen (timeline по кортам) |
| **Phase 1, It. 7** — Публикация | PublicationService.createSnapshot; SyncClient; Publish screen |
| **Phase 1, It. 8** — Hardening | Autosave подтверждено; backup; PDF/CSV export; onboarding |
| **Phase 4, It. 1** — Online-first | Расширение SyncClient: двунаправленная синхронизация, conflict resolution |

---

## 12. Открытые вопросы и решения, требующие подтверждения

| Вопрос | Предварительное решение | Требует решения |
|---|---|---|
| PDF-генерация | jsPDF + jspdf-autotable + svg2pdf.js | Нет |
| Маршрутизация в renderer | React Router v7 vs TanStack Router | Да |
| Drag-and-drop для распределения команд по группам | @dnd-kit | Нет, @dnd-kit — стандарт для React |
| SVG для playoff bracket | Самописный компонент vs react-bracket | Да |
| Формат API-ключа для синхронизации | Bearer token | Нет, достаточно для MVP |
| Целевая платформа для MVP | macOS-first, затем Windows | Рекомендуется уточнить |

---

## 13. Переносимость на веб

Архитектура намеренно построена так, чтобы при переходе к веб-приложению переписывать минимум.

### Что переедет без изменений (~80%)

- Весь `renderer/` — обычный React SPA без Electron-специфики
- Компоненты, экраны, стили, роуты
- Zustand-сторы
- TypeScript-типы из `shared/types/`

### Что потребует замены (~10%)

- `lib/api/` — единственная точка связи с Electron. Для веба достаточно написать альтернативную реализацию того же интерфейса, которая делает HTTP-запросы вместо IPC. Компоненты этого не почувствуют.

> **Правило:** Electron-специфичный код не должен выходить за пределы `lib/api/`. Никаких прямых вызовов `window.api.*` в компонентах или фичах.

### Что останется только в десктопе

- `main/` — IPC handlers, SQLite, Drizzle, backup, файловая система
- `preload/` — contextBridge

### Бизнес-логика

`services/` (`RoundRobinService`, `PlayoffService`, `ScheduleService`) — чистый TypeScript без зависимости от Electron. При переходе на веб переезжают на Node.js-бэкенд без изменений.

### Что потребует нового проектирования при переходе на веб

- Auth и управление пользователями (сейчас отсутствует по дизайну)
- Многопользовательский concurrent-доступ к одному турниру
- Real-time обновления (WebSocket / SSE)
- Смена парадигмы: «сервер — источник правды» вместо «десктоп — источник правды»
