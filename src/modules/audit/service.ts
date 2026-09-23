import type { DB } from "~/lib/db";
import { auditEvents } from "~/db/schema";
import { getRequestId } from "~/lib/context";
import { nanoid } from "nanoid";

export interface AuditInput {
  familyId?: string | null;
  actorAccountId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: Record<string, unknown>;
  requestId?: string;
}

/**
 * Builds an audit row without writing it. Services call this when the audit
 * event must be part of a `db.batch(...)` so the mutation and its audit trail
 * commit atomically.
 */
export function auditValues(input: AuditInput) {
  return {
    id: nanoid(),
    familyId: input.familyId ?? null,
    actorAccountId: input.actorAccountId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    summary: input.summary,
    requestId: input.requestId ?? getRequestId(),
    createdAt: new Date(),
  };
}

export async function audit(tx: DB, input: AuditInput) {
  await tx.insert(auditEvents).values(auditValues(input));
}
