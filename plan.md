# План реализации: Менеджер турниров (Desktop)

Каждый шаг — один git commit, видимый инкремент для пользователя.
Тесты пишутся там, где есть бизнес-логика (services, repositories).

---

## Этап 0. Основа проекта

### Шаг 1. Инициализация проекта
- [x] `electron-vite` + TypeScript + React 18
- Конфигурация `tsconfig.json`, `electron.vite.config.ts`, `eslint`
- **Результат:** приложение запускается, открывается пустое окно
- **Commit:** `chore: init electron-vite project with TypeScript and React`

### Шаг 2. UI-фундамент
- [x] Tailwind CSS v4, shadcn/ui (Button, Card, Input, Dialog — базовый набор)
- Общий layout: sidebar + main area
- **Результат:** приложение открывается с навигационной оболочкой
- **Commit:** `chore: add Tailwind CSS v4, shadcn/ui and app shell layout`

### Шаг 3. Инфраструктура базы данных
- [x] `better-sqlite3` + Drizzle ORM
- `main/db/client.ts` — singleton подключение
- `drizzle.config.ts`, `npm run db:generate`, `npm run db:migrate`
- Пустая первая миграция
- **Результат:** база данных создаётся при старте без ошибок
- **Commit:** `chore: add SQLite with Drizzle ORM and migrations infrastructure`

### Шаг 4. IPC-инфраструктура
- [x] `preload/index.ts` с `contextBridge`
- `main/ipc/router.ts` — регистрация handlers
- `renderer/src/lib/api/` — типизированные обёртки `window.api.*`
- `shared/types/` — базовые IPC-типы
- Ping/pong handler для проверки
- **Результат:** renderer может вызывать main process через типизированный API
- **Commit:** `chore: add IPC infrastructure with contextBridge and typed api layer`

---

## Этап 1. Турнир (каркас)

### Шаг 5. Таблица venues
- [x] Схема: `venues` (id, name, address)
- `VenueRepository`: create, getById, list, update, delete
- IPC handler: `venues.*`
- **Тесты:** unit-тесты VenueRepository (in-memory SQLite)
- **Результат:** venues можно создавать и читать через IPC
- **Commit:** `feat: add venues table with repository and IPC handler`

### Шаг 6. Таблица tournaments
- [x] Схема: `tournaments` (id, name, date_start, date_end, venue_id, status, created_at, updated_at)
- `TournamentRepository`: create, getById, list, update, delete
- IPC handler: `tournament.*`
- **Тесты:** unit-тесты TournamentRepository
- **Результат:** турниры можно создавать и читать через IPC
- **Commit:** `feat: add tournaments table with repository and IPC handler`

### Шаг 7. Dashboard — список турниров
- [x] Маршрут `/` — список карточек турниров
- Пустое состояние с call-to-action
- Zustand store: `useTournamentStore`
- **Результат:** пользователь видит список своих турниров (или empty state)
- **Commit:** `feat: add Dashboard screen with tournament list`

### Шаг 7.5. Локализация (i18n)
- [ ] `i18next` + `react-i18next` — setup и провайдер
- `src/renderer/src/locales/en/common.json` — английский (единственный язык MVP)
- Все строки UI вынесены в файл переводов, компоненты используют `t()`
- Обновить Dashboard и Sidebar (уже написанные экраны)
- **Результат:** все строки в одном месте, добавление нового языка — только новый JSON-файл
- **Commit:** `chore: add i18n infrastructure with react-i18next`

### Шаг 8. Создание турнира
- [ ] Маршрут `/tournaments/new` — форма создания
- Поля: название, место (создание venue inline), даты, статус
- После создания — редирект на страницу турнира
- **Результат:** пользователь может создать первый турнир
- **Commit:** `feat: add tournament creation form with venue`

### Шаг 9. Страница турнира (overview)
- [ ] Маршрут `/tournaments/:id` — просмотр деталей
- Редактирование полей турнира
- Удаление турнира (с подтверждением)
- Статус-бейдж
- **Результат:** пользователь может просматривать и редактировать созданный турнир
- **Commit:** `feat: add tournament overview screen with edit and delete`

### Шаг 10. Корты турнира
- [ ] Схема: `courts` (id, tournament_id, name)
- `CourtRepository` + IPC handler
- UI: управление кортами на странице турнира
- **Результат:** к турниру можно привязать корты
- **Commit:** `feat: add courts management within tournament`

