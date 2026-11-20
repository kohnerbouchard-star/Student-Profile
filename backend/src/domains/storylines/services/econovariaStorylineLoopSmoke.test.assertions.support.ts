import type { StorylineEventCandidateRecord } from "../contracts/storylineRepositoryContracts.ts";

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json();
}

export function compareEventOrder(
  left: StorylineEventCandidateRecord,
  right: StorylineEventCandidateRecord,
): number {
  return left.act - right.act || left.sequence - right.sequence;
}

export function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(
      `Assertion failed. Actual: ${actualJson} Expected: ${expectedJson}`,
    );
  }
}
