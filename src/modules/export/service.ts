import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/lib/db";
import { familyMemberships, parentChildRelationships, people } from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { audit } from "~/modules/audit/service";
import { loadViewerContext } from "~/modules/kinship/service";
import { presentPerson, type PresentedPerson } from "~/modules/people/visibility";

export interface ExportOptions {
  format: "json" | "csv";
}

export async function exportFamilyData(account: Account, familyId: string, options: ExportOptions) {
  const membership = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.familyId, familyId),
      eq(familyMemberships.accountId, account.id),
      isNull(familyMemberships.removedAt),
    ),
  });
  if (!membership) throw Errors.FORBIDDEN();
  const ctx = await loadViewerContext(account.id, familyId);

  await audit(db, {
    actorAccountId: account.id,
    familyId,
    action: "FAMILY_EXPORTED",
    targetType: "Family",
    targetId: familyId,
    summary: { format: options.format },
  });

  // Exports go through the same serializer as the API, so hidden fields stay hidden.
  const familyPeople = (
    await db.query.people.findMany({
      where: and(eq(people.familyId, familyId), isNull(people.deletedAt)),
    })
  ).map((p) => presentPerson(p, ctx));
  // Only export relationships between people who have not been deleted.
  const livePersonIds = new Set(familyPeople.map((p) => p.id));
  const edges = (
    await db.query.parentChildRelationships.findMany({
      where: eq(parentChildRelationships.familyId, familyId),
    })
  ).filter((e) => livePersonIds.has(e.parentPersonId) && livePersonIds.has(e.childPersonId));

  if (options.format === "csv") {
    const csv = toCsv(familyPeople, edges);
    return {
      contentType: "text/csv",
      filename: `family-${familyId}.csv`,
      data: csv,
    };
  }

  const payload = {
    familyId,
    exportedAt: new Date().toISOString(),
    people: familyPeople.map(mapPerson),
    relationships: edges.map((e) => ({
      id: e.id,
      parentPersonId: e.parentPersonId,
      childPersonId: e.childPersonId,
      createdAt: e.createdAt,
    })),
  };

  return {
    contentType: "application/json",
    filename: `family-${familyId}.json`,
    data: JSON.stringify(payload, null, 2),
  };
}

function mapPerson(p: PresentedPerson) {
  return {
    id: p.id,
    name: p.name,
    gender: p.gender,
    dateOfBirth: p.dateOfBirth,
    dateOfDeath: p.dateOfDeath,
    heightCm: p.heightCm ? Number(p.heightCm) : null,
    weightKg: p.weightKg ? Number(p.weightKg) : null,
    address: p.address,
    email: p.email,
    phone: p.phone,
    occupation: p.occupation,
    education: p.education,
    city: p.city,
    skills: p.skills,
    biography: p.biography,
    profileMediaId: p.profileMediaId,
  };
}

function toCsv(
  familyPeople: PresentedPerson[],
  edges: (typeof parentChildRelationships.$inferSelect)[],
) {
  const headers = [
    "id",
    "name",
    "gender",
    "dateOfBirth",
    "dateOfDeath",
    "heightCm",
    "weightKg",
    "address",
    "email",
    "phone",
    "occupation",
    "education",
    "city",
    "skills",
    "biography",
  ];
  const peopleRows = familyPeople.map((p) =>
    headers
      .map((h) => {
        const value = mapPerson(p)[h as keyof ReturnType<typeof mapPerson>];
        if (value === null || value === undefined) return "";
        const str = String(value);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(","),
  );
  const edgeHeaders = "parentPersonId,childPersonId";
  const edgeRows = edges.map((e) => `${e.parentPersonId},${e.childPersonId}`);

  return [headers.join(","), ...peopleRows, "", edgeHeaders, ...edgeRows].join("\n");
}
