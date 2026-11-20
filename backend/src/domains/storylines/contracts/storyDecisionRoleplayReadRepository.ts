/** Optional Story context reads. Error/data coexistence is preserved for the renderer. */
export interface StoryDecisionRoleplayReadResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

export interface StoryDecisionRoleplayReadRepository {
  readDecision(scope: {
    readonly gameSessionId: string;
    readonly playerId: string;
    readonly contractKey: string;
  }): Promise<StoryDecisionRoleplayReadResult>;
  readDefinition(decisionKey: string): Promise<StoryDecisionRoleplayReadResult>;
  readRelationship(scope: {
    readonly gameSessionId: string;
    readonly playerId: string;
    readonly characterKey: string;
  }): Promise<StoryDecisionRoleplayReadResult>;
}
