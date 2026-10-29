import { Monster, totalTurnsPlayed } from "kolmafia";
import { $item, Counter, get, have } from "libram";
import { wandererSources } from "loopstar/resources/wanderer";

/**
 * Predictions for when each free wanderer that loopstar can route into a quest
 * delay zone will next be guaranteed. Used to decide how long garbo may farm
 * before handing a turn back to the quest.
 *
 * Returns undefined if the wanderer will not become available today.
 */
const turnsUntilGuaranteed: { [name: string]: () => number | undefined } = {
  Kramco: () => {
    if (!have($item`Kramco Sausage-o-Matic™`)) return undefined;
    // Mirrors libram's getKramcoWandererChance()
    const fights = get("_sausageFights");
    if (fights < 1) return 0;
    const needed = 5 + fights * 3 + Math.max(0, fights - 5) ** 3;
    const since = totalTurnsPlayed() - get("_lastSausageMonsterTurn");
    return Math.max(0, needed - 1 - since);
  },
  Voted: () => {
    if (!have($item`"I Voted!" sticker`) || get("_voteFreeFights") >= 3) return undefined;
    const turns = totalTurnsPlayed();
    const untilNext = (((1 - turns) % 11) + 11) % 11;
    if (untilNext === 0 && get("lastVoteMonsterTurn") >= turns) return 11;
    return untilNext;
  },
  "Cursed Magnifying Glass": () => {
    if (!have($item`cursed magnifying glass`) || get("_voidFreeFights") >= 5) return undefined;
    return Math.max(0, 13 - get("cursedMagnifyingGlassCount"));
  },
};

/**
 * The number of turns until the soonest allowed wanderer is guaranteed,
 * or undefined if none of them will be.
 */
export function turnsUntilNextWanderer(allowed: string[]): number | undefined {
  let best: number | undefined = undefined;
  for (const name of allowed) {
    const predict = turnsUntilGuaranteed[name];
    if (!predict) continue;
    const turns = predict();
    if (turns === undefined) continue;
    if (best === undefined || turns < best) best = turns;
  }
  return best;
}

/**
 * True if one of the allowed wanderers is guaranteed on the next combat.
 */
export function allowedWandererReady(allowed: string[]): boolean {
  return wandererSources.some(
    (source) => allowed.includes(source.name) && source.available() && source.chance() === 1,
  );
}

/**
 * Copies that garbo sets up for farming (e.g. a digitized copy target) also
 * arrive as wanderers. Those must be fought in garbo's farming outfit, so the
 * quest must not spend turns while one is due, and loopstar must not treat them
 * as free delay burners.
 */
export function isFarmingCopy(monster: Monster | null, questCopies: Set<Monster>): boolean {
  if (monster === null || monster.name === "none") return false;
  return !questCopies.has(monster);
}

export function farmingCopyDue(questCopies: Set<Monster>): boolean {
  if (
    Counter.get("Digitize Monster") <= 0 &&
    isFarmingCopy(get("_sourceTerminalDigitizeMonster"), questCopies)
  )
    return true;
  if (
    Counter.get("Spooky VHS Tape Monster") <= 0 &&
    isFarmingCopy(get("spookyVHSTapeMonster"), questCopies)
  )
    return true;
  return false;
}