### Шаг 11. Категории турнира (events)
- [ ] Схема: `events` (id, tournament_id, name, category, max_entries)
- `EventRepository` + IPC handler
- UI: список категорий (MS / WS / MD / WD / XD), добавление/удаление
- **Результат:** к турниру можно добавить соревновательные категории
- **Commit:** `feat: add events (categories) management within tournament`

---

## Этап 2. Игроки и команды (реестр)

### Шаг 12. Глобальный реестр игроков
- [ ] Схема: `players` (id, first_name, last_name, club)
- `PlayerRepository` + IPC handler
- Маршрут `/players` — список, создание, редактирование
- **Результат:** организатор может вести базу игроков независимо от турниров
- **Commit:** `feat: add global players registry screen`

### Шаг 13. Импорт игроков из CSV
- [ ] `ExportService.importPlayersCSV` (парсинг в main process)
- UI: кнопка «Import CSV» на экране `/players`
- **Тесты:** unit-тест парсинга CSV
- **Результат:** можно загрузить список игроков из файла за один шаг
- **Commit:** `feat: add CSV import for players`

### Шаг 14. Глобальный реестр команд
- [ ] Схема: `teams` (id, name, category), `team_players` (id, team_id, player_id, order)
- `TeamRepository` + IPC handler
- Маршрут `/teams` — список команд, создание (выбор 1 или 2 игроков из реестра)
- **Результат:** можно создавать одиночные и парные команды из зарегистрированных игроков
- **Commit:** `feat: add global teams registry with team_players`

### Шаг 15. Заявки игроков на турнир (tournament_players)
- [ ] Схема: `tournament_players` (id, tournament_id, player_id, status, registered_at)
- `TournamentPlayerRepository` + IPC handler
- Маршрут `/tournaments/:id/players` — список заявок, изменение статуса (pending → accepted / rejected)
- **Результат:** организатор может управлять регистрацией игроков на турнир
- **Commit:** `feat: add tournament player registrations screen`

### Шаг 16. Команды турнира (tournament_teams)
- [ ] Схема: `tournament_teams` (id, tournament_id, team_id)
- `TournamentTeamRepository` + IPC handler
- Маршрут `/tournaments/:id/teams` — выбор команд из реестра для участия в турнире
- **Результат:** организатор формирует состав участников турнира из зарегистрированных команд
- **Commit:** `feat: add tournament teams management screen`

---

## Этап 3. Групповой этап (Round Robin)

### Шаг 17. Раунды турнира
- [ ] Схема: `rounds` (id, event_id, name, type, order, qualification_rule JSON)
- `RoundRepository` + IPC handler
- UI: создание раундов для категории (тип: round_robin / playoff)
- **Результат:** к каждой категории можно добавить раунды разного типа
- **Commit:** `feat: add rounds management per event`

### Шаг 18. Команды раунда (round_teams) и round_table
- [ ] Схема: `round_teams` (id, round_id, team_id, status, seed, checked_in), `round_table` (id, round_id, team_id, wins, losses, sets_won, sets_lost, points_won, points_lost, position)
- `RoundTeamRepository`, `RoundTableRepository` + IPC handlers
- UI: добавление команд в раунд из состава tournament_teams
- **Результат:** в раунде можно зарегистрировать участников, таблица инициализируется нулями
- **Commit:** `feat: add round_teams and round_table with team assignment UI`

### Шаг 19. Генерация матчей Round Robin
- [ ] Схема: `matches` (id, round_id, team1_id, team2_id, winner_team_id, s1, s2, status, scheduled_at, court_id, win_match_id, left_match_id, right_match_id), `match_sets` (id, match_id, order, s1, s2)
- `MatchRepository` + IPC handler
- `RoundRobinService.generateMatches(roundId)` — каждый против каждого, уникальные пары
- **Тесты:** unit-тесты generateMatches: корректное число пар, нет дублей
- **Результат:** нажав «Generate Matches», организатор получает полный список матчей группового этапа
- **Commit:** `feat: add RoundRobinService.generateMatches with tests`

### Шаг 20. Экран групп (Groups View)
- [ ] Маршрут `/tournaments/:id/events/:eid/rounds/:rid/groups`
- Отображение списка матчей раунда
- Таблица round_table (standings)
- **Результат:** организатор видит все матчи и турнирную таблицу группового этапа
- **Commit:** `feat: add Groups View screen with matches list and standings table`

