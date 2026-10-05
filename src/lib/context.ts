import { AsyncLocalStorage } from "node:async_hooks";
import type { Context } from "hono";
import type { DB } from "~/lib/db";
import type { ObjectStore } from "~/lib/object-store";

export interface Account {
  id: string;
  authSubject: string;
  displayName: string;
  avatarMediaId: string | null;
  createdAt: Date;
}

export interface RequestContext {
  db: DB;
  requestId: string;
  requestStart: number;
  objects: ObjectStore;
  account?: Account;
  // Why a presented token was rejected (for example "ERR_JWT_CLAIM_VALIDATION_FAILED: iss").
  authError?: string;
}

export type HonoContext = Context & { var: { ctx: RequestContext } };

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return requestContextStorage.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function getRequestId(): string {
  return getContext()?.requestId ?? crypto.randomUUID();
}
