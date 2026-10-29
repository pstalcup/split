import { bufferToFile, fileToBuffer, Location, myAscensions, myName } from "kolmafia";
import { get, set, undelay } from "libram";
import { hasDelay, Task } from "loopstar/engine/task";

import { args } from "./args";

/**
 * Estimates how many turns the rest of the quest will take, to know when the
 * finish day has to stop farming and finish the quest.
 *
 * Turns spent by each quest task are recorded during the run. When a run is
 * finished, its totals are added to a per-character history file, and later
 * estimates use each task's average turns per run. Before any history exists,
 * a rough default is used (see {@link defaultTurns}).
 */

const CURRENT_RUN_PREF = "split_currentRun";

type RunTally = { ascension: number; finished: boolean; turns: { [task: string]: number } };
type History = { runs: number; turns: { [task: string]: number } };

function historyFile(): string {
  return `split_history_${myName().toLowerCase()}.json`;
}

function readTally(): RunTally {
  try {
    const tally = JSON.parse(get(CURRENT_RUN_PREF, "")) as RunTally;
    if (typeof tally.ascension === "number" && tally.turns) return tally;
  } catch {
    // fall through to a fresh tally
  }
  return { ascension: myAscensions(), finished: false, turns: {} };
}

function writeTally(tally: RunTally): void {
  set(CURRENT_RUN_PREF, JSON.stringify(tally));
}

export function readHistory(): History {
  try {
    const history = JSON.parse(fileToBuffer(historyFile())) as History;
    if (typeof history.runs === "number" && history.turns) return history;
  } catch {
    // no history yet
  }
  return { runs: 0, turns: {} };
}

/**
 * Start tracking the current run. If the tally belongs to an earlier,
 * finished run, add it to the history first.
 */
export function startTracking(): void {
  const tally = readTally();
  if (tally.ascension === myAscensions()) return;
  if (tally.finished) {
    const history = readHistory();
    history.runs += 1;
    for (const [task, turns] of Object.entries(tally.turns)) {
      history.turns[task] = (history.turns[task] ?? 0) + turns;
    }
    bufferToFile(JSON.stringify(history), historyFile());
  }
  writeTally({ ascension: myAscensions(), finished: false, turns: {} });
}

export function recordTurns(taskName: string, turns: number): void {
  if (turns <= 0) return;
  const tally = readTally();
  tally.turns[taskName] = (tally.turns[taskName] ?? 0) + turns;
  writeTally(tally);
}

export function markRunFinished(): void {
  const tally = readTally();
  if (tally.finished) return;
  tally.finished = true;
  writeTally(tally);
}

/**
 * Turns a task is expected to take in a run, without history: nothing for
 * free tasks, otherwise one turn plus any delay left in its zone.
 */
function defaultTurns(task: Task): number {
  if (undelay(task.freeaction) || task.freecombat) return 0;
  if (!(task.do instanceof Location)) return 0;
  return hasDelay(task) + 1;
}

export type TaskEstimate = { task: Task; turns: number };

export function estimateTasks(tasks: Task[]): TaskEstimate[] {
  const history = readHistory();
  const tally = readTally();
  return tasks
    .filter((task) => !task.completed())
    .map((task) => {
      const spent = tally.turns[task.name] ?? 0;
      const expected =
        history.runs > 0 ? (history.turns[task.name] ?? 0) / history.runs : defaultTurns(task);
      return { task, turns: Math.max(expected - spent, hasDelay(task)) };
    })
    .filter((estimate) => estimate.turns > 0);
}

/**
 * Turns to keep in reserve for finishing the quest: the estimated turns left,
 * with the configured margin and buffer.
 */
export function questTurnsReserve(tasks: Task[]): number {
  const turns = estimateTasks(tasks).reduce((total, estimate) => total + estimate.turns, 0);
  return Math.ceil(turns * args.finishmargin + args.finishbuffer);
}
