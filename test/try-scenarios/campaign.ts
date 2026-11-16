import { catalogue } from "../../src/catalogue";
import { loadCampaign } from "../../src/simulation";
import {
  playReferenceCampaign,
  referenceSteps,
  type PlayStep,
} from "../reference-campaign";
import { keepTheBaseGoing, playLongGame, playOnUntil } from "../long-game";
import { toGameMinutes } from "../scenario";
import {
  addComponents,
  fillStocks,
  freshSaveWith,
  reachEveryMilestoneBut,
  stockOf,
  unlockEverything,
  type EditableSaveState,
} from "./save-editing";
import type { TryScenario } from "./try-scenario";

/**
 * A step that keeps the Campaign's save as Act 1's last Milestone is reached,
 * playing nothing, so that the play is the same with it as without it.
 */
function keepingAct1sEnd(keep: (save: string) => void): PlayStep {
  return {
    milestoneId: undefined,
    description: "Keep the Campaign as Act 1 ends.",
    play(play) {
      keep(play.campaign.save());
    },
  };
}

/**
 * The reference Campaign's play guide with a step after Act 1's last Milestone
 * that gives `keep` the save as it stands, so that a test that plays the
 * reference Campaign anyway can make the act-2 and act-3 scenarios' saves
 * from it, rather than play it again.
 */
export function referenceStepsKeepingAct1sEnd(
  keep: (save: string) => void,
): readonly PlayStep[] {
  const last = referenceSteps.findLastIndex(
    ({ milestoneId }) => milestoneId !== undefined,
  );
  return [
    ...referenceSteps.slice(0, last + 1),
    keepingAct1sEnd(keep),
    ...referenceSteps.slice(last + 1),
  ];
}

/**
 * The reference Campaign's base as Act 2 opens, the moment the base is
 * self-sufficient in water, from the save `referenceStepsKeepingAct1sEnd`
 * keeps, played on until the Lander is free to fly, with the Design and
 * Funding for a Workshop and more metals to hand, so that Act 2 can be tried
 * without waiting for Science.
 */
export function act2SaveFrom(act1sEnd: string): string {
  const loaded = loadCampaign(act1sEnd);
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  for (let hours = 0; campaign.snapshot().lander.state !== "landed-free";) {
    if (++hours > 30 * 24) throw new Error("The Lander never came back.");
    campaign.advance(60);
  }
  const opened = JSON.parse(campaign.save()) as { state: EditableSaveState };
  // Enough to live on and keep the base repaired while the game is tried.
  fillStocks(opened.state);
  addComponents(opened.state, [
    { componentId: catalogue.maintenance.spareComponentId, count: 40 },
  ]);
  opened.state.science = 400;
  opened.state.fundingMillionDollars = 2500;
  stockOf(opened.state, "metals", 150);
  stockOf(opened.state, "circuit-boards", 60);
  return JSON.stringify(opened, undefined, 2);
}

/**
 * The act-2 scenario's save, played once, as Act 3's is made from it too. It
 * plays Act 1 of the reference Campaign, about 83 Earth Days.
 */
let act2Text: string | undefined;
function act2Save(): string {
  if (act2Text === undefined) {
    let act1sEnd: string | undefined;
    const { failure } = playReferenceCampaign([
      ...referenceSteps.filter(({ milestoneId }) => milestoneId !== undefined),
      keepingAct1sEnd((save) => {
        act1sEnd = save;
      }),
    ]);
    if (act1sEnd === undefined) {
      throw new Error(failure ?? "It never got there.");
    }
    act2Text = act2SaveFrom(act1sEnd);
  }
  return act2Text;
}

/**
 * Act 2's base, from the act-2 scenario's save, with all of Act 2's Milestones
 * reached, so that Act 3 is current, with a propellant plant's Components, the
 * Design for it and enough propellant and Exports to fly a tripled Return Mass.
 */
export function act3SaveFrom(act2: string): string {
  const opened = JSON.parse(act2) as {
    state: EditableSaveState & {
      reachedMilestoneIds: string[];
      unlockedDesignIds: string[];
    };
  };
  opened.state.reachedMilestoneIds.push(
    ...catalogue.milestones
      .filter(
        ({ actId, id }) =>
          actId === "act-2" && !opened.state.reachedMilestoneIds.includes(id),
      )
      .map(({ id }) => id),
  );
  for (const id of [
    "molten-regolith-electrolysis",
    "cold-trap-mining",
    "propellant-production",
  ]) {
    if (!opened.state.unlockedDesignIds.includes(id)) {
      opened.state.unlockedDesignIds.push(id);
    }
  }
  addComponents(opened.state, [
    { componentId: "oxygen-liquefier", count: 2 },
    { componentId: "cryogenic-tank", count: 2 },
  ]);
  opened.state.fundingMillionDollars = 5000;
  stockOf(opened.state, "propellant", 500);
  stockOf(opened.state, "metals", 400);
  stockOf(opened.state, "circuit-boards", 150);
  return JSON.stringify(opened, undefined, 2);
}

