import { Args } from "grimoire-kolmafia";

export const args = Args.create(
  "split",
  'Runs a casual run over two days, scheduling loopstar questing and garbo farming together.\n\nBefore the finish day, quest tasks run only when they are quick: when daily resources like free runs, free kills, yellow rays, NC forces or free wanderers are available for them. Everything else is farmed with garbo, and quest tasks are picked up again as resources recharge during farming. On the finish day the quest runs to completion first, then garbo farms the remaining turns.\n\nRun "split status" to see what the script would do right now.',
  {
    status: Args.flag({
      help: "Print the current day plan and which quest tasks are allowed, then exit.",
      setting: "",
    }),
    finishday: Args.number({
      help: "Day of the run by which the quest must be completed. Earlier days only make quick quest progress.",
      default: 2,
    }),
    questturns: Args.number({
      help: "Number of turns that quest tasks without quick resources may spend on each day before the finish day. Use -1 for no limit.",
      default: 0,
    }),
    alwaystasks: Args.string({
      help: "Comma-separated task names or quest prefixes (e.g. Leveling or Misc/Snojo) that may always run before the finish day, without counting against questturns.",
      default:
        "Misc/Break Stone,Toot,Misc/Workshed,Misc/Goose Exp,Misc/Acquire Birch Battery,Keys/Deck,Leveling,Misc/LOV Tunnel,Misc/Daycare,Misc/Bastille,Misc/Snojo,Misc/Hermit Clover,CasualDiet,Acquire,Friar,Organ",
    }),
    defertasks: Args.string({
      help: "Comma-separated task names or quest prefixes that never run before the finish day.",
      default: "",
    }),
    quick: Args.string({
      help: "Comma-separated combat resources that make a quest task quick enough to run before the finish day: freerun, freekill, banish, yellowray, forceitems.",
      default: "freerun,freekill,yellowray,forceitems",
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
      help: "Pause farming when a free wanderer or a free run is about to become available, so that the quest can use it.",
      default: true,
    }),
    minchunk: Args.number({
      help: "Minimum number of turns to farm between quest interruptions when interleaving.",
      default: 3,
    }),
    farm: Args.boolean({
      help: "Run garbo after questing. Set to false to only quest.",
      default: true,
    }),
    garboargs: Args.string({
      help: 'Extra garbo arguments (e.g. "quick nobarf"). Garbo settings (garbo_*) are also respected.',
      default: "",
    }),
    garboascend: Args.boolean({
      help: "Farm in garbo's ascend mode once the quest is complete on or after the finish day.",
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
