import { haveEffect } from "kolmafia";
import { $effect, $item, get, have } from "libram";
import { Task } from "loopstar/engine/task";
import { globalStateCache } from "loopstar/engine/state";
import { getRunawaySources } from "loopstar/resources/runaway";
import { freekillSources } from "loopstar/resources/freekill";
import { unusedBanishes } from "loopstar/resources/banish";
import { forceItemSources, yellowRayPossible } from "loopstar/resources/yellowray";
import { warCleared } from "loopstar/tasks/level12";

/**
 * Daily combat resources that let loopstar make quest progress without
 * spending turns on unwanted monsters.
 */
export type QuickResource = "freerun" | "freekill" | "banish" | "yellowray" | "forceitems";

const quickResourceNames: QuickResource[] = [
  "freerun",
  "freekill",
  "banish",
  "yellowray",
  "forceitems",
];

export function parseQuickResources(names: string[]): QuickResource[] {
  for (const name of names) {
    if (!quickResourceNames.includes(name as QuickResource)) {
      throw `Unknown quick resource ${name}; expected one of ${quickResourceNames.join(", ")}`;
    }
  }
  return names as QuickResource[];
}

function canRunAway(task: Task): boolean {
  const combat = task.combat;
  return (
    !!combat &&
    (combat.can("ignore") || combat.can("ignoreSoftBanish") || combat.can("ignoreNoBanish"))
  );
}

function freeRunAvailable(task: Task): boolean {
  return getRunawaySources().some(
    (source) => source.available() && source.chance() === 1 && !source.blocked?.includes(task.name)
  );
}

/**
 * Mirrors the conditions under which loopstar's engine provides a free kill
 * (see customize() in loopstar's engine).
 */
function usesFreeKill(task: Task): boolean {
  const combat = task.combat;
  if (!combat) return false;
  if (combat.can("killFree")) return true;
  return (
    (combat.can("kill") || combat.can("killItem")) &&
    !task.boss &&
    (get("sidequestNunsCompleted") !== "none" || warCleared()) &&
    get("breathitinCharges") === 0
  );
}

function banishUseful(task: Task): boolean {
  const combat = task.combat;
  if (!combat || task.ignorebanishes?.()) return false;
  const banishState = globalStateCache.banishes();
  if (banishState.unbanished("banish", combat).length === 0) return false;
  return unusedBanishes(banishState, [task], task.name, "ends").length > 0;
}

/**
 * The quick resources that loopstar would use on this task right now.
 */
export function quickResourcesFor(task: Task, allowed: QuickResource[]): QuickResource[] {
  const combat = task.combat;
  if (!combat) return [];
  const result: QuickResource[] = [];
  if (allowed.includes("freerun") && canRunAway(task) && freeRunAvailable(task))
    result.push("freerun");
  if (
    allowed.includes("freekill") &&
    usesFreeKill(task) &&
    freekillSources.some((source) => source.available())
  )
    result.push("freekill");
  if (allowed.includes("banish") && banishUseful(task)) result.push("banish");
  if (allowed.includes("yellowray") && combat.can("yellowRay") && yellowRayPossible())
    result.push("yellowray");
  if (
    allowed.includes("forceitems") &&
    combat.can("forceItems") &&
    (forceItemSources.some((source) => source.available()) || yellowRayPossible())
  )
    result.push("forceitems");
  return result;
}

/**
 * True if the task would use a free run, if one were available.
 */
export function wantsFreeRun(task: Task): boolean {
  return canRunAway(task);
}

/**
 * Turns until a cooldown-based free run comes back, or undefined if none is
 * on cooldown. Free runs recharge while farming, so the quest can pick them up
 * again later in the day.
 */
export function turnsUntilFreeRun(): number | undefined {
  const cooldowns: number[] = [];
  if (have($item`spring shoes`) && have($effect`Everything Looks Green`)) {
    cooldowns.push(haveEffect($effect`Everything Looks Green`));
  }
  const bowlingBall = get("cosmicBowlingBallReturnCombats");
  if (!have($item`cosmic bowling ball`) && bowlingBall > 0) cooldowns.push(bowlingBall);
  if (cooldowns.length === 0) return undefined;
  return Math.min(...cooldowns);
}
