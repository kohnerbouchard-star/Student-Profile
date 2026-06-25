import type { JsonValue } from "../../../supabase/tableTypes.ts";

export interface PlayerStoryContext {
  readonly playerId: string;
  readonly gameSessionId: string;
  readonly homeCountryId: string | null;
  readonly homeCountryCode: string | null;
  readonly currentCountryId: string | null;
  readonly currentCountryCode: string | null;
  readonly cashBalance: number | null;
  readonly resources: Readonly<Record<string, number>>;
  readonly sectorExposurePct: Readonly<Record<string, number>>;
  readonly countryExposurePct: Readonly<Record<string, number>>;
  readonly activeContractKeys: readonly string[];
  readonly completedContractKeys: readonly string[];
  readonly storyFlags: Readonly<Record<string, JsonValue>>;
}
