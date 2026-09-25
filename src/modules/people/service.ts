import { and, eq, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "~/lib/db";
import {
  accounts,
  auditEvents,
  familyMemberships,
  mediaAssets,
  parentChildRelationships,
  people,
} from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { auditValues } from "~/modules/audit/service";
import { loadViewerContext, type ViewerContext } from "~/modules/kinship/service";
import { isSelf, presentPerson } from "~/modules/people/visibility";

export interface PersonInput {
  name: string;
  gender: string;
  dateOfBirth?: string | null;
  dateOfDeath?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  occupation?: string | null;
  education?: string | null;
  city?: string | null;
  skills?: string | null;
  biography?: string | null;
  profileMediaId?: string | null;
  fieldVisibility?: Record<string, string> | null;
}

/**
 * Fields the account linked to a person may change on its own profile even
 * without an Editor role: how to reach them, what they do, and who sees it.
 */
export const selfServiceFields = [
  "occupation",
  "education",
  "city",
  "skills",
  "email",
  "phone",
  "address",
  "biography",
  "fieldVisibility",
] as const;

function toDb(input: PersonInput) {
  return {
    name: input.name,
    gender: input.gender,
    dateOfBirth: input.dateOfBirth ?? null,
    dateOfDeath: input.dateOfDeath ?? null,
    heightCm: input.heightCm ?? null,
    weightKg: input.weightKg ?? null,
    address: input.address ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    occupation: input.occupation ?? null,
    education: input.education ?? null,
    city: input.city ?? null,
    skills: input.skills ?? null,
    biography: input.biography ?? null,
    profileMediaId: input.profileMediaId ?? null,
    fieldVisibility: input.fieldVisibility ?? null,
  };
}

export async function createPerson(account: Account, familyId: string, input: PersonInput) {
  await requireEditor(account, familyId);
  await assertPersonMediaInFamily(input.profileMediaId, familyId, account.id);
  const now = new Date();
  const person = {
    id: nanoid(),
    familyId,
    createdByAccountId: account.id,
    ...toDb(input),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.batch([
    db.insert(people).values(person),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId,
        action: "PERSON_CREATED",
        targetType: "Person",
        targetId: person.id,
        summary: { name: input.name },
      }),
    ),
  ]);
  return presentPerson(person, await loadViewerContext(account.id, familyId));
}

/**
 * People in a family as one viewer may see them, with kinship to the viewer
 * and the member account linked to each person. `search` matches the name and
 * only the work fields this viewer can see, so a search cannot reveal hidden values.
 */
export async function listPeopleFor(account: Account, familyId: string, search?: string) {
  const ctx = await loadViewerContext(account.id, familyId);
  const [rows, links] = await Promise.all([
    db
      .select()
      .from(people)
      .where(and(eq(people.familyId, familyId), isNull(people.deletedAt)))
      .orderBy(people.name),
    db
      .select({
        personId: familyMemberships.personId,
        accountId: accounts.id,
        displayName: accounts.displayName,
      })
      .from(familyMemberships)
      .innerJoin(accounts, eq(familyMemberships.accountId, accounts.id))
      .where(and(eq(familyMemberships.familyId, familyId), isNull(familyMemberships.removedAt))),
  ]);
  const linked = new Map(
    links
      .filter((l) => l.personId)
      .map((l) => [l.personId!, { accountId: l.accountId, displayName: l.displayName }]),
  );
  const needle = search?.trim().toLowerCase();
  return rows
    .map((row) => ({ ...presentPerson(row, ctx), member: linked.get(row.id) ?? null }))
    .filter(
      (p) =>
        !needle ||
        [p.name, p.occupation, p.education, p.city, p.skills].some((value) =>
          value?.toLowerCase().includes(needle),
        ),
    );
}

export async function getPersonFor(account: Account, familyId: string, personId: string) {
  const ctx = await loadViewerContext(account.id, familyId);
  return presentPerson(await getPerson(familyId, personId), ctx);
}

export async function getPerson(familyId: string, personId: string) {
  const person = await db.query.people.findFirst({
    where: and(eq(people.id, personId), eq(people.familyId, familyId), isNull(people.deletedAt)),
  });
  if (!person) throw Errors.NOT_FOUND();
  return person;
}

