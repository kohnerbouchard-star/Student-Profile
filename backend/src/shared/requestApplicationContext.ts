/**
 * Internal request/use-case identity. Contexts are composed only after the
 * relevant authentication and ownership policy has succeeded and must never
 * be serialized as browser response DTOs.
 */
export interface RequestApplicationContext<
  TActor extends RequestApplicationActor,
  TRole extends string,
  TPermission extends string = string,
> {
  readonly gameSessionId: string;
  readonly actor: TActor;
  readonly role: TRole;
  readonly permissions: readonly TPermission[];
  readonly requestId: string;
  readonly idempotencyContext?: ValidatedIdempotencyContext;
}

export interface RequestApplicationActor {
  readonly kind: string;
}

export interface ValidatedIdempotencyContext {
  readonly key: string;
  readonly source: "body" | "header";
  readonly validated: true;
}
