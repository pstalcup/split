/**
 * Garbo's farming day, run in-process and split into phases so that quest
 * work can be scheduled between them.
 *
 * This mirrors main() in garbo's src/index.ts (from the vendored version). When
 * updating the vendored garbo, diff its main() against this file.
 */
import { Args } from "grimoire-kolmafia";
import {
  canEquip,
  cliExecute,
  currentRound,
  equip,
  getCampground,
  guildStoreAvailable,
  handlingChoice,
  inebrietyLimit,
  Item,
  maximize,
  myAdventures,
  myClass,
  myGardenType,
  myInebriety,
  myLevel,
  myTurncount,
  print,
  runChoice,
  setAutoAttack,
  toInt,
  use,
  visitUrl,
} from "kolmafia";
import {
  $class,
  $classes,
  $familiars,
  $item,
  $items,
  $location,
  $monster,
  $monsters,
  $skill,
  $skills,
  $slots,
  examine,
  get,
  getCombatFlags,
  have,
  haveInCampground,
  JuneCleaver,
  maxBy,
  set,
  setCombatFlags,
  setDefaultMaximizeOptions,
} from "libram";
import { stashItems, withStash, withVIPClan } from "garbo/clan";
import { globalOptions, isQuickGear } from "garbo/config";
import { dailySetup } from "garbo/dailies";
import { nonOrganAdventures, runDiet } from "garbo/diet";
import { dailyFights, freeFights } from "garbo/fights";
import {
  bestJuneCleaverOption,
  HIGHLIGHT,
  isFreeAndCopyable,
  printEventLog,
  propertyManager,
  questStep,
  targetingMeat,
  valueDrops,
} from "garbo/lib";
import { printLog } from "garbo/log";
import { meatMood } from "garbo/mood";
import { potionSetup } from "garbo/potions";
import { endSession, startSession } from "garbo/session";
import { estimatedGarboTurns } from "garbo/turns";
import { garboAverageValue } from "garbo/garboValue";
import { safeRestore } from "garbo/restore";
import { BuffExtensionQuest, PostBuffExtensionQuest } from "garbo/tasks/buffExtension";
import { shouldAffirmationHate } from "garbo/combat";
import { acquire } from "garbo/acquire";
import { FarmingStrategy } from "garbo/farmingStrategy";
import { runGarboFarmQuests, runGarboQuests } from "garbo/tasks/engine";
import { CockroachFinish, CockroachSetup } from "garbo/tasks/cockroach/prep";
import { EmbezzlerFightsQuest } from "garbo/tasks/embezzler";
import { FarmQuests } from "garbo/tasks/farm";
import { FinishUpQuest } from "garbo/tasks/finishUp";
import { PostQuest } from "garbo/tasks/post";
import { SetupTargetCopyQuest } from "garbo/tasks/target";

// Max price for tickets. You should rethink whether Barf is the best place if they're this expensive.
const TICKET_MAX_PRICE = 500000;

function ensureBarfAccess() {
  if (!(get("stenchAirportAlways") || get("_stenchAirportToday"))) {
    const ticket = $item`one-day ticket to Dinseylandfill`;
    acquire(1, ticket, TICKET_MAX_PRICE, true);
    use(ticket);
  }
}

function defaultTarget() {
  if ($skills`Curse of Weaksauce, Saucegeyser`.every((s) => have(s))) {
    return maxBy(
      $monsters.all().filter((m) => m.wishable && isFreeAndCopyable(m)),
      valueDrops
    );
  }
  return $monster`Knob Goblin Elite Guard Captain`;
}

const GARDENS = $items`packet of pumpkin seeds, Peppermint Pip Packet, packet of dragon's teeth, packet of beer seeds, packet of winter seeds, packet of thanksgarden seeds, packet of tall grass seeds, packet of mushroom spores, packet of rock seeds, black garden rose`;

/**
 * Load garbo's arguments (garbo_* settings, plus any passthrough arguments) and
 * check that garbo can farm with them. Throws if not.
 */
