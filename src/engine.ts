import { myTurncount } from "kolmafia";
import { $effect, have } from "libram";
import { ActiveTask, Engine } from "loopstar/engine/engine";
import { Task } from "loopstar/engine/task";
import { debug } from "loopstar/lib";

import { recordTurns } from "./estimate";
import { Admission, QuestPolicy } from "./policy";

// Re-planning is expensive, so only skip a few rejected tasks before yielding to farming.
const MAX_REJECTIONS = 5;

/**
 * The loopstar engine, restricted by a {@link QuestPolicy}.
 *
 * When no admissible quest task remains, getNextTask() returns undefined and
 * engine.run() ends, handing control back to the scheduler to farm.
 */
export class SplitEngine extends Engine {
  policy: QuestPolicy | undefined = undefined;
  actionsTaken = 0;
  private rejected = new Set<string>();
  private admissions = new Map<string, Admission>();

  override available(task: Task): boolean {
    if (this.rejected.has(task.name)) return false;
    if (this.policy && this.policy.preadmit(task) === undefined) return false;
    return super.available(task);
  }

  override getNextTask(): ActiveTask | undefined {
    // Loopstar must clean up Teleportitis before anything else, including farming
    if (have($effect`Teleportitis`)) return super.getNextTask();

    this.rejected.clear();
    try {
      for (let i = 0; i < MAX_REJECTIONS; i++) {
        const task = super.getNextTask();
        if (!task || !this.policy) return task;
        const admission = this.policy.admit(task);
        if (admission !== undefined) {
          this.admissions.set(task.name, admission);
          return task;
        }
        debug(`Deferring ${task.name} to a later day`, "gray");
        this.rejected.add(task.name);
      }
      return undefined;
    } finally {
      this.rejected.clear();
    }
  }

  /**
   * Quest tasks that could run right now if the policy allowed them.
   * Used to decide which recharging resources are worth pausing farming for.
   */
  pendingTasks(): Task[] {
    this.updatePlan();
    return this.tasks.filter(
      (task) => !task.completed() && !this.policy?.isDeferred(task) && super.available(task),
    );
  }

  override execute(task: ActiveTask): void {
    const admission = this.admissions.get(task.name) ?? "finish";
    const before = myTurncount();
    try {
      super.execute(task);
    } finally {
      this.actionsTaken++;
      const turns = myTurncount() - before;
      this.policy?.record(admission, turns);
      recordTurns(task.name, turns);
    }
  }

  override initPropetiesManagerOnRun(): void {
    super.initPropetiesManagerOnRun();
    // Use our own build of loopstar's choice script, so that split does not
    // depend on (or conflict with) an installed copy of loopstar.
    this.propertyManager.set({ choiceAdventureScript: "split_choice.js" });
  }
}
