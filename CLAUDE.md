# CLAUDE.md — контекст для нового сеанса

## Документация проекта

Все документы находятся в `docs/`:

| Файл | Назначение |
|------|-----------|
| `docs/plan.md` | Пошаговый план реализации MVP (37 шагов). **Главный ориентир по прогрессу.** Отмечай `[x]` по мере выполнения. |
| `docs/idea.md` | Продуктовая дорожная карта: позиционирование, целевая аудитория, ключевые сценарии использования. |
| `docs/technical_design.md` | Техническое проектирование: стек, схема БД, IPC-архитектура, структура проекта. |
| `docs/backlog.md` | Идеи и пожелания за рамками MVP — для рассмотрения после первых пользователей. |

## Стек

- **Electron** + React 18 + TypeScript
- **SQLite** via `better-sqlite3` + Drizzle ORM (синхронный API, `.run()` / `.get()` / `.all()`)
- IPC через `contextBridge` → `window.api.*`
- Drizzle migrations: один файл = один или несколько statements через `--> statement-breakpoint`
- Tailwind CSS v4 + shadcn/ui
- i18n: `react-i18next`, переводы в `src/renderer/src/locales/en/common.json`
- Тесты: Vitest + in-memory SQLite через `src/main/db/test-helpers.ts`

## Прогресс по плану

Шаги 1–27 завершены и закоммичены. Последние коммиты:

| Коммит | Шаг | Что сделано |
|--------|-----|-------------|
| `5f12b32` | 27 | Schedule screen: двухколоночный layout, drag&drop, ввод результата |
| `fa7c823` | 26 | ScheduleService: assignSlot + validateConflicts + тесты |
| `af14c7c` | 25 | PlayoffService.advanceWinner + auto-progression + тесты |
| `410ff28` | 24 | PlayoffBracket — SVG-визуализация сетки, кликабельные матчи |
| `265cead` | 23 | GroupsView для playoff: Generate Bracket UI + тесты сидирования |

## Схема БД (актуальная, 15 миграций)

```
venues           id, name, address
tournaments      id, name, date_start, date_end, venue_id, status, created_at, updated_at
players          id, first_name, last_name, club, gender(M|F), birth_year
events           id, tournament_id, name, category(MS|WS|MD|WD|XD), max_entries
tournament_players  id, tournament_id, player_id, status(pending|accepted|rejected), registered_at
teams            id, name, category(MS|WS|MD|WD|XD)
team_players     id, team_id, player_id, position
tournament_teams id, tournament_id, event_id, team_id
rounds           id, event_id, name, type(round_robin|playoff), order, qualification_rule, age_min, age_max
round_teams      id, round_id, team_id, status(active|withdrawn), seed, checked_in
round_table      id, round_id, team_id, wins, losses, sets_won, sets_lost, points_won, points_lost, position
matches          id, round_id, team1_id, team2_id, winner_team_id, s1, s2,
                 status(scheduled|in_progress|finished|walkover|retired),
                 scheduled_at, court_id, win_match_id, left_match_id, right_match_id, tour
match_sets       id, match_id, order, s1, s2
courts           id, tournament_id, name
```

## Ключевые файлы

```
src/main/db/schema.ts                          — Drizzle-схема всех таблиц
src/main/db/repositories/                      — репозитории (синхр. Drizzle)
src/main/services/round-robin.service.ts       — bergerSchedule + generateMatches + updateStandings
src/main/services/round-robin.service.test.ts  — тесты алгоритма и DB
src/main/services/playoff.service.ts           — generateBracket + advanceWinner
src/main/services/playoff.service.test.ts      — тесты bracket и advanceWinner
src/main/services/schedule.service.ts          — assignSlot + validateConflicts + getOrderOfPlay + listScheduled + listUnscheduled
src/main/services/schedule.service.test.ts     — тесты validateConflicts
src/main/ipc/router.ts                         — регистрация всех IPC handlers
src/preload/index.ts                           — contextBridge (window.api.*)
src/shared/types/ipc.ts                        — типы AppAPI (source of truth)
src/shared/types/schedule.ts                   — тип MatchSlot
src/renderer/src/App.tsx                       — роуты React Router
src/renderer/src/locales/en/common.json        — все строки UI

Ключевые роуты UI:
  /                                            Dashboard (список турниров)
  /tournaments/:id                             TournamentDetail
  /tournaments/:id/players                     TournamentPlayers
  /tournaments/:id/teams                       TournamentTeams
  /tournaments/:id/rounds                      TournamentRounds (список этапов)
  /tournaments/:id/events/:eid/rounds/:rid/groups    GroupsView (round_robin и playoff список)
  /tournaments/:id/events/:eid/rounds/:rid/playoff   PlayoffBracket (SVG-сетка)
  /tournaments/:id/schedule                    TournamentSchedule (расписание)
  /players                                     Players
  /teams                                       Teams
```

