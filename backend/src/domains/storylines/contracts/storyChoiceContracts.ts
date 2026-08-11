export const STORY_CHOICE_SOURCES = ["selected", "default"] as const;

export type StoryChoiceSource = typeof STORY_CHOICE_SOURCES[number];

export interface StoryEffectiveChoice {
  readonly interactionKey: string;
  readonly characterKey: string;
  readonly choiceKey: string;
  readonly source: StoryChoiceSource;
}

export type PlayerStoryChoices = Readonly<Record<string, StoryEffectiveChoice>>;
