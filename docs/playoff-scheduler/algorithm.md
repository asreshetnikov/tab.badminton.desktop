# Алгоритм составления расписания

## Модель данных

```
Tournament
  └─ courts: Court[N]
  └─ categories: Category[]       # singles/doubles/mixed
  └─ rest_minutes: M
  └─ day_start_times: Date[]
  └─ stage_durations: {round → minutes}

Category
  └─ bracket: Match[]             # бинарное дерево

Match
  └─ id, category, round
  └─ sides: Side[2]               # каждая сторона — 1 или 2 игрока
  └─ parent_match: Match?         # матч следующего раунда
  └─ child_matches: Match[2]?     # матчи, чьи победители — участники этого
  └─ status: PENDING | READY | IN_PROGRESS | COMPLETED
  └─ not_before_hard: DateTime?   # задаётся вручную
  └─ not_before_soft: DateTime    # вычисляется
  └─ effective_not_before: DateTime  # max(soft, hard)
  └─ scheduled_start: DateTime?
  └─ actual_start / actual_end: DateTime?
  └─ court: Court?

Player
  └─ id, name, gender
  └─ matches: Match[]             # все матчи во всех категориях
```

---

## Вычисляемые поля

**`not_before_soft(match)`**
```
Для каждого участника p:
  last_end(p) = max actual_end среди всех COMPLETED матчей p
              = day_start_time, если матчей ещё не было

not_before_soft(match) = max(last_end(p) + M) по всем участникам матча
```

**`effective_not_before(match)`**
```
max(not_before_soft, not_before_hard ?? -∞)
```

**`priority(match)`** — ключевая функция для сортировки очереди
```
# Глубина в своей категории: сколько матчей после этого до финала включительно
category_depth(match) = rounds from this match to final
                        # финал = 1, полуфинал = 2, 1/4 = 3 ...

# Кросс-категорийная нагрузка игроков
cross_pending(player) = кол-во PENDING/READY/IN_PROGRESS матчей
                        в ДРУГИХ категориях этого игрока

priority(match) = category_depth(match)
                + max(cross_pending(p)) по всем участникам матча
```

Логика: матч, чей победитель ещё должен сыграть много матчей (и в этой категории, и в других), нужно сыграть раньше, чтобы не создавать цепочку ожиданий.

---

## Событийная модель

Система реагирует на три типа событий:

```
EVENT: court_freed(court, time T)
EVENT: match_completed(match, winner, time T)
EVENT: queue_rebuild_requested()      # вручную или при старте
```

---

## Основной алгоритм: назначение матча на площадку

```
function assign_next(court, T):

  ready = все матчи со статусом READY

  # Матчи, которые уже можно начать
  available = [m ∈ ready | m.effective_not_before ≤ T]

  if available не пуст:
    best = argmax(priority) в available
           при равенстве — наименьший effective_not_before
    schedule(best, court, start_time = T)

  else:
    # Площадка ждёт ближайшего матча
    earliest = argmin(effective_not_before) в ready
    schedule(earliest, court, start_time = earliest.effective_not_before)
```

---

## Обработка завершения матча

```
function on_match_completed(match, winner, T):

  match.status = COMPLETED
  match.actual_end = T

  # 1. Продвинуть победителя в скобке
  next = match.parent_match
  if next:
    next.fill_participant(winner)
    if next.all_participants_known():
      next.status = READY
      recompute_not_before_soft(next)

  # 2. Пересчитать not_before_soft для всех READY матчей,
  #    в которых участвуют игроки завершённого матча
  for p in match.all_players:
    for m in p.upcoming_matches where m.status == READY:
      recompute_not_before_soft(m)

  # 3. Пересчитать priority всей очереди
  #    (cross_pending изменился у других матчей этих игроков)
  recompute_priorities()

  # 4. Назначить освободившуюся площадку
  assign_next(match.court, T)
```

---

## Начальное построение очереди

```
function build_initial_queue():
  for each category:
    for each round_1_match:
      match.status = READY
      recompute_not_before_soft(match)

  recompute_priorities()
  # Очередь = все READY матчи, отсортированные по приоритету
```

---

## Триггеры пересчёта

| Событие | Действие |
|---|---|
| Старт турнира / внесены все данные | `build_initial_queue()` |
| Внесён результат матча | `on_match_completed(...)` |
| Пользователь задал `not_before_hard` | пересчитать `effective_not_before`, переставить в очереди |
| Пользователь вручную назначил матч | убрать из очереди, назначить площадку |

---

## Предупреждение о нарушении отдыха (ручной режим)

При ручном назначении матча M на время T:
```
for p in M.all_players:
  if last_end(p) + rest_minutes > T:
    warn("Игрок {p} не успеет отдохнуть: перерыв {T - last_end(p)} мин < {M} мин")
```
Предупреждение не блокирует назначение.
