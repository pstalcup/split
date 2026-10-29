import { Args } from "grimoire-kolmafia";

export const args = Args.create(
  "split",
  'Splits a casual run across two days, interleaving loopstar questing with garbo farming.\n\nOn days before the finish day, only "cheap" quest progress is made: free actions, leveling, NC forces and lucky adventures, free wanderers sent into quest delay zones, and a small turn budget. Everything else is farmed with garbo. On the finish day the quest runs to completion first, using the day\'s fresh resources, and garbo farms the remaining turns.\n\nRun "split status" to see what the script would do right now.',
  {
    status: Args.flag({
      help: "Print the current day plan and which quest tasks are allowed, then exit.",
      setting: "",
    }),
    finishday: Args.number({
      help: "Day of the run on which the quest must be completed. Earlier days only make cheap quest progress.",
      default: 2,
    }),
    questturns: Args.number({
      help: "Number of turns that ordinary (non-free) quest tasks may spend on each day before the finish day. Use -1 for no limit.",
      default: 0,
    }),
    alwaystasks: Args.string({
      help: "Comma-separated task names or quest prefixes (e.g. Leveling or Misc/Snojo) that may always run before the finish day, without counting against questturns.",
      default:
        "Misc/Break Stone,Toot,Misc/Workshed,Misc/Goose Exp,Misc/Acquire Birch Battery,Keys/Deck,Leveling,Misc/LOV Tunnel,Misc/Daycare,Misc/Bastille,Misc/Snojo,Misc/Hermit Clover,CasualDiet,Acquire,Friar,Organ",
    }),
    defertasks: Args.string({
      help: "Comma-separated task names or quest prefixes that never run before the finish day.",
      default: "Tower",
    }),
    resources: Args.string({
      help: "Comma-separated loopstar resource allocations (NCForce, Lucky, or a summon source like Fax) that may be spent on quest tasks before the finish day, without counting against questturns.",
      default: "NCForce,Lucky",
    }),
    wanderers: Args.string({
      help: "Comma-separated free wanderer sources that may be routed into quest delay zones before the finish day.",
      default: "Kramco,Voted,Cursed Magnifying Glass",
    }),
    interleave: Args.boolean({
      help: "Stop garbo early when a free wanderer is about to become available, so that it can burn quest delay instead.",
      default: true,
    }),
    minchunk: Args.number({
      help: "Minimum number of turns to farm between quest interruptions when interleaving.",
      default: 10,
    }),
    farm: Args.boolean({
      help: "Run garbo after questing. Set to false to only quest.",
      default: true,
    }),
    garboargs: Args.string({
      help: "Extra arguments passed to every garbo invocation.",
      default: "",
    }),
    garboascend: Args.boolean({
      help: 'Pass "ascend" to garbo once the quest is complete on or after the finish day.',
      default: true,
    }),
    day2diet: Args.boolean({
      help: "Let the loopstar diet (using the loopstar stomach/liver/spleen settings) run on later days of the run, not just day 1.",
      default: true,
    }),
    loopstarargs: Args.string({
      help: 'Extra arguments passed to loopstar\'s argument parser (e.g. "savelocket=1 fax=false"). Loopstar settings (loopstar_*) are also respected.',
      default: "",
    }),
    actions: Args.number({
      help: "Maximum number of quest actions to perform in this invocation (debug).",
      setting: "",
    }),
    help: Args.flag({ help: "Show this message and exit.", setting: "" }),
  }
);

export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * True if the task name is matched by one of the given patterns,
 * where a pattern is either a full task name or a quest prefix.
 */
export function matchesTask(taskName: string, patterns: string[]): boolean {
  return patterns.some((p) => taskName === p || taskName.startsWith(`${p}/`));
}
