import { Monster } from "kolmafia";
import { get } from "libram";
import { wandererSources } from "loopstar/resources/wanderer";

import { isFarmingCopy } from "./wanderers";

let patched = false;

/**
 * Adjust loopstar's resources so they coexist with garbo during the same day.
 *
 * Loopstar treats any due digitize or VHS copy as a free wanderer for burning
 * delay. Once garbo has farmed, those copies are its copy target, which must be
 * fought in garbo's farming outfit rather than in a quest zone.
 */
export function patchLoopstarResources(questCopies: Set<Monster>): void {
  if (patched) return;
  patched = true;

  const copiedMonster: { [name: string]: () => Monster | null } = {
    Digitize: () => get("_sourceTerminalDigitizeMonster"),
    "VHS Tape": () => get("spookyVHSTapeMonster"),
  };
  for (const source of wandererSources) {
    const monster = copiedMonster[source.name];
    if (!monster) continue;
    const available = source.available;
    source.available = () => available() && !isFarmingCopy(monster(), questCopies);
  }
}
