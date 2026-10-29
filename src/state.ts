import { inCasual, myDaycount } from "kolmafia";
import { get } from "libram";
import { args } from "./args";

/**
 * How the quest should be treated in the current session.
 *
 * - "opportunistic": a day before the finish day. Only cheap quest progress is
 *   made; the remaining turns are farmed.
 * - "due": the finish day (or later). The quest is completed before farming.
 * - "complete": the quest is done; only farm.
 */
export type QuestMode = "opportunistic" | "due" | "complete";

export type DayState = {
  inRun: boolean;
  day: number;
  mode: QuestMode;
  /** True if garbo should run in "ascend" mode once farming starts. */
  ascendAfterFarming: boolean;
};

export function getDayState(questFinished: () => boolean): DayState {
  const inRun = inCasual() && !get("kingLiberated");
  const day = myDaycount();

  let mode: QuestMode;
  if (!inRun || questFinished()) mode = "complete";
  else if (day >= args.finishday) mode = "due";
  else mode = "opportunistic";

  return {
    inRun,
    day,
    mode,
    ascendAfterFarming: args.garboascend && mode !== "opportunistic" && day >= args.finishday,
  };
}