export function loadGarboOptions(argString: string, ascend: boolean): void {
  Args.fill(globalOptions, argString);
  globalOptions.ascend = ascend;
  globalOptions.prefs.yachtzeechain = false;
  globalOptions.stopTurncount = null;

  if (!FarmingStrategy.available) {
    throw `Farming strategy not available: ${globalOptions.prefs.farmingMethod}`;
  }
  if (globalOptions.target === $monster.none) globalOptions.target = defaultTarget();

  if (
    !$classes`Seal Clubber, Turtle Tamer, Pastamancer, Sauceror, Disco Bandit, Accordion Thief, Cow Puncher, Snake Oiler, Beanslinger, Pig Skinner, Cheese Wizard, Jazz Agent`.includes(
      myClass()
    )
  ) {
    throw "Garbo does not support this class.";
  }
  const voa = globalOptions.prefs.valueOfAdventure;
  if (voa && voa <= 3500) {
    throw `Your valueOfAdventure is set to ${voa}, which is too low for barf farming to be worthwhile.`;
  }
  if (!globalOptions.nobarf && voa && voa >= 10_000) {
    throw `Your valueOfAdventure is set to ${voa}, which is definitely incorrect. Please set it to your reliable marginal turn value.`;
  }
}

export class GarboSession {
  private active = false;
  private combatFlags: ReturnType<typeof getCombatFlags> = [];
  private startingGarden: Item | undefined = undefined;
  private barfReady = false;

  get started(): boolean {
    return this.active;
  }

  /**
   * Run the given action with garbo's day set up: properties, combat flags,
   * and stash/VIP clan items. Quest phases may run inside the action; the
   * quest engine sets and resets its own properties on top of garbo's.
   */
  run(action: () => void): void {
    if (currentRound() > 0 || handlingChoice()) {
      throw "Cannot start farming in the middle of a combat or choice.";
    }
    if (stashItems.length > 0) {
      throw `Items from a previous garbo run are still out of the clan stash (${stashItems.join(
        ", "
      )}). Run "garbo returnstash" first.`;
    }
    cliExecute("mallcheck.js");
    examine($item`designer sweatpants`); // re-align sweat (useful for diet and outfit)

    startSession();
    this.active = true;
    try {
      if (!globalOptions.nobarf && FarmingStrategy.ensureBarfAccess) ensureBarfAccess();
      this.harvestGarden();
      this.combatFlags = getCombatFlags(["aabosses", "bothcombatinterf"]);
      print("Collecting garbage!", HIGHLIGHT);
      if (
        have($item`packet of tall grass seeds`) &&
        myGardenType() !== "grass" &&
        myGardenType() !== "mushroom"
      ) {
        use($item`packet of tall grass seeds`);
      }
      setAutoAttack(0);
      setCombatFlags({ flag: "aabosses", value: true }, { flag: "bothcombatinterf", value: false });
      this.setProperties();
      this.dailyQuestStarts();
      withStash(this.stashToTake(), () => withVIPClan(action));
    } finally {
      this.end();
    }
  }

  /**
   * Diet, daily setup, free fights and copy target fights.
   * Garbo does these all at once, before any barf turns.
   */
  setup(): void {
    if (globalOptions.target === $monster`cockroach` && !globalOptions.simdiet) {
      if (!globalOptions.nodiet) nonOrganAdventures();
      runGarboQuests([CockroachSetup]);
      if (get("_lastPirateRealmIsland") === $location`Dessert Island`) {
        runGarboQuests([CockroachFinish]);
      }
      maximize("MP", false);
    }

    if (!globalOptions.nodiet) runDiet();
    else nonOrganAdventures();

    dailySetup();

    const preventEquip = $items`broken champagne bottle, Spooky Putty snake, Spooky Putty mitre, Spooky Putty leotard, Spooky Putty ball, papier-mitre, papier-mâchéte, papier-mâchine gun, papier-masque, papier-mâchuridars, smoke ball, stinky fannypack, dice-shaped backpack, Amulet of Perpetual Darkness`;
    if (isQuickGear()) {
      preventEquip.push(
        ...$items`Brimstone Bludgeon, Brimstone Bunker, Brimstone Brooch, Brimstone Bracelet, Brimstone Boxers, Brimstone Beret`
      );
    }
    preventEquip.push(
      ...$items`devilbone rosary, devilbone greaves, devilbone corset, angelbone totem, angelbone chopsticks, angelbone dice`
    );
    setDefaultMaximizeOptions({
      preventEquip: preventEquip,
      preventSlot: $slots`buddy-bjorn, crown-of-thrones`,
    });

    freeFights();
    runGarboQuests([CockroachFinish]);
    maximize("MP", false);
    runGarboQuests([SetupTargetCopyQuest]);
    dailyFights();
  }

