import type { people } from "~/db/schema";
import { circleOf, kinshipView, type ViewerContext } from "~/modules/kinship/service";

/**
 * Who may see a group of profile fields.
 *
 * - `FAMILY`: every member of the family
 * - `CLOSE`: the person themself, close family, and the family's maintainers
 * - `MAINTAINERS`: only the person themself and the family's Creator and Editors
 *
 * Name, gender, photo, life years and tree position are always visible to members.
 */
export const visibilityLevels = ["FAMILY", "CLOSE", "MAINTAINERS"] as const;
export type VisibilityLevel = (typeof visibilityLevels)[number];

export const fieldGroups = {
  work: ["occupation", "education", "city", "skills"],
  biography: ["biography"],
  birthday: ["dateOfBirth"],
  contact: ["email", "phone"],
  address: ["address"],
  body: ["heightCm", "weightKg"],
} as const;
export type FieldGroup = keyof typeof fieldGroups;
export const fieldGroupNames = Object.keys(fieldGroups) as FieldGroup[];

export const defaultVisibility: Record<FieldGroup, VisibilityLevel> = {
  work: "FAMILY",
  biography: "FAMILY",
  birthday: "FAMILY",
  contact: "CLOSE",
  address: "CLOSE",
  body: "CLOSE",
};

type PersonRow = typeof people.$inferSelect;

export function effectiveVisibility(
  overrides: Record<string, string> | null | undefined,
): Record<FieldGroup, VisibilityLevel> {
  const result = { ...defaultVisibility };
  for (const group of fieldGroupNames) {
    const value = overrides?.[group];
    if (value && (visibilityLevels as readonly string[]).includes(value)) {
      result[group] = value as VisibilityLevel;
    }
  }
  return result;
}

export function canSeeGroup(ctx: ViewerContext, personId: string, level: VisibilityLevel): boolean {
  if (ctx.isMaintainer || ctx.personId === personId) return true;
  if (level === "FAMILY") return true;
  if (level === "CLOSE") return circleOf(ctx, personId) === "CLOSE";
  return false;
}

/** The linked account may edit its own profile's self-service fields and privacy. */
export function isSelf(ctx: ViewerContext, personId: string): boolean {
  return ctx.personId === personId;
}

/**
 * Serializes a person for one viewer. Hidden fields are removed on the server,
 * so they never reach the client, an export, or a search match.
 */
export function presentPerson(person: PersonRow, ctx: ViewerContext) {
  const visibility = effectiveVisibility(person.fieldVisibility);
  const hiddenFields: string[] = [];
  const output: Record<string, unknown> = { ...person };
  delete output.fieldVisibility;
  for (const group of fieldGroupNames) {
    if (canSeeGroup(ctx, person.id, visibility[group])) continue;
    for (const field of fieldGroups[group]) {
      if (output[field] !== null && output[field] !== undefined) hiddenFields.push(field);
      output[field] = null;
    }
  }
  const canManage = ctx.isMaintainer || isSelf(ctx, person.id);
  return {
    ...(output as Omit<PersonRow, "fieldVisibility">),
    // The year stays visible when the full birth date is private.
    birthYear: person.dateOfBirth ? Number(person.dateOfBirth.slice(0, 4)) : null,
    hiddenFields,
    kinship: kinshipView(ctx, person.id),
    fieldVisibility: canManage ? visibility : undefined,
  };
}

export type PresentedPerson = ReturnType<typeof presentPerson>;