export async function updatePerson(
  account: Account,
  familyId: string,
  personId: string,
  input: Partial<PersonInput>,
) {
  const ctx = await loadViewerContext(account.id, familyId);
  const person = await getPerson(familyId, personId);
  assertCanUpdate(ctx, personId, input);
  await assertPersonMediaInFamily(input.profileMediaId, familyId, account.id);

  const values: Record<string, unknown> = {};
  if (input.name !== undefined) values.name = input.name;
  if (input.gender !== undefined) values.gender = input.gender;
  if (input.dateOfBirth !== undefined) values.dateOfBirth = input.dateOfBirth ?? null;
  if (input.dateOfDeath !== undefined) values.dateOfDeath = input.dateOfDeath ?? null;
  if (input.heightCm !== undefined) values.heightCm = input.heightCm ?? null;
  if (input.weightKg !== undefined) values.weightKg = input.weightKg ?? null;
  if (input.address !== undefined) values.address = input.address ?? null;
  if (input.email !== undefined) values.email = input.email ?? null;
  if (input.phone !== undefined) values.phone = input.phone ?? null;
  if (input.occupation !== undefined) values.occupation = input.occupation ?? null;
  if (input.education !== undefined) values.education = input.education ?? null;
  if (input.city !== undefined) values.city = input.city ?? null;
  if (input.skills !== undefined) values.skills = input.skills ?? null;
  if (input.biography !== undefined) values.biography = input.biography ?? null;
  if (input.profileMediaId !== undefined) values.profileMediaId = input.profileMediaId ?? null;
  if (input.fieldVisibility !== undefined) {
    // Overrides merge, so a client can change one group without restating the rest.
    values.fieldVisibility = input.fieldVisibility
      ? { ...(person.fieldVisibility ?? {}), ...input.fieldVisibility }
      : null;
  }
  const now = new Date();
  values.updatedAt = now;

  await db.batch([
    db
      .update(people)
      .set(values as never)
      .where(eq(people.id, personId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId,
        action: input.fieldVisibility !== undefined ? "PERSON_PRIVACY_UPDATED" : "PERSON_UPDATED",
        targetType: "Person",
        targetId: personId,
        summary: {
          name: input.name ?? person.name,
          fields: Object.keys(input),
          selfService: !ctx.isMaintainer,
        },
      }),
    ),
  ]);
  return presentPerson(await getPerson(familyId, personId), ctx);
}

function assertCanUpdate(ctx: ViewerContext, personId: string, input: Partial<PersonInput>) {
  if (ctx.isMaintainer) return;
  if (!isSelf(ctx, personId)) throw Errors.FORBIDDEN();
  const disallowed = Object.keys(input).filter(
    (key) => !(selfServiceFields as readonly string[]).includes(key),
  );
  if (disallowed.length > 0) {
    throw Errors.FORBIDDEN(
      `Only an Editor can change ${disallowed.join(", ")}. You can update your own contact, work, biography and privacy.`,
    );
  }
}

export async function deletePerson(account: Account, familyId: string, personId: string) {
  await requireCreator(account, familyId);
  const person = await getPerson(familyId, personId);
  const now = new Date();

  // Soft-delete the person and detach dependent rows atomically. D1 enforces
  // foreign keys, so the relationship and membership references must be
  // resolved in the same batch.
  await db.batch([
    db
      .delete(parentChildRelationships)
      .where(
        or(
          eq(parentChildRelationships.parentPersonId, personId),
          eq(parentChildRelationships.childPersonId, personId),
        ),
      ),
    db
      .update(familyMemberships)
      .set({ personId: null })
      .where(eq(familyMemberships.personId, personId)),
    db.update(people).set({ deletedAt: now, updatedAt: now }).where(eq(people.id, personId)),
    db.insert(auditEvents).values(
      auditValues({
        actorAccountId: account.id,
        familyId,
        action: "PERSON_DELETED",
        targetType: "Person",
        targetId: personId,
        summary: { name: person.name },
      }),
    ),
  ]);
  return { deleted: true };
}

async function requireEditor(account: Account, familyId: string) {
  const membership = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.familyId, familyId),
      eq(familyMemberships.accountId, account.id),
      isNull(familyMemberships.removedAt),
    ),
  });
  if (!membership || (membership.role !== "CREATOR" && membership.role !== "EDITOR")) {
    throw Errors.FORBIDDEN();
  }
  return membership;
}

async function requireCreator(account: Account, familyId: string) {
  const membership = await db.query.familyMemberships.findFirst({
    where: and(
      eq(familyMemberships.familyId, familyId),
      eq(familyMemberships.accountId, account.id),
      isNull(familyMemberships.removedAt),
    ),
  });
  if (!membership || membership.role !== "CREATOR") throw Errors.FORBIDDEN();
  return membership;
}

async function assertPersonMediaInFamily(
  mediaId: string | null | undefined,
  familyId: string,
  accountId: string,
) {
  if (!mediaId) return;
  const media = await db.query.mediaAssets.findFirst({
    where: eq(mediaAssets.id, mediaId),
  });
  if (!media || media.ownerAccountId !== accountId || media.familyId !== familyId) {
    throw Errors.VALIDATION("Profile media must be owned by you and belong to this family.");
  }
  if (media.status !== "READY" || media.purpose !== "PERSON_PROFILE") {
    throw Errors.VALIDATION("Profile media is not ready or has an invalid purpose.");
  }
}