/**
 * The long-game play guide's own base on the Earth Day given, reached by playing
 * the guide and left as it stands, so that a stretch of Act 4 can be played from a
 * base that has really played everything before it. It takes minutes.
 */
function longGameSaveOn(earthDay: number): string {
  let save: string | undefined;
  const { failure } = playLongGame([
    ...referenceSteps,
    {
      milestoneId: undefined,
      description: `Keep the base going as the long-game play guide does, until Earth Day ${earthDay}.`,
      play(play) {
        keepTheBaseGoing(play);
        playOnUntil(play, earthDay);
        save = play.campaign.save();
      },
    },
  ]);
  if (save === undefined) throw new Error(failure ?? "It never got there.");
  return save;
}

/** Where `crewHabitatSave` builds the Large-scale Crew Habitat, in view north-west of the Lander. */
export const CREW_HABITAT_SITE = { x: -24, y: 22 } as const;

/**
 * Early in a Campaign with every Design unlocked and every Milestone reached but
 * the last, and a Large-scale Crew Habitat built as far as its Commissioning
 * in Daylight from the Components and oxygen and water a save was edited to
 * have, so that the last Milestone and its celebration come in a few game-hours. It plays only
 * as far as the Robot's building takes.
 */
export function crewHabitatSave(): string {
  const type = catalogue.structureTypes.find(({ id }) => id === "crew-habitat");
  if (type?.stockedWith === undefined) {
    throw new Error("expected a Large-scale Crew Habitat");
  }
  const { stockedWith } = type;
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      unlockEverything(state);
      reachEveryMilestoneBut(state, "crew-habitat-commissioned");
      addComponents(state, type.components);
      // What it is stocked with, and as much again, beyond what its tanks hold.
      for (const stock of state.lifeSupport) {
        const fill = stockedWith.find(
          ({ stockId }) => stockId === stock.stockId,
        );
        if (fill !== undefined) stock.kilograms = 2 * fill.kilograms;
      }
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  // Planned early enough in a Daylight to be commissioned in it, as its building
  // takes about 9 Earth Days.
  for (
    let hours = 0;
    campaign.snapshot().lunation.part !== "daylight" ||
    campaign.snapshot().lunation.minutesRemaining <
      toGameMinutes({ earthDays: 12 });
    hours++
  ) {
    if (hours > 40 * 24) throw new Error("Daylight never came.");
    campaign.advance(60);
  }
  const planned = campaign.planConstruction({
    structureTypeId: type.id,
    position: CREW_HABITAT_SITE,
  });
  if (!planned.ok) throw new Error(planned.message);
  for (
    let hours = 0;
    campaign.snapshot().constructions[0]?.stage !== "commissioning";
    hours++
  ) {
    if (hours > 40 * 24) throw new Error("It never came to its Commissioning.");
    campaign.advance(60);
  }
  return campaign.save();
}

