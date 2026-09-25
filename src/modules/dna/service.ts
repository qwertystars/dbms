import { and, eq, inArray, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "~/lib/db";
import { accounts, auditEvents, dnaMatches } from "~/db/schema";
import type { DnaProvider } from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { auditValues } from "~/modules/audit/service";

/**
 * DNA relative matches (beta).
 *
 * Banyan never receives raw genetic data. A person copies the summary their
 * testing provider shows for a match (shared centimorgans and, optionally,
 * segments), and the other account must confirm before either side sees the
 * match as confirmed. Either account can delete the match at any time, which
 * erases the row. A DNA match never grants access to any family.
 */

export interface DnaMatchInput {
  accountId: string;
  provider: DnaProvider;
  sharedCm: number;
  sharedSegments?: number | null;
  note?: string | null;
}

export interface RelationshipEstimate {
  /** Most likely relationships for this amount of shared DNA, closest first. */
  likely: string[];
  confidence: "high" | "medium" | "low";
}

/**
 * Relationship ranges for shared centimorgans, based on the published averages
 * and ranges of the Shared cM Project. An estimate only: different
 * relationships overlap heavily below about 1,300 cM.
 */
const CM_BANDS: {
  min: number;
  likely: string[];
  confidence: RelationshipEstimate["confidence"];
}[] = [
  { min: 3300, likely: ["Parent or child", "Identical twin"], confidence: "high" },
  { min: 2200, likely: ["Full sibling", "Parent or child"], confidence: "high" },
  {
    min: 1300,
    likely: ["Grandparent or grandchild", "Aunt, uncle, niece or nephew", "Half sibling"],
    confidence: "medium",
  },
  {
    min: 575,
    likely: [
      "First cousin",
      "Great-grandparent",
      "Great-aunt or great-uncle",
      "Half aunt or half uncle",
    ],
    confidence: "medium",
  },
  {
    min: 200,
    likely: ["First cousin once removed", "Half first cousin", "Second cousin"],
    confidence: "medium",
  },
  { min: 75, likely: ["Second cousin", "Second cousin once removed"], confidence: "low" },
  { min: 30, likely: ["Third cousin", "Fourth cousin"], confidence: "low" },
  { min: 8, likely: ["Distant cousin (fourth to sixth)"], confidence: "low" },
  { min: 0, likely: ["Too little shared DNA to suggest a relationship"], confidence: "low" },
];

export function estimateRelationship(sharedCm: number): RelationshipEstimate {
  const band = CM_BANDS.find((b) => sharedCm >= b.min) ?? CM_BANDS[CM_BANDS.length - 1];
  return { likely: band.likely, confidence: band.confidence };
}

function pair(a: string, b: string) {
  return a < b ? { low: a, high: b } : { low: b, high: a };
}

export async function reportMatch(account: Account, input: DnaMatchInput) {
  if (input.accountId === account.id) {
    throw Errors.VALIDATION("You cannot record a DNA match with yourself.");
  }
  const other = await db.query.accounts.findFirst({ where: eq(accounts.id, input.accountId) });
  if (!other) throw Errors.NOT_FOUND("No account with that ID.");

  const { low, high } = pair(account.id, input.accountId);
  const existing = await db.query.dnaMatches.findFirst({
    where: and(eq(dnaMatches.accountLowId, low), eq(dnaMatches.accountHighId, high)),
  });
  if (existing) throw Errors.CONFLICT("A DNA match with this account already exists.");

  const match = {
    id: nanoid(),
    accountLowId: low,
    accountHighId: high,
    reporterAccountId: account.id,
    provider: input.provider,
    sharedCm: input.sharedCm,
    sharedSegments: input.sharedSegments ?? null,
    note: input.note ?? null,
    status: "PENDING" as const,
    createdAt: new Date(),
    confirmedAt: null,
  };
  try {
    await db.insert(dnaMatches).values(match);
  } catch (error) {
    if (String((error as Error)?.message ?? error).includes("UNIQUE")) {
      throw Errors.CONFLICT("A DNA match with this account already exists.");
    }
    throw error;
  }
  return present(account.id, match, other.displayName);
}

export async function listMatches(account: Account) {
  const rows = await db
    .select()
    .from(dnaMatches)
    .where(or(eq(dnaMatches.accountLowId, account.id), eq(dnaMatches.accountHighId, account.id)))
    .orderBy(sql`${dnaMatches.sharedCm} DESC`);
  if (rows.length === 0) return [];
  const otherIds = rows.map((r) =>
    r.accountLowId === account.id ? r.accountHighId : r.accountLowId,
  );
  const others = await db
    .select({ id: accounts.id, displayName: accounts.displayName })
    .from(accounts)
    .where(inArray(accounts.id, otherIds));
  const names = new Map(others.map((o) => [o.id, o.displayName]));
  return rows.map((row) => {
    const otherId = row.accountLowId === account.id ? row.accountHighId : row.accountLowId;
    return present(account.id, row, names.get(otherId) ?? "Unknown account");
  });
}

/** Only the account that did not report the match can confirm it. */
export async function confirmMatch(account: Account, matchId: string) {
  const match = await getOwnMatch(account, matchId);
  if (match.reporterAccountId === account.id) {
    throw Errors.FORBIDDEN("The other account must confirm this match.");
  }
  if (match.status === "CONFIRMED") return { confirmed: true };
  const now = new Date();
  await db.batch([
    db
      .update(dnaMatches)
      .set({ status: "CONFIRMED", confirmedAt: now })
      .where(and(eq(dnaMatches.id, matchId), eq(dnaMatches.status, "PENDING"))),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        action: "DNA_MATCH_CONFIRMED",
        targetType: "DnaMatch",
        targetId: matchId,
        // No genetic values in the audit trail.
        summary: { provider: match.provider },
      }),
    ),
  ]);
  return { confirmed: true };
}

/** Declining, cancelling and withdrawing consent all erase the match. */
export async function deleteMatch(account: Account, matchId: string) {
  const match = await getOwnMatch(account, matchId);
  await db.batch([
    db.delete(dnaMatches).where(eq(dnaMatches.id, matchId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        action: "DNA_MATCH_DELETED",
        targetType: "DnaMatch",
        targetId: matchId,
        summary: { status: match.status },
      }),
    ),
  ]);
  return { deleted: true };
}

async function getOwnMatch(account: Account, matchId: string) {
  const match = await db.query.dnaMatches.findFirst({ where: eq(dnaMatches.id, matchId) });
  // Other people's matches are indistinguishable from missing ones.
  if (!match || (match.accountLowId !== account.id && match.accountHighId !== account.id)) {
    throw Errors.NOT_FOUND();
  }
  return match;
}

function present(viewerId: string, row: typeof dnaMatches.$inferSelect, otherName: string) {
  const otherId = row.accountLowId === viewerId ? row.accountHighId : row.accountLowId;
  return {
    id: row.id,
    otherAccount: { id: otherId, displayName: otherName },
    direction: row.reporterAccountId === viewerId ? ("OUTGOING" as const) : ("INCOMING" as const),
    status: row.status,
    provider: row.provider,
    sharedCm: row.sharedCm,
    sharedSegments: row.sharedSegments,
    note: row.note,
    estimate: estimateRelationship(row.sharedCm),
    createdAt: row.createdAt,
    confirmedAt: row.confirmedAt,
  };
}