### Шаг 21. Ввод результата матча
- [ ] UI: диалог ввода счёта по партиям (match_sets) и итогового счёта (matches.s1/s2)
- Статусы матча: scheduled → in_progress → finished / walkover / retired
- `RoundRobinService.updateStandings(roundId)` — пересчёт round_table после ввода
- **Тесты:** unit-тесты updateStandings: wins/losses, sets, points, tie-break
- **Результат:** после ввода результата таблица группы обновляется автоматически
- **Commit:** `feat: add match result entry with automatic standings update`

---

## Этап 4. Playoff

### Шаг 22. Генерация playoff bracket
- [ ] `PlayoffService.generateBracket(roundId, roundTeams[])` — определение размера сетки, bye-слоты, дерево матчей (win_match_id, left_match_id, right_match_id)
- **Тесты:** unit-тесты: 5 команд → bracket 8, расстановка bye; 8 команд → bracket 8, нет bye; корректные ссылки между матчами
- **Результат:** IPC-вызов создаёт структуру playoff bracket в БД
- **Commit:** `feat: add PlayoffService.generateBracket with bracket tree and tests`

### Шаг 23. Выход из групп (seedFromGroups)
- [ ] `PlayoffService.seedFromGroups(roundId, qualifiers[])` — извлечение квалифицировавшихся по qualification_rule, расстановка в bracket
- UI: на экране раунда — кнопка «Generate Playoff» с выбором правила выхода (top 1 / top 2)
- **Тесты:** unit-тесты seedFromGroups: лидеры из разных групп попадают в разные части сетки
- **Результат:** победители групп автоматически заносятся в playoff bracket
- **Commit:** `feat: add PlayoffService.seedFromGroups with qualification rules and tests`

### Шаг 24. Экран playoff bracket
- [ ] Маршрут `/tournaments/:id/events/:eid/rounds/:rid/playoff`
- SVG-визуализация сетки (самописный компонент обходом дерева)
- Кликабельные матчи — открывают диалог ввода результата
- **Результат:** организатор видит сетку и может кликнуть на матч для ввода счёта
- **Commit:** `feat: add playoff bracket screen with SVG visualization`

### Шаг 25. Продвижение победителя по сетке
- [ ] `PlayoffService.advanceWinner(matchId)` — по `win_match_id` заполняет team1_id / team2_id следующего матча
- Вызывается автоматически после ввода результата playoff-матча
- **Тесты:** unit-тесты advanceWinner: победитель попадает в правильный слот (left/right)
- **Результат:** после ввода результата победитель автоматически переходит в следующий раунд bracket
- **Commit:** `feat: add PlayoffService.advanceWinner with auto-progression tests`

---

## Этап 5. Расписание

### Шаг 26. Назначение матчей на корты
- [ ] `ScheduleService.assignSlot(matchId, { courtId, datetime })`
- `ScheduleService.validateConflicts(matchId, { teamId, datetime, duration })` — проверка занятости игрока через team_players
- IPC handlers для schedule
- **Тесты:** unit-тесты validateConflicts: конфликт / нет конфликта при пересечении слотов
- **Результат:** матчу можно назначить корт и время; при конфликте показывается предупреждение
- **Commit:** `feat: add ScheduleService with slot assignment and conflict validation`

### Шаг 27. Экран расписания
- [ ] Маршрут `/tournaments/:id/schedule`
- Timeline-вид: строки — корты, колонки — время
- Фильтры по категории и стадии
- `ScheduleService.getOrderOfPlay(tournamentId, date)` — список матчей на день
- **Результат:** организатор видит order of play по кортам и может назначать матчи
- **Commit:** `feat: add Schedule screen with court timeline and order of play`

---

## Этап 6. Публикация

### Шаг 28. Снэпшот публикации
- [ ] Схема: `publication_snapshots` (id, tournament_id, payload JSON, published_at)
- `PublicationService.createSnapshot(tournamentId)` — сериализация состояния турнира в денормализованный JSON
- **Тесты:** unit-тест: снэпшот содержит все необходимые секции (overview, entries, groups, playoff, schedule, results)
- **Результат:** по IPC-вызову создаётся снэпшот данных турнира
- **Commit:** `feat: add PublicationService.createSnapshot with snapshot tests`

