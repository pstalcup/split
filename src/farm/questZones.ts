import {
  addWanderFactory,
  WanderDetails,
  WandererFactory,
  WandererManager,
  WandererTarget,
} from "garbo-lib";
import { wanderer } from "garbo/garboWanderer";
import { canAdventure, Item, Location } from "kolmafia";
import { $items, $location, get, undelay } from "libram";
import { hasDelay, Task } from "loopstar/engine/task";

import { args, splitList } from "../args";
import { SplitEngine } from "../engine";

/**
 * Quest zones that can only be adventured in with an item equipped.
 * Garbo-lib skips these unless the fight allows equipment, and equips them if so.
 */
const REQUIRED_EQUIPMENT = new Map<Location, Item[]>([
  [$location`Inside the Palindome`, $items`Talisman o' Namsilat`],
]);

export type QuestZone = { location: Location; task: Task; delay: number };

let questEngine: SplitEngine | undefined = undefined;

/**
 * Quest tasks that could run now and still have delay to burn. Any turn-taking
 * or wandering fight there (a digitized copy target, a backup, a voting
 * monster, ...) also burns a turn of that delay.
 */
export function questZones(engine: SplitEngine | undefined = questEngine): QuestZone[] {
  if (!engine) return [];
  const zones: QuestZone[] = [];
  for (const task of engine.pendingTasks()) {
    if (!(task.do instanceof Location)) continue;
    const delay = hasDelay(task);
    if (delay <= 0 || !canAdventure(task.do)) continue;
    if (zones.some((zone) => zone.location === task.do)) continue;
    zones.push({ location: task.do, task, delay });
  }
  return zones;
}

/**
 * Offers quest delay zones to garbo-lib as wander targets, worth one adventure
 * (valueOfAdventure * routevalue) each: a turn of delay burned now is a quest
 * turn that does not have to be spent later. Garbo-lib weighs this against
 * the value of its usual zones, so a wanderer only goes to a quest zone when
 * that is the better use of it. The fight itself is still garbo's: garbo's
 * outfit, familiar and combat macro.
 */
const questZoneFactory: WandererFactory = (type, locationSkiplist, options) => {
  if (!splitList(args.routetypes).includes(type)) return [];
  const value = (options.valueOfAdventure ?? get("valueOfAdventure")) * args.routevalue;
  return questZones()
    .filter((zone) => !locationSkiplist.includes(zone.location))
    .map(
      (zone) =>
        new WandererTarget({
          name: `Quest: ${zone.task.name}`,
          location: zone.location,
          zoneValue: value,
        }),
    );
};

let installed = false;

/**
 * Route garbo's draggable fights into quest delay zones while farming.
 */
export function routeWanderersToQuest(engine: SplitEngine): void {
  questEngine = engine;
  if (installed) return;
  installed = true;

  addWanderFactory(questZoneFactory);
  for (const [location, items] of REQUIRED_EQUIPMENT) {
    wanderer().equipment.set(location, items);
  }

  // If the zone's own encounter shows up instead of a wanderer, make the
  // choices the quest would make, so the turn still counts toward the quest.
  const getChoices = WandererManager.prototype.getChoices;
  WandererManager.prototype.getChoices = function (
    this: WandererManager,
    target: WanderDetails | Location,
    takeTurnForProfit?: boolean,
  ) {
    const base = getChoices.call(this, target, takeTurnForProfit);
    const location = target instanceof Location ? target : this.getTarget(target).location;
    const zone = questZones().find((z) => z.location === location);
    if (!zone) return base;
    return { ...base, ...(undelay(zone.task.choices) ?? {}) };
  };
}
