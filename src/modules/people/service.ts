import { and, eq, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "~/lib/db";
import {
  auditEvents,
  familyMemberships,
  mediaAssets,
  parentChildRelationships,
  people,
} from "~/db/schema";
import { Errors } from "~/lib/errors";
import type { Account } from "~/lib/context";
import { auditValues } from "~/modules/audit/service";

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
  biography?: string | null;
  profileMediaId?: string | null;
}

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
    biography: input.biography ?? null,
    profileMediaId: input.profileMediaId ?? null,
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
  return person;
}

export async function listPeople(familyId: string, search?: string, limit = 100, offset = 0) {
  const base = and(eq(people.familyId, familyId), isNull(people.deletedAt));
  const condition = search
    ? and(base, sql`LOWER(${people.name}) LIKE LOWER(${"%" + search + "%"})`)
    : base;
  return await db.select().from(people).where(condition).limit(limit).offset(offset);
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
  await requireEditor(account, familyId);
  const person = await getPerson(familyId, personId);
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
  if (input.biography !== undefined) values.biography = input.biography ?? null;
  if (input.profileMediaId !== undefined) values.profileMediaId = input.profileMediaId ?? null;
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
        action: "PERSON_UPDATED",
        targetType: "Person",
        targetId: personId,
        summary: { name: input.name ?? person.name, fields: Object.keys(input) },
      }),
    ),
  ]);
  return await getPerson(familyId, personId);
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