### Шаг 29. Sync client (MVP)
- [ ] `main/sync/client.ts` — `PUT /api/v1/tournaments/:id/snapshot`
- `main/sync/config.ts` — хранение serverUrl, apiKey в JSON-файле в AppData
- IPC handler `sync.publishSnapshot`
- **Результат:** снэпшот можно отправить на удалённый сервер через IPC
- **Commit:** `feat: add sync client with PUT snapshot endpoint`

### Шаг 30. Экран публикации
- [ ] Маршрут `/tournaments/:id/publish`
- Предпросмотр ключевых данных снэпшота
- Кнопка «Publish», статус последней публикации
- Экран настроек `/settings` — serverUrl, apiKey
- **Результат:** организатор может опубликовать турнир в один клик
- **Commit:** `feat: add Publish screen and settings for sync configuration`

---

## Этап 7. Надёжность (Hardening)

### Шаг 31. Автосохранение и backup
- [ ] Автоматическая копия `tournament.db` в `backups/YYYYMMDD_HHmmss.db` при каждом запуске
- Хранить последние N копий (по умолчанию 10)
- Ручной экспорт файла БД через меню
- **Результат:** данные не теряются при сбое; можно восстановиться из backup
- **Commit:** `feat: add auto-backup on startup with configurable retention`

### Шаг 32. PDF-экспорт: order of play и таблицы групп
- [ ] `ExportService.exportPDF` — jsPDF + jspdf-autotable
- Кнопки экспорта на экранах расписания и групп
- **Результат:** организатор может распечатать расписание и таблицы групп
- **Commit:** `feat: add PDF export for order of play and group standings`

### Шаг 33. PDF-экспорт: playoff bracket
- [ ] SVG → PDF через svg2pdf.js
- Кнопка экспорта на экране playoff bracket
- **Результат:** playoff bracket можно распечатать
- **Commit:** `feat: add PDF export for playoff bracket via SVG`

### Шаг 34. CSV-экспорт
- [ ] `ExportService.exportCSV(tournamentId)` — игроки, команды, результаты
- Кнопка экспорта на странице турнира
- **Результат:** данные турнира можно выгрузить в таблицу
- **Commit:** `feat: add CSV export for tournament data`

### Шаг 35. Sentry (трекинг ошибок)
- [ ] `@sentry/electron` в main и renderer процессах
- React Error Boundary → Sentry
- PII scrubbing через `beforeSend`
- DSN из переменной окружения/конфига сборки
- **Результат:** необработанные ошибки автоматически отправляются в Sentry
- **Commit:** `feat: add Sentry error tracking with PII scrubbing`

### Шаг 36. Mixpanel (аналитика)
- [ ] Генерация анонимного `distinct_id` при первом запуске
- Локальная очередь событий `analytics-queue.json` в AppData
- Фоновый воркер в main process — отправка батча каждые 30 секунд при наличии сети
- События: app lifecycle, screen_viewed, business metrics (tournament_created, bracket_generated и т.д.)
- **Результат:** продуктовая аналитика работает без блокировки, метрики доезжают при появлении сети
- **Commit:** `feat: add Mixpanel analytics with offline-first event queue`

### Шаг 37. Онбординг
- [ ] Экран приветствия при первом запуске (первый раз нет турниров)
- Подсказки на ключевых экранах (tooltip / inline hint)
- **Результат:** новый пользователь понимает, с чего начать
- **Commit:** `feat: add first-run onboarding hints`

---

## Итог по этапам

| Этап | Шаги | Результат для пользователя |
|------|------|---------------------------|
| 0. Основа | 1–4 | Приложение запускается с оболочкой |
| 1. Турнир | 5–11 | Можно создать турнир с кортами и категориями |
| 2. Игроки и команды | 12–16 | Можно добавить участников и сформировать состав |
| 3. Round Robin | 17–21 | Можно провести групповой этап с таблицей |
| 4. Playoff | 22–25 | Можно провести playoff с автопродвижением |
| 5. Расписание | 26–27 | Можно составить order of play по кортам |
| 6. Публикация | 28–30 | Можно опубликовать турнир на сайт |
| 7. Hardening | 31–37 | MVP стабилен, данные защищены, аналитика работает |

**Итого: 37 шагов = 37 коммитов = полный MVP**
