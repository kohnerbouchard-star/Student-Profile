import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type {
  ContractSourceType,
  ContractStatus,
  ContractVisibility,
} from "../contracts/contractContracts.ts";

// Adapter-local query contracts and persisted row projections.
export type ContractTableName =
  | "contract_templates"
  | "game_session_contracts"
  | "player_contract_progress";

interface SupabaseContractQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

export interface SupabaseContractQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseContractQueryError | null;
}

export interface SupabaseContractClient {
  from(tableName: ContractTableName): SupabaseContractQueryBuilder;
}

interface SupabaseContractQueryBuilder {
  select(columns: string): SupabaseContractFilterBuilder;
  insert(row: unknown): SupabaseContractWriteBuilder;
  update(row: unknown): SupabaseContractUpdateBuilder;
  upsert(
    row: unknown,
    options?: { readonly onConflict?: string },
  ): SupabaseContractWriteBuilder;
}

interface SupabaseContractFilterBuilder
  extends PromiseLike<SupabaseContractQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): SupabaseContractFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabaseContractFilterBuilder;
  order(
    column: string,
    options?: {
      readonly ascending?: boolean;
      readonly nullsFirst?: boolean;
    },
  ): SupabaseContractFilterBuilder;
  maybeSingle(): PromiseLike<SupabaseContractQueryResponse<unknown>>;
}

interface SupabaseContractWriteBuilder {
  select(columns: string): SupabaseContractWriteSelectBuilder;
}

interface SupabaseContractUpdateBuilder {
  eq(column: string, value: unknown): SupabaseContractUpdateBuilder;
  is(column: string, value: unknown): SupabaseContractUpdateBuilder;
  select(columns: string): SupabaseContractWriteSelectBuilder;
}

interface SupabaseContractWriteSelectBuilder {
  maybeSingle(): PromiseLike<SupabaseContractQueryResponse<unknown>>;
}

export interface ContractTemplateRow {
  readonly id: string;
  readonly template_key: string;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly difficulty: string;
  readonly estimated_duration_minutes?: number | string | null;
  readonly requirements_payload: JsonObject;
  readonly reward_payload: JsonObject;
  readonly metadata: JsonObject;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface GameSessionContractRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly contract_template_id?: string | null;
  readonly contract_key: string;
  readonly source_type: ContractSourceType | string;
  readonly source_id?: string | null;
  readonly created_by_staff_id?: string | null;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly status: ContractStatus | string;
  readonly visibility: ContractVisibility | string;
  readonly targeting_payload: JsonObject;
  readonly requirements_payload: JsonObject;
  readonly reward_payload: JsonObject;
  readonly completion_mode: string;
  readonly published_at?: string | null;
  readonly deadline_at?: string | null;
  readonly expires_at?: string | null;
  readonly metadata: JsonObject;
  readonly created_at: string;
  readonly updated_at: string;
}

export const CONTRACT_TEMPLATE_SELECT = [
  "id",
  "template_key",
  "title",
  "description",
  "instructions",
  "category",
  "difficulty",
  "estimated_duration_minutes",
  "requirements_payload",
  "reward_payload",
  "metadata",
  "is_active",
  "created_at",
  "updated_at",
].join(",");

export const GAME_SESSION_CONTRACT_SELECT = [
  "id",
  "game_session_id",
  "contract_template_id",
  "contract_key",
  "source_type",
  "source_id",
  "created_by_staff_id",
  "title",
  "description",
  "instructions",
  "category",
  "status",
  "visibility",
  "targeting_payload",
  "requirements_payload",
  "reward_payload",
  "completion_mode",
  "published_at",
  "deadline_at",
  "expires_at",
  "metadata",
  "created_at",
  "updated_at",
].join(",");
