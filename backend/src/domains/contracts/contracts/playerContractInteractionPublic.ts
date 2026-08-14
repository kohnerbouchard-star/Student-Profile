import type { GameSessionContractRecord } from "./contractRepositoryContracts.ts";
import {
  type PublicPlayerContractListItemDto,
  toPublicPlayerContractListItemDto,
} from "./playerContractPublicListContracts.ts";

const PUBLIC_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function publicKey(value: unknown, fallback: string): string {
  const candidate = text(value);
  return candidate && PUBLIC_TOKEN.test(candidate) && !UUID.test(candidate)
    ? candidate
    : fallback;
}

function optionLabel(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const item = object(value);
  return text(item.label || item.text || item.title || item.value || item.name);
}

function publicQuestions(material: Record<string, unknown>): readonly Record<string, unknown>[] {
  return list(material.questions).flatMap((rawQuestion, questionIndex) => {
    const question = object(rawQuestion);
    const prompt = text(question.prompt || question.question || question.title);
    if (!prompt) return [];
    const options = list(question.options || question.choices || question.answers).flatMap((rawOption, optionIndex) => {
      const option = object(rawOption);
      const label = optionLabel(rawOption);
      if (!label) return [];
      const detail = text(option.detail || option.description);
      return [{
        optionKey: publicKey(option.optionKey || option.key, String.fromCharCode(65 + optionIndex)),
        label,
        ...(detail ? { detail } : {}),
      }];
    });
    if (options.length < 2) return [];
    const detail = text(question.detail || question.description);
    return [{
      questionKey: publicKey(question.questionKey || question.key, `q${questionIndex + 1}`),
      prompt,
      ...(detail ? { detail } : {}),
      options,
    }];
  });
}

function publicMaterials(metadata: Record<string, unknown>): readonly Record<string, unknown>[] {
  return list(metadata.materials).flatMap((rawMaterial) => {
    const material = object(rawMaterial);
    if (text(material.type).toLowerCase() !== "quiz") return [];
    const questions = publicQuestions(material);
    return questions.length ? [{ type: "quiz", questions }] : [];
  });
}

export function toPublicPlayerContractInteractionDto(
  contract: GameSessionContractRecord,
): PublicPlayerContractListItemDto {
  const base = toPublicPlayerContractListItemDto(contract);
  const rawMetadata = object(contract.metadata);
  const materials = publicMaterials(rawMetadata);
  const difficulty = text(rawMetadata.difficulty);
  const interactionType = text(rawMetadata.interactionType);
  return {
    ...base,
    metadata: {
      ...base.metadata,
      ...(difficulty ? { difficulty } : {}),
      ...(interactionType ? { interactionType } : {}),
      ...(materials.length ? { materials } : {}),
    },
  };
}
