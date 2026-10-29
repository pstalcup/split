import { myAdventures } from "kolmafia";
import { hasDelay } from "loopstar/engine/task";
import { args } from "../args";
import { SplitEngine } from "../engine";
import { QuestPolicy } from "../policy";
import { turnsUntilFreeRun, wantsFreeRun } from "../quick";
import { turnsUntilNextWanderer } from "../wanderers";

/**
 * Decide how many turns to farm before handing control back to the quest, or
 * undefined to farm all remaining turns.
 *
 * Before the finish day, quest tasks wait for resources: free wanderers that
 * can burn quest delay, and free runs that recharge as turns pass. Farm until
 * the next such resource is ready, so the quest can use it.
 */
export function planFarmChunk(
  policy: QuestPolicy | undefined,
  engine: SplitEngine | undefined
): number | undefined {
  if (!args.interleave || !policy || policy.mode !== "flexible" || !engine) return undefined;
  if (myAdventures() <= 0) return undefined;

  const pending = engine.pendingTasks();
  const waits: number[] = [];
  if (policy.wanderers.length > 0 && pending.some((task) => hasDelay(task) > 0)) {
    const turns = turnsUntilNextWanderer(policy.wanderers);
    if (turns !== undefined) waits.push(turns);
  }
  if (policy.quick.includes("freerun") && pending.some(wantsFreeRun)) {
    const turns = turnsUntilFreeRun();
    if (turns !== undefined) waits.push(turns);
  }
  if (waits.length === 0) return undefined;
  return Math.max(args.minchunk, Math.min(...waits), 1);
}
