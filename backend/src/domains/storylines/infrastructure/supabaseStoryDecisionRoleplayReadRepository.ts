import type {
  StoryDecisionRoleplayReadRepository,
  StoryDecisionRoleplayReadResult,
} from "../contracts/storyDecisionRoleplayReadRepository.ts";

interface QueryBuilder {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  maybeSingle(): Promise<StoryDecisionRoleplayReadResult>;
}
export interface StoryDecisionRoleplayClient {
  from(tableName: string): QueryBuilder;
}

export class SupabaseStoryDecisionRoleplayReadRepository
  implements StoryDecisionRoleplayReadRepository {
  constructor(private readonly client: StoryDecisionRoleplayClient) {}

  async readDecision(scope: Parameters<StoryDecisionRoleplayReadRepository["readDecision"]>[0]): Promise<StoryDecisionRoleplayReadResult> {
    return await this.client
      .from("player_story_decisions")
      .select("decision_key,option_key,rationale,relationship_character_key,semantic_tags,dimensions")
      .eq("game_session_id", scope.gameSessionId)
      .eq("player_id", scope.playerId)
      .eq("contract_key", scope.contractKey)
      .maybeSingle();
  }

  async readDefinition(decisionKey: string): Promise<StoryDecisionRoleplayReadResult> {
    return await this.client
      .from("story_decision_definitions")
      .select("public_prompt")
      .eq("decision_key", decisionKey)
      .eq("is_active", true)
      .maybeSingle();
  }

  async readRelationship(scope: Parameters<StoryDecisionRoleplayReadRepository["readRelationship"]>[0]): Promise<StoryDecisionRoleplayReadResult> {
    return await this.client
      .from("player_story_relationships")
      .select("character_name,stage,trust_score,memory")
      .eq("game_session_id", scope.gameSessionId)
      .eq("player_id", scope.playerId)
      .eq("character_key", scope.characterKey)
      .maybeSingle();
  }
}
