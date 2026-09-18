import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "~/lib/db";
import { families, familyMemberships, people } from "~/db/schema";
import type { Account } from "~/lib/context";

export interface UpcomingEvent {
  familyId: string;
  familyName: string;
  personId: string;
  personName: string;
  type: "birthday" | "memorial";
  /** Next occurrence, formatted YYYY-MM-DD (UTC). */
  date: string;
  daysUntil: number;
  /** Age they turn, or years since passing. */
  age: number | null;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function nextOccurrence(
  date: string,
  today: Date,
): { date: string; daysUntil: number; year: number } | null {
  const [year, month, day] = date.split("-").map(Number);
  if (!month || !day || !year) return null;
  for (const candidateYear of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
    const candidate = new Date(Date.UTC(candidateYear, month - 1, day));
    const daysUntil = Math.round((candidate.getTime() - today.getTime()) / 86_400_000);
    if (daysUntil >= 0) {
      return { date: candidate.toISOString().slice(0, 10), daysUntil, year: candidateYear };
    }
  }
  return null;
}

/**
 * Birthdays and memorial anniversaries across every family the account belongs
 * to, within the requested window. Both dates already exist on `people`, so
 * reminders need no extra data entry.
 */
export async function listUpcomingEvents(
  account: Account,
  days = 45,
  now = new Date(),
): Promise<UpcomingEvent[]> {
  const memberships = await db
    .select({ familyId: families.id, familyName: families.name })
    .from(familyMemberships)
    .innerJoin(families, eq(familyMemberships.familyId, families.id))
    .where(
      and(
        eq(familyMemberships.accountId, account.id),
        isNull(familyMemberships.removedAt),
        isNull(families.deletedAt),
      ),
    );
  if (memberships.length === 0) return [];

  const familyNames = new Map(memberships.map((m) => [m.familyId, m.familyName]));
  const rows = await db
    .select({
      id: people.id,
      familyId: people.familyId,
      name: people.name,
      dateOfBirth: people.dateOfBirth,
      dateOfDeath: people.dateOfDeath,
    })
    .from(people)
    .where(
      and(
        inArray(
          people.familyId,
          memberships.map((m) => m.familyId),
        ),
        isNull(people.deletedAt),
      ),
    );

  const today = startOfUtcDay(now);
  const events: UpcomingEvent[] = [];
  for (const person of rows) {
    const source = person.dateOfDeath
      ? {
          type: "memorial" as const,
          date: person.dateOfDeath,
          originYear: Number(person.dateOfDeath.slice(0, 4)),
        }
      : person.dateOfBirth
        ? {
            type: "birthday" as const,
            date: person.dateOfBirth,
            originYear: Number(person.dateOfBirth.slice(0, 4)),
          }
        : null;
    if (!source) continue;
    const occurrence = nextOccurrence(source.date, today);
    if (!occurrence || occurrence.daysUntil > days) continue;
    const age = occurrence.year - source.originYear;
    events.push({
      familyId: person.familyId,
      familyName: familyNames.get(person.familyId) ?? "Family",
      personId: person.id,
      personName: person.name,
      type: source.type,
      date: occurrence.date,
      daysUntil: occurrence.daysUntil,
      age: Number.isFinite(age) && age > 0 ? age : null,
    });
  }

  return events.sort(
    (a, b) => a.daysUntil - b.daysUntil || a.personName.localeCompare(b.personName),
  );
}
