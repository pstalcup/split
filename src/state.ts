import { inCasual, myDaycount } from "kolmafia";
import { get } from "libram";

import { args } from "./args";

/**
 * How the quest should be treated in the current session.
 *
 * - "flexible": a day before the finish day. Quest tasks run only when they are
 *   quick (see {@link QuestPolicy}); the remaining turns are farmed.
 * - "due": the finish day (or later). Quest tasks still run only when quick,
 *   until the adventures left are only enough to finish the quest (see
 *   {@link questTurnsReserve}); then the quest is finished, whatever it costs.
 * - "complete": the quest is done; only farm.
 */
export type QuestMode = "flexible" | "due" | "complete";

export type DayState = {
  inRun: boolean;
  day: number;
  mode: QuestMode;
  /** True if garbo should farm in "ascend" mode. */
  ascendAfterFarming: boolean;
};

export function getDayState(questFinished: () => boolean): DayState {
  const inRun = inCasual() && !get("kingLiberated");
  const day = myDaycount();

  let mode: QuestMode;
  if (!inRun || questFinished()) mode = "complete";
  else if (day >= args.finishday) mode = "due";
  else mode = "flexible";

  return {
    inRun,
    day,
    mode,
    ascendAfterFarming: args.garboascend && day >= args.finishday,
  };
}
