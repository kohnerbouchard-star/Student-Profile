export type ThreadStatus = "active" | "disabled" | "closed";

export type ThreadType = "announcement" | "system" | "player" | "contract";

export type ModerationAction =
  | "disable_thread"
  | "enable_thread"
  | "close_thread"
  | "hide_message"
  | "unhide_message";


export interface RpcError {
  readonly code?: string;
  readonly message: string;
}


export interface RpcResponse<T> {
  readonly data: T | null;
  readonly error: RpcError | null;
}


export interface AdminService {
  rpc<T>(name: string, args: unknown): PromiseLike<RpcResponse<T>>;
}


export interface CreateRow {
  readonly create_outcome?: unknown;
  readonly thread_id?: unknown;
  readonly created_thread_type?: unknown;
  readonly thread_title?: unknown;
  readonly thread_status?: unknown;
  readonly participant_count?: unknown;
  readonly created_at?: unknown;
}


export interface ModerationRow {
  readonly moderation_outcome?: unknown;
  readonly action_id?: unknown;
  readonly thread_id?: unknown;
  readonly message_id?: unknown;
  readonly moderation_action?: unknown;
  readonly thread_status?: unknown;
  readonly message_hidden?: unknown;
  readonly created_at?: unknown;
}


export interface DeletionRow {
  readonly deletion_outcome?: unknown;
  readonly action_id?: unknown;
  readonly thread_id?: unknown;
  readonly deleted_message_count?: unknown;
  readonly created_at?: unknown;
}


export interface MessagingOperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: unknown;
}


export const THREAD_ID_PATTERN = /^thr_[0-9a-f]{32}$/;

export const MESSAGE_ID_PATTERN = /^msg_[0-9a-f]{32}$/;

export const ACTION_ID_PATTERN = /^mda_[0-9a-f]{32}$/;

export const PLAYER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

export const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const THREAD_TYPES = new Set<ThreadType>([
  "announcement",
  "system",
  "player",
  "contract",
]);

export const THREAD_STATUSES = new Set<ThreadStatus>([
  "active",
  "disabled",
  "closed",
]);
