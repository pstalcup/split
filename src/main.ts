import { inCasual, myAdventures, myPath, print } from "kolmafia";
import { Args } from "grimoire-kolmafia";
import { get, sinceKolmafiaRevision, undelay } from "libram";
import { allocateResources } from "loopstar/engine/allocation";
import { getTaggedName, merge } from "loopstar/engine/task";
import { args } from "./args";
import { planFarmChunk, runGarbo } from "./farm";
import { QuestPolicy } from "./policy";
import { loadQuest, Quest } from "./quest";
import { DayState, getDayState } from "./state";

// Each round is one quest phase followed by one garbo invocation.
const MAX_ROUNDS = 50;

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
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let policy: QuestPolicy | undefined = undefined;
    const questState = currentState(quest);
    if (quest && questState.mode !== "complete") {
      policy = new QuestPolicy(questState.mode, quest.questCopies);
      runQuestPhase(quest, policy);
      if (actionsExhausted(quest)) {
        print(`Stopping after ${quest.engine.actionsTaken} quest actions.`, "purple");
        return;
      }
      if (currentState(quest).mode === "due") failUnfinishedQuest(quest);
    }

    if (!args.farm) return;
    const farmState = currentState(quest);
    // On the last round, farm everything that is left
    const chunk = round < MAX_ROUNDS - 1 ? planFarmChunk(policy, quest?.engine) : undefined;
    const spent = runGarbo(chunk, farmState.ascendAfterFarming);
    if (chunk === undefined || spent === 0 || myAdventures() <= 0) break;
  }

  const finalState = currentState(quest);
  if (finalState.mode === "complete") print("Quest complete and turns farmed.", "purple");
  else print(`Day ${finalState.day} done; the quest continues tomorrow.`, "purple");
}

function runQuestPhase(quest: Quest, policy: QuestPolicy): void {
  const engine = quest.engine;
  engine.policy = policy;
  const remaining = args.actions === undefined ? undefined : args.actions - engine.actionsTaken;
  if (remaining !== undefined && remaining <= 0) return;
  print(`Questing (${policy.mode})`, "purple");
  try {
    engine.run(remaining);
  } finally {
    engine.propertyManager.resetAll();
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
    opportunistic: `cheap progress only (quest is due on day ${args.finishday})`,
    due: "finish the quest, then farm",
    complete: "farm only",
  }[state.mode];
  print(`split: day ${state.day} of run, ${modeText}.`, "purple");
  if (args.farm) {
    print(`Garbo will run${state.ascendAfterFarming ? " in ascend mode" : ""}.`, "purple");
  }
}

function printQuestPlan(quest: Quest, state: DayState): void {
  if (state.mode === "complete") return;
  const policy = new QuestPolicy(state.mode, quest.questCopies);
  if (state.mode === "opportunistic") {
    const budget = args.questturns < 0 ? "unlimited" : `${policy.budgetRemaining()}`;
    print(`Quest turn budget remaining today: ${budget}`);
  }

  const engine = quest.engine;
  engine.updatePlan();
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
    const name = getTaggedName(allocated);
    if (admission === undefined) print(`${name}: deferred`, "gray");
    else print(`${name}: allowed (${admission})`);
  }
}
