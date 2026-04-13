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

Шаги 1–20 завершены и закоммичены. Последние коммиты:

| Коммит | Шаг | Что сделано |
|--------|-----|-------------|
| `01058dd` | 20 | Groups View — экран этапа с командами, матчами, standings |
| `8006f62` | 19 | RoundRobinService (алгоритм Бергера) + тесты + matches IPC |
| `a5eb80a` | 18 | round_teams, round_table, UI добавления команд в раунд |
| `eaeb61f` | 17 | Rounds management — создание, редактирование, удаление этапов |
| `4f9d7dc` | 16 | Tournament teams — гендерная фильтрация, создание пар |

## Следующий шаг: Шаг 21

**Ввод результата матча + пересчёт standings**

Из `docs/plan.md`:
- UI: диалог ввода счёта по партиям (`match_sets`) и итогового счёта (`matches.s1/s2`)
- Статусы матча: `scheduled → in_progress → finished / walkover / retired`
- `RoundRobinService.updateStandings(roundId)` — пересчёт `round_table` после ввода результата
- **Тесты:** unit-тесты `updateStandings`: wins/losses, sets, points, tie-break
- **Commit:** `feat: add match result entry with automatic standings update`

## Схема БД (актуальная, 14 миграций)

```
venues           id, name, address
tournaments      id, name, date_start, date_end, venue_id, status, created_at, updated_at
players          id, first_name, last_name, club, gender(M|F)
events           id, tournament_id, name, category(MS|WS|MD|WD|XD), max_entries
tournament_players  id, tournament_id, player_id, status(pending|accepted|rejected), registered_at
teams            id, name, category(MS|WS|MD|WD|XD)
team_players     id, team_id, player_id, position
tournament_teams id, tournament_id, event_id, team_id
rounds           id, event_id, name, type(round_robin|playoff), order, qualification_rule
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
src/main/services/round-robin.service.ts       — bergerSchedule + generateMatches
src/main/services/round-robin.service.test.ts  — 17 тестов алгоритма и DB
src/main/ipc/router.ts                         — регистрация всех IPC handlers
src/preload/index.ts                           — contextBridge (window.api.*)
src/shared/types/ipc.ts                        — типы AppAPI (source of truth)
src/renderer/src/App.tsx                       — роуты React Router
src/renderer/src/locales/en/common.json        — все строки UI

Ключевые роуты UI:
  /                                            Dashboard (список турниров)
  /tournaments/:id                             TournamentDetail
  /tournaments/:id/players                     TournamentPlayers
  /tournaments/:id/teams                       TournamentTeams
  /tournaments/:id/rounds                      TournamentRounds (список этапов)
  /tournaments/:id/events/:eid/rounds/:rid/groups  GroupsView (экран этапа)
  /players                                     Players
  /teams                                       Teams
```

## Архитектурные решения

- **IPC pattern**: `ipcMain.handle('ns:method', (_e, ...args) => repo.method(...args))` в handler, `ipcRenderer.invoke('ns:method', ...args)` в preload, типизированный `window.api.ns.method()` в renderer.
- **Drizzle sync**: всегда `.run()` для write, `.get()` для single row, `.all()` для списков. Никаких async/await в репозиториях.
- **Алгоритм Бергера**: `bergerSchedule(teamIds[])` — чистая функция, экспортируется отдельно для тестов. Нечётное число команд → добавляем null-bye. Фиксируем последний слот, вращаем остальные.
- **round_table**: инициализируется нулями при `roundTeams.add()`, обновляется в шаге 21 через `updateStandings`.
- **GroupsView** — единый экран этапа: редактирование названия inline, участники, матчи (по турам), таблица. TournamentRounds — только навигационный список.
- **Миграции SQLite**: нельзя `ADD COLUMN NOT NULL` без default. Решение — DROP + CREATE через `statement-breakpoint`. Пример: миграция 0008.
- **Gender-aware teams**: при принятии заявки игрока → автосоздание singles-команды (MS для M, WS для F) через `ensureSinglesTeamOnAccept`.

## Незавершённые мысли / известные ограничения

- `match_sets` таблица создана, но не используется в UI — ввод счёта по партиям запланирован в шаге 21.
- `round_table.position` поле всегда `null` — заполняется в шаге 21 после расчёта standings.
- `matches.win_match_id / left_match_id / right_match_id` — для playoff-сетки, шаги 22–25.
- `qualification_rule` в `rounds` — для перехода из групп в playoff, шаг 23.
- Тесты репозитория (`*.repo.test.ts`) не запускаются через `npm test` из-за несовместимости Node v25 с `better-sqlite3` native binding. Запускать через `npx vitest run` после electron-rebuild.
