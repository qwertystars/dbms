import { z } from "zod";

export const uuidSchema = z.string().min(1).max(64);

export const roleSchema = z.enum(["CREATOR", "EDITOR", "VIEWER"]);
export const invitationRoleSchema = z.enum(["EDITOR", "VIEWER"]);
export const reactionTypeSchema = z.enum(["LIKE", "LOVE", "LAUGH", "SAD"]);
export const mediaPurposeSchema = z.enum(["ACCOUNT_AVATAR", "PERSON_PROFILE", "POST_ATTACHMENT"]);

export const familyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

export const familyUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
});

export const personCreateSchema = z.object({
  name: z.string().min(1).max(255),
  gender: z.string().min(1).max(50),
  dateOfBirth: z.string().date().optional().nullable(),
  dateOfDeath: z.string().date().optional().nullable(),
  heightCm: z.coerce.number().positive().optional().nullable(),
  weightKg: z.coerce.number().positive().optional().nullable(),
  address: z.string().max(1000).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  occupation: z.string().max(255).optional().nullable(),
  biography: z.string().max(5000).optional().nullable(),
  profileMediaId: uuidSchema.optional().nullable(),
});

export const personUpdateSchema = personCreateSchema.partial();

export const parentChildEdgeSchema = z.object({
  parentPersonId: uuidSchema,
  childPersonId: uuidSchema,
});

export const invitationCreateSchema = z.object({
  email: z.string().email().max(255).optional(),
  role: invitationRoleSchema,
});

export const membershipUpdateSchema = z.object({
  role: z.enum(["EDITOR", "VIEWER"]),
});

export const ownershipTransferSchema = z.object({
  newCreatorMembershipId: uuidSchema,
});

const taggedPersonIdsSchema = z.array(uuidSchema).max(20);

export const postCreateSchema = z.object({
  body: z.string().min(1).max(5000),
  personIds: taggedPersonIdsSchema.optional(),
});

export const postUpdateSchema = z.object({
  body: z.string().min(1).max(5000),
  personIds: taggedPersonIdsSchema.optional(),
});

export const partnerEdgeSchema = z.object({
  personAId: uuidSchema,
  personBId: uuidSchema,
});

export const claimDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
});

export const familyEventCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  startsOn: z.string().date(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour).")
    .optional()
    .nullable(),
  location: z.string().max(300).optional().nullable(),
});

export const familyEventUpdateSchema = familyEventCreateSchema.partial();

export const rsvpSchema = z.object({
  response: z.enum(["GOING", "MAYBE", "NOT_GOING"]),
});

export const commentCreateSchema = z.object({
  body: z.string().min(1).max(2000),
});

export const commentUpdateSchema = commentCreateSchema;

export const reactionSchema = z.object({
  type: reactionTypeSchema,
});

export const friendRequestSchema = z.object({
  accountId: uuidSchema,
});

export const uploadIntentSchema = z.object({
  purpose: mediaPurposeSchema,
  familyId: uuidSchema.optional(),
  mimeType: z.string().min(1).max(255),
  size: z.coerce
    .number()
    .positive()
    .max(50 * 1024 * 1024),
});

export const uploadCompleteSchema = z.object({
  sha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
});

export const accountUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});

export const authConfigSchema = z.object({
  provider: z.enum(["oidc", "google"]),
  devSignIn: z.boolean(),
  googleSignIn: z.boolean(),
});

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-z][a-z0-9_]*$/, "Use 3–32 letters, numbers or underscores, starting with a letter.");
export const passwordSchema = z.string().min(12).max(128);
export const passwordLoginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128),
});
export const passwordRegisterSchema = passwordLoginSchema.extend({
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(100),
});
export const credentialsSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  currentPassword: z.string().max(128).optional(),
});
