import { cliExecute, getProperty, myAdventures, myTurncount, print, setProperty } from "kolmafia";
import { get, set } from "libram";
import { args, splitList } from "./args";
import { QuestPolicy } from "./policy";
import { SplitEngine } from "./engine";
import { turnsUntilNextWanderer } from "./wanderers";

/**
 * Decide how many turns garbo should farm before handing control back to the
 * quest, or undefined to farm all remaining turns.
 *
 * Before the finish day, quest delay can still be burned by free wanderers.
 * Garbo would otherwise fight those wanderers in its own zone, so stop garbo
 * just as the next one becomes guaranteed.
 */
export function planFarmChunk(
  policy: QuestPolicy | undefined,
  engine: SplitEngine | undefined
): number | undefined {
  if (!args.interleave || !policy || policy.mode !== "opportunistic" || !engine) return undefined;
  if (policy.wanderers.length === 0 || myAdventures() <= 0) return undefined;
  if (!engine.hasDelayWork()) return undefined;
  const until = turnsUntilNextWanderer(splitList(args.wanderers));
  if (until === undefined) return undefined;
  return Math.max(args.minchunk, until, 1);
}

/**
 * Run garbo, optionally stopping after the given number of turns.
 * Returns the number of turns garbo spent.
 */
export function runGarbo(turns: number | undefined, ascend: boolean): number {
  const garboArgs = [
    ascend ? "ascend" : "",
    turns !== undefined ? `turns=${turns}` : "",
    args.garboargs,
  ]
    .filter((s) => s.length > 0)
    .join(" ");

  const before = myTurncount();
  print(`Farming: garbo ${garboArgs}`, "purple");
  // garbo asks for confirmation when run before the prism is broken
  const skipCheck = getProperty("garbo_skipAscensionCheck");
  setProperty("garbo_skipAscensionCheck", "true");
  try {
    set("_garboCompleted", "");
    cliExecute(`garbo ${garboArgs}`);
  } finally {
    setProperty("garbo_skipAscensionCheck", skipCheck);
  }
  if (get("_garboCompleted") === "") throw `garbo did not complete (garbo ${garboArgs})`;

  const spent = myTurncount() - before;
  print(`Farmed ${spent} turns; ${myAdventures()} adventures remaining.`, "purple");
  return spent;
}
