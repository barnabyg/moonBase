import { loadCampaign } from "../../src/simulation";
import { toGameMinutes } from "../scenario";
import { addComponents, freshSaveWith } from "./save-editing";
import type { TryScenario } from "./try-scenario";

/**
 * Early in a Campaign with a flag pole standing east of the Lander, and the
 * kits for a founding memorial and a viewing area in stock, as a Launch would
 * have brought them. It plays only as far as the Robot's building takes.
 */
export function decorationsSave(): string {
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      addComponents(state, [
        { componentId: "flag-kit", count: 1 },
        { componentId: "memorial-plaque", count: 1 },
        { componentId: "viewing-area-kit", count: 1 },
      ]);
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  const planned = campaign.planConstruction({
    structureTypeId: "flag-pole",
    position: { x: 14, y: 6 },
  });
  if (!planned.ok) throw new Error(planned.message);
  for (let minutes = 0; campaign.snapshot().constructions.length > 0;) {
    if (minutes > toGameMinutes({ earthDays: 2 })) {
      throw new Error("The flag pole never went up.");
    }
    campaign.advance(10);
    minutes += 10;
  }
  return campaign.save();
}

export const decorationsScenarios: readonly TryScenario[] = [
  {
    id: "decorations",
    title:
      "Early in a Campaign with a flag pole standing east of the Lander, and the kits for a founding memorial and a Mission Director's viewing area in stock",
    steps: [
      'Pause the game. Find the flag pole on the map, east of the Lander: a slim pole with a white and orange flag held out from its top. In the Base panel it is under Decoration, and says "commissioned". Click it: the pop-up says the Decorations are there for how they look and what they mean rather than for what they do, and that it needs no power.',
      'Open the build menu: the Decoration group, last, offers the flag pole, the founding memorial, the rock garden and the Mission Director\'s viewing area, with "Built from Regolith alone" under the rock garden. Place a founding memorial, a rock garden and a viewing area round the flag.',
      "Set the game to 20x. The excavator grades each site, and digs the rock garden's rocks; the Robot brings the memorial's plaque and the viewing area's kit from the stockpile and sets them up, then lays out the rocks. The plinth rises and its plaque goes on, the windbreak rises before the chair and screen, and the bed of Regolith spreads before the rocks are set round it. None of them is cabled.",
      "Open the Guide's Structures tab: the four are under Construction, each saying it does nothing else. Open the Launch manifest: the flag kit, memorial plaque and viewing area kit are under Construction.",
    ],
    save: decorationsSave,
  },
];
