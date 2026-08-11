import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import { parseStoryCondition } from "../contracts/storyConditionContracts.ts";
import { evaluateStoryCondition } from "./storyConditionEngine.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("Story choice condition distinguishes explicit selection from authored default", () => {
  const player: PlayerStoryContext = {
    playerId: "player-1", gameSessionId: "game-1", homeCountryId: null, homeCountryCode: null,
    currentCountryId: null, currentCountryCode: "NORTHREACH", cashBalance: 500, resources: {},
    sectorExposurePct: {}, countryExposurePct: {}, activeContractKeys: [], completedContractKeys: [],
    storyFlags: {}, storyChoices: {
      "interaction.jonis.offer.v1": {
        interactionKey: "interaction.jonis.offer.v1",
        characterKey: "character.northreach.jonis-hale.v1",
        choiceKey: "accept",
        source: "selected",
      },
      "interaction.edda.review.v1": {
        interactionKey: "interaction.edda.review.v1",
        characterKey: "character.northreach.edda-veyr.v1",
        choiceKey: "wait",
        source: "default",
      },
    },
  };
  const selected = parseStoryCondition({ type: "player_story_choice_is", interactionKey: "interaction.jonis.offer.v1", choiceKey: "accept", source: "selected" });
  const defaulted = parseStoryCondition({ type: "player_story_choice_is", interactionKey: "interaction.edda.review.v1", choiceKey: "wait", source: "default" });
  const wrongSource = parseStoryCondition({ type: "player_story_choice_is", interactionKey: "interaction.edda.review.v1", choiceKey: "wait", source: "selected" });
  if (!evaluateStoryCondition(selected, player)) throw new Error("selected choice did not match");
  if (!evaluateStoryCondition(defaulted, player)) throw new Error("default choice did not match");
  if (evaluateStoryCondition(wrongSource, player)) throw new Error("choice source was not distinguished");
});
