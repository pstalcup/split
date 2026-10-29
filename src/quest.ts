import { myFullness, myInebriety } from "kolmafia";
import { Args } from "grimoire-kolmafia";
import { args as loopstarArgs } from "loopstar/args";
import { findAndMerge, NamedDeltaTask, Task } from "loopstar/engine/task";
import { loadEngine } from "loopstar/paths/all";
import { CasualInfo } from "loopstar/paths/casual/info";
import { args } from "./args";
import { SplitEngine } from "./engine";
import { startTracking } from "./estimate";
import { patchLoopstarResources } from "./patches";
import { getQuestCopies } from "./policy";

function splitDeltas(): NamedDeltaTask[] {
  const deltas: NamedDeltaTask[] = [];
  if (args.day2diet) {
    // Loopstar only eats on day 1. When the quest spills into a later day,
    // its turns need a (partial) diet as well; garbo fills the rest afterwards.
    deltas.push({
      name: "CasualDiet/Consume",
      replace: {
        completed: () =>
          myFullness() >= loopstarArgs.casual.stomach && myInebriety() >= loopstarArgs.casual.liver,
      },
    });
  }
  return deltas;
}

/**
 * Loopstar's casual path, with split's task changes and engine.
 */
export class SplitCasualInfo extends CasualInfo {
  override getTasks(tasks: Task[]): Task[] {
    return findAndMerge(super.getTasks(tasks), splitDeltas(), "Split", true);
  }

  override getEngine(tasks: Task[]): SplitEngine {
    return new SplitEngine(tasks);
  }
}

export type Quest = {
  path: SplitCasualInfo;
  engine: SplitEngine;
  questCopies: ReturnType<typeof getQuestCopies>;
};

/**
 * Load loopstar's arguments and build the quest engine, the same way loopstar's
 * own main() does for the casual path.
 */
export function loadQuest(): Quest {
  startTracking();
  Args.fill(loopstarArgs, args.loopstarargs);
  const path = new SplitCasualInfo();
  const extraArgs = path.args();
  if (extraArgs) {
    Args.fill(loopstarArgs, extraArgs);
    // Reload our passthrough args so they always have the highest priority
    Args.fill(loopstarArgs, args.loopstarargs);
  }
  path.runIntro();

  const engine = loadEngine(path) as SplitEngine;
  const questCopies = getQuestCopies(engine.tasks);
  patchLoopstarResources(questCopies);
  return { path, engine, questCopies };
}
