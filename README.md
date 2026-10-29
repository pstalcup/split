# split

A KoLmafia script that combines [loopstar](https://github.com/Kasekopf/loopstar) (casual path) and
[garbage-collector](https://github.com/loathers/garbage-collector) into one script, so that the
quest and the farming for a casual run can be scheduled together, across the days of the run.

## Why

The usual loop finishes the casual run on day 1 and spends day 2 farming. That spends day 1's
daily resources on the quest, and day 2's daily resources on farming. But many daily resources
(free runs, noncombat forces, some free wanderers) are worth much more to the quest than to garbo.

`split` instead treats the quest as **due on day 2** (configurable via `finishday`):

- **Before the finish day** the quest only makes _cheap_ progress, and garbo farms everything else.
  A quest task is cheap if it:
  - is a free action (costs no turns),
  - is on the `alwaystasks` list (by default: the opening/leveling tasks, the diet, Friars, and the
    steel organ, which garbo benefits from),
  - is enabled by a daily resource on the `resources` list (by default `NCForce` and `Lucky`),
  - burns quest delay with a free wanderer from the `wanderers` list (Kramco, voting, cursed
    magnifying glass), or
  - fits in the `questturns` budget (default 0).
- **On the finish day** the quest runs to completion first, with the day's fresh resources. Then
  garbo farms the remaining turns, in `ascend` mode.

### Interleaving

Before the finish day, garbo does not run in a single invocation. When quest delay remains, garbo
stops (`garbo turns=N`) just as the next free wanderer becomes guaranteed. That wanderer then burns a
turn of quest delay instead of being fought in Barf Mountain, and garbo resumes. Copies that garbo
sets up (e.g. a digitized copy target) are never routed into quest zones, and the quest never
spends a turn while one is due. Use `interleave=false` to farm in one invocation, or raise `minchunk`
to restart garbo less often.

## How it works

- `vendor/loopstar` is loopstar's source, pinned as a git submodule. `split` loads loopstar's
  casual path in-process and wraps its engine (`SplitEngine`) with a `QuestPolicy` that admits or
  defers each task. Loopstar's routing, resource allocation and combat logic are unchanged.
- garbo is run through the CLI (`garbo ...`), using your installed copy, so garbo stays up to date
  independently of this script.
- `split` builds its own `split_choice.js` from loopstar's choice script, so it neither requires nor
  conflicts with an installed loopstar.

| File               | Purpose                                                     |
| ------------------ | ----------------------------------------------------------- |
| `src/main.ts`      | Entry point; runs quest phases and garbo phases for the day |
| `src/state.ts`     | Which day of the run it is, and whether the quest is due    |
| `src/policy.ts`    | Which quest tasks may run today (`QuestPolicy`)             |
| `src/engine.ts`    | Loopstar's engine, restricted by the policy                 |
| `src/quest.ts`     | Loads loopstar's casual path with split's changes           |
| `src/farm.ts`      | Runs garbo, and decides how long each garbo chunk should be |
| `src/wanderers.ts` | Predicts when free wanderers will be guaranteed             |
| `src/patches.ts`   | Keeps loopstar from using garbo's copies as delay burners   |

## Setup

Loopstar is pulled in as a submodule. In a fresh clone:

```bash
git submodule add https://github.com/Kasekopf/loopstar.git vendor/loopstar
```

(or, once the submodule is committed, `git submodule update --init`). Then:

```bash
npm install
```

```bash
npm run build
```

Copy (or symlink) `dist/KoLmafia/scripts/split/` into your KoLmafia `scripts` directory. garbo must
also be installed (`git checkout loathers/garbage-collector release`).

`npm run check` typechecks `src/`. Upstream loopstar has a few type errors of its own; those are
reported but do not fail the check.

## Usage

Ascend into a casual run (see loopstar's README for recommendations), then each day run:

```
split
```

`split status` prints the day plan and whether each remaining quest task is allowed or deferred
today. `split help` lists all options. Options can also be set permanently, e.g.
`set split_questturns=20`.

Loopstar's own settings (`loopstar_*`, e.g. `loopstar_stomach`) still apply; extra loopstar
arguments can be passed with `loopstarargs="..."`. Extra garbo arguments can be passed with
`garboargs="..."`.

| Option        | Default                               | Meaning                                                             |
| ------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `finishday`   | 2                                     | Day of the run on which the quest must be finished                  |
| `questturns`  | 0                                     | Turns ordinary quest tasks may spend per day before the finish day  |
| `alwaystasks` | opening, leveling, diet, Friar, Organ | Tasks/quests that always run before the finish day                  |
| `defertasks`  | Tower                                 | Tasks/quests that never run before the finish day                   |
| `resources`   | NCForce,Lucky                         | Loopstar allocations that may be spent before the finish day        |
| `wanderers`   | Kramco,Voted,Cursed Magnifying Glass  | Free wanderers that may burn quest delay before the finish day      |
| `interleave`  | true                                  | Stop garbo early so free wanderers can burn quest delay             |
| `minchunk`    | 10                                    | Minimum turns per garbo invocation when interleaving                |
| `farm`        | true                                  | Run garbo at all                                                    |
| `garboascend` | true                                  | Run garbo in `ascend` mode once the quest is done on the finish day |
| `day2diet`    | true                                  | Let loopstar's partial diet also run on later days of the run       |

## Status

This is a first version. It builds, but has not yet been run in-game. Things to watch for on the
first runs:

- garbo running in-run before level 13 on day 1 (the always-allowed leveling tasks should get there
  first, and split sets `garbo_skipAscensionCheck` while garbo runs).
- How many garbo restarts interleaving causes, and whether `minchunk` should be higher.
- Whether the default `alwaystasks`, `resources` and `questturns` give the right day 1 / day 2 split.