## Архитектурные решения

- **IPC pattern**: `ipcMain.handle('ns:method', (_e, ...args) => repo.method(...args))` в handler, `ipcRenderer.invoke('ns:method', ...args)` в preload, типизированный `window.api.ns.method()` в renderer.
- **Drizzle sync**: всегда `.run()` для write, `.get()` для single row, `.all()` для списков. Никаких async/await в репозиториях.
- **Алгоритм Бергера**: `bergerSchedule(teamIds[])` — чистая функция, экспортируется отдельно для тестов. Нечётное число команд → добавляем null-bye. Фиксируем последний слот, вращаем остальные.
- **round_table**: инициализируется нулями при `roundTeams.add()`, пересчитывается через `updateStandings(db, roundId)` после каждого результата round_robin матча.
- **GroupsView** — единый экран этапа для обоих типов: редактирование названия inline, участники, матчи (по турам для RR, по раундам для playoff), standings (только для RR). Кнопка «View Bracket» ведёт на PlayoffBracket.
- **PlayoffBracket** — SVG-визуализация с `foreignObject` для карточек матчей. Обход дерева через `left_match_id` / `right_match_id` BFS от финала, компоновка по колонкам. После сохранения результата перезагружает все матчи раунда.
- **advanceWinner**: определяет слот победителя (left_match_id → team1_id, right_match_id → team2_id) и пишет в родительский матч. Вызывается автоматически в `matches:updateResult` когда `round.type === 'playoff'`.
- **Миграции SQLite**: нельзя `ADD COLUMN NOT NULL` без default. Решение — DROP + CREATE через `statement-breakpoint`. Пример: миграция 0008.
- **Gender-aware teams**: при принятии заявки игрока → автосоздание singles-команды (MS для M, WS для F) через `ensureSinglesTeamOnAccept`.
- **ScheduleService**: `getMatchesForTournament` — внутренний хелпер, собирает `MatchSlot[]` по всем events/rounds/matches турнира за одну цепочку запросов; `computeBracketRounds` — BFS от финала, определяет bracketRound (1 = первый раунд) для playoff-матчей. `validateConflicts` ищет конфликты через team_players → общие игроки в уже назначенных матчах.
- **TournamentSchedule**: двухколоночный layout (unscheduled / scheduled). Левая — матчи сгруппированы по туру/раунду сетки, карточки draggable (HTML5 DnD). Правая — табы по датам (DD), матчи по кортам в обратном хронологическом порядке, drop-зона сверху каждого корта (появляется при drag, если все матчи корта завершены или матчей нет), дефолтное время 09:00.
- **B-1 (возраст)**: `players.birth_year` (nullable integer). `rounds.age_min` / `rounds.age_max` (nullable integer). Возраст = год турнира − birth_year. Валидация в `roundTeams:add` / `roundTeams:addMany` handler — бросает Error если хотя бы один игрок с известным birth_year выходит за ограничение. Игроки без birth_year не проверяются. UI: столбец Born в Players, поля age_min/age_max в AddRoundForm и в inline-редакторе GroupsView.

## Незавершённые мысли / известные ограничения

- `round_table.position` — вычисляется при сортировке в UI, в БД всегда `null`.
- `qualification_rule` в `rounds` — для перехода из групп в playoff, шаг 23 по плану предполагал это, но пока не реализовано в UI.
- Тесты с `better-sqlite3` (`*.test.ts` с DB) не запускаются через `npm test` из-за несовместимости Node v25 с native binding. Запускать через `npx vitest run` после electron-rebuild. Чистые функции тестируются без проблем.
