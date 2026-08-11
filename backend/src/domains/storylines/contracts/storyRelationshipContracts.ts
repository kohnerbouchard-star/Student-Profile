export const STORY_RELATIONSHIP_METRICS = [
  "trust",
  "respect",
  "affinity",
  "obligation",
  "suspicion",
] as const;

export const STORY_RELATIONSHIP_STANDINGS = [
  "hostile",
  "strained",
  "neutral",
  "trusted",
  "allied",
] as const;

export type StoryRelationshipMetric = typeof STORY_RELATIONSHIP_METRICS[number];
export type StoryRelationshipStanding = typeof STORY_RELATIONSHIP_STANDINGS[number];

export interface StoryRelationshipState {
  readonly characterKey: string;
  readonly trust: number;
  readonly respect: number;
  readonly affinity: number;
  readonly obligation: number;
  readonly suspicion: number;
  readonly standing: StoryRelationshipStanding;
}

export type PlayerStoryRelationships = Readonly<Record<string, StoryRelationshipState>>;

export function relationshipStandingForScore(score: number): StoryRelationshipStanding {
  if (score <= -50) return "hostile";
  if (score <= -15) return "strained";
  if (score < 35) return "neutral";
  if (score < 70) return "trusted";
  return "allied";
}

export function relationshipStandingScore(state: StoryRelationshipState): number {
  return Math.round(
    state.trust * 0.35 +
    state.respect * 0.25 +
    state.affinity * 0.2 +
    state.obligation * 0.1 -
    state.suspicion * 0.35
  );
}