export const campaignScenarios: readonly TryScenario[] = [
  {
    id: "everything-unlocked",
    title: "An hour into a Campaign with every Design unlocked and $5,000M",
    steps: [
      "Open the Launch manifest: every item the game has today is listed, under Supplies, then Power, Construction, Protection, Life Support, Industry and Mobility, with a box above them to find one.",
      'Type "telescope" in the box: only the telescope\'s two parts stay, under Industry, and it says "Showing 2 of 67 items".',
      "Press + on one of them: the bars and the box stay in sight, and the rows don't move.",
      "Press Clear: all 67 come back, in the same order.",
      "Close it. The build menu lists its Structures under the Base panel's groups, from Habitats to Science, and those with 0 beside them are dimmed with a dashed border. Each group's heading number is the sum of the numbers beside its Structures, leaving out those with a dash. Fold Power: it stays folded after a reload.",
    ],
    save: () => freshSaveWith(unlockEverything),
  },
  {
    id: "last-milestone",
    title:
      "An hour into a Campaign with every Milestone reached but power storage, the quickest to reach",
    steps: [
      'Look at the status panel\'s Milestones: it says "Act 1" and what the Act asks, then "Now" with Power storage before the first Night and the first two lines of its hint, with no "Next" line as none is left. Press "Show all" under the hint, or Tab to it and press Enter: the whole hint shows, and "Show less" folds it again.',
      "Pick the Battery bank in the build menu, place it on clear ground beside the Lander, and set the game to 20x. In a few real seconds the Robot has built it.",
      'A notification says "Milestone reached: Power storage before the first Night", and another that Act 4: Permanence begins, the last Act there is.',
      'The panel now says "Act 4: Permanence" and what it asks, with "Everything this Act asks of you is done." Then "Now" says "Every Milestone reached", with a hint that the Campaign carries on, and still no "Next" line. None of the lines below has moved up.',
      'A "Ready for Crew" message opens over everything, as every Milestone is now reached, with the game paused. Press Carry on: the game runs at 20x again.',
      "Leave the game running: it carries on, and nothing ends.",
      'Click the Milestones title to fold it: beside the title it says "every Milestone reached".',
    ],
    save: () =>
      freshSaveWith((state) => {
        reachEveryMilestoneBut(state, "power-storage");
      }),
  },
  {
    id: "act-2",
    title:
      "The start of Act 2, at the reference Campaign's base with $2,500M, 400 Science, 150 kg of metals and 60 kg of circuit boards",
    steps: [
      'Look at the status panel\'s Milestones: it says "Act 2: Independence" and what it asks, then "Now" with Workshop running and its hint, then "Next" with Self-sufficiency in spare Components.',
      "Press Tech Tree and, under Industry, unlock Molten regolith electrolysis, then Parts machining. The new Designs of Act 2 are there too: Array fabrication, Concentrator towers, Thermal storage and Cold-trap mining, each saying what it brings, and for now too dear in Science.",
      "Press Launch manifest. Under Industry, add a machine tool and a casting furnace: the cost bar shows $1,150M with the Launch fee, of $2,500M. Open the Exports tab: Metals are there at $1 a kilogram. Set 60 kg of circuit boards and 40 kg of metals: Return Mass says 100 of 100 kg, and it won't take more.",
      'Press Send the Lander and set the game to 20x. As the Lander reaches Earth a notification says the Exports sold, and "Milestone reached: Metals sold", though the Milestones section still has Workshop running as "Now": Milestones can be reached in any order.',
      'When the Lander is back and unloaded, pick the Workshop in the build menu and place it near the other Plants. Once it is running, a notification says "Milestone reached: Workshop running", "Now" moves on to Self-sufficiency in spare Components, and Self-sufficient has a new chip, Spares.',
      "Leave it running on 20x for about 3 real minutes, a whole Lunation: the Spares chip says whether the Workshop has made as many as repairs have used. If it has, the Milestone is reached and, with the others reached, the Milestones section moves on to Act 3.",
      "Open the Guide: the Structures tab has the Concentrator tower under Power and the Array works under Industry, and Launches and Funding says metals are an Export.",
    ],
    slow: true,
    save: act2Save,
  },
  {
    id: "act-3",
    title:
      "The start of Act 3, with a propellant plant's Components in stock, 500 kg of propellant, 150 kg of circuit boards, 400 kg of metals and $5,000M",
    steps: [
      'Look at the status panel\'s Milestones: it says "Act 3: Scale" and what it asks, then "Now" with First propellant made.',
      'Set the game to 5x. Within a game-minute the Milestone is reached, as propellant is in stock, and "Now" moves on to Oxygen sold as propellant.',
      "Press Launch manifest and open the Exports tab. Return Mass says 0 of 350 kg, as 500 kg of propellant adds 250 kg. Set 150 kg of circuit boards and 150 kg of metals: it says 300 of 350 kg, burning 400 kg of propellant. Try 250 kg of metals: it is refused, naming the Return Mass.",
      'Press Send the Lander. A notification says "Milestone reached: Return Mass tripled", and the status panel shows 100 kg of propellant left.',
      "When the Lander reaches Earth the Funding rises by $600M. When it is back, load the last of the propellant on the Exports tab, and send it again: Oxygen sold as propellant is reached as it reaches Earth, and Now moves on to Moved into a Buried Habitat, the last of Act 3.",
      "Pick the Propellant plant in the build menu and place it on the power network. Once it runs, the propellant in the status panel, shown now against the limit of 450 kg that the Plant brings, rises by about a kilogram a game-hour.",
    ],
    slow: true,
    save: () => act3SaveFrom(act2Save()),
  },
  {
    id: "act-3-buried",
    title:
      "Act 3 on Earth Day 880, at the long-game play guide's own base as it played there, as it sends for a Buried Habitat: 524 mSv behind a water wall, $9,563M and a Buried Habitat unlocked",
    slow: true,
    steps: [
      'Pause the game. The Milestones say "Act 3: Scale", with First propellant made as "Now"; Moved into a Buried Habitat is one of the Act\'s too. Radiation says about "524.1 / 600 mSv", rising 0.25 a day behind the water wall, with the limit about 300 days off, and more with the Solar Particle Events. Funding is about $9,563M, and it is Daylight. The Lander is at Earth, so what is on the Launch manifest now comes on the next Launch.',
      "The goal: move the Mission Director into a Buried Habitat, which cuts the dose rate to 0.015 a day, before the limit. Its parts come to 5,300 kg, and a Launch carries 2,000 kg, so it takes three Launches.",
      "Open the Launch manifest and, under Protection, add 4 vault sections: 2,000 kg, a full Launch. Set the game to 20x.",
      "Each time the Lander is back and unloaded, open the manifest again: 4 more vault sections on the second Launch, then the deep life support core, under Protection, and an airlock, under Life Support, on the third. Press Send the Lander each time.",
      "Once all the parts are in, pick Buried Habitat in the build menu and place it on clear ground, early in a Daylight if you can. The excavator takes about 5 Earth Days to dig it in.",
      'Once it is commissioned and has power, click it on the map, the low mound with a hatch at one end, and press "Move here" in its pop-up. Radiation now says "+0.015 a day", and a notification says "Milestone reached: Moved into a Buried Habitat". The guide moved in on about Earth Day 949, at 550 mSv. If you like, dismantle the old Habitat to get its power back: its water wall first, then its shielding, then the Habitat itself.',
      "The rest of the base is the guide's, with its choices: its array works is switched off, and a solar array it planned waits unbuilt for the array works' Components. Note how soon the limit felt pressing, whether a Buried Habitat came at the cost of propellant, and whether those Earth Days had enough to do or dragged.",
    ],
    save: () => longGameSaveOn(880),
  },
  {
    id: "act-3-moved-in",
    title:
      "Act 3 on Earth Day 960, at the long-game play guide's base just after it moved into a Buried Habitat: 550 mSv, $3,245M and 163 Science",
    slow: true,
    steps: [
      'Pause the game. Living says "in the Buried Habitat", and the old Habitat, its water wall and its shielding are gone. Radiation says about "549.9 / 600 mSv" and "+0.015 a day". Funding is about $3,245M and Science about 163. It is Night, with about a day and a half of it left.',
      'The limit is years off now. Look at what to aim for next: the Milestones\' "Now", First propellant made, and the Tech Tree, where Propellant production is the Design it needs.',
      "Play on at 20x as you would for 15 minutes, about 75 Earth Days. The guide first made propellant on about Earth Day 1,021.",
      "Note whether you knew what to aim for, whether the Funding the Buried Habitat took was felt, and whether those Earth Days had enough to do or dragged.",
    ],
    save: () => longGameSaveOn(960),
  },
  {
    id: "act-4-optics",
    title:
      "Act 4 on Earth Day 1,690, at the long-game play guide's base just after Precision optics was unlocked, with a Greenhouse growing and $16,341M",
    slow: true,
    steps: [
      "Pause the game. Precision optics is unlocked and no optics works is built yet. A Greenhouse stands, and Water is about 396 kg. Funding is about $16,341M.",
      "Open the Launch manifest: the guide has already put an optics works' two optical grinders and metrology bench on it. Keep them or clear them: precision optics sell for $6M a kilogram, twice circuit boards, and an optics works takes 5 kg of water for each kilogram, from the same water as the Greenhouse.",
      "Play on at 20x as you would for 15 minutes, about 75 Earth Days. The guide sold its first precision optics on about Earth Day 1,714.",
      "Note whether water felt like the limit, whether you'd rather it went to optics or to the Greenhouse's Science, and whether those Earth Days had enough to do or dragged.",
    ],
    save: () => longGameSaveOn(1690),
  },
  {
    id: "act-4-late",
    title:
      "Act 4 on Earth Day 2,000, at the long-game play guide's base with an optics works, a grinding line, a Greenhouse and the late science, $3,415M and 2,026 Science",
    slow: true,
    steps: [
      "Pause the game. An optics works, a grinding line, a Greenhouse, an automated experiments lab, an infrared telescope, a radio telescope array with two antenna fields, a water tank and an oxygen tank stand. Water is about 494 of 1,400 kg: the guide switches the optics off below 320 kg, to leave the Greenhouse a Night's water. Funding is about $3,415M and Science about 2,026. In the Tech Tree, Growing halls and Large-scale Crew Habitats are unlocked, and Vault cistern comes last.",
      "Play on at 20x as you would for 15 minutes, about 75 Earth Days.",
      "Note what you spent Funding on, if anything, whether a Greenhouse's Science felt worth its water, and whether those Earth Days had enough to do or dragged.",
    ],
    save: () => longGameSaveOn(2000),
  },
  {
    id: "act-4-halls",
    title:
      "Act 4 on Earth Day 1,875, at the long-game play guide's base just after Growing halls was unlocked, with $9,149M and 201 kg of water",
    slow: true,
    steps: [
      "Pause the game. Growing halls has just been unlocked. The guide has built a third Workshop, three water-processing plants and the late science, and its optics works is switched off, as Water is about 201 kg. Funding is about $9,149M. The Launch manifest holds a grinding line's parts.",
      "Open the Tech Tree and the Guide: a growing hall earns more Science for its water than a Greenhouse, for $5,000M. The guide went on to buy three more water-processing plants, four cold-trap ice lines at $3,000M each and a growing hall, about $18,500M with the rest.",
      "Play on at 20x as you would for 15 to 20 minutes, 75 to 100 Earth Days.",
      "Note whether Funding was worth spending on Science and water, or better left idle, and whether those Earth Days had enough to do or dragged.",
    ],
    save: () => longGameSaveOn(1875),
  },
  {
    id: "act-4-end",
    title:
      "The end of Act 4, on Earth Day 2,850, at the long-game play guide's finished base, with a Large-scale Crew Habitat and a vault cistern, $36,501M and every Milestone reached",
    slow: true,
    steps: [
      'Pause the game. The Milestones say every Milestone is reached: the guide commissioned its Large-scale Crew Habitat on about Earth Day 2,438 and its vault cistern on about 2,505. Water is about 4,392 of 4,400 kg. Funding is about $36,501M, and Science about 7,185, with every Design unlocked. Radiation says about "581.7 / 600 mSv", with the limit thousands of Earth Days off.',
      "The guide has switched off the Greenhouse, growing hall, infrared telescope and automated experiments lab, with nothing left for Science to buy, and its optics works and grinding line run on the water the tanks hold.",
      "Play on at 20x to Earth Day 3,000, about 30 minutes, where the Campaign's content runs out. Note whether there was anything left worth doing with the Funding, and whether those Earth Days had enough to do or dragged. The crew-habitat scenario tries the Large-scale Crew Habitat's commissioning and its celebration.",
    ],
    save: () => longGameSaveOn(2850),
  },
  {
    id: "crew-habitat",
    title:
      "Early in a Campaign with every Milestone reached but the last, and a Large-scale Crew Habitat being commissioned",
    steps: [
      'Pause the game. The Milestones say "Act 4: Permanence", with Large-scale Crew Habitat commissioned as "Now". The Work panel shows the Large-scale Crew Habitat being commissioned. Find it on the map north-west of the Lander: three long white vaults side by side, joined by a lower spine with an airlock at each end.',
      "Click it: the pop-up says it is a Large-scale Crew Habitat. The status panel's Oxygen and Water are lower by the 600 kg and 2,500 kg it was stocked with as its Assembly started.",
      'Set the game to 20x. Within a few real seconds it is commissioned (if Commissioning fails, the Robot tries again), and a "Ready for Crew" message opens over everything, saying the base has moved on to its next phase and that the Campaign goes on. The game speed now shows Pause.',
      'Press "Carry on": the message closes and the game runs at 20x again. A notification says "Milestone reached: Large-scale Crew Habitat commissioned", and the Milestones say every Milestone is reached. The Base panel has no "Move here" button beside it.',
      "Save the game and load the save: the message doesn't open again.",
      "Open the Guide: How it works says what the last Milestone builds towards, and the Structures tab has the Large-scale Crew Habitat under Life Support, saying what it is stocked with.",
    ],
    save: crewHabitatSave,
  },
];
