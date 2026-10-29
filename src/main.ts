import { inCasual, myAdventures, myPath, print } from "kolmafia";
import { Args } from "grimoire-kolmafia";
import { get, sinceKolmafiaRevision, undelay } from "libram";
import { allocateResources } from "loopstar/engine/allocation";
import { getTaggedName, merge } from "loopstar/engine/task";
import { args } from "./args";
import { canFarm, GarboSession, loadGarboOptions } from "./farm/garbo";
import { planFarmChunk } from "./farm/plan";
import { questZones, routeWanderersToQuest } from "./farm/questZones";
import { estimateTasks, markRunFinished, questTurnsReserve, readHistory } from "./estimate";
import { QuestPolicy, Strategy } from "./policy";
import { loadQuest, Quest } from "./quest";
import { DayState, getDayState } from "./state";

// Each round is one chunk of farming followed by one quest phase.
const MAX_ROUNDS = 100;

export function main(command = ""): void {
  sinceKolmafiaRevision(28726);
  Args.fill(args, command);
  if (args.help) {
    Args.showHelp(args);
    return;
  }

  if (!inCasual() && !get("kingLiberated")) {
    throw `split only supports casual runs and aftercore, but you are in ${myPath()}.`;
  }

  const quest = inCasual() && !get("kingLiberated") ? loadQuest() : undefined;
  const state = currentState(quest);
  printState(state);

  if (args.status) {
    if (quest) printQuestPlan(quest, state);
    return;
  }

  runDay(quest);
}

function currentState(quest: Quest | undefined): DayState {
  return getDayState(() => quest?.path.finished() ?? true);
}

function runDay(quest: Quest | undefined): void {
  const farming = args.farm && canFarm();
  if (args.farm && !farming) {
    print("You are overdrunk without a usable Drunkula's wineglass; not farming.", "red");
  }

  // Quest first, so it gets first use of the day's fresh resources before
  // garbo's free fights compete for them. Without farming, there is nothing
  // to wait for on the finish day.
  const questState = currentState(quest);
  if (quest && questState.mode !== "complete") {
    if (questState.mode === "due" && !farming) {
      finishQuest(quest);
    } else {
      runQuestPhase(quest, "quick");
    }
    if (actionsExhausted(quest)) {
      print(`Stopping after ${quest.engine.actionsTaken} quest actions.`, "purple");
      return;
    }
  }
  if (!farming) return;

  const farmState = currentState(quest);
  loadGarboOptions(args.garboargs, farmState.ascendAfterFarming);
  if (quest && farmState.mode !== "complete" && args.routewanderers) {
    routeWanderersToQuest(quest.engine);
  }
  const session = new GarboSession();
  session.run(() => {
    session.diet();
    // Check before garbo's copy target fights spend turns
    if (quest && deadlineReached(quest)) finishQuest(quest);
    session.dailies();

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (quest && deadlineReached(quest)) finishQuest(quest);
      const state = currentState(quest);
      const lastRound = round === MAX_ROUNDS - 1;
      if (quest && lastRound && state.mode === "due") finishQuest(quest);

      const policy =
        quest && state.mode !== "complete"
          ? new QuestPolicy("quick", quest.questCopies)
          : undefined;
      let chunk = lastRound ? undefined : planFarmChunk(policy, quest?.engine);
      if (quest && state.mode === "due") {
        // Farm no further than the point where the quest has to be finished
        const slack = Math.max(1, turnsUntilDeadline(quest));
        chunk = chunk === undefined ? slack : Math.min(chunk, slack);
      }
      const spent = session.farm(chunk);
      if (chunk === undefined || myAdventures() <= 0) break;

      // Give the resource that just became ready to the quest
      if (!quest || !policy || actionsExhausted(quest)) continue;
      const actionsBefore = quest.engine.actionsTaken;
      runQuestPhase(quest, "quick");
      if (spent === 0 && quest.engine.actionsTaken === actionsBefore) break;
    }

    // Out of rounds or stalled: the quest still has to be done today
    if (quest && currentState(quest).mode === "due") {
      finishQuest(quest);
      session.farm(undefined);
    }
  });

  const finalState = currentState(quest);
  if (finalState.mode === "complete") print("Quest complete and turns farmed.", "purple");
  else print(`Day ${finalState.day} done; the quest continues tomorrow.`, "purple");
}

/**
 * Adventures that can still be farmed on the finish day before the rest must
 * go to the quest. Not limited on earlier days.
 */