  /**
   * Farm barf turns: up to the given number of turns, or all remaining turns.
   * Can be called repeatedly; quest phases may run between calls.
   * Returns the number of turns spent.
   */
  farm(turns: number | undefined): number {
    if (globalOptions.nobarf) return 0;
    const before = myTurncount();

    // Buy potions and buffs for the whole day's farming, not just this chunk
    globalOptions.stopTurncount = null;
    if (!this.barfReady) {
      potionSetup(false);
      maximize("MP", false);
    }
    meatMood().execute(estimatedGarboTurns());
    if (!this.barfReady) {
      runGarboQuests([BuffExtensionQuest, PostBuffExtensionQuest]);
      if (!targetingMeat()) runGarboQuests([EmbezzlerFightsQuest]);
      this.barfReady = true;
    }

    globalOptions.stopTurncount = turns === undefined ? null : myTurncount() + turns;
    try {
      runGarboFarmQuests([PostQuest(), ...FarmQuests()]);
      if (turns === undefined || myAdventures() <= 0) {
        runGarboQuests([FinishUpQuest]);
        set("_garboCompleted", "split");
      }
    } finally {
      globalOptions.stopTurncount = null;
      setAutoAttack(0);
    }
    return myTurncount() - before;
  }

  private harvestGarden(): void {
    this.startingGarden = GARDENS.find((garden) =>
      Object.getOwnPropertyNames(getCampground()).includes(garden.name)
    );
    const garden = this.startingGarden;
    if (
      garden &&
      !$items`packet of tall grass seeds, packet of mushroom spores`.includes(garden) &&
      getCampground()[garden.name] &&
      $items`packet of tall grass seeds, packet of mushroom spores`.some((seed) => have(seed))
    ) {
      if (garden === $item`packet of rock seeds`) {
        visitUrl("campground.php?action=rgarden1&pwd");
        visitUrl("campground.php?action=rgarden2&pwd");
        visitUrl("campground.php?action=rgarden3&pwd");
      } else {
        visitUrl("campground.php?action=garden&pwd");
      }
    }
  }

  private setProperties(): void {
    const maximizerCombinationLimit = isQuickGear() ? 100000 : get("maximizerCombinationLimit");
    const bannedAutoRestorers = have($item`Cincho de Mayo`)
      ? [
          "sleep on your clan sofa",
          "rest in your campaway tent",
          "rest at the chateau",
          "rest at your campground",
          "free rest",
        ]
      : [];
    const hpItems = get("hpAutoRecoveryItems")
      .split(";")
      .filter((s) => !bannedAutoRestorers.includes(s))
      .join(";");
    const mpItems = get("mpAutoRecoveryItems")
      .split(";")
      .filter((s) => !bannedAutoRestorers.includes(s))
      .join(";");

    propertyManager.set({
      logPreferenceChange: true,
      logPreferenceChangeFilter: [
        ...new Set([
          ...get("logPreferenceChangeFilter").split(","),
          "libram_savedMacro",
          "maximizerMRUList",
          "testudinalTeachings",
          "garboTargetDate",
          "garboTargetCount",
          "garboTargetSources",
          "spadingData",
        ]),
      ]
        .sort()
        .filter((a) => a)
        .join(","),
      battleAction: "custom combat script",
      customCombatScript: "garbo",
      autoSatisfyWithMall: true,
      autoSatisfyWithNPCs: true,
      autoSatisfyWithCoinmasters: true,
      autoSatisfyWithStash: false,
      dontStopForCounters: true,
      maximizerFoldables: true,
      hpAutoRecovery: -0.05,
      hpAutoRecoveryTarget: 0.0,
      mpAutoRecovery: -0.05,
      mpAutoRecoveryTarget: 0.0,
      hpAutoRecoveryItems: hpItems,
      mpAutoRecoveryItems: mpItems,
      afterAdventureScript: "",
      betweenBattleScript: "",
      choiceAdventureScript: "garbo_choice.js",
      counterScript: "",
      familiarScript: "",
      currentMood: "apathetic",
      autoTuxedo: true,
      autoPinkyRing: true,
      autoGarish: true,
      allowNonMoodBurning: !globalOptions.ascend,
      allowSummonBurning: true,
      libramSkillsSoftcore: "none",
      valueOfInventory: 2,
      suppressMallPriceCacheMessages: true,
      maximizerCombinationLimit: maximizerCombinationLimit,
      allowNegativeTally: true,
      spadingScript: "excavator.js",
      lastChanceBurn: "",
      errorOnAmbiguousFold: false,
    });

    let bestHalloweiner = 0;
    if (haveInCampground($item`haunted doghouse`)) {
      const halloweinerOptions: { price: number; choiceId: number }[] = (
        [
          [$items`bowl of eyeballs, bowl of mummy guts, bowl of maggots`, 1],
          [$items`blood and blood, Jack-O-Lantern beer, zombie`, 2],
          [$items`wind-up spider, plastic nightmare troll, Telltale™ rubber heart`, 3],
        ] as [Item[], number][]
      ).map(([halloweinerOption, choiceId]) => {
        return { price: garboAverageValue(...halloweinerOption), choiceId: choiceId };
      });
      bestHalloweiner = maxBy(halloweinerOptions, "price").choiceId;
    }
    propertyManager.setChoices({
      1106: 3, // Ghost Dog Chow
      1107: 1, // tennis ball
      1108: bestHalloweiner,
      1340: 1, // Accept the doctor quest
      1341: 1, // Cure her poison
    });
    if (JuneCleaver.have()) {
      propertyManager.setChoices(
        Object.fromEntries(
          JuneCleaver.choices.map((choice) => [choice, bestJuneCleaverOption(choice)])
        )
      );
    }
    propertyManager.set({ shadowLabyrinthGoal: "effects" });

    const equipmentFamiliars = $familiars`Left-Hand Man, Disembodied Hand, Mad Hatrack, Fancypants Scarecrow`;
    for (const familiar of equipmentFamiliars.filter(have)) {
      equip(familiar, $item.none);
    }
    safeRestore();
  }

