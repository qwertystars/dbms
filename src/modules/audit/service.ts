import type { DB } from "~/lib/db";
import { auditEvents } from "~/db/schema";
import { getRequestId } from "~/lib/context";

export interface AuditInput {
  familyId?: string | null;
  actorAccountId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: Record<string, unknown>;
  requestId?: string;
}

export async function audit(tx: DB, input: AuditInput) {
  await tx.insert(auditEvents).values({
    familyId: input.familyId ?? null,
    actorAccountId: input.actorAccountId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    summary: input.summary,
    requestId: input.requestId ?? getRequestId(),
  });
}
