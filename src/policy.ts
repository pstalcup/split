import { Monster } from "kolmafia";
import { $monsters, get, set, undelay } from "libram";
import { hasDelay, Task } from "loopstar/engine/task";
import { ActiveTask } from "loopstar/engine/engine";
import { args, matchesTask, splitList } from "./args";
import { QuestMode } from "./state";
import { allowedWandererReady, farmingCopyDue } from "./wanderers";

const QUEST_TURNS_PREF = "_split_questTurns";

/**
 * Why a quest task was allowed to run.
 * Only "budget" tasks count against the questturns budget.
 */
export type Admission = "due" | "free" | "always" | "resource" | "wanderer" | "budget";

/**
 * Decides which loopstar tasks may run in the current session.
 *
 * When the quest is due, everything loopstar wants to do is allowed. Before
 * the finish day, a task runs only if its quest progress is cheap relative to
 * farming: it costs no turns, it is on the always-allowed list, it spends a
 * daily resource that garbo gets little value from, it burns delay with a free
 * wanderer, or it fits in the remaining questturns budget.
 */
export class QuestPolicy {
  readonly always = splitList(args.alwaystasks);
  readonly deferred = splitList(args.defertasks);
  readonly resources = splitList(args.resources);
  readonly wanderers = splitList(args.wanderers);

  readonly mode: QuestMode;
  private readonly questCopies: Set<Monster>;

  constructor(mode: QuestMode, questCopies: Set<Monster>) {
    this.mode = mode;
    this.questCopies = questCopies;
  }

  budgetUsed(): number {
    return get(QUEST_TURNS_PREF, 0);
  }

  budgetRemaining(): number {
    if (args.questturns < 0) return Infinity;
    return args.questturns - this.budgetUsed();
  }

  /**
   * Admission without considering the chosen prioritization (wanderers etc).
   * Used to filter the available tasks before loopstar picks one.
   */
  preadmit(task: Task): Admission | undefined {
    if (this.mode !== "opportunistic") return "due";
    if (this.isDeferred(task)) return undefined;
    if (undelay(task.freeaction)) return "free";
    // A copy set up by garbo is about to show up; it must be fought while farming
    if (farmingCopyDue(this.questCopies)) return undefined;
    if (matchesTask(task.name, this.always)) return "always";
    if (task.tags?.some((tag) => this.resources.includes(tag))) return "resource";
    if (this.budgetRemaining() > 0) return "budget";
    if (hasDelay(task) > 0 && allowedWandererReady(this.wanderers)) return "wanderer";
    return undefined;
  }

  /**
   * Final admission of the task loopstar chose, now that its priorities are known.
   */
  admit(task: ActiveTask): Admission | undefined {
    const admission = this.preadmit(task);
    if (admission !== "wanderer") return admission;
    const wanderer = task.activePriority?.wanderer();
    if (wanderer && this.wanderers.includes(wanderer.name)) return "wanderer";
    return undefined;
  }

  /**
   * Record the turns spent by a task. Wanderer tasks are expected to be free;
   * if the wanderer did not show up, the turn is charged to the budget.
   */
  record(admission: Admission, turnsSpent: number): void {
    if (this.mode !== "opportunistic" || turnsSpent <= 0) return;
    if (admission === "budget" || admission === "wanderer") {
      set(QUEST_TURNS_PREF, this.budgetUsed() + turnsSpent);
    }
  }

  isDeferred(task: Task): boolean {
    return matchesTask(task.name, this.deferred);
  }
}

/**
 * Monsters that loopstar itself copies or summons. A digitized or taped copy of
 * anything else was set up by garbo, and should be fought while farming.
 */
export function getQuestCopies(tasks: Task[]): Set<Monster> {
  const result = new Set<Monster>(
    $monsters`sausage goblin, giant swarm of ghuol whelps, pygmy bowler, dairy goat, mountain man`
  );
  for (const task of tasks) {
    const request = undelay(task.resources);
    if (request && typeof request.which === "object" && "summon" in request.which) {
      result.add(request.which.summon);
    }
  }
  return result;
}