  private dailyQuestStarts(): void {
    if (questStep("questM23Meatsmith") === -1) {
      visitUrl("shop.php?whichshop=meatsmith&action=talk");
      runChoice(1);
    }
    if (questStep("questM24Doc") === -1) {
      visitUrl("shop.php?whichshop=doc&action=talk");
      runChoice(1);
    }
    if (questStep("questM25Armorer") === -1) {
      visitUrl("shop.php?whichshop=armory&action=talk");
      runChoice(1);
    }
    if (myLevel() >= 11 && questStep("questS01OldGuy") === -1) {
      visitUrl("place.php?whichplace=sea_oldman&action=oldman_oldman");
    }
    if (
      myClass() === $class`Seal Clubber` &&
      !have($skill`Furious Wallop`) &&
      guildStoreAvailable()
    ) {
      visitUrl("guild.php?action=buyskill&skillid=32", true);
    }
    if (shouldAffirmationHate()) {
      acquire(
        1,
        $item`Daily Affirmation: Keep Free Hate in your Heart`,
        globalOptions.prefs.valueOfPvPFight * 3 * 1.1
      );
    }
  }

  private stashToTake(): Item[] {
    const result = $items`repaid diaper, Buddy Bjorn, Crown of Thrones, Pantsgiving, mafia pointer finger ring, Mayflower bouquet`;
    if (
      myInebriety() <= inebrietyLimit() &&
      (myClass() !== $class`Seal Clubber` || !have($skill`Furious Wallop`)) &&
      !have($skill`Head in the Game`)
    ) {
      result.push(...$items`haiku katana, Operation Patriot Shield`);
    }
    if (!have($item`Jurassic Parka`) && have($skill`Torso Awareness`)) {
      result.push($item`origami pasties`);
    }
    return result;
  }

  private end(): void {
    if (!this.active) return;
    this.active = false;
    cliExecute("spade autoconfirm");
    propertyManager.resetAll();
    set("garboStashItems", stashItems.map((item) => toInt(item).toFixed(0)).join(","));
    if (this.combatFlags.length > 0) setCombatFlags(...this.combatFlags);
    if (this.startingGarden && have(this.startingGarden)) use(this.startingGarden);
    printEventLog();
    endSession();
    printLog(HIGHLIGHT);
  }
}

/**
 * Garbo refuses to farm drunk without a wineglass; check before starting.
 */
export function canFarm(): boolean {
  return (
    myInebriety() <= inebrietyLimit() ||
    (have($item`Drunkula's wineglass`) && canEquip($item`Drunkula's wineglass`))
  );
}