function turnsUntilDeadline(quest: Quest): number {
  quest.engine.updatePlan();
  return myAdventures() - questTurnsReserve(quest.engine.tasks);
}

function deadlineReached(quest: Quest): boolean {
  return currentState(quest).mode === "due" && turnsUntilDeadline(quest) <= 0;
}

/**
 * Run every remaining quest task, whatever it costs.
 */
function finishQuest(quest: Quest): void {
  if (currentState(quest).mode !== "due") return;
  print(
    `Finishing the quest: ${myAdventures()} adventures left, about ${questTurnsReserve(
      quest.engine.tasks
    )} reserved for it.`,
    "purple"
  );
  runQuestPhase(quest, "finish");
  if (actionsExhausted(quest)) throw "Stopped by the actions limit while finishing the quest.";
  if (currentState(quest).mode === "due") failUnfinishedQuest(quest);
}

function runQuestPhase(quest: Quest, strategy: Strategy): void {
  const engine = quest.engine;
  engine.policy = new QuestPolicy(strategy, quest.questCopies);
  const remaining = args.actions === undefined ? undefined : args.actions - engine.actionsTaken;
  if (remaining !== undefined && remaining <= 0) return;
  print(`Questing (${strategy})`, "purple");
  try {
    engine.run(remaining);
  } finally {
    engine.propertyManager.resetAll();
    if (quest.path.finished()) markRunFinished();
  }
}

function actionsExhausted(quest: Quest): boolean {
  return args.actions !== undefined && quest.engine.actionsTaken >= args.actions;
}

function failUnfinishedQuest(quest: Quest): never {
  print("Remaining tasks:", "red");
  for (const task of quest.engine.tasks) {
    if (!task.completed()) print(getTaggedName(task), "red");
  }
  if (myAdventures() <= 0) {
    throw "Ran out of adventures before finishing the quest. Consider raising loopstar_stomach / loopstar_liver, then rerun split.";
  }
  throw "Unable to find an available quest task, but the quest is due today.";
}

function printState(state: DayState): void {
  const modeText = {
    flexible: `quick quest progress only (quest is due on day ${args.finishday})`,
    due: "quick quest progress, then finish the quest when the turns run short",
    complete: "farm only",
  }[state.mode];
  print(`split: day ${state.day} of run, ${modeText}.`, "purple");
  if (args.farm) {
    print(`Garbo will farm${state.ascendAfterFarming ? " in ascend mode" : ""}.`, "purple");
  }
}

function printQuestPlan(quest: Quest, state: DayState): void {
  if (state.mode === "complete") return;
  const policy = new QuestPolicy("quick", quest.questCopies);
  if (state.mode === "flexible") {
    const budget = args.questturns < 0 ? "unlimited" : `${policy.budgetRemaining()}`;
    print(`Quest turn budget remaining today: ${budget}`);
  }

  const engine = quest.engine;
  engine.updatePlan();
  const history = readHistory();
  const estimates = estimateTasks(engine.tasks);
  const estimated = estimates.reduce((total, estimate) => total + estimate.turns, 0);
  const basis =
    history.runs > 0 ? `from ${history.runs} previous run(s)` : "no history yet; rough default";
  print(
    `Estimated quest turns left: ${estimated.toFixed(0)} (${basis}); reserving ${questTurnsReserve(
      engine.tasks
    )}.`
  );
  if (state.mode === "due") {
    print(
      `Adventures that can be farmed before finishing the quest: ${Math.max(
        0,
        turnsUntilDeadline(quest)
      )} (before garbo's diet).`
    );
  }
  const estimateByTask = new Map(estimates.map((estimate) => [estimate.task.name, estimate.turns]));

  if (args.routewanderers) {
    const zones = questZones(quest.engine);
    const zoneText = zones.map((zone) => `${zone.location} (${zone.delay})`).join(", ");
    print(`Quest zones garbo may route wanderers into: ${zoneText || "none"}`);
  }

  const allocations = allocateResources(engine.tasks);
  for (const task of engine.tasks) {
    if (task.completed()) continue;
    const allocation = allocations.get(task.name);
    const resources = undelay(task.resources);
    const allocated =
      allocation === undefined
        ? task
        : merge(resources?.delta ? merge(task, resources.delta) : task, allocation);
    const admission = policy.preadmit(allocated);
    const turns = estimateByTask.get(task.name);
    const name = `${getTaggedName(allocated)}${turns ? ` [~${turns.toFixed(1)} turns]` : ""}`;
    if (admission === undefined) print(`${name}: waiting`, "gray");
    else print(`${name}: allowed (${admission})`);
  }
}
