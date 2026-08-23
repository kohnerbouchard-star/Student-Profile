import { z } from "zod";

const publicKeySchema = z
  .string()
  .trim()
  .min(5)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

const nullableTimestampSchema = z.string().datetime({ offset: true }).nullable();

export const playerBusinessManufacturingPrioritySchema = z.enum([
  "standard",
  "expedite",
]);

export const playerBusinessManufacturingStatusSchema = z.enum([
  "queued",
  "in_progress",
  "completed",
  "cancelled",
  "failed",
]);

export const playerBusinessManufacturingJobSchema = z
  .object({
    jobKey: publicKeySchema.regex(/^mfg_[a-z0-9_-]+$/),
    businessKey: publicKeySchema,
    productKey: publicKeySchema,
    productName: z.string().trim().min(1).max(160),
    status: playerBusinessManufacturingStatusSchema,
    resourceState: z.string().trim().min(1).max(80),
    priority: playerBusinessManufacturingPrioritySchema,
    quantity: z.number().int().nonnegative(),
    completedOutputQuantity: z.number().int().nonnegative(),
    queuedAt: nullableTimestampSchema,
    startedAt: nullableTimestampSchema,
    completesAt: nullableTimestampSchema,
    completedAt: nullableTimestampSchema,
    cancelledAt: nullableTimestampSchema,
    failedAt: nullableTimestampSchema,
    failureCode: z.string().trim().max(160).nullable(),
    canCancel: z.boolean(),
  })
  .strict();

export const playerBusinessManufacturingJobsSchema = z.array(
  playerBusinessManufacturingJobSchema,
);

export const playerBusinessManufacturingStartRequestSchema = z
  .object({
    productKey: publicKeySchema,
    quantity: z.number().int().min(1).max(10_000),
    priority: playerBusinessManufacturingPrioritySchema.default("standard"),
    idempotencyKey: z.string().trim().min(8).max(160),
  })
  .strict();

export const playerBusinessManufacturingCancelRequestSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(160),
  })
  .strict();

export const playerBusinessManufacturingMutationResultSchema =
  playerBusinessManufacturingJobSchema.extend({
    replayed: z.boolean(),
  });

export type PlayerBusinessManufacturingJob = z.infer<
  typeof playerBusinessManufacturingJobSchema
>;
export type PlayerBusinessManufacturingStartRequest = z.infer<
  typeof playerBusinessManufacturingStartRequestSchema
>;
export type PlayerBusinessManufacturingCancelRequest = z.infer<
  typeof playerBusinessManufacturingCancelRequestSchema
>;
export type PlayerBusinessManufacturingMutationResult = z.infer<
  typeof playerBusinessManufacturingMutationResultSchema
>;
