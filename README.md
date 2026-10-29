# split

A KoLmafia script that combines [loopstar](https://github.com/Kasekopf/loopstar) (casual path) and
[garbage-collector](https://github.com/loathers/garbage-collector) into one script, so that the
quest and the farming for a casual run are scheduled together, across the two days of the run.

## Why

The usual loop finishes the casual run on day 1 and spends day 2 farming. But many daily resources
(free runs, free kills, yellow rays, noncombat forces, some free wanderers) are worth much more to
the quest than to garbo, and day 2's copies of them mostly go to waste.

`split` requires the primary quests to be finished **by the end of day 2** (`finishday`), and does
each quest task on whichever day the resources make it quick:

- **Before the finish day**, a quest task runs only when it is quick right now:

  - it is a free action (costs no turns),
  - loopstar would use a **quick resource** on it that is currently available: a free run (for
    tasks that run away from unwanted monsters), a free kill, a yellow ray or an item-forcing
    resource (the `quick` option; banishes can be added too),
  - it has a daily resource like an NC force or Lucky! allocated (the `resources` option),
  - it burns quest delay with a free wanderer (Kramco, voting, cursed magnifying glass),
  - it is on the `alwaystasks` list (by default: the opening and leveling tasks, the diet, Friars,
    and the steel organ, which garbo benefits from), or
  - it fits in the `questturns` budget (default 0).

  Everything else waits, and garbo farms. Tasks that are waiting get picked up again later in the
  day when their resources recharge, or on the finish day.

- **On the finish day** the quest runs to completion first, with the day's fresh resources. Then
  garbo farms the remaining turns, in ascend mode.

### Wanderers in quest zones

While farming, split offers every quest zone that still has delay to burn to garbo-lib's wanderer
planner, as one more candidate location worth one adventure (`valueOfAdventure * routevalue`) per
fight. Garbo-lib compares that against its usual zones (item drops, Guzzlr, bofa, ...). When the
quest zone wins, garbo sends the fight there: digitized and other copy targets, backups, voting
monsters, Kramco goblins, and so on. The fight is still garbo's, with garbo's meat outfit,
familiar and combat macro, so it is worth the same as before and it also burns a turn of quest
delay. If the zone's own encounter shows up instead, the quest's choice settings are used, so that
turn still counts toward the quest. `routetypes` controls which garbo-lib fight types can be
routed (default `wanderer,backup`).

Outside of farming, loopstar uses its own free wanderers in quest zones as usual. Loopstar never
fights garbo's copies itself, since they need garbo's outfit, and the quest never spends a turn
while one of them is due.

This uses a small garbo-lib addition, `addWanderFactory()`, kept in
`patches/garbage-collector/` until it is upstreamed. `npm run build` and `npm run check` apply it.

### Interleaving

garbo runs in-process, so farming can pause at any turn without restarting garbo. Before the
finish day, split farms until a cooldown-based free run (spring shoes, cosmic bowling ball) is
ready for a waiting quest task, hands it to the quest, and resumes farming. With
`routewanderers=false`, it also pauses for free wanderers so that loopstar can use them.

## How it works

Each day (each `split` invocation):

1. **Quest phase.** Loopstar's engine runs under a `QuestPolicy`: the whole quest on the finish day,
   only quick tasks before it. This happens before garbo's free fights, so the quest gets first
   use of the day's free runs and free kills (garbo itself only spends free kills on Robortender
   fights, and free runs on low-value item fights).
2. **Garbo setup.** garbo's diet, daily setup, free fights and copy target fights.
3. **Barf farming in chunks**, with a quest phase between chunks whenever a resource the quest is
   waiting for becomes ready (before the finish day only).

Both scripts are vendored as git submodules and imported directly:

- `vendor/loopstar`: split loads loopstar's casual path and wraps its engine (`SplitEngine`) with
  the policy. Loopstar's routing, resource allocation and combat logic are unchanged.
- `vendor/garbage-collector`: split runs garbo's own tasks and functions. `src/farm/garbo.ts` is a
  port of garbo's `main()`, split into phases (setup, farm a chunk, finish). When updating the
  vendored garbo, diff its `src/index.ts` `main()` against that file.

| File                     | Purpose                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| `src/main.ts`            | Entry point; schedules quest phases and farming for the day      |
| `src/state.ts`           | Which day of the run it is, and whether the quest is due         |
| `src/policy.ts`          | Which quest tasks may run right now (`QuestPolicy`)              |
| `src/quick.ts`           | Which quick resources loopstar would use on a task               |
| `src/engine.ts`          | Loopstar's engine, restricted by the policy                      |
| `src/quest.ts`           | Loads loopstar's casual path with split's changes                |
| `src/farm/garbo.ts`      | garbo's farming day, split into resumable phases                 |
| `src/farm/plan.ts`       | How many turns to farm before the quest's next resource is ready |
| `src/wanderers.ts`       | Predicts when free wanderers will be guaranteed                  |
| `src/farm/questZones.ts` | Offers quest delay zones to garbo-lib's wanderer planner         |
| `src/patches.ts`         | Keeps loopstar from using garbo's copies as delay burners        |

## Setup

Both upstream scripts are git submodules under `vendor/`, pinned to the versions split was built
against. Clone with submodules:

```bash
git clone --recurse-submodules https://github.com/pstalcup/split.git
```

(or run `git submodule update --init` in an existing clone). Then:

```bash
npm install
```

```bash
npm run build
```

Copy (or symlink) `dist/KoLmafia/scripts/split/` into your KoLmafia `scripts` directory.

garbo must also be installed normally (`git checkout loathers/garbage-collector release`): split
uses its data files (`garbo_item_lists.json`), its choice script (`garbo_choice.js`) and its
dependencies (e.g. `mallcheck.js`). Keep the installed garbo and the vendored one on the same
version.

To update a vendored script, check out the new commit inside its submodule (e.g.
`git -C vendor/garbage-collector checkout <commit>`), rebuild, and commit the submodule change. For
garbo, also port any changes in its `main()` to `src/farm/garbo.ts`.

`npm run check` typechecks `src/`. Upstream loopstar has a few type errors of its own; those are
reported but do not fail the check.

## Usage

Ascend into a casual run (see loopstar's README for recommendations), then each day run:

```
split
```

`split status` prints the day plan and why each remaining quest task is allowed right now, or that
it is waiting. `split help` lists all options. Options can also be set permanently, e.g.
`set split_questturns=20`.

Loopstar's own settings (`loopstar_*`, e.g. `loopstar_stomach`) and garbo's settings (`garbo_*`,
`valueOfAdventure`) still apply. Extra arguments can be passed with `loopstarargs="..."` and
`garboargs="..."`.

| Option           | Default                               | Meaning                                                              |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `finishday`      | 2                                     | Day of the run by which the quest must be finished                   |
| `quick`          | freerun,freekill,yellowray,forceitems | Combat resources that make a quest task quick enough to run early    |
| `resources`      | NCForce,Lucky                         | Loopstar allocations that may be spent before the finish day         |
| `wanderers`      | Kramco,Voted,Cursed Magnifying Glass  | Free wanderers that may burn quest delay before the finish day       |
| `alwaystasks`    | opening, leveling, diet, Friar, Organ | Tasks/quests that always run before the finish day                   |
| `defertasks`     | (none)                                | Tasks/quests that never run before the finish day                    |
| `questturns`     | 0                                     | Turns other quest tasks may spend per day before the finish day      |
| `routewanderers` | true                                  | Let garbo route its wanderers, copies and backups into quest zones   |
| `routetypes`     | wanderer,backup                       | garbo-lib fight types that may be routed into quest zones            |
| `routevalue`     | 1                                     | Value of one turn of quest delay, as a multiple of valueOfAdventure  |
| `interleave`     | true                                  | Pause farming when a resource the quest is waiting for is ready      |
| `minchunk`       | 3                                     | Minimum turns to farm between quest interruptions                    |
| `farm`           | true                                  | Farm at all                                                          |
| `garboascend`    | true                                  | Farm in garbo's ascend mode once the quest is done on the finish day |
| `day2diet`       | true                                  | Let loopstar's partial diet also run on later days of the run        |

## Status

This builds, but has not yet been run in-game. Things to watch for on the first runs:

- Day 2 adventures: if day 1 leaves a lot of turn-heavy quest work, day 2 might not have enough
  adventures before garbo's diet. Raise `loopstar_stomach` / `loopstar_liver`, or `questturns`.
- Property handoffs between garbo's settings and loopstar's engine during interleaved phases.
- Quest zones that need equipment to enter: only the Palindome's talisman is handled so far
  (`REQUIRED_EQUIPMENT` in `src/farm/questZones.ts`).
- Whether the default `quick`, `alwaystasks` and `questturns` give the right day 1 / day 2 split.
